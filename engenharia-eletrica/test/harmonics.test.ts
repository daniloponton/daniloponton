import { describe, it, expect } from "vitest";
import { checkHarmonics, type HarmonicsInput } from "@core/modules/powerQuality";

const drive6p: HarmonicsInput = {
  systemVoltageKV: 0.38,
  shortCircuitRatio: 50,
  harmonics: [
    { order: 5, currentPercentIL: 18 },
    { order: 7, currentPercentIL: 12 },
    { order: 11, currentPercentIL: 7 },
    { order: 13, currentPercentIL: 5 },
  ],
};

describe("Harmônicas (IEEE 519-2014)", () => {
  it("acionamento de 6 pulsos viola os limites (TDD e individuais)", async () => {
    const r = await checkHarmonics(drive6p);
    // Isc/IL=50 → linha 50<100: limites 3-11=10, 11-17=4.5, TDD=12
    expect(r.tddLimitPercent).toBe(12);
    expect(r.tddPercent).toBeCloseTo(23.28, 1); // √(18²+12²+7²+5²)
    expect(r.tddOk).toBe(false);
    expect(r.perHarmonic.find((h) => h.order === 5)?.ok).toBe(false);
    expect(r.perHarmonic.find((h) => h.order === 11)?.limitPercent).toBe(4.5);
    expect(r.status).toBe("fail");
    expect(r.warnings.some((w) => w.code === "TDD_OVER")).toBe(true);
  });

  it("espectro baixo é conforme", async () => {
    const r = await checkHarmonics({
      systemVoltageKV: 0.38,
      shortCircuitRatio: 50,
      harmonics: [
        { order: 5, currentPercentIL: 3 },
        { order: 7, currentPercentIL: 2 },
        { order: 11, currentPercentIL: 1 },
      ],
    });
    expect(r.tddPercent).toBeCloseTo(3.74, 1);
    expect(r.tddOk).toBe(true);
    expect(r.status).toBe("ok");
  });

  it("calcula Isc/IL a partir de Isc e IL", async () => {
    const r = await checkHarmonics({
      systemVoltageKV: 0.38,
      iscA: 20000,
      loadCurrentA: 200,
      harmonics: [{ order: 5, currentPercentIL: 3 }],
    });
    expect(r.shortCircuitRatio).toBe(100);
  });

  it("harmônica par tem limite de 25% do ímpar", async () => {
    const r = await checkHarmonics({
      systemVoltageKV: 0.38,
      shortCircuitRatio: 50,
      harmonics: [{ order: 4, currentPercentIL: 2 }],
    });
    // ordem 4 (par, faixa 3-11): 10 × 0,25 = 2,5
    expect(r.perHarmonic[0].limitPercent).toBe(2.5);
  });

  it("THD de tensão é comparado ao limite por nível", async () => {
    const r = await checkHarmonics({
      systemVoltageKV: 0.38,
      shortCircuitRatio: 50,
      harmonics: [],
      voltageThdPercent: 9,
    });
    expect(r.voltageThdLimitPercent).toBe(8); // ≤1 kV
    expect(r.voltageThdOk).toBe(false);
    expect(r.status).toBe("fail");
  });

  it("é determinístico", async () => {
    const a = await checkHarmonics(drive6p);
    const b = await checkHarmonics(drive6p);
    expect(a.inputHash).toBe(b.inputHash);
  });
});
