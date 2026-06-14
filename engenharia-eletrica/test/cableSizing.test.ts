import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { calculateCableSizing, type CableSizingInput } from "@core/modules/cableSizing";

const baseCase: CableSizingInput = {
  ibAmps: 45,
  system: "three",
  voltageV: 380,
  lengthM: 85,
  cosPhi: 0.85,
  conductor: "Cu",
  insulation: "PVC",
  installMethod: "B1",
  ambientTempC: 38,
  groupingCircuits: 3,
  maxVoltageDropPct: 4,
  shortCircuitKA: 12,
  faultClearingS: 0.2,
};

describe("CableSizing — caso de referência", () => {
  it("seleciona a maior seção entre os três critérios", async () => {
    const r = await calculateCableSizing(baseCase);
    // Ampacidade exige 25 mm²; queda 10 mm²; curto-circuito (12 kA/0,2 s) ~50 mm².
    // Curto-circuito governa.
    expect(r.selectedSectionMm2).toBe(50);
    expect(r.governingCriterion).toBe("short_circuit");
    expect(r.overall).toBe("ok");
    expect(r.voltageDropPct).toBeLessThan(4);
    expect(r.correctedAmpacityA).toBeGreaterThanOrEqual(45);
  });

  it("é determinístico: mesmas entradas → mesmo hash e seção", async () => {
    const a = await calculateCableSizing(baseCase);
    const b = await calculateCableSizing(baseCase);
    expect(a.inputHash).toBe(b.inputHash);
    expect(a.selectedSectionMm2).toBe(b.selectedSectionMm2);
  });

  it("sem curto-circuito, ampacidade governa e o critério fica como aviso", async () => {
    const r = await calculateCableSizing({ ...baseCase, shortCircuitKA: 0 });
    expect(r.selectedSectionMm2).toBe(25); // governado pela ampacidade
    expect(r.governingCriterion).toBe("ampacity");
    expect(r.criteria.shortCircuit.status).toBe("warning");
    expect(r.overall).toBe("warning");
  });

  it("circuito longo é governado pela queda de tensão", async () => {
    const r = await calculateCableSizing({
      ...baseCase,
      lengthM: 250,
      shortCircuitKA: 0,
    });
    expect(r.governingCriterion).toBe("voltage_drop");
    expect(r.voltageDropPct).toBeLessThanOrEqual(4);
  });
});

describe("CableSizing — validação de entrada", () => {
  it("rejeita corrente não positiva", async () => {
    await expect(
      calculateCableSizing({ ...baseCase, ibAmps: -1 }),
    ).rejects.toThrow();
  });

  it("rejeita cos φ fora de faixa", async () => {
    await expect(
      calculateCableSizing({ ...baseCase, cosPhi: 1.5 }),
    ).rejects.toThrow();
  });

  it("dimensiona em alumínio com aviso de resistência aproximada", async () => {
    const cu = await calculateCableSizing({ ...baseCase, shortCircuitKA: 0 });
    const al = await calculateCableSizing({ ...baseCase, conductor: "Al", shortCircuitKA: 0 });
    expect(al.selectedSectionMm2).not.toBeNull();
    // Alumínio conduz menos → seção igual ou maior que a de cobre.
    expect(al.selectedSectionMm2!).toBeGreaterThanOrEqual(cu.selectedSectionMm2!);
    expect(al.warnings.some((w) => w.code === "AL_RESISTANCE_APPROX")).toBe(true);
  });
});

describe("CableSizing — propriedades", () => {
  it("monotonicidade: aumentar Ib nunca reduz a seção selecionada", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.double({ min: 5, max: 80, noNaN: true }),
        fc.double({ min: 0, max: 60, noNaN: true }),
        async (ib, deltaIb) => {
          const low = await calculateCableSizing({ ...baseCase, ibAmps: ib, shortCircuitKA: 0 });
          const high = await calculateCableSizing({ ...baseCase, ibAmps: ib + deltaIb, shortCircuitKA: 0 });
          if (low.selectedSectionMm2 === null || high.selectedSectionMm2 === null) return;
          expect(high.selectedSectionMm2).toBeGreaterThanOrEqual(low.selectedSectionMm2);
        },
      ),
      { numRuns: 60 },
    );
  });

  it("a seção selecionada sempre satisfaz a capacidade de condução", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.double({ min: 5, max: 200, noNaN: true }),
        fc.constantFrom("A1", "A2", "B1", "B2", "C"),
        fc.constantFrom("PVC", "XLPE"),
        async (ib, method, ins) => {
          const r = await calculateCableSizing({
            ...baseCase,
            ibAmps: ib,
            installMethod: method as CableSizingInput["installMethod"],
            insulation: ins as CableSizingInput["insulation"],
            shortCircuitKA: 0,
          });
          if (r.selectedSectionMm2 !== null) {
            expect(r.correctedAmpacityA).toBeGreaterThanOrEqual(ib - 1e-6);
          }
        },
      ),
      { numRuns: 80 },
    );
  });
});
