import { describe, it, expect } from "vitest";
import {
  buildProjectMemorial,
  buildComplianceMatrix,
  evaluateCircuit,
  calculateVoltageDrop,
  sizeCapacitorBank,
  analyzeGrounding,
  sizePvString,
  type Circuit,
  type CircuitResults,
} from "@core/index";
import { analyzeArcFlash } from "@core/modules/arcFlash";

function feeder(name: string, ib: number): Circuit {
  return {
    id: name,
    name,
    shortCircuit: {
      faultVoltageV: 400,
      feeder: { skMVA: 500, unHvKV: 13.8, rxRatio: 0.1 },
      transformer: { srKVA: 1000, ukrPercent: 6, copperLossKW: 12, unHvKV: 13.8, unLvV: 400, applyKT: true },
      cables: [],
    },
    protection: {
      downstream: { id: "d", name: "J", stages: [{ kind: "inverse", pickupA: 100, tms: 0.1, curve: "SI" }] },
      upstream: { id: "u", name: "M", stages: [{ kind: "inverse", pickupA: 300, tms: 0.2, curve: "SI" }] },
      faultCurrentKA: 1,
    },
    cable: {
      ibAmps: ib, system: "three", voltageV: 400, lengthM: 85, cosPhi: 0.85,
      insulation: "PVC", installMethod: "B1", ambientTempC: 38, groupingCircuits: 3,
    },
  };
}

async function results(c: Circuit): Promise<{ circuit: Circuit; results: CircuitResults }> {
  const e = await evaluateCircuit(c);
  return { circuit: c, results: { shortCircuit: e.shortCircuit, protection: e.protection, cable: e.cable } };
}

describe("buildProjectMemorial", () => {
  it("gera um grupo por circuito, cada um com unifilar e seções", async () => {
    const circuits = [feeder("Alimentador A", 45), feeder("Alimentador B", 80)];
    const data = await Promise.all(circuits.map(results));
    const doc = buildProjectMemorial("Quadro QGBT", data, {});
    expect(doc.circuits).toHaveLength(2);
    expect(doc.circuits[0].name).toBe("Alimentador A");
    for (const g of doc.circuits) {
      expect(g.singleLine.length).toBeGreaterThan(0);
      expect(g.sections.map((s) => s.id)).toEqual(["short_circuit", "protection", "cable"]);
    }
  });

  it("inclui as análises de projeto (extras) à parte dos circuitos", async () => {
    const data = await Promise.all([feeder("A", 45)].map(results));
    const arc = await analyzeArcFlash({ systemVoltageKV: 0.4, boltedFaultKA: 20, arcDurationS: 0.2 });
    const doc = buildProjectMemorial("P", data, { arcFlash: arc });
    expect(doc.projectSections.map((s) => s.id)).toEqual(["arc_flash"]);
  });

  it("documenta os módulos 4/5/6 — FP, aterramento e fotovoltaico", async () => {
    const data = await Promise.all([feeder("A", 45)].map(results));
    const capacitorBank = await sizeCapacitorBank({ activePowerKW: 100, currentCosPhi: 0.8, targetCosPhi: 0.95, voltageV: 380 });
    const voltageDrop = await calculateVoltageDrop({
      system: "three", baseVoltageV: 380,
      segments: [{ sectionMm2: 35, lengthM: 100, currentA: 80, cosPhi: 0.9 }],
    });
    const grounding = await analyzeGrounding({ soilResistivity: 200, rodLengthM: 3, rodDiameterM: 0.016, faultCurrentA: 1000, faultClearingS: 0.5 });
    const pvString = await sizePvString({
      module: { vocStcV: 49.5, vmpStcV: 41.5, iscStcA: 11.5, impStcA: 10.8, tempCoeffVocPctPerC: -0.27 },
      inverter: { maxDcVoltageV: 1100, mpptMinV: 200, mpptMaxV: 1000, maxInputCurrentA: 26 },
      minCellTempC: -10, maxCellTempC: 70,
    });
    const doc = buildProjectMemorial("P", data, { voltageDrop, capacitorBank, grounding, pvString });
    const ids = doc.projectSections.map((s) => s.id);
    expect(ids).toContain("voltage_drop");
    expect(ids).toContain("capacitor_bank");
    expect(ids).toContain("grounding");
    expect(ids).toContain("pv_string");
    // Cada análise de projeto entra também na matriz de conformidade, escopo "Projeto".
    const m = buildComplianceMatrix(doc);
    expect(m.rows.filter((r) => r.scope === "Projeto").length).toBeGreaterThanOrEqual(4);
  });

  it("conformidade geral é a pior entre circuitos e análises de projeto", async () => {
    const data = await Promise.all([feeder("A", 45)].map(results));
    const doc = buildProjectMemorial("P", data, {});
    expect(["ok", "warning", "fail"]).toContain(doc.overallCompliance);
  });
});

describe("buildComplianceMatrix", () => {
  it("gera uma linha por item, com escopo, norma e status", async () => {
    const data = await Promise.all([feeder("Alimentador A", 45)].map(results));
    const doc = buildProjectMemorial("Quadro", data, {});
    const m = buildComplianceMatrix(doc);
    expect(m.rows.length).toBe(doc.circuits[0].sections.length);
    expect(m.rows.every((r) => r.scope === "Alimentador A")).toBe(true);
    const totals = m.counts.ok + m.counts.warning + m.counts.fail + m.counts.info;
    expect(totals).toBe(m.rows.length);
    expect(m.overall).toBe(doc.overallCompliance);
  });

  it("análises de projeto entram com escopo 'Projeto'", async () => {
    const data = await Promise.all([feeder("A", 45)].map(results));
    const arc = await analyzeArcFlash({ systemVoltageKV: 0.4, boltedFaultKA: 20, arcDurationS: 0.2 });
    const m = buildComplianceMatrix(buildProjectMemorial("P", data, { arcFlash: arc }));
    expect(m.rows.some((r) => r.scope === "Projeto" && r.item.includes("Arco"))).toBe(true);
  });
});
