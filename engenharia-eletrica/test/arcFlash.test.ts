import { describe, it, expect } from "vitest";
import { analyzeArcFlash, type ArcFlashInput } from "@core/modules/arcFlash";

const base: ArcFlashInput = {
  systemVoltageKV: 0.6,
  boltedFaultKA: 20,
  gapMm: 32,
  workingDistanceMm: 455,
  equipmentClass: "switchgear_lv",
  electrodeConfig: "box",
  grounded: true,
  arcDurationS: 0.2,
};

describe("Arco elétrico (IEEE 1584-2002)", () => {
  it("caso 600 V, Ibf=20 kA, box: Ia ≈ 14,1 kA e E ≈ 9,4 cal/cm²", async () => {
    const r = await analyzeArcFlash(base);
    expect(r.arcingCurrentKA).toBeCloseTo(14.1, 0);
    expect(r.incidentEnergyCalCm2).toBeGreaterThan(8.5);
    expect(r.incidentEnergyCalCm2).toBeLessThan(10.5); // ≈ 9,4
    expect(r.ppeCategory).toContain("Categoria 3");
    expect(r.status).toBe("warning");
    expect(r.arcFlashBoundaryM).toBeGreaterThan(1);
  });

  it("energia incidente cresce proporcionalmente ao tempo de arco", async () => {
    const t1 = await analyzeArcFlash(base);
    const t2 = await analyzeArcFlash({ ...base, arcDurationS: 0.4 });
    expect(t2.incidentEnergyCalCm2).toBeCloseTo(t1.incidentEnergyCalCm2 * 2, 1);
  });

  it("energia muito alta (falta lenta) → acima de 40 cal/cm² (proibido)", async () => {
    const r = await analyzeArcFlash({ ...base, boltedFaultKA: 40, arcDurationS: 2 });
    expect(r.incidentEnergyCalCm2).toBeGreaterThan(40);
    expect(r.status).toBe("fail");
    expect(r.ppeCategory).toContain("proibido");
  });

  it("maior distância de trabalho reduz a energia incidente", async () => {
    const near = await analyzeArcFlash(base);
    const far = await analyzeArcFlash({ ...base, workingDistanceMm: 910 });
    expect(far.incidentEnergyCalCm2).toBeLessThan(near.incidentEnergyCalCm2);
  });

  it("média tensão (≥1 kV) usa a equação de Ia simplificada", async () => {
    const r = await analyzeArcFlash({
      systemVoltageKV: 13.8, boltedFaultKA: 25, gapMm: 153,
      workingDistanceMm: 910, equipmentClass: "switchgear_mv", electrodeConfig: "box",
      grounded: true, arcDurationS: 0.2,
    });
    expect(r.arcingCurrentKA).toBeGreaterThan(0);
    expect(r.incidentEnergyCalCm2).toBeGreaterThan(0);
  });

  it("é determinístico", async () => {
    const a = await analyzeArcFlash(base);
    const b = await analyzeArcFlash(base);
    expect(a.inputHash).toBe(b.inputHash);
  });
});
