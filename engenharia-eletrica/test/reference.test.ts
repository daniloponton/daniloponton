/**
 * Validação cruzada: casos de referência com fonte citada e cálculo manual
 * documentado. Cada asserção exige erro relativo ≤ tolerância — protege contra
 * regressão e confirma a correção dos algoritmos (fórmulas) dos motores.
 *
 * NOTA DE PROVENIÊNCIA: os casos abaixo validam as FÓRMULAS (curto-circuito,
 * aterramento, fator de potência, queda de tensão, curvas IEC 60255, esfera
 * rolante, string FV). As TABELAS de capacidade de condução (ampacidade) da
 * IEC 60364-5-52 são dados tabelados e devem ser conferidos contra a edição
 * vigente da norma — ver docs/VALIDACAO.md.
 */
import { describe, it, expect } from "vitest";
import { calculateShortCircuit } from "@core/modules/shortCircuit";
import { sizeCapacitorBank, calculateVoltageDrop } from "@core/modules/powerQuality";
import { analyzeGrounding } from "@core/modules/grounding";
import { inverseTime } from "@core/modules/protection";
import { rollingSphereRadius } from "@core/modules/grounding";
import { sizePvString } from "@core/modules/pv";
import { IEC_60364_5_52 } from "@core/norms";

/** Exige erro relativo (%) ≤ tolerância. */
function expectClose(actual: number, expected: number, relTolPct: number, label = "") {
  const err = (Math.abs(actual - expected) / Math.abs(expected)) * 100;
  expect(
    err,
    `${label}: esperado ${expected}, obtido ${actual} (erro ${err.toFixed(2)}% > ${relTolPct}%)`,
  ).toBeLessThanOrEqual(relTolPct);
}

describe("Ref. IEC 60909 — curto-circuito trifásico", () => {
  it('rede 13,8 kV (S"k=500 MVA) + trafo 1000 kVA 6% (Pcu=12 kW) → I"k ≈ 25,26 kA', async () => {
    // Cálculo manual: ZQ_LV≈3,5e-4∠~84°; ZT(KT)≈9,6e-3∠~78°; Zk≈9,60e-3 Ω
    // I"k = 1,05·400/(√3·9,60e-3) ≈ 25,26 kA
    const r = await calculateShortCircuit({
      faultVoltageV: 400,
      feeder: { skMVA: 500, unHvKV: 13.8, rxRatio: 0.1 },
      transformer: { srKVA: 1000, ukrPercent: 6, copperLossKW: 12, unHvKV: 13.8, unLvV: 400, applyKT: true },
      cables: [],
    });
    expectClose(r.ikSymKA, 25.26, 1.5, 'I"k');
  });
});

describe("Ref. NBR 5410:2004 Tab. 36 — ampacidade PVC/cobre", () => {
  const amp = IEC_60364_5_52.ampacity;
  it("método B1 (2 e 3 condutores carregados)", () => {
    expect(amp.Cu.B1.PVC[2][1.5]).toBe(17.5);
    expect(amp.Cu.B1.PVC[2][240]).toBe(415);
    expect(amp.Cu.B1.PVC[3][25]).toBe(89);
    expect(amp.Cu.B1.PVC[3][240]).toBe(369);
  });
  it("método C (2 e 3 condutores carregados)", () => {
    expect(amp.Cu.C.PVC[2][240]).toBe(461);
    expect(amp.Cu.C.PVC[3][25]).toBe(96);
    expect(amp.Cu.C.PVC[3][240]).toBe(403);
  });
  it("método B2 — valores corrigidos em 150/185/240 mm²", () => {
    expect(amp.Cu.B2.PVC[2][150]).toBe(265);
    expect(amp.Cu.B2.PVC[2][185]).toBe(300);
    expect(amp.Cu.B2.PVC[2][240]).toBe(351);
    expect(amp.Cu.B2.PVC[3][150]).toBe(236);
    expect(amp.Cu.B2.PVC[3][185]).toBe(268);
    expect(amp.Cu.B2.PVC[3][240]).toBe(313);
  });
  it("fatores de temperatura (Tab. 40) e agrupamento (Tab. 42)", () => {
    expect(IEC_60364_5_52.tempCorrection.PVC[40]).toBe(0.87);
    expect(IEC_60364_5_52.tempCorrection.XLPE[80]).toBe(0.41);
    expect(IEC_60364_5_52.groupingCorrection[20]).toBe(0.38);
  });
});

describe("Ref. NBR 5410:2004 Tab. 37 — ampacidade EPR/XLPE/cobre", () => {
  const amp = IEC_60364_5_52.ampacity;
  it("método B1 (2 e 3 condutores carregados)", () => {
    expect(amp.Cu.B1.XLPE[2][240]).toBe(546);
    expect(amp.Cu.B1.XLPE[2][150]).toBe(407);
    expect(amp.Cu.B1.XLPE[3][240]).toBe(481);
    expect(amp.Cu.B1.XLPE[3][16]).toBe(88);
  });
  it("método B2 (2 e 3 condutores carregados)", () => {
    expect(amp.Cu.B2.XLPE[2][150]).toBe(349);
    expect(amp.Cu.B2.XLPE[2][240]).toBe(462);
    expect(amp.Cu.B2.XLPE[3][1.5]).toBe(19.5);
    expect(amp.Cu.B2.XLPE[3][240]).toBe(407);
  });
  it("método C (2 e 3 condutores carregados)", () => {
    expect(amp.Cu.C.XLPE[2][240]).toBe(599);
    expect(amp.Cu.C.XLPE[3][25]).toBe(119);
    expect(amp.Cu.C.XLPE[3][240]).toBe(500);
  });
});

describe("Ref. NBR 5410:2004 — métodos A1 e A2 (cobre)", () => {
  const amp = IEC_60364_5_52.ampacity;
  it("A1 PVC/Cu e XLPE/Cu", () => {
    expect(amp.Cu.A1.PVC[2][1.5]).toBe(14.5);
    expect(amp.Cu.A1.PVC[2][240]).toBe(321);
    expect(amp.Cu.A1.XLPE[3][240]).toBe(380);
  });
  it("A2 PVC/Cu e XLPE/Cu", () => {
    expect(amp.Cu.A2.PVC[3][1.5]).toBe(13);
    expect(amp.Cu.A2.PVC[2][240]).toBe(291);
    expect(amp.Cu.A2.XLPE[2][1.5]).toBe(18.5);
  });
});

describe("Ref. NBR 5410:2004 — método D (enterrado) e correções de solo", () => {
  const amp = IEC_60364_5_52.ampacity;
  it("ampacidade D (cobre e alumínio, Tab. 36/37 coluna D)", () => {
    expect(amp.Cu.D.PVC[2][240]).toBe(361);
    expect(amp.Cu.D.PVC[3][1.5]).toBe(18);
    expect(amp.Cu.D.XLPE[2][240]).toBe(419);
    expect(amp.Al.D.PVC[2][16]).toBe(62);
    expect(amp.Al.D.XLPE[2][240]).toBe(322);
  });
  it("correções de solo: temperatura (Tab. 40), resistividade (Tab. 41), agrupamento (Tab. 44)", () => {
    expect(IEC_60364_5_52.soilTempCorrection.PVC[40]).toBe(0.77);
    expect(IEC_60364_5_52.soilThermalResistivityCorrection[1]).toBe(1.18);
    expect(IEC_60364_5_52.buriedGroupingCorrection[3]).toBe(0.65);
  });
});

describe("Ref. NBR 5410:2004 — ampacidade alumínio", () => {
  const amp = IEC_60364_5_52.ampacity;
  it("PVC/Al (Tab. 36) — métodos B1, B2, C", () => {
    expect(amp.Al.B1.PVC[2][10]).toBe(44);
    expect(amp.Al.B1.PVC[2][240]).toBe(324);
    expect(amp.Al.B2.PVC[3][10]).toBe(36);
    expect(amp.Al.C.PVC[2][240]).toBe(352);
    expect(amp.Al.B1.PVC[2][1.5]).toBeUndefined(); // Al não tem < 10 mm² em PVC
  });
  it("EPR/XLPE/Al (Tab. 37) — métodos B1, B2, C", () => {
    expect(amp.Al.B1.XLPE[2][16]).toBe(79);
    expect(amp.Al.B1.XLPE[2][240]).toBe(433);
    expect(amp.Al.C.XLPE[3][240]).toBe(382);
    expect(amp.Al.B2.XLPE[2][10]).toBeUndefined(); // Al/XLPE começa em 16 mm²
  });
});

describe("Ref. correção de fator de potência (trigonometria)", () => {
  it("100 kW, 0,80 → 0,95 → Qc ≈ 42,13 kvar", async () => {
    // Qc = 100·(tan(acos0,80) − tan(acos0,95)) = 100·(0,7500 − 0,3287) = 42,13
    const r = await sizeCapacitorBank({ activePowerKW: 100, currentCosPhi: 0.8, targetCosPhi: 0.95, voltageV: 380 });
    expectClose(r.requiredKvar, 42.13, 0.5, "Qc");
  });

  it("500 kW, 0,70 → 0,92 → Qc ≈ 297,0 kvar", async () => {
    const r = await sizeCapacitorBank({ activePowerKW: 500, currentCosPhi: 0.7, targetCosPhi: 0.92, voltageV: 380 });
    expectClose(r.requiredKvar, 297.0, 1.0, "Qc");
  });
});

describe("Ref. IEEE 80 / NBR 7117 — aterramento", () => {
  it("Wenner: ρ = 2πaR (a=5 m, R=8 Ω) = 251,33 Ω·m", async () => {
    const r = await analyzeGrounding({ soilMethod: "wenner", wennerSpacingM: 5, wennerResistanceOhm: 8, electrode: "rod", faultCurrentA: 100 });
    expectClose(r.soilResistivityOhmM, 251.33, 0.2, "ρ");
  });

  it("Dwight: ρ=100, L=3 m, d=16 mm → R ≈ 29,81 Ω", async () => {
    // R = 100/(2π·3)·(ln(4·3/0,016) − 1) = 5,305·(6,620 − 1) = 29,81 Ω
    const r = await analyzeGrounding({ soilMethod: "direct", soilResistivity: 100, electrode: "rod", rodLengthM: 3, rodDiameterM: 0.016, faultCurrentA: 100 });
    expectClose(r.electrodeResistanceOhm, 29.81, 1.0, "R haste");
  });

  it("Tensão de toque tolerável (70 kg, ρs=2500, hs=0,102, ρ=400, t=0,5 s) ≈ 840,5 V", async () => {
    // Cs=0,7429 ; E_toque=(1000+1,5·0,7429·2500)·0,157/√0,5 = 840,5 V
    const r = await analyzeGrounding({
      soilMethod: "direct", soilResistivity: 400, electrode: "rod", faultCurrentA: 100,
      faultClearingS: 0.5, bodyWeightKg: 70, surfaceLayerResistivity: 2500, surfaceLayerThicknessM: 0.102,
    });
    expectClose(r.tolerableTouchV, 840.5, 1.0, "E_toque");
  });
});

describe("Ref. IEC 62305 — esfera rolante", () => {
  it("modelo eletrogeométrico r = 10·I^0,65; I=3 kA → ≈ 20 m (coerente com NP I)", () => {
    expectClose(rollingSphereRadius(3), 20.4, 1.0, "raio");
  });
});

describe("Ref. IEC 60255 — curva de relé (Standard Inverse)", () => {
  it("I=600 A, Is=100 A, TMS=0,5 → t ≈ 1,918 s", () => {
    // t = 0,14·0,5/((6)^0,02 − 1) = 0,07/0,03649 = 1,918 s
    expectClose(inverseTime(600, 100, 0.5, "SI"), 1.918, 0.5, "t");
  });
});

describe("Ref. queda de tensão trifásica (método fasorial)", () => {
  it("50 mm² PVC Cu, I=100 A, L=50 m, cosφ=0,9, 380 V → ΔU ≈ 1,03 %", async () => {
    // R(70°C)=0,387·1,1965=0,463 ; X=0,083 ; ΔU=√3·100·50·(0,463·0,9+0,083·0,4359)/1000=3,92 V → 1,03 %
    const r = await calculateVoltageDrop({
      system: "three", baseVoltageV: 380,
      segments: [{ sectionMm2: 50, lengthM: 50, currentA: 100, cosPhi: 0.9 }],
    });
    expectClose(r.totalDropPct, 1.03, 2.0, "ΔU%");
  });
});

describe("Ref. NBR 16690 — string fotovoltaica", () => {
  it("módulo 49,5 Voc / -0,27 %/°C a -10 °C; inversor 1100 V → 20 módulos/string", async () => {
    // Voc(-10)=49,5·(1+(-0,0027)·(-35))=54,18 V ; floor(1100/54,18)=20
    const r = await sizePvString({
      module: { vocStcV: 49.5, vmpStcV: 41.5, iscStcA: 11.5, impStcA: 10.8, tempCoeffVocPctPerC: -0.27 },
      inverter: { maxDcVoltageV: 1100, mpptMinV: 200, mpptMaxV: 1000, maxInputCurrentA: 26 },
      minCellTempC: -10, maxCellTempC: 70,
    });
    expectClose(r.vocAtMinTempV, 54.18, 0.5, "Voc(min)");
    expect(r.maxModulesByVoltage).toBe(20);
  });
});
