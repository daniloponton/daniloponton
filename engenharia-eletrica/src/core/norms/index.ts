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
