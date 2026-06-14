import { describe, it, expect } from "vitest";
import {
  createProject,
  createCircuit,
  evaluateCircuit,
  MemoryProjectStore,
  type Circuit,
} from "@core/project";

const fullCircuit: Circuit = {
  id: "c1",
  name: "Alimentador QGBT",
  shortCircuit: {
    faultVoltageV: 400,
    faultVoltageLevel: "LV",
    feeder: { skMVA: 500, unHvKV: 13.8, rxRatio: 0.1 },
    transformer: { srKVA: 1000, ukrPercent: 6, copperLossKW: 12, unHvKV: 13.8, unLvV: 400, applyKT: true },
    cables: [],
  },
  protection: {
    downstream: { id: "d", name: "Jusante", stages: [{ kind: "inverse", pickupA: 100, tms: 0.1, curve: "SI" }] },
    upstream: { id: "u", name: "Montante", stages: [{ kind: "inverse", pickupA: 300, tms: 0.2, curve: "SI" }] },
    faultCurrentKA: 1, // placeholder: será sobrescrito pela I"k do curto
    minMarginS: 0.2,
  },
  cable: {
    ibAmps: 45,
    system: "three",
    voltageV: 400,
    lengthM: 85,
    cosPhi: 0.85,
    conductor: "Cu",
    insulation: "PVC",
    installMethod: "B1",
    ambientTempC: 38,
    groupingCircuits: 3,
    maxVoltageDropPct: 4,
    shortCircuitKA: 0, // será preenchido pela I"k do curto
    faultClearingS: 0.1, // será preenchido pelo tempo da proteção
  },
};

describe("evaluateCircuit — propagação entre módulos", () => {
  it("injeta a I\"k do curto na proteção e no cabo", async () => {
    const e = await evaluateCircuit(fullCircuit);
    expect(e.shortCircuit).not.toBeNull();
    const ik = e.shortCircuit!.ikSymKA;
    expect(e.propagation.ikSymKA).toBe(ik);

    // A proteção foi avaliada com a I"k real (não com o placeholder de 1 kA):
    // a curva chega até ~ik kA, então a corrente da pior margem supera 1000 A.
    expect(e.protection!.worstCurrentA).toBeGreaterThan(1000);

    // O cabo recebeu Icc > 0 → o critério térmico de curto passou a valer.
    expect(e.cable!.minSectionByShortCircuitMm2).toBeGreaterThan(0);
    expect(e.cable!.criteria.shortCircuit.status).not.toBe("warning");
  });

  it("injeta o tempo de atuação da proteção no critério térmico do cabo", async () => {
    const e = await evaluateCircuit(fullCircuit);
    expect(e.propagation.clearingS).toBe(e.protection!.downstreamClearingAtFaultS);
    expect(e.propagation.clearingS).toBeGreaterThan(0);
  });

  it("módulos ausentes resultam em null, sem quebrar", async () => {
    const e = await evaluateCircuit({ id: "x", name: "só curto", shortCircuit: fullCircuit.shortCircuit });
    expect(e.shortCircuit).not.toBeNull();
    expect(e.protection).toBeNull();
    expect(e.cable).toBeNull();
  });
});

describe("MemoryProjectStore — CRUD", () => {
  it("salva, lê, lista e remove", async () => {
    const store = new MemoryProjectStore();
    const p = createProject("Projeto Teste");
    p.circuits.push(createCircuit("Circuito 1"));

    await store.save(p);
    const loaded = await store.get(p.id);
    expect(loaded?.name).toBe("Projeto Teste");
    expect(loaded?.circuits).toHaveLength(1);

    const list = await store.list();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(p.id);

    await store.remove(p.id);
    expect(await store.get(p.id)).toBeNull();
    expect(await store.list()).toHaveLength(0);
  });

  it("persiste um projeto com múltiplos circuitos", async () => {
    const store = new MemoryProjectStore();
    const p = createProject("Quadro QGBT");
    p.circuits.push(createCircuit("Alimentador 1"), createCircuit("Alimentador 2"), createCircuit("Alimentador 3"));
    await store.save(p);
    const loaded = await store.get(p.id);
    expect(loaded?.circuits).toHaveLength(3);
    expect(loaded?.circuits.map((c) => c.name)).toEqual([
      "Alimentador 1", "Alimentador 2", "Alimentador 3",
    ]);
  });

  it("createProject/createCircuit geram ids únicos", () => {
    const a = createProject("A");
    const b = createProject("B");
    expect(a.id).not.toBe(b.id);
    expect(createCircuit("x").id).not.toBe(createCircuit("y").id);
  });
});
