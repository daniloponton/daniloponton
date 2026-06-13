import { z } from "zod";
import { CalculationTrace, canonicalJson, sha256Hex } from "../../engine/trace";
import { round } from "../../engine/units";
import { ENGINE_VERSION } from "../../version";
import type { CalculationStep } from "../../engine/types";

const REF = "IEC 62305-3 / ABNT NBR 5419-3";

/** Nível de proteção contra descargas atmosféricas (NP / LPL). */
export type LightningProtectionLevel = "I" | "II" | "III" | "IV";

/** Parâmetros de captação por nível de proteção (IEC 62305-3 Tab. 2). */
const LPL_TABLE: Readonly<
  Record<
    LightningProtectionLevel,
    { rollingSphereRadiusM: number; meshSizeM: number; downConductorSpacingM: number }
  >
> = {
  I: { rollingSphereRadiusM: 20, meshSizeM: 5, downConductorSpacingM: 10 },
  II: { rollingSphereRadiusM: 30, meshSizeM: 10, downConductorSpacingM: 10 },
  III: { rollingSphereRadiusM: 45, meshSizeM: 15, downConductorSpacingM: 15 },
  IV: { rollingSphereRadiusM: 60, meshSizeM: 20, downConductorSpacingM: 20 },
};

export const spdaInputSchema = z.object({
  /** Nível de proteção desejado. */
  protectionLevel: z.enum(["I", "II", "III", "IV"]),
  /** Corrente de primeira descarga para o modelo eletrogeométrico [kA] (opcional). */
  firstStrokeCurrentKA: z.number().positive().optional(),
});

export type SpdaInput = z.input<typeof spdaInputSchema>;

export interface SpdaResult {
  readonly traceId: string;
  readonly inputHash: string;
  readonly engineVersion: string;
  readonly timestamp: string;

  readonly protectionLevel: LightningProtectionLevel;
  /** Raio da esfera rolante por nível de proteção [m]. */
  readonly rollingSphereRadiusM: number;
  /** Raio da esfera pelo modelo eletrogeométrico r = 10·I^0,65 [m] (se I dado). */
  readonly rollingSphereFromCurrentM: number | null;
  /** Largura máxima da malha de captação [m]. */
  readonly meshSizeM: number;
  /** Espaçamento máximo entre condutores de descida [m]. */
  readonly downConductorSpacingM: number;

  readonly steps: readonly CalculationStep[];
}

/** Raio da esfera rolante pelo modelo eletrogeométrico: r = 10·I^0,65 [m]. */
export function rollingSphereRadius(currentKA: number): number {
  return 10 * Math.pow(currentKA, 0.65);
}

/**
 * Parâmetros de proteção contra descargas atmosféricas (IEC 62305-3 / NBR 5419)
 * por nível de proteção: raio da esfera rolante, malha de captação e espaçamento
 * de descidas.
 */
export async function analyzeSpda(rawInput: SpdaInput): Promise<SpdaResult> {
  const inp = spdaInputSchema.parse(rawInput);
  const trace = new CalculationTrace();
  const lpl = inp.protectionLevel;
  const t = LPL_TABLE[lpl];

  trace.step({
    label: `Raio da esfera rolante (NP ${lpl})`,
    formula: "tabela IEC 62305-3",
    inputs: { protectionLevel: lpl },
    result: t.rollingSphereRadiusM,
    unit: "m",
    normRef: `${REF} Tab. 2`,
  });
  trace.step({
    label: `Largura da malha de captação (NP ${lpl})`,
    formula: "tabela IEC 62305-3",
    inputs: { protectionLevel: lpl },
    result: t.meshSizeM,
    unit: "m",
    normRef: `${REF} Tab. 2`,
  });
  trace.step({
    label: `Espaçamento entre descidas (NP ${lpl})`,
    formula: "tabela IEC 62305-3",
    inputs: { protectionLevel: lpl },
    result: t.downConductorSpacingM,
    unit: "m",
    normRef: `${REF} Tab. 4`,
  });

  let fromCurrent: number | null = null;
  if (inp.firstStrokeCurrentKA != null) {
    fromCurrent = rollingSphereRadius(inp.firstStrokeCurrentKA);
    trace.step({
      label: "Raio da esfera (modelo eletrogeométrico)",
      formula: "r = 10·I^0,65",
      inputs: { I_kA: inp.firstStrokeCurrentKA },
      result: fromCurrent,
      unit: "m",
      normRef: `${REF} / modelo eletrogeométrico`,
    });
  }

  const canonical = canonicalJson({ input: inp, engineVersion: ENGINE_VERSION, norm: REF });
  const inputHash = await sha256Hex(canonical);

  return {
    traceId: `SP-${inputHash.slice(0, 12)}`,
    inputHash,
    engineVersion: ENGINE_VERSION,
    timestamp: new Date().toISOString(),
    protectionLevel: lpl,
    rollingSphereRadiusM: t.rollingSphereRadiusM,
    rollingSphereFromCurrentM: fromCurrent != null ? round(fromCurrent, 1) : null,
    meshSizeM: t.meshSizeM,
    downConductorSpacingM: t.downConductorSpacingM,
    steps: trace.steps,
  };
}
