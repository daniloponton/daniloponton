import { z } from "zod";
import { CalculationTrace, canonicalJson, sha256Hex } from "../../engine/trace";
import { round } from "../../engine/units";
import { ENGINE_VERSION } from "../../version";
import type { CalculationStep, EngineeringWarning } from "../../engine/types";

const REF = "IEC 60364 / IEEE 18 (correção de FP)";

/** Série de potências reativas comerciais de bancos de capacitores [kvar]. */
const STANDARD_KVAR = [
  2.5, 5, 7.5, 10, 12.5, 15, 20, 25, 30, 40, 50, 60, 75, 100, 125, 150, 200,
] as const;

export const capacitorBankInputSchema = z.object({
  /** Potência ativa da carga [kW]. */
  activePowerKW: z.number().positive(),
  /** Fator de potência atual (cos φ1). */
  currentCosPhi: z.number().min(0.1).max(1),
  /** Fator de potência desejado (cos φ2). */
  targetCosPhi: z.number().min(0.1).max(1),
  /** Tensão de linha [V] (para cálculo da redução de corrente). */
  voltageV: z.number().positive(),
  /** Sistema. */
  system: z.enum(["single", "three"]).default("three"),
});

export type CapacitorBankInput = z.input<typeof capacitorBankInputSchema>;

export interface CapacitorBankResult {
  readonly traceId: string;
  readonly inputHash: string;
  readonly engineVersion: string;
  readonly timestamp: string;

  /** Potência reativa do banco necessária [kvar]. */
  readonly requiredKvar: number;
  /** Banco comercial recomendado (≥ necessário) [kvar]. */
  readonly recommendedKvar: number;
  /** Potência aparente antes e depois [kVA]. */
  readonly apparentBeforeKVA: number;
  readonly apparentAfterKVA: number;
  /** Corrente antes e depois [A]. */
  readonly currentBeforeA: number;
  readonly currentAfterA: number;
  /** Redução percentual de corrente. */
  readonly currentReductionPct: number;

  readonly steps: readonly CalculationStep[];
  readonly warnings: readonly EngineeringWarning[];
}

/**
 * Dimensiona o banco de capacitores para corrigir o fator de potência de
 * cos φ1 para cos φ2: Qc = P·(tan φ1 − tan φ2).
 */
export async function sizeCapacitorBank(
  rawInput: CapacitorBankInput,
): Promise<CapacitorBankResult> {
  const inp = capacitorBankInputSchema.parse(rawInput);
  const trace = new CalculationTrace();

  if (inp.targetCosPhi <= inp.currentCosPhi) {
    trace.warn(
      "NO_CORRECTION_NEEDED",
      "O fator de potência desejado não é maior que o atual: não há correção a fazer.",
    );
  }

  const phi1 = Math.acos(inp.currentCosPhi);
  const phi2 = Math.acos(inp.targetCosPhi);
  const tan1 = Math.tan(phi1);
  const tan2 = Math.tan(phi2);

  const requiredKvar = trace.step({
    label: "Potência reativa do banco",
    formula: "Qc = P·(tan φ1 − tan φ2)",
    inputs: { P_kW: inp.activePowerKW, cosPhi1: inp.currentCosPhi, cosPhi2: inp.targetCosPhi },
    result: Math.max(0, inp.activePowerKW * (tan1 - tan2)),
    unit: "kvar",
    normRef: REF,
  });

  const recommendedKvar =
    STANDARD_KVAR.find((q) => q >= requiredKvar) ?? STANDARD_KVAR[STANDARD_KVAR.length - 1];
  trace.step({
    label: "Banco comercial recomendado",
    formula: "menor degrau comercial ≥ Qc",
    inputs: { requiredKvar: round(requiredKvar, 2) },
    result: recommendedKvar,
    unit: "kvar",
    normRef: REF,
  });

  const sBefore = inp.activePowerKW / inp.currentCosPhi;
  const sAfter = inp.activePowerKW / inp.targetCosPhi;
  const factor = inp.system === "single" ? 1 : Math.sqrt(3);
  const iBefore = (sBefore * 1000) / (factor * inp.voltageV);
  const iAfter = (sAfter * 1000) / (factor * inp.voltageV);
  const reduction = iBefore > 0 ? (1 - iAfter / iBefore) * 100 : 0;

  trace.step({
    label: "Potência aparente antes / depois",
    formula: "S = P / cos φ",
    inputs: { sBeforeKVA: round(sBefore, 2), sAfterKVA: round(sAfter, 2) },
    result: round(sAfter, 2),
    unit: "kVA",
    normRef: REF,
  });
  trace.step({
    label: "Redução de corrente",
    formula: "ΔI(%) = (1 − I_depois/I_antes)·100",
    inputs: { iBeforeA: round(iBefore, 1), iAfterA: round(iAfter, 1) },
    result: reduction,
    unit: "%",
    normRef: REF,
  });

  const canonical = canonicalJson({ input: inp, engineVersion: ENGINE_VERSION, norm: REF });
  const inputHash = await sha256Hex(canonical);

  return {
    traceId: `PF-${inputHash.slice(0, 12)}`,
    inputHash,
    engineVersion: ENGINE_VERSION,
    timestamp: new Date().toISOString(),
    requiredKvar: round(requiredKvar, 2),
    recommendedKvar,
    apparentBeforeKVA: round(sBefore, 2),
    apparentAfterKVA: round(sAfter, 2),
    currentBeforeA: round(iBefore, 1),
    currentAfterA: round(iAfter, 1),
    currentReductionPct: round(reduction, 1),
    steps: trace.steps,
    warnings: trace.warnings,
  };
}
