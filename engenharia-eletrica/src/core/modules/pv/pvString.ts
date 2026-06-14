import { z } from "zod";
import { CalculationTrace, canonicalJson, sha256Hex } from "../../engine/trace";
import { round } from "../../engine/units";
import { getNorm, conductorResistance20C, DEFAULT_NORM_ID } from "../../norms";
import { ENGINE_VERSION } from "../../version";
import type { CalculationStep, ComplianceStatus, EngineeringWarning } from "../../engine/types";

const REF = "ABNT NBR 16690 / IEC 62548";
const STC_TEMP_C = 25;

const moduleSchema = z.object({
  /** Tensão de circuito aberto Voc (STC) [V]. */
  vocStcV: z.number().positive(),
  /** Tensão de máxima potência Vmp (STC) [V]. */
  vmpStcV: z.number().positive(),
  /** Corrente de curto-circuito Isc (STC) [A]. */
  iscStcA: z.number().positive(),
  /** Corrente de máxima potência Imp (STC) [A]. */
  impStcA: z.number().positive(),
  /** Coeficiente de temperatura de Voc [%/°C] (tipicamente negativo). */
  tempCoeffVocPctPerC: z.number(),
  /** Coeficiente de temperatura de Vmp [%/°C] (usa o de Voc se ausente). */
  tempCoeffVmpPctPerC: z.number().optional(),
});

const inverterSchema = z.object({
  /** Tensão CC máxima de entrada [V]. */
  maxDcVoltageV: z.number().positive(),
  /** Tensão mínima da faixa de MPPT [V]. */
  mpptMinV: z.number().positive(),
  /** Tensão máxima da faixa de MPPT [V]. */
  mpptMaxV: z.number().positive(),
  /** Corrente máxima de entrada por MPPT [A]. */
  maxInputCurrentA: z.number().positive(),
});

export const pvStringInputSchema = z.object({
  module: moduleSchema,
  inverter: inverterSchema,
  /** Temperatura de célula mínima esperada [°C] (dia mais frio). */
  minCellTempC: z.number().default(-10),
  /** Temperatura de célula máxima esperada [°C] (operação quente). */
  maxCellTempC: z.number().default(70),
});

export type PvStringInput = z.input<typeof pvStringInputSchema>;

export interface PvStringResult {
  readonly traceId: string;
  readonly inputHash: string;
  readonly engineVersion: string;
  readonly timestamp: string;

  /** Voc corrigida na temperatura mínima [V]. */
  readonly vocAtMinTempV: number;
  /** Vmp corrigida na temperatura máxima [V]. */
  readonly vmpAtMaxTempV: number;
  /** Vmp corrigida na temperatura mínima [V]. */
  readonly vmpAtMinTempV: number;
  /** Máx. módulos/string pela tensão CC máxima do inversor. */
  readonly maxModulesByVoltage: number;
  /** Máx. módulos/string pelo topo da faixa de MPPT. */
  readonly maxModulesByMppt: number;
  /** Mín. módulos/string pela base da faixa de MPPT. */
  readonly minModulesByMppt: number;
  /** Módulos/string recomendado (máximo válido). */
  readonly recommendedModulesPerString: number;
  /** Máx. de strings em paralelo por MPPT. */
  readonly maxParallelStrings: number;
  readonly status: ComplianceStatus;

  readonly steps: readonly CalculationStep[];
  readonly warnings: readonly EngineeringWarning[];
}

/**
 * Dimensiona a string fotovoltaica (NBR 16690 / IEC 62548): nº de módulos por
 * string limitado pela tensão CC máxima do inversor (Voc na temperatura mínima)
 * e pela faixa de MPPT (Vmp nas temperaturas extremas), e nº de strings em
 * paralelo pela corrente máxima de entrada.
 */
export async function sizePvString(rawInput: PvStringInput): Promise<PvStringResult> {
  const inp = pvStringInputSchema.parse(rawInput);
  const m = inp.module;
  const inv = inp.inverter;
  const trace = new CalculationTrace();

  const betaVoc = m.tempCoeffVocPctPerC / 100;
  const betaVmp = (m.tempCoeffVmpPctPerC ?? m.tempCoeffVocPctPerC) / 100;

  const vocMin = m.vocStcV * (1 + betaVoc * (inp.minCellTempC - STC_TEMP_C));
  trace.step({
    label: "Voc na temperatura mínima",
    formula: "Voc(Tmin) = Voc_stc·(1 + βVoc·(Tmin − 25))",
    inputs: { vocStcV: m.vocStcV, betaVocPct: m.tempCoeffVocPctPerC, Tmin: inp.minCellTempC },
    result: vocMin,
    unit: "V",
    normRef: `${REF} (tensão máxima)`,
  });

  const vmpMaxTemp = m.vmpStcV * (1 + betaVmp * (inp.maxCellTempC - STC_TEMP_C));
  const vmpMinTemp = m.vmpStcV * (1 + betaVmp * (inp.minCellTempC - STC_TEMP_C));
  trace.step({
    label: "Vmp nas temperaturas extremas",
    formula: "Vmp(T) = Vmp_stc·(1 + βVmp·(T − 25))",
    inputs: { vmpStcV: m.vmpStcV, vmpAtTmax: round(vmpMaxTemp, 2), vmpAtTmin: round(vmpMinTemp, 2) },
    result: vmpMaxTemp,
    unit: "V",
    normRef: `${REF} (faixa de MPPT)`,
  });

  const maxByVoltage = Math.floor(inv.maxDcVoltageV / vocMin);
  const maxByMppt = Math.floor(inv.mpptMaxV / vmpMinTemp);
  const minByMppt = Math.ceil(inv.mpptMinV / vmpMaxTemp);
  trace.step({
    label: "Máx. módulos por tensão CC do inversor",
    formula: "floor(V_cc_máx / Voc(Tmin))",
    inputs: { maxDcVoltageV: inv.maxDcVoltageV, vocMinV: round(vocMin, 2) },
    result: maxByVoltage,
    unit: "módulos",
    normRef: REF,
  });
  trace.step({
    label: "Máx. módulos pelo topo do MPPT",
    formula: "floor(MPPT_máx / Vmp(Tmin))",
    inputs: { mpptMaxV: inv.mpptMaxV, vmpMinTempV: round(vmpMinTemp, 2) },
    result: maxByMppt,
    unit: "módulos",
    normRef: REF,
  });
  trace.step({
    label: "Mín. módulos pela base do MPPT",
    formula: "ceil(MPPT_mín / Vmp(Tmax))",
    inputs: { mpptMinV: inv.mpptMinV, vmpMaxTempV: round(vmpMaxTemp, 2) },
    result: minByMppt,
    unit: "módulos",
    normRef: REF,
  });

  const recommended = Math.min(maxByVoltage, maxByMppt);
  const maxParallel = Math.floor(inv.maxInputCurrentA / m.impStcA);
  trace.step({
    label: "Módulos por string recomendado",
    formula: "min(máx. por tensão, máx. por MPPT)",
    inputs: { maxByVoltage, maxByMppt, minByMppt },
    result: recommended,
    unit: "módulos",
    normRef: REF,
  });
  trace.step({
    label: "Máx. strings em paralelo por MPPT",
    formula: "floor(I_entrada_máx / Imp)",
    inputs: { maxInputCurrentA: inv.maxInputCurrentA, impStcA: m.impStcA },
    result: maxParallel,
    unit: "strings",
    normRef: REF,
  });

  let status: ComplianceStatus = "ok";
  if (minByMppt > recommended) {
    status = "fail";
    trace.warn(
      "NO_VALID_STRING",
      `Não há nº de módulos válido: mínimo por MPPT (${minByMppt}) excede o máximo permitido (${recommended}). Reveja módulo/inversor.`,
    );
  } else if (maxByVoltage < maxByMppt) {
    trace.warn("VOLTAGE_LIMITED", "String limitada pela tensão CC máxima do inversor (não pelo MPPT).");
  }
  if (maxParallel < 1) {
    status = "fail";
    trace.warn("CURRENT_LIMITED", "A corrente do módulo excede a entrada máxima do inversor por MPPT.");
  }

  const canonical = canonicalJson({ input: inp, engineVersion: ENGINE_VERSION, norm: REF });
  const inputHash = await sha256Hex(canonical);

  return {
    traceId: `PV-${inputHash.slice(0, 12)}`,
    inputHash,
    engineVersion: ENGINE_VERSION,
    timestamp: new Date().toISOString(),
    vocAtMinTempV: round(vocMin, 2),
    vmpAtMaxTempV: round(vmpMaxTemp, 2),
    vmpAtMinTempV: round(vmpMinTemp, 2),
    maxModulesByVoltage: maxByVoltage,
    maxModulesByMppt: maxByMppt,
    minModulesByMppt: minByMppt,
    recommendedModulesPerString: recommended,
    maxParallelStrings: maxParallel,
    status,
    steps: trace.steps,
    warnings: trace.warnings,
  };
}

/* ─────────────────────────── Queda de tensão CC ─────────────────────────── */

export const dcVoltageDropInputSchema = z.object({
  /** Corrente da string (Imp) [A]. */
  currentA: z.number().positive(),
  /** Comprimento de ida do cabo CC [m] (ida e volta calculados internamente). */
  lengthM: z.number().positive(),
  /** Seção do condutor [mm²]. */
  sectionMm2: z.number().positive(),
  /** Tensão de operação da string [V] (N·Vmp). */
  stringVoltageV: z.number().positive(),
  conductor: z.enum(["Cu", "Al"]).default("Cu"),
  /** Limite de queda CC admissível [%] (NBR 16690 recomenda ≤ 1–3%). */
  maxDropPct: z.number().positive().max(5).default(1),
  normId: z.string().default(DEFAULT_NORM_ID),
});

export type DcVoltageDropInput = z.input<typeof dcVoltageDropInputSchema>;

export interface DcVoltageDropResult {
  readonly dropV: number;
  readonly dropPct: number;
  readonly status: ComplianceStatus;
  readonly steps: readonly CalculationStep[];
}

/** Queda de tensão CC em string fotovoltaica: ΔU = 2·I·L·R/1000 (ida e volta). */
export async function dcStringVoltageDrop(
  rawInput: DcVoltageDropInput,
): Promise<DcVoltageDropResult> {
  const inp = dcVoltageDropInputSchema.parse(rawInput);
  const norm = getNorm(inp.normId);
  const trace = new CalculationTrace();
  const r20 = conductorResistance20C(norm, inp.sectionMm2, inp.conductor);
  if (r20 === undefined) throw new Error(`Seção ${inp.sectionMm2} mm² não consta na tabela.`);
  // Em CC não há reatância; usa-se a resistência na temperatura de operação.
  const alpha = norm.tempCoeff[inp.conductor];
  const rOp = r20 * (1 + alpha * (70 - 20));
  const dropV = (2 * inp.currentA * inp.lengthM * rOp) / 1000;
  const dropPct = (dropV / inp.stringVoltageV) * 100;
  trace.step({
    label: "Queda de tensão CC",
    formula: "ΔU = 2·I·L·R/1000 ; usa apenas R (CC, sem reatância)",
    inputs: { currentA: inp.currentA, lengthM: inp.lengthM, sectionMm2: inp.sectionMm2, rOpOhmKm: round(rOp, 4) },
    result: dropV,
    unit: "V",
    normRef: `${REF} (queda CC)`,
  });

  const status: ComplianceStatus = dropPct > inp.maxDropPct ? "fail" : dropPct > 0.9 * inp.maxDropPct ? "warning" : "ok";
  return { dropV: round(dropV, 3), dropPct: round(dropPct, 3), status, steps: trace.steps };
}
