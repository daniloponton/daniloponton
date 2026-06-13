import { CalculationTrace, canonicalJson, sha256Hex } from "../../engine/trace";
import { round } from "../../engine/units";
import { ENGINE_VERSION } from "../../version";
import { inverseTime } from "./curves";
import {
  selectivityInputSchema,
  type ProtectiveDevice,
  type SelectivityInput,
  type SelectivityResult,
  type TccPoint,
} from "./schema";

const REF = "IEC 60255-151 / IEC 60364 (coordenação)";

/**
 * Tempo de atuação do dispositivo para uma corrente: o menor tempo entre os
 * estágios que partem. Retorna Infinity se nenhum estágio parte.
 */
export function deviceTripTime(device: ProtectiveDevice, currentA: number): number {
  let best = Infinity;
  for (const stage of device.stages) {
    let t = Infinity;
    if (stage.kind === "inverse") {
      t = inverseTime(currentA, stage.pickupA, stage.tms, stage.curve);
    } else if (stage.kind === "definite") {
      t = currentA >= stage.pickupA ? stage.delayS : Infinity;
    } else {
      t = currentA >= stage.pickupA ? stage.delayS : Infinity;
    }
    if (t < best) best = t;
  }
  return best;
}

/** Menor pickup entre os estágios do dispositivo (início da faixa de atuação). */
function minPickup(device: ProtectiveDevice): number {
  return Math.min(...device.stages.map((s) => s.pickupA));
}

/** Gera pontos (I, t) log-espaçados para plotagem da curva TCC. */
export function generateTccPoints(
  device: ProtectiveDevice,
  iMinA: number,
  iMaxA: number,
  n = 80,
): TccPoint[] {
  const points: TccPoint[] = [];
  const logMin = Math.log10(iMinA);
  const logMax = Math.log10(iMaxA);
  for (let i = 0; i <= n; i++) {
    const currentA = 10 ** (logMin + ((logMax - logMin) * i) / n);
    const timeS = deviceTripTime(device, currentA);
    if (Number.isFinite(timeS) && timeS > 0) {
      points.push({ currentA: round(currentA, 2), timeS: round(timeS, 4) });
    }
  }
  return points;
}

/**
 * Verifica a coordenação seletiva entre um dispositivo de montante e um de
 * jusante: para toda corrente até a falta em que ambos atuam, o de montante
 * deve atuar com atraso ≥ margem mínima em relação ao de jusante.
 */
export async function checkSelectivity(
  rawInput: SelectivityInput,
): Promise<SelectivityResult> {
  const inp = selectivityInputSchema.parse(rawInput);
  const trace = new CalculationTrace();

  const faultA = inp.faultCurrentKA * 1000;
  const startA = Math.max(minPickup(inp.downstream), minPickup(inp.upstream)) * 1.01;

  if (startA >= faultA) {
    trace.warn(
      "PICKUP_ABOVE_FAULT",
      "A corrente de partida é igual/superior à corrente de falta: faixa de coordenação inexistente.",
    );
  }

  // Amostragem log-espaçada da faixa de coordenação.
  const n = 200;
  const logMin = Math.log10(startA);
  const logMax = Math.log10(faultA);
  let worstMargin = Infinity;
  let worstCurrent = faultA;

  for (let i = 0; i <= n; i++) {
    const I = 10 ** (logMin + ((logMax - logMin) * i) / Math.max(1, n));
    const tD = deviceTripTime(inp.downstream, I);
    const tU = deviceTripTime(inp.upstream, I);
    if (!Number.isFinite(tD)) continue; // jusante não atua: nada a coordenar
    const margin = Number.isFinite(tU) ? tU - tD : Infinity; // montante não atua → ok
    if (margin < worstMargin) {
      worstMargin = margin;
      worstCurrent = I;
    }
  }

  const tDFault = deviceTripTime(inp.downstream, faultA);
  const tUFault = deviceTripTime(inp.upstream, faultA);

  trace.step({
    label: "Atuação na corrente de falta — jusante",
    formula: "t_jusante = min_estágios t(I_falta)",
    inputs: { faultCurrentKA: inp.faultCurrentKA },
    result: Number.isFinite(tDFault) ? tDFault : 0,
    unit: "s",
    normRef: REF,
  });
  trace.step({
    label: "Atuação na corrente de falta — montante",
    formula: "t_montante = min_estágios t(I_falta)",
    inputs: { faultCurrentKA: inp.faultCurrentKA },
    result: Number.isFinite(tUFault) ? tUFault : 0,
    unit: "s",
    normRef: REF,
  });
  trace.step({
    label: "Pior margem de coordenação na faixa",
    formula: "min(t_montante − t_jusante)",
    inputs: { worstCurrentA: round(worstCurrent, 1), minMarginS: inp.minMarginS },
    result: Number.isFinite(worstMargin) ? worstMargin : 999,
    unit: "s",
    normRef: REF,
  });

  const selective = worstMargin >= inp.minMarginS;
  if (!selective) {
    trace.warn(
      "NON_SELECTIVE",
      `Coordenação insuficiente: pior margem ${round(worstMargin, 3)} s < mínimo ${inp.minMarginS} s em ~${round(worstCurrent, 0)} A.`,
    );
  }
  if (Number.isFinite(tUFault) && Number.isFinite(tDFault) && tUFault < tDFault) {
    trace.warn(
      "UPSTREAM_FIRST",
      "O dispositivo de montante atua ANTES do de jusante na falta — falta de seletividade grave.",
    );
  }

  const iMinPlot = startA / 2;
  const upstreamCurve = generateTccPoints(inp.upstream, iMinPlot, faultA);
  const downstreamCurve = generateTccPoints(inp.downstream, iMinPlot, faultA);

  const canonical = canonicalJson({ input: inp, engineVersion: ENGINE_VERSION, norm: REF });
  const inputHash = await sha256Hex(canonical);

  return {
    traceId: `PR-${inputHash.slice(0, 12)}`,
    inputHash,
    engineVersion: ENGINE_VERSION,
    timestamp: new Date().toISOString(),
    selective,
    worstMarginS: Number.isFinite(worstMargin) ? round(worstMargin, 3) : 999,
    worstCurrentA: round(worstCurrent, 1),
    downstreamClearingAtFaultS: Number.isFinite(tDFault) ? round(tDFault, 4) : Infinity,
    upstreamClearingAtFaultS: Number.isFinite(tUFault) ? round(tUFault, 4) : Infinity,
    upstreamCurve,
    downstreamCurve,
    steps: trace.steps,
    warnings: trace.warnings,
  };
}
