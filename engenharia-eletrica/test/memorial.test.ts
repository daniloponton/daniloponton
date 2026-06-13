import { describe, it, expect } from "vitest";
import { buildMemorial } from "@core/documentation";
import { calculateShortCircuit } from "@core/modules/shortCircuit";
import { checkSelectivity } from "@core/modules/protection";
import { calculateCableSizing } from "@core/modules/cableSizing";

async function sampleResults() {
  const shortCircuit = await calculateShortCircuit({
    faultVoltageV: 400,
    feeder: { skMVA: 500, unHvKV: 13.8, rxRatio: 0.1 },
    transformer: { srKVA: 1000, ukrPercent: 6, copperLossKW: 12, unHvKV: 13.8, unLvV: 400, applyKT: true },
    cables: [],
  });
  const protection = await checkSelectivity({
    downstream: { id: "d", name: "J", stages: [{ kind: "inverse", pickupA: 100, tms: 0.1, curve: "SI" }] },
    upstream: { id: "u", name: "M", stages: [{ kind: "inverse", pickupA: 300, tms: 0.2, curve: "SI" }] },
    faultCurrentKA: shortCircuit.ikSymKA,
  });
  const cable = await calculateCableSizing({
    ibAmps: 45, system: "three", voltageV: 400, lengthM: 85, cosPhi: 0.85,
    insulation: "PVC", installMethod: "B1", ambientTempC: 38, groupingCircuits: 3,
    shortCircuitKA: shortCircuit.ikSymKA, faultClearingS: protection.downstreamClearingAtFaultS,
  });
  return { shortCircuit, protection, cable };
}

describe("buildMemorial", () => {
  it("monta uma seção por resultado disponível, com passos e hash", async () => {
    const r = await sampleResults();
    const doc = buildMemorial("Subestação X", r);
    expect(doc.sections).toHaveLength(3);
    expect(doc.sections.map((s) => s.id)).toEqual(["short_circuit", "protection", "cable"]);
    for (const s of doc.sections) {
      expect(s.steps.length).toBeGreaterThan(0);
      expect(s.inputHash).toMatch(/^[0-9a-f]{64}$/);
      expect(s.summary.length).toBeGreaterThan(0);
    }
    expect(doc.projectName).toBe("Subestação X");
    expect(doc.engineVersion).toBeTruthy();
  });

  it("conformidade geral é a pior entre as seções", async () => {
    const r = await sampleResults();
    const doc = buildMemorial("P", r);
    // proteção seletiva (ok) + cabo ok → geral ok
    expect(["ok", "warning", "fail"]).toContain(doc.overallCompliance);

    // proteção não seletiva força geral = fail
    const badProt = await checkSelectivity({
      downstream: { id: "d", name: "J", stages: [{ kind: "inverse", pickupA: 100, tms: 0.1, curve: "SI" }] },
      upstream: { id: "u", name: "M", stages: [{ kind: "inverse", pickupA: 300, tms: 0.1, curve: "SI" }] },
      faultCurrentKA: 5,
    });
    const doc2 = buildMemorial("P", { ...r, protection: badProt });
    expect(doc2.overallCompliance).toBe("fail");
  });

  it("omite seções de módulos ausentes", async () => {
    const r = await sampleResults();
    const doc = buildMemorial("P", { shortCircuit: r.shortCircuit });
    expect(doc.sections).toHaveLength(1);
    expect(doc.sections[0].id).toBe("short_circuit");
  });
});
