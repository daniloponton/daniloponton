import { z } from "zod";
import { CalculationTrace, canonicalJson, sha256Hex } from "../../engine/trace";
import { round } from "../../engine/units";
import { ENGINE_VERSION } from "../../version";
import type { CalculationStep, ComplianceStatus, EngineeringWarning } from "../../engine/types";

const REF = "IEEE Std 80 / ABNT NBR 7117";

export const groundingInputSchema = z
  .object({
    /** Como a resistividade do solo é obtida. */
    soilMethod: z.enum(["direct", "wenner"]).default("direct"),
    /** Resistividade do solo [Ω·m] (método direto). */
    soilResistivity: z.number().positive().optional(),
    /** Espaçamento entre hastes do ensaio de Wenner [m]. */
    wennerSpacingM: z.number().positive().optional(),
    /** Resistência medida no ensaio de Wenner [Ω]. */
    wennerResistanceOhm: z.number().positive().optional(),

    /** Tipo de eletrodo. */
    electrode: z.enum(["rod", "rods", "grid"]).default("rod"),
    /** Comprimento da haste [m]. */
    rodLengthM: z.number().positive().default(2.4),
    /** Diâmetro da haste [m]. */
    rodDiameterM: z.number().positive().default(0.015),
    /** Número de hastes em paralelo. */
    rodCount: z.number().int().min(1).default(1),
    /** Eficiência do agrupamento de hastes (0–1). */
    rodEfficiency: z.number().min(0.3).max(1).default(0.7),
    /** Comprimento total de condutor enterrado da malha [m]. */
    gridTotalLengthM: z.number().positive().optional(),
    /** Área coberta pela malha [m²]. */
    gridAreaM2: z.number().positive().optional(),
    /** Profundidade de enterramento da malha [m]. */
    gridDepthM: z.number().positive().default(0.5),

    /** Corrente de falta que escoa pela malha Ig [A]. */
    faultCurrentA: z.number().positive(),
    /** Tempo de eliminação da falta [s]. */
    faultClearingS: z.number().positive().default(0.5),
    /** Peso corporal de referência [kg]. */
    bodyWeightKg: z.union([z.literal(50), z.literal(70)]).default(70),
    /** Resistividade da camada superficial (brita) [Ω·m]. */
    surfaceLayerResistivity: z.number().positive().optional(),
    /** Espessura da camada superficial [m]. */
    surfaceLayerThicknessM: z.number().positive().optional(),
  })
  .refine((d) => (d.soilMethod === "direct" ? d.soilResistivity != null : true), {
    message: "soilResistivity é obrigatório no método direto.",
  })
  .refine(
    (d) => (d.soilMethod === "wenner" ? d.wennerSpacingM != null && d.wennerResistanceOhm != null : true),
    { message: "wennerSpacingM e wennerResistanceOhm são obrigatórios no método de Wenner." },
  );

export type GroundingInput = z.input<typeof groundingInputSchema>;

export interface GroundingResult {
  readonly traceId: string;
  readonly inputHash: string;
  readonly engineVersion: string;
  readonly timestamp: string;

  /** Resistividade do solo usada [Ω·m]. */
  readonly soilResistivityOhmM: number;
  /** Resistência de aterramento do eletrodo [Ω]. */
  readonly electrodeResistanceOhm: number;
  /** Elevação de potencial de terra GPR = Ig·Rg [V]. */
  readonly gprVolts: number;
  /** Fator de redução da camada superficial Cs. */
  readonly surfaceDerateCs: number;
  /** Tensão de toque tolerável [V]. */
  readonly tolerableTouchV: number;
  /** Tensão de passo tolerável [V]. */
  readonly tolerableStepV: number;
  /** Veredito de triagem (IEEE 80): GPR ≤ toque tolerável? */
  readonly status: ComplianceStatus;

  readonly steps: readonly CalculationStep[];
  readonly warnings: readonly EngineeringWarning[];
}

/**
 * Análise de aterramento (IEEE 80 / NBR 7117): resistividade do solo,
 * resistência do eletrodo (haste de Dwight, hastes em paralelo ou malha de
 * Sverak), GPR e tensões toleráveis de toque/passo com triagem de segurança.
 */
export async function analyzeGrounding(rawInput: GroundingInput): Promise<GroundingResult> {
  const inp = groundingInputSchema.parse(rawInput);
  const trace = new CalculationTrace();

  // 1. Resistividade do solo
  let rho: number;
  if (inp.soilMethod === "wenner") {
    rho = 2 * Math.PI * inp.wennerSpacingM! * inp.wennerResistanceOhm!;
    trace.step({
      label: "Resistividade do solo (Wenner)",
      formula: "ρ = 2·π·a·R",
      inputs: { a_m: inp.wennerSpacingM!, R_ohm: inp.wennerResistanceOhm! },
      result: rho,
      unit: "Ω·m",
      normRef: `${REF} / método de Wenner`,
    });
  } else {
    rho = inp.soilResistivity!;
    trace.step({
      label: "Resistividade do solo (informada)",
      formula: "ρ informado",
      inputs: { rho_ohm_m: rho },
      result: rho,
      unit: "Ω·m",
      normRef: REF,
    });
  }

  // 2. Resistência do eletrodo
  let rg: number;
  if (inp.electrode === "grid") {
    if (inp.gridTotalLengthM == null || inp.gridAreaM2 == null) {
      throw new Error("Malha exige gridTotalLengthM e gridAreaM2.");
    }
    const Lt = inp.gridTotalLengthM;
    const A = inp.gridAreaM2;
    const h = inp.gridDepthM;
    rg = rho * (1 / Lt + (1 / Math.sqrt(20 * A)) * (1 + 1 / (1 + h * Math.sqrt(20 / A))));
    trace.step({
      label: "Resistência da malha (Sverak/IEEE 80)",
      formula: "Rg = ρ·[1/Lt + 1/√(20A)·(1 + 1/(1 + h·√(20/A)))]",
      inputs: { rho, Lt_m: Lt, A_m2: A, h_m: h },
      result: rg,
      unit: "Ω",
      normRef: `${REF} Eq. Sverak`,
    });
  } else {
    const L = inp.rodLengthM;
    const d = inp.rodDiameterM;
    const rSingle = (rho / (2 * Math.PI * L)) * (Math.log((4 * L) / d) - 1);
    trace.step({
      label: "Resistência de uma haste (Dwight)",
      formula: "R = ρ/(2πL)·(ln(4L/d) − 1)",
      inputs: { rho, L_m: L, d_m: d },
      result: rSingle,
      unit: "Ω",
      normRef: `${REF} / fórmula de Dwight`,
    });
    if (inp.electrode === "rods" && inp.rodCount > 1) {
      rg = rSingle / (inp.rodCount * inp.rodEfficiency);
      trace.step({
        label: "Resistência de hastes em paralelo",
        formula: "Rg = R₁ / (n·η)",
        inputs: { n: inp.rodCount, eta: inp.rodEfficiency },
        result: rg,
        unit: "Ω",
        normRef: REF,
      });
    } else {
      rg = rSingle;
    }
  }

  // 3. GPR
  const gpr = inp.faultCurrentA * rg;
  trace.step({
    label: "Elevação de potencial de terra (GPR)",
    formula: "GPR = Ig · Rg",
    inputs: { Ig_A: inp.faultCurrentA, Rg_ohm: round(rg, 3) },
    result: gpr,
    unit: "V",
    normRef: REF,
  });

  // 4. Camada superficial e tensões toleráveis
  const rhoS = inp.surfaceLayerResistivity ?? rho;
  let cs = 1;
  if (inp.surfaceLayerResistivity != null && inp.surfaceLayerThicknessM != null) {
    cs = 1 - (0.09 * (1 - rho / rhoS)) / (2 * inp.surfaceLayerThicknessM + 0.09);
  }
  trace.step({
    label: "Fator de redução da camada superficial (Cs)",
    formula: "Cs = 1 − 0,09·(1 − ρ/ρs)/(2·hs + 0,09)",
    inputs: { rhoS, hs_m: inp.surfaceLayerThicknessM ?? 0 },
    result: cs,
    unit: "-",
    normRef: `${REF} Eq. Cs`,
  });

  const kBody = inp.bodyWeightKg === 50 ? 0.116 : 0.157;
  const t = inp.faultClearingS;
  const tolerableTouch = (1000 + 1.5 * cs * rhoS) * (kBody / Math.sqrt(t));
  const tolerableStep = (1000 + 6 * cs * rhoS) * (kBody / Math.sqrt(t));
  trace.step({
    label: `Tensão de toque tolerável (${inp.bodyWeightKg} kg)`,
    formula: "E_toque = (1000 + 1,5·Cs·ρs)·k/√t",
    inputs: { Cs: round(cs, 4), rhoS, t_s: t, k: kBody },
    result: tolerableTouch,
    unit: "V",
    normRef: `${REF} §8`,
  });
  trace.step({
    label: `Tensão de passo tolerável (${inp.bodyWeightKg} kg)`,
    formula: "E_passo = (1000 + 6·Cs·ρs)·k/√t",
    inputs: { Cs: round(cs, 4), rhoS, t_s: t, k: kBody },
    result: tolerableStep,
    unit: "V",
    normRef: `${REF} §8`,
  });

  // 5. Triagem de segurança (IEEE 80): GPR ≤ toque tolerável → seguro
  let status: ComplianceStatus;
  if (gpr <= tolerableTouch) {
    status = "ok";
  } else {
    status = "warning";
    trace.warn(
      "MESH_ANALYSIS_REQUIRED",
      `GPR (${round(gpr, 0)} V) excede a tensão de toque tolerável (${round(tolerableTouch, 0)} V): exige análise detalhada de malha (tensões de malha Em e de passo Es por IEEE 80).`,
    );
  }

  const canonical = canonicalJson({ input: inp, engineVersion: ENGINE_VERSION, norm: REF });
  const inputHash = await sha256Hex(canonical);

  return {
    traceId: `GR-${inputHash.slice(0, 12)}`,
    inputHash,
    engineVersion: ENGINE_VERSION,
    timestamp: new Date().toISOString(),
    soilResistivityOhmM: round(rho, 2),
    electrodeResistanceOhm: round(rg, 3),
    gprVolts: round(gpr, 1),
    surfaceDerateCs: round(cs, 4),
    tolerableTouchV: round(tolerableTouch, 1),
    tolerableStepV: round(tolerableStep, 1),
    status,
    steps: trace.steps,
    warnings: trace.warnings,
  };
}

/* ───────────────── Corrente de malha de projeto (IEEE 80) ────────────────── */

export const gridCurrentInputSchema = z.object({
  /** Corrente de falta simétrica (ex.: I"k do IEC 60909) [kA]. */
  symmetricalFaultKA: z.number().positive(),
  /** Relação X/R no ponto de falta. */
  xrRatio: z.number().positive().default(10),
  /** Duração da falta tf [s]. */
  faultDurationS: z.number().positive().default(0.5),
  /** Frequência [Hz]. */
  frequencyHz: z.number().positive().default(60),
  /** Fator de divisão de corrente Sf (fração que escoa pela malha, 0–1). */
  splitFactor: z.number().min(0).max(1).default(1),
});

export type GridCurrentInput = z.input<typeof gridCurrentInputSchema>;

export interface GridCurrentResult {
  readonly traceId: string;
  readonly inputHash: string;
  readonly engineVersion: string;
  readonly timestamp: string;

  /** Constante de tempo CC Ta = (X/R)/ω [s]. */
  readonly dcTimeConstantS: number;
  /** Fator de decremento Df (assimetria/offset CC). */
  readonly decrementFactor: number;
  /** Corrente simétrica de malha Ig = Sf·If [kA]. */
  readonly symmetricalGridCurrentKA: number;
  /** Corrente de malha de projeto IG = Df·Sf·If [kA]. */
  readonly gridCurrentKA: number;

  readonly steps: readonly CalculationStep[];
}

/**
 * Corrente de malha de projeto pela IEEE 80: aplica o fator de divisão Sf
 * (parcela que escoa pela malha) e o fator de decremento Df (offset CC) sobre
 * a corrente de falta simétrica.
 *
 *   Ta = (X/R)/ω ;  Df = √(1 + (Ta/tf)·(1 − e^(−2·tf/Ta))) ;  IG = Df·Sf·If
 */
export async function gridCurrentIEEE80(rawInput: GridCurrentInput): Promise<GridCurrentResult> {
  const inp = gridCurrentInputSchema.parse(rawInput);
  const trace = new CalculationTrace();

  const omega = 2 * Math.PI * inp.frequencyHz;
  const ta = inp.xrRatio / omega;
  trace.step({
    label: "Constante de tempo CC (Ta)",
    formula: "Ta = (X/R) / (2πf)",
    inputs: { xrRatio: inp.xrRatio, frequencyHz: inp.frequencyHz },
    result: ta,
    unit: "s",
    normRef: "IEEE Std 80 §15",
  });

  const tf = inp.faultDurationS;
  const df = Math.sqrt(1 + (ta / tf) * (1 - Math.exp((-2 * tf) / ta)));
  trace.step({
    label: "Fator de decremento (Df)",
    formula: "Df = √(1 + (Ta/tf)·(1 − e^(−2·tf/Ta)))",
    inputs: { Ta: round(ta, 5), tf },
    result: df,
    unit: "-",
    normRef: "IEEE Std 80 Eq. 79",
  });

  const ig = inp.splitFactor * inp.symmetricalFaultKA;
  const igDesign = df * ig;
  trace.step({
    label: "Corrente de malha de projeto (IG)",
    formula: "IG = Df · Sf · If",
    inputs: { Df: round(df, 4), Sf: inp.splitFactor, If_kA: inp.symmetricalFaultKA },
    result: igDesign,
    unit: "kA",
    normRef: "IEEE Std 80 §16.4",
  });

  const canonical = canonicalJson({ input: inp, engineVersion: ENGINE_VERSION, norm: "IEEE Std 80" });
  const inputHash = await sha256Hex(canonical);

  return {
    traceId: `IG-${inputHash.slice(0, 12)}`,
    inputHash,
    engineVersion: ENGINE_VERSION,
    timestamp: new Date().toISOString(),
    dcTimeConstantS: round(ta, 5),
    decrementFactor: round(df, 4),
    symmetricalGridCurrentKA: round(ig, 3),
    gridCurrentKA: round(igDesign, 3),
    steps: trace.steps,
  };
}

/* ───────────── Cálculo detalhado de malha retangular (IEEE 80) ───────────── */

export const groundGridInputSchema = z.object({
  /** Resistividade do solo [Ω·m]. */
  soilResistivity: z.number().positive(),
  /** Dimensão da malha na direção X [m]. */
  gridLengthXM: z.number().positive(),
  /** Dimensão da malha na direção Y [m]. */
  gridLengthYM: z.number().positive(),
  /** Espaçamento entre condutores paralelos D [m]. */
  conductorSpacingM: z.number().positive(),
  /** Diâmetro do condutor da malha d [m]. */
  conductorDiameterM: z.number().positive().default(0.01),
  /** Profundidade de enterramento h [m]. */
  gridDepthM: z.number().positive().default(0.5),
  /** Número de hastes verticais. */
  rodCount: z.number().int().min(0).default(0),
  /** Comprimento de cada haste [m]. */
  rodLengthM: z.number().positive().default(2.4),
  /** Corrente que escoa pela malha Ig [A]. */
  faultCurrentA: z.number().positive(),
  /** Tempo de eliminação da falta [s]. */
  faultClearingS: z.number().positive().default(0.5),
  /** Peso corporal de referência [kg]. */
  bodyWeightKg: z.union([z.literal(50), z.literal(70)]).default(70),
  /** Resistividade da camada superficial (brita) [Ω·m]. */
  surfaceLayerResistivity: z.number().positive().optional(),
  /** Espessura da camada superficial [m]. */
  surfaceLayerThicknessM: z.number().positive().optional(),
});

export type GroundGridInput = z.input<typeof groundGridInputSchema>;

export interface GroundGridResult {
  readonly traceId: string;
  readonly inputHash: string;
  readonly engineVersion: string;
  readonly timestamp: string;

  readonly nFactor: number;
  readonly kmFactor: number;
  readonly ksFactor: number;
  readonly kiFactor: number;
  readonly totalConductorLengthM: number;
  readonly gridResistanceOhm: number;
  readonly gprVolts: number;
  /** Tensão de malha (toque na pior posição) Em [V]. */
  readonly meshVoltageV: number;
  /** Tensão de passo Es [V]. */
  readonly stepVoltageV: number;
  readonly tolerableTouchV: number;
  readonly tolerableStepV: number;
  readonly touchSafe: boolean;
  readonly stepSafe: boolean;
  readonly status: ComplianceStatus;

  readonly steps: readonly CalculationStep[];
  readonly warnings: readonly EngineeringWarning[];
}

/**
 * Cálculo detalhado de malha de aterramento retangular pela IEEE Std 80:
 * tensões de malha (Em) e de passo (Es) com os fatores geométricos Km, Ks, Ki
 * e o fator n, comparadas às tensões toleráveis de toque e passo.
 */
export async function analyzeGroundGrid(rawInput: GroundGridInput): Promise<GroundGridResult> {
  const inp = groundGridInputSchema.parse(rawInput);
  const trace = new CalculationTrace();

  const { soilResistivity: rho, conductorSpacingM: D, conductorDiameterM: d, gridDepthM: h } = inp;
  const Lx = inp.gridLengthXM;
  const Ly = inp.gridLengthYM;
  const A = Lx * Ly;
  const Lp = 2 * (Lx + Ly);
  const Ig = inp.faultCurrentA;

  // Comprimento de condutores horizontais e hastes
  const condX = Math.round(Lx / D) + 1; // condutores paralelos a Y (comprimento Ly)
  const condY = Math.round(Ly / D) + 1; // condutores paralelos a X (comprimento Lx)
  const LC = condX * Ly + condY * Lx;
  const LR = inp.rodCount * inp.rodLengthM;

  // Fator geométrico n (malha retangular: nc = nd = 1)
  const na = (2 * LC) / Lp;
  const nb = Math.sqrt(Lp / (4 * Math.sqrt(A)));
  const n = na * nb;
  trace.step({
    label: "Fator geométrico n",
    formula: "n = na·nb ; na = 2·LC/Lp ; nb = √(Lp/(4√A))",
    inputs: { LC: round(LC, 1), Lp, A },
    result: n,
    unit: "-",
    normRef: "IEEE Std 80 §16.5",
  });

  // Km — fator de espaçamento da tensão de malha
  const Kii = inp.rodCount > 0 ? 1 : 1 / Math.pow(2 * n, 2 / n);
  const Kh = Math.sqrt(1 + h / 1); // h0 = 1 m
  const kmTerm1 = Math.log(
    (D * D) / (16 * h * d) + (D + 2 * h) ** 2 / (8 * D * d) - h / (4 * d),
  );
  const kmTerm2 = (Kii / Kh) * Math.log(8 / (Math.PI * (2 * n - 1)));
  const Km = (1 / (2 * Math.PI)) * (kmTerm1 + kmTerm2);
  trace.step({
    label: "Fator de malha Km",
    formula: "Km = 1/2π·[ln(D²/16hd + (D+2h)²/8Dd − h/4d) + Kii/Kh·ln(8/π(2n−1))]",
    inputs: { D, h, d, Kii: round(Kii, 4), Kh: round(Kh, 4) },
    result: Km,
    unit: "-",
    normRef: "IEEE Std 80 Eq. 81-85",
  });

  // Ki — fator de irregularidade
  const Ki = 0.644 + 0.148 * n;
  trace.step({
    label: "Fator de irregularidade Ki",
    formula: "Ki = 0,644 + 0,148·n",
    inputs: { n: round(n, 4) },
    result: Ki,
    unit: "-",
    normRef: "IEEE Std 80 Eq. 89",
  });

  // Ks — fator de espaçamento da tensão de passo
  const Ks = (1 / Math.PI) * (1 / (2 * h) + 1 / (D + h) + (1 / D) * (1 - Math.pow(0.5, n - 2)));
  trace.step({
    label: "Fator de passo Ks",
    formula: "Ks = 1/π·[1/2h + 1/(D+h) + 1/D·(1 − 0,5^(n−2))]",
    inputs: { D, h },
    result: Ks,
    unit: "-",
    normRef: "IEEE Std 80 Eq. 90",
  });

  // Comprimentos efetivos
  const diag = Math.sqrt(Lx * Lx + Ly * Ly);
  const LM = inp.rodCount > 0 ? LC + (1.55 + 1.22 * (inp.rodLengthM / diag)) * LR : LC + LR;
  const LS = 0.75 * LC + 0.85 * LR;

  const Em = (rho * Km * Ki * Ig) / LM;
  const Es = (rho * Ks * Ki * Ig) / LS;
  trace.step({
    label: "Tensão de malha Em",
    formula: "Em = ρ·Km·Ki·Ig / LM",
    inputs: { rho, Km: round(Km, 4), Ki: round(Ki, 4), Ig, LM: round(LM, 1) },
    result: Em,
    unit: "V",
    normRef: "IEEE Std 80 Eq. 80",
  });
  trace.step({
    label: "Tensão de passo Es",
    formula: "Es = ρ·Ks·Ki·Ig / LS",
    inputs: { rho, Ks: round(Ks, 4), Ki: round(Ki, 4), Ig, LS: round(LS, 1) },
    result: Es,
    unit: "V",
    normRef: "IEEE Std 80 Eq. 92",
  });

  // Resistência da malha (Sverak) e GPR
  const Lt = LC + LR;
  const rg = rho * (1 / Lt + (1 / Math.sqrt(20 * A)) * (1 + 1 / (1 + h * Math.sqrt(20 / A))));
  const gpr = Ig * rg;

  // Tensões toleráveis (camada superficial)
  const rhoS = inp.surfaceLayerResistivity ?? rho;
  let cs = 1;
  if (inp.surfaceLayerResistivity != null && inp.surfaceLayerThicknessM != null) {
    cs = 1 - (0.09 * (1 - rho / rhoS)) / (2 * inp.surfaceLayerThicknessM + 0.09);
  }
  const kBody = inp.bodyWeightKg === 50 ? 0.116 : 0.157;
  const t = inp.faultClearingS;
  const tolerableTouch = (1000 + 1.5 * cs * rhoS) * (kBody / Math.sqrt(t));
  const tolerableStep = (1000 + 6 * cs * rhoS) * (kBody / Math.sqrt(t));

  const touchSafe = Em <= tolerableTouch;
  const stepSafe = Es <= tolerableStep;
  const status: ComplianceStatus = touchSafe && stepSafe ? "ok" : "fail";
  if (!touchSafe)
    trace.warn("MESH_OVER_TOUCH", `Tensão de malha Em (${round(Em, 0)} V) excede o toque tolerável (${round(tolerableTouch, 0)} V): adicione condutores/hastes ou camada de brita.`);
  if (!stepSafe)
    trace.warn("STEP_OVER", `Tensão de passo Es (${round(Es, 0)} V) excede o passo tolerável (${round(tolerableStep, 0)} V).`);

  const canonical = canonicalJson({ input: inp, engineVersion: ENGINE_VERSION, norm: "IEEE Std 80" });
  const inputHash = await sha256Hex(canonical);

  return {
    traceId: `GG-${inputHash.slice(0, 12)}`,
    inputHash,
    engineVersion: ENGINE_VERSION,
    timestamp: new Date().toISOString(),
    nFactor: round(n, 4),
    kmFactor: round(Km, 4),
    ksFactor: round(Ks, 4),
    kiFactor: round(Ki, 4),
    totalConductorLengthM: round(Lt, 1),
    gridResistanceOhm: round(rg, 3),
    gprVolts: round(gpr, 1),
    meshVoltageV: round(Em, 1),
    stepVoltageV: round(Es, 1),
    tolerableTouchV: round(tolerableTouch, 1),
    tolerableStepV: round(tolerableStep, 1),
    touchSafe,
    stepSafe,
    status,
    steps: trace.steps,
    warnings: trace.warnings,
  };
}
