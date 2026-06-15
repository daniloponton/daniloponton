import { z } from "zod";
import { CalculationTrace, canonicalJson, sha256Hex } from "../../engine/trace";
import { round } from "../../engine/units";
import { ENGINE_VERSION } from "../../version";
import type { CalculationStep, ComplianceStatus, EngineeringWarning } from "../../engine/types";

const REF = "IEC 61642 / IEEE 1531 (filtros dessintonizados)";

export const detunedFilterInputSchema = z.object({
  /** Tensão de linha [V]. */
  systemVoltageV: z.number().positive(),
  /** Frequência [Hz]. */
  frequencyHz: z.number().positive().default(60),
  /** Potência reativa a entregar à rede (na fundamental) [kvar]. */
  reactivePowerKvar: z.number().positive(),
  /** Fator de dessintonia p = XL/XC [%] (típico 5,67–14%). */
  detuningFactorPercent: z.number().min(1).max(20).default(7),
});

export type DetunedFilterInput = z.input<typeof detunedFilterInputSchema>;

export interface DetunedFilterResult {
  readonly traceId: string;
  readonly inputHash: string;
  readonly engineVersion: string;
  readonly timestamp: string;

  /** Ordem de sintonia h_r = 1/√p. */
  readonly tuningOrder: number;
  /** Frequência de sintonia [Hz]. */
  readonly tuningFrequencyHz: number;
  /** Reatância equivalente do capacitor [Ω]. */
  readonly capacitorReactanceOhm: number;
  /** Reatância do reator [Ω]. */
  readonly reactorReactanceOhm: number;
  /** Indutância do reator [mH]. */
  readonly reactorInductanceMh: number;
  /** Tensão nominal do capacitor (com sobretensão) [V]. */
  readonly capacitorRatedVoltageV: number;
  /** Potência reativa nominal do capacitor [kvar]. */
  readonly capacitorReactiveKvar: number;
  readonly status: ComplianceStatus;

  readonly steps: readonly CalculationStep[];
  readonly warnings: readonly EngineeringWarning[];
}

/**
 * Dimensiona um banco de capacitores dessintonizado (reator em série) pelo
 * fator de dessintonia p = XL/XC. A ordem de sintonia h_r = 1/√p deve ficar
 * abaixo da menor harmônica presente (tipicamente < 5ª) para evitar ressonância.
 */
export async function sizeDetunedFilter(rawInput: DetunedFilterInput): Promise<DetunedFilterResult> {
  const inp = detunedFilterInputSchema.parse(rawInput);
  const trace = new CalculationTrace();

  const p = inp.detuningFactorPercent / 100;
  const hr = 1 / Math.sqrt(p);
  const fr = hr * inp.frequencyHz;
  trace.step({
    label: "Ordem de sintonia",
    formula: "h_r = 1/√p ; f_r = h_r·f",
    inputs: { p_pct: inp.detuningFactorPercent, f: inp.frequencyHz },
    result: hr,
    unit: "-",
    normRef: REF,
  });

  // Reatância líquida na fundamental (capacitiva) a partir do Q entregue.
  const qSys = inp.reactivePowerKvar * 1000;
  const xNet = (inp.systemVoltageV * inp.systemVoltageV) / qSys;
  const xC = xNet / (1 - p);
  const xL = p * xC;
  const L = xL / (2 * Math.PI * inp.frequencyHz);
  trace.step({
    label: "Reatâncias (capacitor e reator)",
    formula: "X_net = U²/Q ; X_C = X_net/(1−p) ; X_L = p·X_C",
    inputs: { U: inp.systemVoltageV, Q_kvar: inp.reactivePowerKvar, p },
    result: xC,
    unit: "Ω",
    normRef: REF,
  });

  // Sobretensão no capacitor e potência reativa nominal.
  const vC = inp.systemVoltageV / (1 - p);
  const qCap = inp.reactivePowerKvar / (1 - p);
  trace.step({
    label: "Capacitor: tensão e potência nominais",
    formula: "U_C = U/(1−p) ; Q_C = Q/(1−p)",
    inputs: { factor: round(1 / (1 - p), 4) },
    result: qCap,
    unit: "kvar",
    normRef: REF,
  });

  let status: ComplianceStatus = "ok";
  if (hr >= 5) {
    status = "fail";
    trace.warn("RESONANCE_RISK", `Ordem de sintonia ${round(hr, 2)} ≥ 5: o filtro ressoaria na 5ª harmônica. Use p maior (sintonia mais baixa).`);
  } else if (hr > 4.5) {
    status = "warning";
    trace.warn("NEAR_5TH", `Ordem de sintonia ${round(hr, 2)} próxima da 5ª harmônica: prefira p ≥ 7% (h_r ≈ 3,8).`);
  }

  const canonical = canonicalJson({ input: inp, engineVersion: ENGINE_VERSION, norm: REF });
  const inputHash = await sha256Hex(canonical);

  return {
    traceId: `DF-${inputHash.slice(0, 12)}`,
    inputHash,
    engineVersion: ENGINE_VERSION,
    timestamp: new Date().toISOString(),
    tuningOrder: round(hr, 3),
    tuningFrequencyHz: round(fr, 1),
    capacitorReactanceOhm: round(xC, 4),
    reactorReactanceOhm: round(xL, 4),
    reactorInductanceMh: round(L * 1000, 4),
    capacitorRatedVoltageV: round(vC, 1),
    capacitorReactiveKvar: round(qCap, 2),
    status,
    steps: trace.steps,
    warnings: trace.warnings,
  };
}
