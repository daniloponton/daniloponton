import { z } from "zod";
import type { CalculationStep, EngineeringWarning } from "../../engine/types";

/**
 * Um dispositivo de proteção é uma composição de estágios. O tempo de atuação
 * para uma dada corrente é o MENOR tempo entre os estágios que partem (o estágio
 * mais rápido vence) — comportamento físico de um relé multifunção.
 */

export const inverseStageSchema = z.object({
  kind: z.literal("inverse"),
  /** Corrente de partida Is [A]. */
  pickupA: z.number().positive(),
  /** Multiplicador de tempo TMS. */
  tms: z.number().positive(),
  curve: z.enum(["SI", "VI", "EI", "LTI"]),
});

export const definiteStageSchema = z.object({
  kind: z.literal("definite"),
  /** Corrente de partida [A]. */
  pickupA: z.number().positive(),
  /** Retardo fixo [s]. */
  delayS: z.number().min(0),
});

export const instantaneousStageSchema = z.object({
  kind: z.literal("instantaneous"),
  /** Ajuste instantâneo Ii [A]. */
  pickupA: z.number().positive(),
  /** Tempo próprio de operação [s] (default 0,02 s). */
  delayS: z.number().min(0).default(0.02),
});

export const protectionStageSchema = z.discriminatedUnion("kind", [
  inverseStageSchema,
  definiteStageSchema,
  instantaneousStageSchema,
]);

export const protectiveDeviceSchema = z.object({
  id: z.string(),
  name: z.string(),
  stages: z.array(protectionStageSchema).min(1),
});

export const selectivityInputSchema = z.object({
  upstream: protectiveDeviceSchema,
  downstream: protectiveDeviceSchema,
  /** Corrente de curto máxima no ponto (geralmente I"k da IEC 60909) [kA]. */
  faultCurrentKA: z.number().positive(),
  /** Margem mínima de coordenação entre curvas [s] (típico 0,2–0,4 s). */
  minMarginS: z.number().positive().default(0.2),
});

export type ProtectionStage = z.infer<typeof protectionStageSchema>;
export type ProtectiveDevice = z.infer<typeof protectiveDeviceSchema>;
export type SelectivityInput = z.input<typeof selectivityInputSchema>;

/** Ponto de uma curva TCC para plotagem (log-log). */
export interface TccPoint {
  readonly currentA: number;
  readonly timeS: number;
}

export interface SelectivityResult {
  readonly traceId: string;
  readonly inputHash: string;
  readonly engineVersion: string;
  readonly timestamp: string;

  /** Seletivo em toda a faixa até a corrente de falta? */
  readonly selective: boolean;
  /** Menor margem (t_montante − t_jusante) encontrada na faixa [s]. */
  readonly worstMarginS: number;
  /** Corrente onde ocorreu a pior margem [A]. */
  readonly worstCurrentA: number;
  /** Tempo de atuação do dispositivo de jusante na corrente de falta [s]. */
  readonly downstreamClearingAtFaultS: number;
  /** Tempo de atuação do dispositivo de montante na corrente de falta [s]. */
  readonly upstreamClearingAtFaultS: number;

  /** Curvas amostradas para plotagem. */
  readonly upstreamCurve: readonly TccPoint[];
  readonly downstreamCurve: readonly TccPoint[];

  readonly steps: readonly CalculationStep[];
  readonly warnings: readonly EngineeringWarning[];
}
