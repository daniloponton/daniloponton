import { describe, it, expect } from "vitest";
import {
  calculateVoltageDrop,
  sizeCapacitorBank,
  analyzeMotorStarting,
  type VoltageDropInput,
  type CapacitorBankInput,
  type MotorStartingInput,
} from "@core/modules/powerQuality";

describe("Queda de tensão em alimentador", () => {
  const base: VoltageDropInput = {
    system: "three",
    baseVoltageV: 380,
    maxVoltageDropPct: 4,
    segments: [
      { sectionMm2: 35, lengthM: 100, currentA: 80, cosPhi: 0.9, label: "tronco" },
      { sectionMm2: 16, lengthM: 50, currentA: 40, cosPhi: 0.9, label: "ramal" },
    ],
  };

  it("acumula a queda ao longo dos trechos", async () => {
    const r = await calculateVoltageDrop(base);
    expect(r.nodes).toHaveLength(2);
    expect(r.nodes[1].cumulativeDropV).toBeGreaterThan(r.nodes[0].cumulativeDropV);
    expect(r.totalDropPct).toBeCloseTo(r.nodes[1].cumulativeDropPct, 5);
    expect(r.nodes[1].voltageAtNodeV).toBeLessThan(base.baseVoltageV);
  });

  it("sinaliza quando excede o limite", async () => {
    const r = await calculateVoltageDrop({
      ...base,
      segments: [{ sectionMm2: 4, lengthM: 300, currentA: 30, cosPhi: 0.85 }],
    });
    expect(r.status).toBe("fail");
    expect(r.warnings.some((w) => w.code === "OVER_LIMIT")).toBe(true);
  });

  it("rejeita seção fora da tabela", async () => {
    await expect(
      calculateVoltageDrop({ ...base, segments: [{ sectionMm2: 999, lengthM: 10, currentA: 10 }] }),
    ).rejects.toThrow();
  });
});

describe("Banco de capacitores", () => {
  const base: CapacitorBankInput = {
    activePowerKW: 100,
    currentCosPhi: 0.8,
    targetCosPhi: 0.95,
    voltageV: 380,
  };

  it("Qc = P·(tanφ1 − tanφ2) ≈ 42,1 kvar para 100 kW de 0,8→0,95", async () => {
    const r = await sizeCapacitorBank(base);
    // tan(acos0.8)=0.75 ; tan(acos0.95)=0.3287 → 100*(0.75-0.3287)=42.1
    expect(r.requiredKvar).toBeCloseTo(42.1, 0);
    expect(r.recommendedKvar).toBeGreaterThanOrEqual(r.requiredKvar);
    expect(r.currentReductionPct).toBeGreaterThan(0);
    expect(r.apparentAfterKVA).toBeLessThan(r.apparentBeforeKVA);
  });

  it("avisa quando não há correção a fazer", async () => {
    const r = await sizeCapacitorBank({ ...base, targetCosPhi: 0.8 });
    expect(r.warnings.some((w) => w.code === "NO_CORRECTION_NEEDED")).toBe(true);
  });
});

describe("Partida de motores", () => {
  const base: MotorStartingInput = {
    motorPowerKW: 75,
    voltageV: 380,
    efficiency: 0.93,
    cosPhi: 0.86,
    lockedRotorRatio: 7,
    startingCosPhi: 0.3,
    startMethod: "DOL",
    sourceShortCircuitMVA: 8,
    maxVoltageDipPct: 10,
  };

  it("partida estrela-triângulo reduz corrente e afundamento vs DOL", async () => {
    const dol = await analyzeMotorStarting(base);
    const yd = await analyzeMotorStarting({ ...base, startMethod: "star_delta" });
    expect(yd.startingCurrentA).toBeCloseTo(dol.startingCurrentA / 3, 0);
    expect(yd.voltageDipPct).toBeLessThan(dol.voltageDipPct);
    expect(yd.startingTorqueFactor).toBeCloseTo(1 / 3, 3);
  });

  it("afundamento elevado em fonte fraca é sinalizado", async () => {
    const r = await analyzeMotorStarting({ ...base, sourceShortCircuitMVA: 3, startMethod: "DOL" });
    expect(r.voltageDipPct).toBeGreaterThan(0);
    if (r.voltageDipPct > 10) expect(r.status).toBe("fail");
  });

  it("VFD tem corrente de partida muito menor que DOL", async () => {
    const dol = await analyzeMotorStarting(base);
    const vfd = await analyzeMotorStarting({ ...base, startMethod: "vfd" });
    expect(vfd.startingCurrentA).toBeLessThan(dol.startingCurrentA);
    expect(vfd.voltageDipPct).toBeLessThan(dol.voltageDipPct);
  });

  it("é determinístico", async () => {
    const a = await analyzeMotorStarting(base);
    const b = await analyzeMotorStarting(base);
    expect(a.inputHash).toBe(b.inputHash);
  });
});
