import { describe, it, expect } from "vitest";
import {
  sizePvString,
  dcStringVoltageDrop,
  type PvStringInput,
} from "@core/modules/pv";

const base: PvStringInput = {
  module: {
    vocStcV: 49.5,
    vmpStcV: 41.5,
    iscStcA: 11.5,
    impStcA: 10.8,
    tempCoeffVocPctPerC: -0.27,
  },
  inverter: {
    maxDcVoltageV: 1100,
    mpptMinV: 200,
    mpptMaxV: 1000,
    maxInputCurrentA: 26,
  },
  minCellTempC: -10,
  maxCellTempC: 70,
};

describe("Dimensionamento de string FV (NBR 16690)", () => {
  it("corrige Voc/Vmp e calcula limites de módulos por string", async () => {
    const r = await sizePvString(base);
    expect(r.vocAtMinTempV).toBeCloseTo(54.18, 1); // frio aumenta Voc
    expect(r.maxModulesByVoltage).toBe(20);
    expect(r.maxModulesByMppt).toBe(22);
    expect(r.minModulesByMppt).toBe(6);
    expect(r.recommendedModulesPerString).toBe(20);
    expect(r.maxParallelStrings).toBe(2);
    expect(r.status).toBe("ok");
  });

  it("string limitada pela tensão CC do inversor emite aviso", async () => {
    const r = await sizePvString(base);
    expect(r.warnings.some((w) => w.code === "VOLTAGE_LIMITED")).toBe(true);
  });

  it("inversor incompatível → sem nº de módulos válido", async () => {
    const r = await sizePvString({
      ...base,
      inverter: { maxDcVoltageV: 250, mpptMinV: 200, mpptMaxV: 250, maxInputCurrentA: 26 },
    });
    expect(r.status).toBe("fail");
    expect(r.warnings.some((w) => w.code === "NO_VALID_STRING")).toBe(true);
  });

  it("é determinístico", async () => {
    const a = await sizePvString(base);
    const b = await sizePvString(base);
    expect(a.inputHash).toBe(b.inputHash);
  });
});

describe("Queda de tensão CC da string", () => {
  it("dentro do limite com 4 mm² em 30 m", async () => {
    const r = await dcStringVoltageDrop({
      currentA: 10.8,
      lengthM: 30,
      sectionMm2: 4,
      stringVoltageV: 830,
      maxDropPct: 1,
    });
    expect(r.dropPct).toBeCloseTo(0.43, 1);
    expect(r.status).toBe("ok");
  });

  it("excede o limite com 1,5 mm² em 100 m", async () => {
    const r = await dcStringVoltageDrop({
      currentA: 10.8,
      lengthM: 100,
      sectionMm2: 1.5,
      stringVoltageV: 830,
      maxDropPct: 1,
    });
    expect(r.status).toBe("fail");
  });
});
