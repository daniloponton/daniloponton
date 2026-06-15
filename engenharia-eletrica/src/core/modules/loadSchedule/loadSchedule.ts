import { z } from "zod";
import { CalculationTrace, canonicalJson, sha256Hex } from "../../engine/trace";
import { round, sinFromCosPhi } from "../../engine/units";
import { ENGINE_VERSION } from "../../version";
import type { CalculationStep, ComplianceStatus, EngineeringWarning } from "../../engine/types";

const REF = "ABNT NBR 5410:2004 §4.2.1 (potências) / §6.3 (equilíbrio de fases)";

/** Ligação de uma carga ao quadro trifásico (3 fases + neutro). */
export type LoadConnection = "L1" | "L2" | "L3" | "L12" | "L23" | "L31" | "L123";

const PHASES = ["L1", "L2", "L3"] as const;
type Phase = (typeof PHASES)[number];

/** Fases que recebem a potência de cada tipo de ligação. */
const CONNECTION_PHASES: Record<LoadConnection, readonly Phase[]> = {
  L1: ["L1"],
  L2: ["L2"],
  L3: ["L3"],
  L12: ["L1", "L2"],
  L23: ["L2", "L3"],
  L31: ["L3", "L1"],
  L123: ["L1", "L2", "L3"],
};

const loadItemSchema = z.object({
  /** Identificação da carga (ex.: "Iluminação térreo"). */
  name: z.string().min(1),
  /** Potência ativa de uma unidade [W]. */
  activePowerW: z.number().positive(),
  /** Fator de potência (cos φ). */
  powerFactor: z.number().min(0.1).max(1).default(0.92),
  /** Quantidade de unidades iguais. */
  quantity: z.number().int().positive().default(1),
  /** Fator de demanda (NBR 5410 §4.2.1) — explícito, 1,0 = sem diversidade. */
  demandFactor: z.number().min(0).max(1).default(1),
  /** Ligação ao quadro. */
  connection: z
    .enum(["L1", "L2", "L3", "L12", "L23", "L31", "L123"])
    .default("L123"),
});

export type LoadItemInput = z.input<typeof loadItemSchema>;

export const loadScheduleInputSchema = z.object({
  /** Tensão de linha (fase-fase) [V]. */
  lineVoltageV: z.number().positive().default(380),
  /** Tensão de fase (fase-neutro) [V]. */
  phaseVoltageV: z.number().positive().default(220),
  /** Cargas do quadro. */
  loads: z.array(loadItemSchema).min(1),
  /** Desequilíbrio de corrente máximo admitido [%] (boa prática). */
  maxUnbalancePct: z.number().positive().default(15),
});

export type LoadScheduleInput = z.input<typeof loadScheduleInputSchema>;

export interface PhaseLoad {
  readonly phase: Phase;
  /** Potência aparente demandada na fase [kVA]. */
  readonly apparentKVA: number;
  /** Corrente de linha demandada na fase [A]. */
  readonly currentA: number;
}

export interface LoadScheduleResult {
  readonly traceId: string;
  readonly inputHash: string;
  readonly engineVersion: string;
  readonly timestamp: string;

  /** Potência ativa instalada (sem fator de demanda) [kW]. */
  readonly installedActiveKW: number;
  /** Potência aparente instalada [kVA]. */
  readonly installedApparentKVA: number;
  /** Potência ativa de demanda [kW]. */
  readonly demandedActiveKW: number;
  /** Potência aparente de demanda [kVA]. */
  readonly demandedApparentKVA: number;
  /** Fator de potência resultante da demanda. */
  readonly demandPowerFactor: number;
  /** Corrente de demanda do alimentador (equilibrada) [A]. */
  readonly demandCurrentA: number;
  /** Carga demandada por fase. */
  readonly phaseLoads: readonly PhaseLoad[];
  /** Desequilíbrio de corrente entre fases [%]. */
  readonly phaseUnbalancePct: number;
  /** Corrente estimada no neutro (cargas desequilibradas) [A]. */
  readonly neutralCurrentA: number;

  readonly status: ComplianceStatus;
  readonly steps: readonly CalculationStep[];
  readonly warnings: readonly EngineeringWarning[];
}

/**
 * Quadro de cargas: agrega as cargas, aplica os fatores de demanda, distribui a
 * potência entre as fases (R/S/T) e avalia o equilíbrio, devolvendo a corrente
 * de demanda do alimentador. O método é o do balanço de potências por fase —
 * prática consagrada de quadro de cargas (NBR 5410 §4.2.1 / §6.3).
 */
export async function analyzeLoadSchedule(rawInput: LoadScheduleInput): Promise<LoadScheduleResult> {
  const inp = loadScheduleInputSchema.parse(rawInput);
  const trace = new CalculationTrace();
  const VLL = inp.lineVoltageV;
  const VLN = inp.phaseVoltageV;

  // Acumuladores de potência ativa/reativa por fase (demanda).
  const pPhase: Record<Phase, number> = { L1: 0, L2: 0, L3: 0 };
  const qPhase: Record<Phase, number> = { L1: 0, L2: 0, L3: 0 };
  let installedActiveW = 0;
  let demandActiveW = 0;
  let demandReactiveVar = 0;

  for (const load of inp.loads) {
    const totalP = load.activePowerW * (load.quantity ?? 1);
    const demP = totalP * (load.demandFactor ?? 1);
    const pf = load.powerFactor ?? 0.92;
    const demQ = demP * (sinFromCosPhi(pf) / pf); // Q = P·tanφ
    installedActiveW += totalP;
    demandActiveW += demP;
    demandReactiveVar += demQ;

    const phases = CONNECTION_PHASES[load.connection ?? "L123"];
    for (const ph of phases) {
      pPhase[ph] += demP / phases.length;
      qPhase[ph] += demQ / phases.length;
    }
  }

  const installedActiveKW = installedActiveW / 1000;
  const demandedActiveKW = demandActiveW / 1000;
  const demandedApparentVA = Math.hypot(demandActiveW, demandReactiveVar);
  const demandedApparentKVA = demandedApparentVA / 1000;
  const installedApparentKVA = installedActiveKW / 0.92; // referência informativa
  const demandPF = demandActiveW > 0 ? demandActiveW / demandedApparentVA : 1;

  trace.step({
    label: "Potência de demanda total",
    formula: "P_dem = Σ(P·q·Fd) ; S_dem = √(P_dem² + Q_dem²)",
    inputs: { P_dem_kW: round(demandedActiveKW, 3), S_dem_kVA: round(demandedApparentKVA, 3), FP: round(demandPF, 3) },
    result: round(demandedApparentKVA, 3),
    unit: "kVA",
    normRef: REF,
  });

  // Corrente de linha por fase = S_fase / V_LN (balanço de potências por fase).
  const phaseLoads: PhaseLoad[] = PHASES.map((ph) => {
    const sVA = Math.hypot(pPhase[ph], qPhase[ph]);
    return {
      phase: ph,
      apparentKVA: round(sVA / 1000, 3),
      currentA: round(sVA / VLN, 2),
    };
  });

  const currents = phaseLoads.map((p) => p.currentA);
  const iMax = Math.max(...currents);
  const iMin = Math.min(...currents);
  const unbalancePct = iMax > 0 ? ((iMax - iMin) / iMax) * 100 : 0;

  // Corrente de neutro (cargas a 120°, mesma referência de fase): aproximação
  // IN = √(I1²+I2²+I3² − I1I2 − I2I3 − I3I1).
  const [i1, i2, i3] = currents;
  const neutralA = Math.sqrt(
    Math.max(0, i1 * i1 + i2 * i2 + i3 * i3 - i1 * i2 - i2 * i3 - i3 * i1),
  );

  // Corrente de demanda do alimentador (sistema equilibrado de projeto).
  const demandCurrentA = demandedApparentVA / (Math.sqrt(3) * VLL);

  trace.step({
    label: "Corrente de demanda do alimentador",
    formula: "I_dem = S_dem / (√3 · V_LL)",
    inputs: { S_dem_VA: round(demandedApparentVA, 1), V_LL: VLL },
    result: round(demandCurrentA, 2),
    unit: "A",
    normRef: REF,
  });
  trace.step({
    label: "Equilíbrio entre fases",
    formula: "desequilíbrio = (Imax − Imin) / Imax",
    inputs: { I_L1: currents[0], I_L2: currents[1], I_L3: currents[2] },
    result: round(unbalancePct, 1),
    unit: "%",
    normRef: REF,
  });
  trace.step({
    label: "Corrente no condutor neutro",
    formula: "IN = √(ΣI² − I1I2 − I2I3 − I3I1)",
    inputs: {},
    result: round(neutralA, 2),
    unit: "A",
    normRef: REF,
  });

  let status: ComplianceStatus = "ok";
  if (unbalancePct > inp.maxUnbalancePct) {
    status = unbalancePct > 2 * inp.maxUnbalancePct ? "fail" : "warning";
    trace.warn(
      "PHASE_UNBALANCE",
      `Desequilíbrio de ${round(unbalancePct, 1)} % acima do alvo de ${inp.maxUnbalancePct} %. ` +
        `Redistribua as cargas monofásicas entre as fases.`,
    );
  }
  if (demandPF < 0.92) {
    trace.warn(
      "LOW_POWER_FACTOR",
      `Fator de potência de demanda ${round(demandPF, 3)} abaixo de 0,92 — ` +
        `avalie correção (módulo de fator de potência).`,
    );
  }

  const canonical = canonicalJson({ input: inp, engineVersion: ENGINE_VERSION, norm: REF });
  const inputHash = await sha256Hex(canonical);

  return {
    traceId: `LS-${inputHash.slice(0, 12)}`,
    inputHash,
    engineVersion: ENGINE_VERSION,
    timestamp: new Date().toISOString(),
    installedActiveKW: round(installedActiveKW, 3),
    installedApparentKVA: round(installedApparentKVA, 3),
    demandedActiveKW: round(demandedActiveKW, 3),
    demandedApparentKVA: round(demandedApparentKVA, 3),
    demandPowerFactor: round(demandPF, 3),
    demandCurrentA: round(demandCurrentA, 2),
    phaseLoads,
    phaseUnbalancePct: round(unbalancePct, 1),
    neutralCurrentA: round(neutralA, 2),
    status,
    steps: trace.steps,
    warnings: trace.warnings,
  };
}
