import { describe, it, expect } from "vitest";
import {
  checkSelectivity,
  deviceTripTime,
  inverseTime,
  type ProtectiveDevice,
  type SelectivityInput,
} from "@core/modules/protection";

describe("Curvas IEC 60255", () => {
  it("Standard Inverse confere com a fórmula t = TMS·k/((I/Is)^α−1)", () => {
    // I=1000, Is=100, TMS=0,1, SI(k=0,14, α=0,02) → ~0,297 s
    expect(inverseTime(1000, 100, 0.1, "SI")).toBeCloseTo(0.297, 2);
  });
  it("não atua abaixo do pickup (Infinity)", () => {
    expect(inverseTime(90, 100, 0.1, "SI")).toBe(Infinity);
  });
});

describe("deviceTripTime — composição de estágios", () => {
  it("o estágio mais rápido vence (instantâneo sobrepõe o inverso)", () => {
    const dev: ProtectiveDevice = {
      id: "d1",
      name: "Relé 51+50",
      stages: [
        { kind: "inverse", pickupA: 100, tms: 0.1, curve: "SI" },
        { kind: "instantaneous", pickupA: 2000, delayS: 0.02 },
      ],
    };
    expect(deviceTripTime(dev, 5000)).toBeCloseTo(0.02, 3); // instantâneo
    expect(deviceTripTime(dev, 1000)).toBeCloseTo(0.297, 2); // só inverso
  });
});

const downstream: ProtectiveDevice = {
  id: "down",
  name: "Relé jusante",
  stages: [{ kind: "inverse", pickupA: 100, tms: 0.1, curve: "SI" }],
};

describe("checkSelectivity", () => {
  it("coordenação adequada → seletivo", async () => {
    const input: SelectivityInput = {
      downstream,
      upstream: {
        id: "up",
        name: "Relé montante",
        stages: [{ kind: "inverse", pickupA: 300, tms: 0.2, curve: "SI" }],
      },
      faultCurrentKA: 5,
      minMarginS: 0.2,
    };
    const r = await checkSelectivity(input);
    expect(r.selective).toBe(true);
    expect(r.worstMarginS).toBeGreaterThanOrEqual(0.2);
    expect(r.downstreamClearingAtFaultS).toBeLessThan(r.upstreamClearingAtFaultS);
    expect(r.upstreamCurve.length).toBeGreaterThan(0);
    expect(r.downstreamCurve.length).toBeGreaterThan(0);
  });

  it("mesmo TMS → margem insuficiente → não seletivo", async () => {
    const input: SelectivityInput = {
      downstream,
      upstream: {
        id: "up",
        name: "Relé montante",
        stages: [{ kind: "inverse", pickupA: 300, tms: 0.1, curve: "SI" }],
      },
      faultCurrentKA: 5,
      minMarginS: 0.2,
    };
    const r = await checkSelectivity(input);
    expect(r.selective).toBe(false);
    expect(r.warnings.some((w) => w.code === "NON_SELECTIVE")).toBe(true);
  });

  it("é determinístico", async () => {
    const input: SelectivityInput = {
      downstream,
      upstream: { id: "up", name: "M", stages: [{ kind: "inverse", pickupA: 300, tms: 0.2, curve: "SI" }] },
      faultCurrentKA: 5,
    };
    const a = await checkSelectivity(input);
    const b = await checkSelectivity(input);
    expect(a.inputHash).toBe(b.inputHash);
    expect(a.worstMarginS).toBe(b.worstMarginS);
  });
});
