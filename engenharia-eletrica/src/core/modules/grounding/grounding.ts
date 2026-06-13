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
