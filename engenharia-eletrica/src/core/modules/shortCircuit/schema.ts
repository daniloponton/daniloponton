import { z } from "zod";
import type { CalculationStep, EngineeringWarning } from "../../engine/types";

/**
 * Cálculo de corrente de curto-circuito trifásica simétrica pelo método das
 * impedâncias equivalentes da IEC 60909-0.
 *
 * Modela um caminho radial da fonte até o ponto de falta:
 *   Concessionária (feeder)  →  [Transformador]  →  [Cabos/linhas]  →  falta
 *
 * Todas as impedâncias são referidas ao nível de tensão do ponto de falta.
 */

const feederSchema = z.object({
  /** Potência de curto-circuito da concessionária no ponto de entrega [MVA]. */
  skMVA: z.number().positive(),
  /** Tensão nominal (linha) do lado da concessionária [kV]. */
  unHvKV: z.number().positive(),
  /** Relação R/X da fonte (típico 0,1 em AT). */
  rxRatio: z.number().positive().default(0.1),
});

const transformerSchema = z.object({
  /** Potência nominal [kVA]. */
  srKVA: z.number().positive(),
  /** Tensão de curto-circuito (impedância percentual) ukr [%]. */
  ukrPercent: z.number().positive(),
  /** Perdas no cobre (Joule) em carga nominal [kW]. Fornece a parte resistiva. */
  copperLossKW: z.number().positive().optional(),
  /** Alternativa a copperLossKW: componente resistiva da tensão de curto uRr [%]. */
  urrPercent: z.number().positive().optional(),
  /** Tensão nominal primária (linha) [kV]. */
  unHvKV: z.number().positive(),
  /** Tensão nominal secundária (linha) [V]. */
  unLvV: z.number().positive(),
  /** Aplicar fator de correção de impedância KT da IEC 60909-0. */
  applyKT: z.boolean().default(true),
});

const cableSchema = z.object({
  rOhmPerKm: z.number().min(0),
  xOhmPerKm: z.number().min(0),
  lengthM: z.number().positive(),
  parallel: z.number().int().min(1).default(1),
});

export const shortCircuitInputSchema = z.object({
  frequencyHz: z.number().positive().default(60),
  /** Tensão nominal (linha) no ponto de falta [V]. */
  faultVoltageV: z.number().positive(),
  /** Nível de tensão no ponto de falta (define o fator c). */
  faultVoltageLevel: z.enum(["LV", "MV", "HV"]).default("LV"),
  /** Variante do fator de tensão: máximo (capacidade de interrupção) ou mínimo. */
  cVariant: z.enum(["max", "min"]).default("max"),
  feeder: feederSchema,
  transformer: transformerSchema.optional(),
  cables: z.array(cableSchema).default([]),
});

export type ShortCircuitInput = z.input<typeof shortCircuitInputSchema>;
export type ShortCircuitParsed = z.output<typeof shortCircuitInputSchema>;

export interface ShortCircuitResult {
  readonly traceId: string;
  readonly inputHash: string;
  readonly engineVersion: string;
  readonly timestamp: string;

  /** Fator de tensão c aplicado no ponto de falta. */
  readonly cFactor: number;
  /** Resistência equivalente no ponto de falta [Ω]. */
  readonly rkOhm: number;
  /** Reatância equivalente no ponto de falta [Ω]. */
  readonly xkOhm: number;
  /** Impedância equivalente [Ω]. */
  readonly zkOhm: number;
  /** Relação R/X equivalente. */
  readonly rOverX: number;
  /** Corrente de curto-circuito inicial simétrica I"k [kA]. */
  readonly ikSymKA: number;
  /** Fator κ para corrente de pico. */
  readonly kappa: number;
  /** Corrente de pico ip [kA]. */
  readonly ipKA: number;
  /** Potência de curto-circuito S"k no ponto de falta [MVA]. */
  readonly skMVA: number;

  readonly steps: readonly CalculationStep[];
  readonly warnings: readonly EngineeringWarning[];
}
