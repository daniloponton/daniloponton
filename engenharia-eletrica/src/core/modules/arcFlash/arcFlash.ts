import { z } from "zod";
import { CalculationTrace, canonicalJson, sha256Hex } from "../../engine/trace";
import { round } from "../../engine/units";
import { ENGINE_VERSION } from "../../version";
import type { CalculationStep, ComplianceStatus } from "../../engine/types";

const REF = "IEEE Std 1584-2018";

export type ElectrodeConfig = "VCB" | "VCBB" | "HCB" | "VOA" | "HOA";
type Level = "v600" | "v2700" | "v14300";

/** Tabela 1 — coeficientes da corrente de arco (Eq. 1), por config e Voc. */
const TABLE_1: Record<ElectrodeConfig, Record<Level, readonly number[]>> = {
  VCB: {
    v600: [-0.04287, 1.035, -0.083, 0, 0, -4.783e-9, 1.962e-6, -0.000229, 0.003141, 1.092],
    v2700: [0.0065, 1.001, -0.024, -1.557e-12, 4.556e-10, -4.186e-8, 8.346e-7, 5.482e-5, -0.003191, 0.9729],
    v14300: [0.005795, 1.015, -0.011, -1.557e-12, 4.556e-10, -4.186e-8, 8.346e-7, 5.482e-5, -0.003191, 0.9729],
  },
  VCBB: {
    v600: [-0.017432, 0.98, -0.05, 0, 0, -5.767e-9, 2.524e-6, -0.00034, 0.01187, 1.013],
    v2700: [0.002823, 0.995, -0.0125, 0, -9.204e-11, 2.901e-8, -3.262e-6, 0.0001569, -0.004003, 0.9825],
    v14300: [0.014827, 1.01, -0.01, 0, -9.204e-11, 2.901e-8, -3.262e-6, 0.0001569, -0.004003, 0.9825],
  },
  HCB: {
    v600: [0.054922, 0.988, -0.11, 0, 0, -5.382e-9, 2.316e-6, -0.000302, 0.0091, 0.9725],
    v2700: [0.001011, 1.003, -0.0249, 0, 0, 4.859e-10, -1.814e-7, -9.128e-6, -0.0007, 0.9881],
    v14300: [0.008693, 0.999, -0.02, 0, -5.043e-11, 2.233e-8, -3.046e-6, 0.000116, -0.001145, 0.9839],
  },
  VOA: {
    v600: [0.043785, 1.04, -0.18, 0, 0, -4.783e-9, 1.962e-6, -0.000229, 0.003141, 1.092],
    v2700: [-0.02395, 1.006, -0.0188, -1.557e-12, 4.556e-10, -4.186e-8, 8.346e-7, 5.482e-5, -0.003191, 0.9729],
    v14300: [0.005371, 1.0102, -0.029, -1.557e-12, 4.556e-10, -4.186e-8, 8.346e-7, 5.482e-5, -0.003191, 0.9729],
  },
  HOA: {
    v600: [0.111147, 1.008, -0.24, 0, 0, -3.895e-9, 1.641e-6, -0.000197, 0.002615, 1.1],
    v2700: [0.000435, 1.006, -0.038, 0, 0, 7.859e-10, -1.914e-7, -9.128e-6, -0.0007, 0.9981],
    v14300: [0.000904, 0.999, -0.02, 0, 0, 7.859e-10, -1.914e-7, -9.128e-6, -0.0007, 0.9981],
  },
};

/** Tabelas 3/4/5 — coeficientes de energia incidente (Eq. 3-6), por config e Voc. */
const TABLE_E: Record<ElectrodeConfig, Record<Level, readonly number[]>> = {
  VCB: {
    v600: [0.753364, 0.566, 1.752636, 0, 0, -4.783e-9, 1.962e-6, -0.000229, 0.003141, 1.092, 0, -1.598, 0.957],
    v2700: [2.40021, 0.165, 0.354202, -1.557e-12, 4.556e-10, -4.186e-8, 8.346e-7, 5.482e-5, -0.003191, 0.9729, 0, -1.569, 0.9778],
    v14300: [3.825917, 0.11, -0.999749, -1.557e-12, 4.556e-10, -4.186e-8, 8.346e-7, 5.482e-5, -0.003191, 0.9729, 0, -1.568, 0.99],
  },
  VCBB: {
    v600: [3.068459, 0.26, -0.098107, 0, 0, -5.767e-9, 2.524e-6, -0.00034, 0.01187, 1.013, -0.06, -1.809, 1.19],
    v2700: [3.870592, 0.185, -0.736618, 0, -9.204e-11, 2.901e-8, -3.262e-6, 0.0001569, -0.004003, 0.9825, 0, -1.742, 1.09],
    v14300: [3.644309, 0.215, -0.585522, 0, -9.204e-11, 2.901e-8, -3.262e-6, 0.0001569, -0.004003, 0.9825, 0, -1.677, 1.06],
  },
  HCB: {
    v600: [4.073745, 0.344, -0.370259, 0, 0, -5.382e-9, 2.316e-6, -0.000302, 0.0091, 0.9725, 0, -2.03, 1.036],
    v2700: [3.486391, 0.177, -0.193101, 0, 0, 4.859e-10, -1.814e-7, -9.128e-6, -0.0007, 0.9881, 0.027, -1.723, 1.055],
    v14300: [3.044516, 0.125, 0.245106, 0, -5.043e-11, 2.233e-8, -3.046e-6, 0.000116, -0.001145, 0.9839, 0, -1.655, 1.084],
  },
  VOA: {
    v600: [0.679294, 0.746, 1.222636, 0, 0, -4.783e-9, 1.962e-6, -0.000229, 0.003141, 1.092, 0, -1.598, 0.997],
    v2700: [3.880724, 0.105, -1.906033, -1.557e-12, 4.556e-10, -4.186e-8, 8.346e-7, 5.482e-5, -0.003191, 0.9729, 0, -1.515, 1.115],
    v14300: [3.405454, 0.12, -0.93245, -1.557e-12, 4.556e-10, -4.186e-8, 8.346e-7, 5.482e-5, -0.003191, 0.9729, 0, -1.534, 0.979],
  },
  HOA: {
    v600: [3.470417, 0.465, -0.261863, 0, 0, -3.895e-9, 1.641e-6, -0.000197, 0.002615, 1.1, 0, -1.99, 1.04],
    v2700: [3.616266, 0.149, -0.761561, 0, 0, 7.859e-10, -1.914e-7, -9.128e-6, -0.0007, 0.9981, 0, -1.639, 1.078],
    v14300: [2.04049, 0.177, 1.005092, 0, 0, 7.859e-10, -1.914e-7, -9.128e-6, -0.0007, 0.9981, -0.05, -1.633, 1.151],
  },
};

/** Tabela 2 — variação da corrente de arco (Eq. 2), por config. */
const TABLE_2: Record<ElectrodeConfig, readonly number[]> = {
  VCB: [0, -0.0000014269, 0.000083137, -0.0019382, 0.022366, -0.12645, 0.30226],
  VCBB: [1.138e-6, -6.0287e-5, 0.0012758, -0.013778, 0.080217, -0.24066, 0.33524],
  HCB: [0, -3.097e-6, 0.00016405, -0.0033609, 0.033308, -0.16182, 0.34627],
  VOA: [9.5606e-7, -5.1543e-5, 0.0011161, -0.01242, 0.075125, -0.23584, 0.33696],
  HOA: [0, -3.1555e-6, 0.0001682, -0.0034607, 0.034124, -0.1599, 0.34629],
};

/** Tabela 7 — coeficientes do fator de correção de invólucro (Eq. 14/15). */
const TABLE_7 = {
  typical: { VCB: [-0.000302, 0.03441, 0.4325], VCBB: [-0.0002976, 0.032, 0.479], HCB: [-0.0001923, 0.01935, 0.6899] },
  shallow: { VCB: [0.002222, -0.02556, 0.6222], VCBB: [-0.002778, 0.1194, -0.2778], HCB: [-0.0005556, 0.03722, 0.4778] },
} as const;

const lg = Math.log10;

/** Eq. 1 — corrente de arco intermediária em um nível de tensão. */
function arcCurrentAtLevel(config: ElectrodeConfig, level: Level, ibf: number, gap: number): number {
  const k = TABLE_1[config][level];
  const poly = k[3] * ibf ** 6 + k[4] * ibf ** 5 + k[5] * ibf ** 4 + k[6] * ibf ** 3 + k[7] * ibf ** 2 + k[8] * ibf + k[9];
  return Math.pow(10, k[0] + k[1] * lg(ibf) + k[2] * lg(gap)) * poly;
}

/** Eq. 3-6 — energia incidente [J/cm²] em um nível, dados Iarc/Tms. */
function incidentEnergyJ(config: ElectrodeConfig, level: Level, iarc: number, ibf: number, gap: number, dist: number, cf: number, tms: number): number {
  const k = TABLE_E[config][level];
  const denom = k[3] * ibf ** 7 + k[4] * ibf ** 6 + k[5] * ibf ** 5 + k[6] * ibf ** 4 + k[7] * ibf ** 3 + k[8] * ibf ** 2 + k[9] * ibf;
  const lgE = k[0] + k[1] * lg(gap) + (k[2] * iarc) / denom + k[10] * lg(ibf) + k[11] * lg(dist) + k[12] * lg(iarc) + lg(1 / cf);
  return (12.552 / 50) * tms * Math.pow(10, lgE);
}

/** Fronteira de arco [mm] no nível: distância onde E = 5,0 J/cm² (1,2 cal/cm²). */
function afbFromEnergy(config: ElectrodeConfig, level: Level, dist: number, energyJ: number): number {
  const k12 = TABLE_E[config][level][11];
  return dist * Math.pow(5.0 / energyJ, 1 / k12);
}

/** Eq. 2 — fator de variação da corrente de arco. */
function varCf(config: ElectrodeConfig, vocKV: number): number {
  const k = TABLE_2[config];
  const v = vocKV;
  return k[0] * v ** 6 + k[1] * v ** 5 + k[2] * v ** 4 + k[3] * v ** 3 + k[4] * v ** 2 + k[5] * v + k[6];
}

/** Interpolação entre níveis de tensão (Eq. 16-24). v em kV. */
function interpVoltage(v600: number, v2700: number, v14300: number, vocKV: number): number {
  const i1 = ((v2700 - v600) / 2.1) * (vocKV - 2.7) + v2700;
  const i2 = ((v14300 - v2700) / 11.6) * (vocKV - 14.3) + v14300;
  const i3 = (i1 * (2.7 - vocKV)) / 2.1 + (i2 * (vocKV - 0.6)) / 2.1;
  return vocKV > 2.7 ? i2 : i3;
}

/** Fator de correção de tamanho de invólucro (Eq. 11-15 / Tab. 6,7). */
function enclosureCF(config: ElectrodeConfig, vocKV: number, widthMm: number, heightMm: number, depthMm: number): number {
  if (config === "VOA" || config === "HOA") return 1;
  const shallow = vocKV < 0.6 && heightMm < 508 && widthMm < 508 && depthMm <= 203.2;
  // Dimensão equivalente [pol]: ×0,03937 (≥508 mm) ou 20 (típico <508 mm).
  // Para >660,4 mm a Eq. 11/12 reduz levemente o equivalente; aqui adota-se
  // ×0,03937 (limitado a 49) — ver docs/VALIDACAO.md.
  const equiv = (d: number) => {
    if (d < 508) return shallow ? 0.03937 * d : 20;
    return Math.min(0.03937 * d, 49);
  };
  const ees = (equiv(heightMm) + equiv(widthMm)) / 2;
  const ck = shallow ? TABLE_7.shallow[config] : TABLE_7.typical[config];
  const base = ck[0] * ees ** 2 + ck[1] * ees + ck[2];
  return shallow ? 1 / base : base;
}

export const arcFlashInputSchema = z.object({
  /** Tensão do sistema (Voc) [kV], 0,208–15. */
  systemVoltageKV: z.number().min(0.208).max(15),
  /** Corrente de curto-circuito franca Ibf [kA]. */
  boltedFaultKA: z.number().positive(),
  /** Configuração dos eletrodos. */
  electrodeConfig: z.enum(["VCB", "VCBB", "HCB", "VOA", "HOA"]).default("VCB"),
  /** Distância entre eletrodos (gap) [mm]. */
  gapMm: z.number().positive().default(32),
  /** Distância de trabalho [mm]. */
  workingDistanceMm: z.number().positive().default(457.2),
  /** Invólucro: largura, altura, profundidade [mm] (config. em caixa). */
  enclosureWidthMm: z.number().positive().default(508),
  enclosureHeightMm: z.number().positive().default(508),
  enclosureDepthMm: z.number().positive().default(508),
  /** Tempo de atuação da proteção [s] (na corrente de arco média). */
  arcDurationS: z.number().positive().default(0.2),
  /** Tempo de atuação na corrente reduzida [s] (opcional; variação de Iarc). */
  arcDurationMinS: z.number().positive().optional(),
});

export type ArcFlashInput = z.input<typeof arcFlashInputSchema>;

export interface ArcFlashResult {
  readonly traceId: string;
  readonly inputHash: string;
  readonly engineVersion: string;
  readonly timestamp: string;

  readonly arcingCurrentKA: number;
  readonly reducedArcingCurrentKA: number;
  readonly enclosureCorrectionFactor: number;
  readonly incidentEnergyCalCm2: number;
  readonly arcFlashBoundaryM: number;
  readonly ppeCategory: string;
  readonly status: ComplianceStatus;

  readonly steps: readonly CalculationStep[];
}

function classifyPpe(E: number): { category: string; status: ComplianceStatus } {
  if (E < 1.2) return { category: "Risco baixo (< 1,2 cal/cm²) — sem EPI específico de arco", status: "ok" };
  if (E < 4) return { category: "Categoria 1 (EPI ≥ 4 cal/cm²)", status: "warning" };
  if (E < 8) return { category: "Categoria 2 (EPI ≥ 8 cal/cm²)", status: "warning" };
  if (E < 25) return { category: "Categoria 3 (EPI ≥ 25 cal/cm²)", status: "warning" };
  if (E <= 40) return { category: "Categoria 4 (EPI ≥ 40 cal/cm²)", status: "warning" };
  return { category: "Acima de 40 cal/cm² — trabalho energizado proibido", status: "fail" };
}

/**
 * Análise de arco elétrico pela IEEE Std 1584-2018: corrente de arco (com
 * variação), energia incidente, fronteira de arco e categoria de EPI, com
 * correção de tamanho de invólucro e interpolação entre níveis de tensão.
 */
export async function analyzeArcFlash(rawInput: ArcFlashInput): Promise<ArcFlashResult> {
  const inp = arcFlashInputSchema.parse(rawInput);
  const trace = new CalculationTrace();
  const cfg = inp.electrodeConfig;
  const V = inp.systemVoltageKV;
  const Ibf = inp.boltedFaultKA;
  const G = inp.gapMm;
  const D = inp.workingDistanceMm;
  const Tms = inp.arcDurationS * 1000;
  const TminMs = (inp.arcDurationMinS ?? inp.arcDurationS) * 1000;

  const cf = enclosureCF(cfg, V, inp.enclosureWidthMm, inp.enclosureHeightMm, inp.enclosureDepthMm);
  const variation = varCf(cfg, V);
  const reduce = 1 - 0.5 * variation;

  let iarc: number;
  let iarcMin: number;
  let energyJ: number;
  let energyMinJ: number;
  let afbMm: number;
  let afbMinMm: number;

  if (V > 0.6) {
    // Correntes intermediárias e finais (Eq. 1, 16-18).
    const i600 = arcCurrentAtLevel(cfg, "v600", Ibf, G);
    const i2700 = arcCurrentAtLevel(cfg, "v2700", Ibf, G);
    const i14300 = arcCurrentAtLevel(cfg, "v14300", Ibf, G);
    iarc = interpVoltage(i600, i2700, i14300, V);
    iarcMin = interpVoltage(i600 * reduce, i2700 * reduce, i14300 * reduce, V);

    const e600 = incidentEnergyJ(cfg, "v600", i600, Ibf, G, D, cf, Tms);
    const e2700 = incidentEnergyJ(cfg, "v2700", i2700, Ibf, G, D, cf, Tms);
    const e14300 = incidentEnergyJ(cfg, "v14300", i14300, Ibf, G, D, cf, Tms);
    energyJ = interpVoltage(e600, e2700, e14300, V);
    afbMm = interpVoltage(
      afbFromEnergy(cfg, "v600", D, e600),
      afbFromEnergy(cfg, "v2700", D, e2700),
      afbFromEnergy(cfg, "v14300", D, e14300),
      V,
    );

    const em600 = incidentEnergyJ(cfg, "v600", i600 * reduce, Ibf, G, D, cf, TminMs);
    const em2700 = incidentEnergyJ(cfg, "v2700", i2700 * reduce, Ibf, G, D, cf, TminMs);
    const em14300 = incidentEnergyJ(cfg, "v14300", i14300 * reduce, Ibf, G, D, cf, TminMs);
    energyMinJ = interpVoltage(em600, em2700, em14300, V);
    afbMinMm = interpVoltage(
      afbFromEnergy(cfg, "v600", D, em600),
      afbFromEnergy(cfg, "v2700", D, em2700),
      afbFromEnergy(cfg, "v14300", D, em14300),
      V,
    );
  } else {
    // Baixa tensão (Voc ≤ 600 V): Eq. 25 e energia via Eq. 6.
    const i600 = arcCurrentAtLevel(cfg, "v600", Ibf, G);
    const r = 0.6 / V;
    iarc = 1 / Math.sqrt((r * r) / (i600 * i600) + (1 - r * r) / (Ibf * Ibf));
    iarcMin = iarc * reduce;
    energyJ = incidentEnergyJ(cfg, "v600", iarc, Ibf, G, D, cf, Tms);
    energyMinJ = incidentEnergyJ(cfg, "v600", iarcMin, Ibf, G, D, cf, TminMs);
    afbMm = afbFromEnergy(cfg, "v600", D, energyJ);
    afbMinMm = afbFromEnergy(cfg, "v600", D, energyMinJ);
  }

  trace.step({
    label: "Corrente de arco I\"arc",
    formula: "Eq. 1 + interpolação (Voc) / Eq. 25 (BT)",
    inputs: { Ibf, G, V, config: cfg },
    result: iarc,
    unit: "kA",
    normRef: `${REF} §4.4/§4.9/§4.10`,
  });
  trace.step({
    label: "Fator de correção de invólucro CF",
    formula: "Eq. 11-15 (Tab. 7)",
    inputs: { W: inp.enclosureWidthMm, H: inp.enclosureHeightMm, D: inp.enclosureDepthMm },
    result: round(cf, 4),
    unit: "-",
    normRef: `${REF} §4.8`,
  });
  trace.step({
    label: "Variação da corrente de arco (VarCf)",
    formula: "Eq. 2 ; I\"arc_min = I\"arc·(1 − 0,5·VarCf)",
    inputs: { VarCf: round(variation, 4), iarcMinKA: round(iarcMin, 3) },
    result: round(iarcMin, 3),
    unit: "kA",
    normRef: `${REF} §4.5`,
  });

  // Final: maior entre o caso médio e o de corrente reduzida (§4.9/§4.10).
  const finalEnergyJ = Math.max(energyJ, energyMinJ);
  const finalAfbMm = Math.max(afbMm, afbMinMm);
  const E = finalEnergyJ / 4.184; // cal/cm²
  trace.step({
    label: "Energia incidente",
    formula: "E = 12,552/50·T·10^(...) ; maior entre Iarc e Iarc_min ; cal = J/4,184",
    inputs: { energyJ: round(finalEnergyJ, 3), CF: round(cf, 4), T_s: inp.arcDurationS, D_mm: D },
    result: round(E, 3),
    unit: "cal/cm²",
    normRef: `${REF} §4.6`,
  });
  trace.step({
    label: "Fronteira de arco elétrico",
    formula: "distância em que E = 1,2 cal/cm² (5,0 J/cm²)",
    inputs: {},
    result: round(finalAfbMm / 1000, 3),
    unit: "m",
    normRef: `${REF} §4.7`,
  });

  const ppe = classifyPpe(E);
  const canonical = canonicalJson({ input: inp, engineVersion: ENGINE_VERSION, norm: REF });
  const inputHash = await sha256Hex(canonical);

  return {
    traceId: `AF-${inputHash.slice(0, 12)}`,
    inputHash,
    engineVersion: ENGINE_VERSION,
    timestamp: new Date().toISOString(),
    arcingCurrentKA: round(iarc, 3),
    reducedArcingCurrentKA: round(iarcMin, 3),
    enclosureCorrectionFactor: round(cf, 4),
    incidentEnergyCalCm2: round(E, 2),
    arcFlashBoundaryM: round(finalAfbMm / 1000, 2),
    ppeCategory: ppe.category,
    status: ppe.status,
    steps: trace.steps,
  };
}
