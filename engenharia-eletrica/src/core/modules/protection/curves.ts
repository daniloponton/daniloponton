/**
 * Curvas tempo-corrente (TCC) de relés de sobrecorrente conforme IEC 60255-151
 * (antiga IEC 60255-3). Cada curva inversa é parametrizada por (k, α):
 *
 *     t(I) = TMS · k / ((I / Is)^α − 1)
 *
 * onde Is é a corrente de partida (pickup) e TMS o multiplicador de tempo.
 */

export type RelayCurveType = "SI" | "VI" | "EI" | "LTI";

export const IEC_60255_CURVES: Readonly<
  Record<RelayCurveType, { k: number; alpha: number; label: string }>
> = {
  SI: { k: 0.14, alpha: 0.02, label: "Standard Inverse (normalmente inversa)" },
  VI: { k: 13.5, alpha: 1.0, label: "Very Inverse (muito inversa)" },
  EI: { k: 80.0, alpha: 2.0, label: "Extremely Inverse (extremamente inversa)" },
  LTI: { k: 120.0, alpha: 1.0, label: "Long-Time Inverse (tempo longo inversa)" },
};

/** Tempo de atuação de um estágio inverso IEC 60255. Infinity se não parte. */
export function inverseTime(
  currentA: number,
  pickupA: number,
  tms: number,
  curve: RelayCurveType,
): number {
  if (currentA <= pickupA) return Infinity;
  const { k, alpha } = IEC_60255_CURVES[curve];
  const m = currentA / pickupA;
  return (tms * k) / (Math.pow(m, alpha) - 1);
}
