/**
 * Seções nominais comerciais de condutores [mm²], conforme série padronizada
 * (IEC 60228 / NBR NM 280). O motor só seleciona valores desta série.
 */
export const COMMERCIAL_SECTIONS_MM2 = [
  1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240,
] as const;

export type CommercialSection = (typeof COMMERCIAL_SECTIONS_MM2)[number];

/** sin(φ) a partir do fator de potência (cos φ), assumindo carga indutiva. */
export function sinFromCosPhi(cosPhi: number): number {
  return Math.sqrt(Math.max(0, 1 - cosPhi * cosPhi));
}

/**
 * Interpolação linear sobre uma tabela esparsa indexada por número.
 * Fora dos limites, aplica o valor da extremidade mais próxima (clamp).
 */
export function interpolate(
  table: Readonly<Record<number, number>>,
  x: number,
): number {
  const keys = Object.keys(table)
    .map(Number)
    .sort((a, b) => a - b);
  if (keys.length === 0) throw new Error("Tabela de interpolação vazia.");
  if (x <= keys[0]) return table[keys[0]];
  if (x >= keys[keys.length - 1]) return table[keys[keys.length - 1]];
  for (let i = 0; i < keys.length - 1; i++) {
    const x0 = keys[i];
    const x1 = keys[i + 1];
    if (x >= x0 && x <= x1) {
      const y0 = table[x0];
      const y1 = table[x1];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return table[keys[keys.length - 1]];
}

/**
 * Lookup conservador por chave inteira (agrupamento): usa a chave exata se
 * existir; caso contrário, a maior chave tabelada <= x (fator mais penalizante
 * disponível). Se x for menor que todas, usa a menor chave.
 */
export function lookupConservative(
  table: Readonly<Record<number, number>>,
  x: number,
): number {
  const keys = Object.keys(table)
    .map(Number)
    .sort((a, b) => a - b);
  if (table[x] !== undefined) return table[x];
  let chosen = keys[0];
  for (const k of keys) {
    if (k <= x) chosen = k;
  }
  return table[chosen];
}

/** Arredondamento para n casas significativas decimais. */
export function round(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * f) / f;
}
