import { z } from "zod";
import { CalculationTrace, canonicalJson, sha256Hex } from "../../engine/trace";
import { round } from "../../engine/units";
import { ENGINE_VERSION } from "../../version";
import type { CalculationStep, ComplianceStatus, EngineeringWarning } from "../../engine/types";

const REF = "IEEE Std 519-2014";

/** Limites de distorção de corrente (Tabela 2), por faixa de ordem e TDD. */
interface CurrentLimitRow {
  h3_11: number;
  h11_17: number;
  h17_23: number;
  h23_35: number;
  h35_50: number;
  tdd: number;
}

/** Seleciona a linha da Tabela 2 pela relação de curto-circuito Isc/IL. */
function currentLimitRow(scr: number): CurrentLimitRow {
  if (scr < 20) return { h3_11: 4, h11_17: 2, h17_23: 1.5, h23_35: 0.6, h35_50: 0.3, tdd: 5 };
  if (scr < 50) return { h3_11: 7, h11_17: 3.5, h17_23: 2.5, h23_35: 1, h35_50: 0.5, tdd: 8 };
  if (scr < 100) return { h3_11: 10, h11_17: 4.5, h17_23: 4, h23_35: 1.5, h35_50: 0.7, tdd: 12 };
  if (scr < 1000) return { h3_11: 12, h11_17: 5.5, h17_23: 5, h23_35: 2, h35_50: 1, tdd: 15 };
  return { h3_11: 15, h11_17: 7, h17_23: 6, h23_35: 2.5, h35_50: 1.4, tdd: 20 };
}

/** Limite individual de corrente para a ordem h (even = 25% do ímpar). */
function currentLimitForOrder(order: number, row: CurrentLimitRow): number {
  let base: number;
  if (order < 11) base = row.h3_11;
  else if (order < 17) base = row.h11_17;
  else if (order < 23) base = row.h17_23;
  else if (order < 35) base = row.h23_35;
  else if (order <= 50) base = row.h35_50;
  else base = 0; // acima de 50 não coberto
  return order % 2 === 0 ? base * 0.25 : base;
}

/** Limites de distorção de tensão (Tabela 1) por tensão do barramento. */
function voltageLimits(voltageKV: number): { individual: number; thd: number } {
  if (voltageKV <= 1) return { individual: 5, thd: 8 };
  if (voltageKV <= 69) return { individual: 3, thd: 5 };
  if (voltageKV <= 161) return { individual: 1.5, thd: 2.5 };
  return { individual: 1, thd: 1.5 };
}

export const harmonicsInputSchema = z
  .object({
    /** Tensão do barramento [kV] (define os limites de tensão). */
    systemVoltageKV: z.number().positive(),
    /** Relação de curto-circuito Isc/IL (se informada diretamente). */
    shortCircuitRatio: z.number().positive().optional(),
    /** Corrente de curto Isc [A] (ex.: I"k) — usada com loadCurrentA. */
    iscA: z.number().positive().optional(),
    /** Corrente de carga de demanda máxima IL [A]. */
    loadCurrentA: z.number().positive().optional(),
    /** Espectro de corrente: ordem h e magnitude em % de IL. */
    harmonics: z
      .array(z.object({ order: z.number().int().min(2).max(50), currentPercentIL: z.number().min(0) }))
      .default([]),
    /** THD de tensão medido/estimado [%] (opcional). */
    voltageThdPercent: z.number().min(0).optional(),
  })
  .refine((d) => d.shortCircuitRatio != null || (d.iscA != null && d.loadCurrentA != null), {
    message: "Informe shortCircuitRatio ou (iscA e loadCurrentA).",
  });

export type HarmonicsInput = z.input<typeof harmonicsInputSchema>;

export interface HarmonicCheck {
  readonly order: number;
  readonly valuePercent: number;
  readonly limitPercent: number;
  readonly ok: boolean;
}

export interface HarmonicsResult {
  readonly traceId: string;
  readonly inputHash: string;
  readonly engineVersion: string;
  readonly timestamp: string;

  readonly shortCircuitRatio: number;
  /** Distorção total de demanda TDD [%]. */
  readonly tddPercent: number;
  readonly tddLimitPercent: number;
  readonly tddOk: boolean;
  readonly perHarmonic: readonly HarmonicCheck[];
  /** THD de tensão e seu limite (se informado). */
  readonly voltageThdPercent: number | null;
  readonly voltageThdLimitPercent: number;
  readonly voltageThdOk: boolean | null;
  readonly status: ComplianceStatus;

  readonly steps: readonly CalculationStep[];
  readonly warnings: readonly EngineeringWarning[];
}

/**
 * Verifica limites de harmônicos pela IEEE 519-2014: distorção individual de
 * corrente e TDD (Tabela 2, conforme Isc/IL) e THD de tensão (Tabela 1).
 */
export async function checkHarmonics(rawInput: HarmonicsInput): Promise<HarmonicsResult> {
  const inp = harmonicsInputSchema.parse(rawInput);
  const trace = new CalculationTrace();

  const scr = inp.shortCircuitRatio ?? inp.iscA! / inp.loadCurrentA!;
  trace.step({
    label: "Relação de curto-circuito Isc/IL",
    formula: inp.shortCircuitRatio != null ? "informada" : "Isc / IL",
    inputs: inp.shortCircuitRatio != null ? { scr } : { iscA: inp.iscA!, loadCurrentA: inp.loadCurrentA! },
    result: scr,
    unit: "-",
    normRef: `${REF} Tab. 2`,
  });

  const row = currentLimitRow(scr);
  const perHarmonic: HarmonicCheck[] = inp.harmonics.map((h) => {
    const limit = currentLimitForOrder(h.order, row);
    return { order: h.order, valuePercent: h.currentPercentIL, limitPercent: round(limit, 3), ok: h.currentPercentIL <= limit };
  });

  const tdd = Math.sqrt(inp.harmonics.reduce((acc, h) => acc + h.currentPercentIL ** 2, 0));
  trace.step({
    label: "Distorção total de demanda (TDD)",
    formula: "TDD = √(Σ Ih²) em % de IL",
    inputs: { nHarmonicos: inp.harmonics.length },
    result: tdd,
    unit: "%",
    normRef: `${REF} §3.1`,
  });
  const tddOk = tdd <= row.tdd;
  trace.step({
    label: "Limite de TDD",
    formula: "Tabela 2 conforme Isc/IL",
    inputs: { scr: round(scr, 1) },
    result: row.tdd,
    unit: "%",
    normRef: `${REF} Tab. 2`,
  });

  const vLimits = voltageLimits(inp.systemVoltageKV);
  const voltageThdOk = inp.voltageThdPercent != null ? inp.voltageThdPercent <= vLimits.thd : null;
  if (inp.voltageThdPercent != null) {
    trace.step({
      label: "THD de tensão vs limite",
      formula: "Tabela 1 conforme tensão do barramento",
      inputs: { voltageThdPercent: inp.voltageThdPercent, limit: vLimits.thd },
      result: inp.voltageThdPercent,
      unit: "%",
      normRef: `${REF} Tab. 1`,
    });
  }

  const failingOrders = perHarmonic.filter((h) => !h.ok).map((h) => h.order);
  if (failingOrders.length > 0)
    trace.warn("CURRENT_OVER", `Ordens acima do limite individual de corrente: ${failingOrders.join(", ")}.`);
  if (!tddOk) trace.warn("TDD_OVER", `TDD ${round(tdd, 2)}% excede o limite ${row.tdd}%.`);
  if (voltageThdOk === false) trace.warn("VTHD_OVER", `THD de tensão ${inp.voltageThdPercent}% excede ${vLimits.thd}%.`);

  const anyFail = !tddOk || failingOrders.length > 0 || voltageThdOk === false;
  const status: ComplianceStatus = anyFail ? "fail" : "ok";

  const canonical = canonicalJson({ input: inp, engineVersion: ENGINE_VERSION, norm: REF });
  const inputHash = await sha256Hex(canonical);

  return {
    traceId: `HA-${inputHash.slice(0, 12)}`,
    inputHash,
    engineVersion: ENGINE_VERSION,
    timestamp: new Date().toISOString(),
    shortCircuitRatio: round(scr, 2),
    tddPercent: round(tdd, 2),
    tddLimitPercent: row.tdd,
    tddOk,
    perHarmonic,
    voltageThdPercent: inp.voltageThdPercent ?? null,
    voltageThdLimitPercent: vLimits.thd,
    voltageThdOk,
    status,
    steps: trace.steps,
    warnings: trace.warnings,
  };
}
