import { z } from "zod";
import { CalculationTrace, canonicalJson, sha256Hex } from "../../engine/trace";
import { round, sinFromCosPhi } from "../../engine/units";
import { getNorm, conductorResistance20C, DEFAULT_NORM_ID } from "../../norms";
import { ENGINE_VERSION } from "../../version";
import type { CalculationStep, ComplianceStatus, EngineeringWarning } from "../../engine/types";

const REF = "IEC 60364-5-52 (queda de tensão)";

const segmentSchema = z.object({
  label: z.string().default(""),
  /** Seção do condutor [mm²] (deve existir na tabela da norma). */
  sectionMm2: z.number().positive(),
  conductor: z.enum(["Cu", "Al"]).default("Cu"),
  insulation: z.enum(["PVC", "XLPE"]).default("PVC"),
  lengthM: z.number().positive(),
  /** Corrente que percorre o trecho [A]. */
  currentA: z.number().positive(),
  cosPhi: z.number().min(0.5).max(1).default(0.92),
});

export const voltageDropInputSchema = z.object({
  system: z.enum(["single", "three"]).default("three"),
  /** Tensão nominal de linha na origem [V]. */
  baseVoltageV: z.number().positive(),
  /** Queda de tensão máxima acumulada admissível [%]. */
  maxVoltageDropPct: z.number().positive().max(10).default(4),
  segments: z.array(segmentSchema).min(1),
  normId: z.string().default(DEFAULT_NORM_ID),
});

export type VoltageDropInput = z.input<typeof voltageDropInputSchema>;

export interface VoltageDropNode {
  readonly label: string;
  readonly segmentDropV: number;
  readonly cumulativeDropV: number;
  readonly cumulativeDropPct: number;
  readonly voltageAtNodeV: number;
}

export interface VoltageDropResult {
  readonly traceId: string;
  readonly inputHash: string;
  readonly engineVersion: string;
  readonly timestamp: string;

  readonly nodes: readonly VoltageDropNode[];
  /** Queda total acumulada [%]. */
  readonly totalDropPct: number;
  readonly status: ComplianceStatus;

  readonly steps: readonly CalculationStep[];
  readonly warnings: readonly EngineeringWarning[];
}

/**
 * Queda de tensão em alimentador com trechos em série (carga distribuída):
 * acumula a queda fasorial ΔU = k·I·L·(R·cosφ + X·senφ) ao longo da linha,
 * reportando a tensão e a queda acumulada em cada nó.
 */
export async function calculateVoltageDrop(
  rawInput: VoltageDropInput,
): Promise<VoltageDropResult> {
  const inp = voltageDropInputSchema.parse(rawInput);
  const norm = getNorm(inp.normId);
  const trace = new CalculationTrace();
  const factor = inp.system === "single" ? 2 : Math.sqrt(3);

  const nodes: VoltageDropNode[] = [];
  let cumulativeDropV = 0;

  for (let i = 0; i < inp.segments.length; i++) {
    const s = inp.segments[i];
    const r20 = conductorResistance20C(norm, s.sectionMm2, s.conductor);
    const x = norm.reactanceOhmPerKm[s.sectionMm2];
    if (r20 === undefined || x === undefined) {
      throw new Error(`Seção ${s.sectionMm2} mm² não consta na tabela da norma.`);
    }
    const tMax = norm.insulationMaxTempC[s.insulation];
    const alpha = norm.tempCoeff[s.conductor];
    const rOp = r20 * (1 + alpha * (tMax - 20));
    const sinPhi = sinFromCosPhi(s.cosPhi);
    const dropV = (factor * s.currentA * s.lengthM * (rOp * s.cosPhi + x * sinPhi)) / 1000;
    cumulativeDropV += dropV;
    const cumulativePct = (cumulativeDropV / inp.baseVoltageV) * 100;

    trace.step({
      label: `Queda no trecho ${i + 1}${s.label ? ` (${s.label})` : ""}`,
      formula: "ΔU = k·I·L·(R·cosφ + X·senφ)/1000",
      inputs: { sectionMm2: s.sectionMm2, lengthM: s.lengthM, currentA: s.currentA, cosPhi: s.cosPhi },
      result: dropV,
      unit: "V",
      normRef: REF,
    });

    nodes.push({
      label: s.label || `Nó ${i + 1}`,
      segmentDropV: round(dropV, 3),
      cumulativeDropV: round(cumulativeDropV, 3),
      cumulativeDropPct: round(cumulativePct, 3),
      voltageAtNodeV: round(inp.baseVoltageV - cumulativeDropV, 2),
    });
  }

  const totalPct = (cumulativeDropV / inp.baseVoltageV) * 100;
  trace.step({
    label: "Queda de tensão total acumulada",
    formula: "ΣΔU / U_base · 100",
    inputs: { totalDropV: round(cumulativeDropV, 3), baseVoltageV: inp.baseVoltageV },
    result: totalPct,
    unit: "%",
    normRef: REF,
  });

  let status: ComplianceStatus = "ok";
  if (totalPct > inp.maxVoltageDropPct) {
    status = "fail";
    trace.warn("OVER_LIMIT", `Queda total ${round(totalPct, 2)}% excede o limite ${inp.maxVoltageDropPct}%.`);
  } else if (totalPct > 0.9 * inp.maxVoltageDropPct) {
    status = "warning";
  }

  const canonical = canonicalJson({ input: inp, engineVersion: ENGINE_VERSION, norm: `${norm.id}:${norm.version}` });
  const inputHash = await sha256Hex(canonical);

  return {
    traceId: `VD-${inputHash.slice(0, 12)}`,
    inputHash,
    engineVersion: ENGINE_VERSION,
    timestamp: new Date().toISOString(),
    nodes,
    totalDropPct: round(totalPct, 3),
    status,
    steps: trace.steps,
    warnings: trace.warnings,
  };
}
