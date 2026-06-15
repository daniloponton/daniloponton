import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { analyzeLoadSchedule, type LoadScheduleInput } from "@core/modules/loadSchedule";

const base: LoadScheduleInput = {
  lineVoltageV: 380,
  phaseVoltageV: 220,
  loads: [
    { name: "Iluminação", activePowerW: 3000, powerFactor: 1, connection: "L1" },
    { name: "Tomadas", activePowerW: 3000, powerFactor: 1, connection: "L2" },
    { name: "Ar-condicionado", activePowerW: 3000, powerFactor: 1, connection: "L3" },
  ],
};

describe("Quadro de cargas — demanda e equilíbrio", () => {
  it("quadro equilibrado: desequilíbrio nulo e correntes iguais", async () => {
    const r = await analyzeLoadSchedule(base);
    expect(r.demandedActiveKW).toBeCloseTo(9, 3);
    expect(r.phaseUnbalancePct).toBe(0);
    // 3000 W / 220 V ≈ 13,64 A por fase.
    for (const p of r.phaseLoads) expect(p.currentA).toBeCloseTo(13.64, 1);
    // Neutro nulo quando as três fases têm corrente igual (cargas resistivas).
    expect(r.neutralCurrentA).toBeCloseTo(0, 2);
    expect(r.status).toBe("ok");
  });

  it("corrente de demanda do alimentador = S/(√3·V_LL)", async () => {
    const r = await analyzeLoadSchedule(base);
    // S = 9 kVA (FP=1) → I = 9000/(√3·380) ≈ 13,67 A.
    expect(r.demandCurrentA).toBeCloseTo(13.67, 1);
  });

  it("aplica o fator de demanda na potência demandada", async () => {
    const r = await analyzeLoadSchedule({
      ...base,
      loads: base.loads.map((l) => ({ ...l, demandFactor: 0.5 })),
    });
    expect(r.installedActiveKW).toBeCloseTo(9, 3); // instalada não muda
    expect(r.demandedActiveKW).toBeCloseTo(4.5, 3); // demanda cai à metade
  });

  it("quadro desequilibrado gera aviso e status warning/fail", async () => {
    const r = await analyzeLoadSchedule({
      lineVoltageV: 380,
      phaseVoltageV: 220,
      maxUnbalancePct: 15,
      loads: [
        { name: "Carga grande", activePowerW: 10000, powerFactor: 1, connection: "L1" },
        { name: "Carga pequena", activePowerW: 1000, powerFactor: 1, connection: "L2" },
      ],
    });
    expect(r.phaseUnbalancePct).toBeGreaterThan(15);
    expect(r.status).not.toBe("ok");
    expect(r.warnings.some((w) => w.code === "PHASE_UNBALANCE")).toBe(true);
    // L3 sem carga → corrente de neutro relevante.
    expect(r.neutralCurrentA).toBeGreaterThan(0);
  });

  it("carga trifásica equilibrada (L123) distribui igualmente entre as fases", async () => {
    const r = await analyzeLoadSchedule({
      lineVoltageV: 380,
      phaseVoltageV: 220,
      loads: [{ name: "Motor", activePowerW: 15000, powerFactor: 0.85, connection: "L123" }],
    });
    expect(r.phaseUnbalancePct).toBe(0);
    expect(r.neutralCurrentA).toBeCloseTo(0, 2);
    // FP de demanda = FP do motor.
    expect(r.demandPowerFactor).toBeCloseTo(0.85, 2);
    expect(r.warnings.some((w) => w.code === "LOW_POWER_FACTOR")).toBe(true);
  });

  it("é determinístico", async () => {
    const a = await analyzeLoadSchedule(base);
    const b = await analyzeLoadSchedule(base);
    expect(a.inputHash).toBe(b.inputHash);
    expect(a.demandCurrentA).toBe(b.demandCurrentA);
  });

  it("rejeita quadro sem cargas", async () => {
    await expect(analyzeLoadSchedule({ ...base, loads: [] })).rejects.toThrow();
  });

  it("rejeita fator de demanda fora de [0,1]", async () => {
    await expect(
      analyzeLoadSchedule({ ...base, loads: [{ name: "x", activePowerW: 100, demandFactor: 1.5 }] }),
    ).rejects.toThrow();
  });
});

describe("Quadro de cargas — propriedades", () => {
  it("a demanda nunca excede a potência instalada", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            p: fc.double({ min: 100, max: 20000, noNaN: true }),
            fd: fc.double({ min: 0, max: 1, noNaN: true }),
          }),
          { minLength: 1, maxLength: 8 },
        ),
        async (items) => {
          const r = await analyzeLoadSchedule({
            lineVoltageV: 380,
            phaseVoltageV: 220,
            loads: items.map((it, i) => ({
              name: `c${i}`,
              activePowerW: it.p,
              powerFactor: 1,
              demandFactor: it.fd,
              connection: "L123",
            })),
          });
          expect(r.demandedActiveKW).toBeLessThanOrEqual(r.installedActiveKW + 1e-6);
        },
      ),
      { numRuns: 60 },
    );
  });
});
