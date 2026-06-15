import { describe, it, expect } from "vitest";
import { analyzeArcFlash, type ArcFlashInput } from "@core/modules/arcFlash";

// Caso de média tensão do Anexo D da IEEE Std 1584-2018 (exemplo trabalhado):
// 4,16 kV, Ibf = 15 kA, VCB, gap = 104 mm, D = 914,4 mm, invólucro 762×1143×762.
const mvExample: ArcFlashInput = {
  systemVoltageKV: 4.16,
  boltedFaultKA: 15,
  electrodeConfig: "VCB",
  gapMm: 104,
  workingDistanceMm: 914.4,
  enclosureWidthMm: 762,
  enclosureHeightMm: 1143,
  enclosureDepthMm: 762,
  arcDurationS: 0.2,
};

describe("Arco elétrico (IEEE 1584-2018)", () => {
  it("reproduz a corrente de arco do exemplo MT do Anexo D (≈ 12,98 kA)", async () => {
    const r = await analyzeArcFlash(mvExample);
    // Iarc do exemplo trabalhado D.1 ≈ 12,98 kA.
    expect(r.arcingCurrentKA).toBeCloseTo(12.98, 1);
    // Corrente reduzida (VarCf) é menor que a média.
    expect(r.reducedArcingCurrentKA).toBeLessThan(r.arcingCurrentKA);
    // Energia e fronteira positivas e coerentes.
    expect(r.incidentEnergyCalCm2).toBeGreaterThan(0);
    expect(r.arcFlashBoundaryM).toBeGreaterThan(1);
  });

  it("aplica o fator de correção de invólucro (CF) na faixa esperada", async () => {
    const r = await analyzeArcFlash(mvExample);
    // Invólucro MT grande → CF > 1 (amplia a energia), ~1,3.
    expect(r.enclosureCorrectionFactor).toBeGreaterThan(1);
    expect(r.enclosureCorrectionFactor).toBeLessThan(1.6);
  });

  it("reproduz a corrente de arco do exemplo BT (480 V, Ibf=45 kA, VCB ≈ 28,8 kA)", async () => {
    const r = await analyzeArcFlash({
      systemVoltageKV: 0.48,
      boltedFaultKA: 45,
      electrodeConfig: "VCB",
      gapMm: 32,
      workingDistanceMm: 457.2,
      enclosureWidthMm: 508,
      enclosureHeightMm: 508,
      enclosureDepthMm: 508,
      arcDurationS: 0.2,
    });
    // Iarc do exemplo BT ≈ 28,79 kA (Eq. 25, interpolação 480 V).
    expect(r.arcingCurrentKA).toBeCloseTo(28.79, 1);
    expect(r.arcingCurrentKA).toBeLessThan(45); // sempre menor que a franca
  });

  it("energia incidente cresce proporcionalmente ao tempo de arco", async () => {
    const t1 = await analyzeArcFlash(mvExample);
    const t2 = await analyzeArcFlash({ ...mvExample, arcDurationS: 0.4 });
    expect(t2.incidentEnergyCalCm2).toBeCloseTo(t1.incidentEnergyCalCm2 * 2, 1);
  });

  it("energia muito alta (falta lenta) → acima de 40 cal/cm² (proibido)", async () => {
    const r = await analyzeArcFlash({ ...mvExample, arcDurationS: 4 });
    expect(r.incidentEnergyCalCm2).toBeGreaterThan(40);
    expect(r.status).toBe("fail");
    expect(r.ppeCategory).toContain("proibido");
  });

  it("maior distância de trabalho reduz a energia incidente", async () => {
    const near = await analyzeArcFlash(mvExample);
    const far = await analyzeArcFlash({ ...mvExample, workingDistanceMm: 1828.8 });
    expect(far.incidentEnergyCalCm2).toBeLessThan(near.incidentEnergyCalCm2);
  });

  it("eletrodos em ar aberto (VOA) não aplicam correção de invólucro (CF = 1)", async () => {
    const r = await analyzeArcFlash({ ...mvExample, electrodeConfig: "VOA" });
    expect(r.enclosureCorrectionFactor).toBe(1);
  });

  it("é determinístico", async () => {
    const a = await analyzeArcFlash(mvExample);
    const b = await analyzeArcFlash(mvExample);
    expect(a.inputHash).toBe(b.inputHash);
    expect(a.incidentEnergyCalCm2).toBe(b.incidentEnergyCalCm2);
  });

  it("rejeita tensão fora da faixa 0,208–15 kV", async () => {
    await expect(analyzeArcFlash({ ...mvExample, systemVoltageKV: 30 })).rejects.toThrow();
  });
});
