import { describe, it, expect } from "vitest";
import { calculateShortCircuit, type ShortCircuitInput } from "@core/modules/shortCircuit";

// Caso clássico: rede 13,8 kV (S"k = 500 MVA) → trafo 1000 kVA 6% (Pcu=12 kW)
// 13,8 kV/400 V → barramento BT. Verificável à mão (ver memorial no código-fonte).
const refCase: ShortCircuitInput = {
  faultVoltageV: 400,
  faultVoltageLevel: "LV",
  cVariant: "max",
  feeder: { skMVA: 500, unHvKV: 13.8, rxRatio: 0.1 },
  transformer: {
    srKVA: 1000,
    ukrPercent: 6,
    copperLossKW: 12,
    unHvKV: 13.8,
    unLvV: 400,
    applyKT: true,
  },
  cables: [],
};

describe("ShortCircuit IEC 60909 — caso de referência", () => {
  it("I\"k no barramento BT ≈ 25,3 kA", async () => {
    const r = await calculateShortCircuit(refCase);
    expect(r.cFactor).toBe(1.05);
    expect(r.ikSymKA).toBeCloseTo(25.3, 0); // ~25,3 kA
    expect(r.ipKA).toBeGreaterThan(r.ikSymKA); // pico > simétrica
    expect(r.kappa).toBeGreaterThan(1.0);
    expect(r.kappa).toBeLessThanOrEqual(2.0);
    expect(r.skMVA).toBeGreaterThan(0);
  });

  it("é determinístico", async () => {
    const a = await calculateShortCircuit(refCase);
    const b = await calculateShortCircuit(refCase);
    expect(a.inputHash).toBe(b.inputHash);
    expect(a.ikSymKA).toBe(b.ikSymKA);
  });

  it("trafo de maior impedância reduz I\"k", async () => {
    const lowZ = await calculateShortCircuit(refCase);
    const highZ = await calculateShortCircuit({
      ...refCase,
      transformer: { ...refCase.transformer!, ukrPercent: 8 },
    });
    expect(highZ.ikSymKA).toBeLessThan(lowZ.ikSymKA);
  });

  it("cabo a jusante reduz I\"k no ponto de falta", async () => {
    const semCabo = await calculateShortCircuit(refCase);
    const comCabo = await calculateShortCircuit({
      ...refCase,
      cables: [{ rOhmPerKm: 1.83, xOhmPerKm: 0.094, lengthM: 50, parallel: 1 }],
    });
    expect(comCabo.ikSymKA).toBeLessThan(semCabo.ikSymKA);
  });
});

describe("ShortCircuit IEC 60909 — variantes e validação", () => {
  it("c=0,95 (cmin) reduz a corrente vs c=1,05 (cmax)", async () => {
    const cmax = await calculateShortCircuit(refCase);
    const cmin = await calculateShortCircuit({ ...refCase, cVariant: "min" });
    expect(cmin.ikSymKA).toBeLessThan(cmax.ikSymKA);
    expect(cmin.cFactor).toBe(0.95);
  });

  it("sem transformador, calcula direto no nível da falta", async () => {
    const r = await calculateShortCircuit({
      faultVoltageV: 13800,
      faultVoltageLevel: "MV",
      feeder: { skMVA: 500, unHvKV: 13.8, rxRatio: 0.1 },
      cables: [],
    });
    expect(r.cFactor).toBe(1.1);
    expect(r.ikSymKA).toBeGreaterThan(0);
  });

  it("rejeita potência de curto não positiva", async () => {
    await expect(
      calculateShortCircuit({ ...refCase, feeder: { ...refCase.feeder, skMVA: 0 } }),
    ).rejects.toThrow();
  });

  it("avisa quando a resistência do trafo não é informada", async () => {
    const r = await calculateShortCircuit({
      ...refCase,
      transformer: { srKVA: 1000, ukrPercent: 6, unHvKV: 13.8, unLvV: 400, applyKT: true },
    });
    expect(r.warnings.some((w) => w.code === "TX_NO_R")).toBe(true);
  });
});
