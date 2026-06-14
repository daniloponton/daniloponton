import { describe, it, expect } from "vitest";
import { buildSingleLine, type Circuit } from "@core/index";

const circuit: Circuit = {
  id: "c1",
  name: "Alimentador",
  shortCircuit: {
    faultVoltageV: 400,
    feeder: { skMVA: 500, unHvKV: 13.8, rxRatio: 0.1 },
    transformer: { srKVA: 1000, ukrPercent: 6, copperLossKW: 12, unHvKV: 13.8, unLvV: 400, applyKT: true },
    cables: [],
  },
  protection: {
    downstream: { id: "d", name: "J", stages: [{ kind: "inverse", pickupA: 100, tms: 0.1, curve: "SI" }] },
    upstream: { id: "u", name: "M", stages: [{ kind: "inverse", pickupA: 300, tms: 0.2, curve: "SI" }] },
    faultCurrentKA: 25,
  },
  cable: {
    ibAmps: 45, system: "three", voltageV: 400, lengthM: 85, cosPhi: 0.85,
    insulation: "PVC", installMethod: "B1", ambientTempC: 38, groupingCircuits: 3,
  },
};

describe("buildSingleLine", () => {
  it("monta os elementos da fonte à carga na ordem correta", () => {
    const el = buildSingleLine(circuit, {});
    expect(el.map((e) => e.kind)).toEqual([
      "utility", "transformer", "busbar", "protection", "cable", "load",
    ]);
  });

  it("inclui dados dos resultados quando disponíveis", () => {
    const el = buildSingleLine(circuit, {
      shortCircuit: { ikSymKA: 25.3 } as never,
      cable: { selectedSectionMm2: 50, voltageDropPct: 1.4, overall: "ok" } as never,
    });
    const bus = el.find((e) => e.kind === "busbar")!;
    expect(bus.details.join(" ")).toContain("25.3");
    const cable = el.find((e) => e.kind === "cable")!;
    expect(cable.details.join(" ")).toContain("50 mm²");
    expect(cable.status).toBe("ok");
  });

  it("omite trafo quando não há e funciona só com cabo", () => {
    const el = buildSingleLine({ id: "x", name: "y", cable: circuit.cable }, {});
    expect(el.map((e) => e.kind)).toEqual(["busbar", "cable", "load"]);
  });
});
