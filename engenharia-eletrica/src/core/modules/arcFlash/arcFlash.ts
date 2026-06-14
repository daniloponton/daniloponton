import { z } from "zod";
import { CalculationTrace, canonicalJson, sha256Hex } from "../../engine/trace";
import { round } from "../../engine/units";
import { ENGINE_VERSION } from "../../version";
import type { CalculationStep, ComplianceStatus } from "../../engine/types";

const REF = "IEEE Std 1584-2002 / NFPA 70E";

/** Classe de equipamento → expoente de distância x (IEEE 1584-2002 Tab. 4). */
const DISTANCE_EXPONENT: Record<string, number> = {
  open_air: 2.0,
  switchgear_lv: 1.473,
  mcc_panel_lv: 1.641,
  cable: 2.0,
  switchgear_mv: 0.973,
};

export const arcFlashInputSchema = z.object({
  /** Tensão do sistema [kV]. */
  systemVoltageKV: z.number().positive(),
  /** Corrente de curto-circuito franca (bolted) Ibf — ex.: I"k do IEC 60909 [kA]. */
  boltedFaultKA: z.number().positive(),
  /** Distância entre eletrodos (gap) G [mm]. */
  gapMm: z.number().positive().default(32),
  /** Distância de trabalho D [mm]. */
  workingDistanceMm: z.number().positive().default(455),
  /** Classe do equipamento (define o expoente de distância x). */
  equipmentClass: z.enum(["open_air", "switchgear_lv", "mcc_panel_lv", "cable", "switchgear_mv"]).default("switchgear_lv"),
  /** Configuração dos eletrodos. */
  electrodeConfig: z.enum(["open", "box"]).default("box"),
  /** Sistema aterrado? (afeta o fator K2 da energia). */
  grounded: z.boolean().default(true),
  /** Tempo de duração do arco (atuação da proteção) [s]. */
  arcDurationS: z.number().positive().default(0.2),
});

export type ArcFlashInput = z.input<typeof arcFlashInputSchema>;

export interface ArcFlashResult {
  readonly traceId: string;
  readonly inputHash: string;
  readonly engineVersion: string;
  readonly timestamp: string;

  /** Corrente de arco Ia [kA]. */
  readonly arcingCurrentKA: number;
  /** Energia incidente na distância de trabalho [cal/cm²]. */
  readonly incidentEnergyCalCm2: number;
  /** Fronteira de arco elétrico (onset de queimadura 2º grau, 1,2 cal/cm²) [m]. */
  readonly arcFlashBoundaryM: number;
  /** Categoria de EPI (NFPA 70E) recomendada. */
  readonly ppeCategory: string;
  /** Severidade: ok (baixo), warning (requer EPI), fail (> 40 cal/cm²). */
  readonly status: ComplianceStatus;

  readonly steps: readonly CalculationStep[];
}

function classifyPpe(E: number): { category: string; status: ComplianceStatus } {
  if (E < 1.2) return { category: "Risco baixo (< 1,2 cal/cm²) — sem EPI específico de arco", status: "ok" };
  if (E < 4) return { category: "Categoria 1 (EPI ≥ 4 cal/cm²)", status: "warning" };
  if (E < 8) return { category: "Categoria 2 (EPI ≥ 8 cal/cm²)", status: "warning" };
  if (E < 25) return { category: "Categoria 3 (EPI ≥ 25 cal/cm²)", status: "warning" };
  if (E <= 40) return { category: "Categoria 4 (EPI ≥ 40 cal/cm²)", status: "warning" };
  return { category: "Acima de 40 cal/cm² — trabalho energizado proibido", status: "fail" };
}

/**
 * Análise de arco elétrico pela IEEE 1584-2002: corrente de arco, energia
 * incidente, fronteira de arco e categoria de EPI (NFPA 70E).
 */
export async function analyzeArcFlash(rawInput: ArcFlashInput): Promise<ArcFlashResult> {
  const inp = arcFlashInputSchema.parse(rawInput);
  const trace = new CalculationTrace();

  const V = inp.systemVoltageKV;
  const G = inp.gapMm;
  const D = inp.workingDistanceMm;
  const x = DISTANCE_EXPONENT[inp.equipmentClass];
  const lgIbf = Math.log10(inp.boltedFaultKA);

  // Corrente de arco Ia
  let lgIa: number;
  if (V < 1) {
    const K = inp.electrodeConfig === "open" ? -0.153 : -0.097;
    lgIa =
      K + 0.662 * lgIbf + 0.0966 * V + 0.000526 * G + 0.5588 * V * lgIbf - 0.00304 * G * lgIbf;
  } else {
    lgIa = 0.00402 + 0.983 * lgIbf;
  }
  const Ia = Math.pow(10, lgIa);
  trace.step({
    label: "Corrente de arco Ia",
    formula: V < 1 ? "lg Ia = K + 0,662·lgIbf + 0,0966·V + 0,000526·G + 0,5588·V·lgIbf − 0,00304·G·lgIbf" : "lg Ia = 0,00402 + 0,983·lgIbf",
    inputs: { Ibf_kA: inp.boltedFaultKA, V_kV: V, G_mm: G },
    result: Ia,
    unit: "kA",
    normRef: `${REF} §5`,
  });

  // Energia incidente normalizada En e energia incidente E
  const K1 = inp.electrodeConfig === "open" ? -0.792 : -0.555;
  const K2 = inp.grounded ? -0.113 : 0;
  const lgEn = K1 + K2 + 1.081 * Math.log10(Ia) + 0.0011 * G;
  const En = Math.pow(10, lgEn);
  const Cf = V > 1 ? 1.0 : 1.5;
  const tNorm = inp.arcDurationS / 0.2;
  const E = Cf * En * tNorm * Math.pow(610 / D, x);
  trace.step({
    label: "Energia incidente E",
    formula: "En = 10^(K1+K2+1,081·lgIa+0,0011·G) ; E = Cf·En·(t/0,2)·(610/D)^x",
    inputs: { Cf, En: round(En, 4), t_s: inp.arcDurationS, D_mm: D, x },
    result: E,
    unit: "cal/cm²",
    normRef: `${REF} §6`,
  });

  // Fronteira de arco (E = 1,2 cal/cm²)
  const boundaryMm = 610 * Math.pow((Cf * En * tNorm) / 1.2, 1 / x);
  trace.step({
    label: "Fronteira de arco elétrico",
    formula: "DB = 610·(Cf·En·(t/0,2)/1,2)^(1/x)",
    inputs: { x },
    result: boundaryMm / 1000,
    unit: "m",
    normRef: `${REF} §7`,
  });

  const ppe = classifyPpe(E);

  const canonical = canonicalJson({ input: inp, engineVersion: ENGINE_VERSION, norm: REF });
  const inputHash = await sha256Hex(canonical);

  return {
    traceId: `AF-${inputHash.slice(0, 12)}`,
    inputHash,
    engineVersion: ENGINE_VERSION,
    timestamp: new Date().toISOString(),
    arcingCurrentKA: round(Ia, 3),
    incidentEnergyCalCm2: round(E, 2),
    arcFlashBoundaryM: round(boundaryMm / 1000, 2),
    ppeCategory: ppe.category,
    status: ppe.status,
    steps: trace.steps,
  };
}
