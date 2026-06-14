import type { NormProfile } from "./types";
import { IEC_60364_5_52 } from "./iec60364";

export * from "./types";
export { IEC_60364_5_52 };

/** Registro de perfis normativos disponíveis, indexado por id. */
export const NORM_REGISTRY: Readonly<Record<string, NormProfile>> = {
  [IEC_60364_5_52.id]: IEC_60364_5_52,
};

export function getNorm(id: string): NormProfile {
  const norm = NORM_REGISTRY[id];
  if (!norm) throw new Error(`Norma não suportada: ${id}`);
  return norm;
}

export const DEFAULT_NORM_ID = IEC_60364_5_52.id;

/**
 * Razão de resistividade ρAl/ρCu (~IEC 60228): a resistência do alumínio por
 * seção é estimada multiplicando a do cobre por este fator, enquanto não houver
 * tabela oficial de resistência de condutores de alumínio.
 */
export const AL_CU_RESISTANCE_RATIO = 1.65;

/** Resistência a 20 °C [Ω/km] para a seção e material informados. */
export function conductorResistance20C(
  norm: NormProfile,
  sectionMm2: number,
  conductor: "Cu" | "Al",
): number | undefined {
  const base = norm.resistanceOhmPerKm20C[sectionMm2];
  if (base === undefined) return undefined;
  return conductor === "Al" ? base * AL_CU_RESISTANCE_RATIO : base;
}
