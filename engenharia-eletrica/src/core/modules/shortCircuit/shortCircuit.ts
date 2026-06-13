import { CalculationTrace, canonicalJson, sha256Hex } from "../../engine/trace";
import { round } from "../../engine/units";
import { ENGINE_VERSION } from "../../version";
import {
  shortCircuitInputSchema,
  type ShortCircuitInput,
  type ShortCircuitResult,
} from "./schema";

const REF = "IEC 60909-0:2016";

/** Fator de tensão c (IEC 60909-0 Tab. 1) por nível de tensão e variante. */
function voltageFactor(level: "LV" | "MV" | "HV", variant: "max" | "min"): number {
  if (level === "LV") return variant === "max" ? 1.05 : 0.95;
  return variant === "max" ? 1.1 : 1.0; // MV/HV
}

/**
 * Calcula a corrente de curto-circuito trifásica simétrica I"k pela IEC 60909-0,
 * somando as impedâncias do caminho radial referidas ao ponto de falta.
 */
export async function calculateShortCircuit(
  rawInput: ShortCircuitInput,
): Promise<ShortCircuitResult> {
  const inp = shortCircuitInputSchema.parse(rawInput);
  const trace = new CalculationTrace();

  const un = inp.faultVoltageV; // tensão de linha no ponto de falta [V]
  const c = trace.step({
    label: "Fator de tensão c",
    formula: "c = f(nível de tensão, variante)",
    inputs: { level: inp.faultVoltageLevel, variant: inp.cVariant },
    result: voltageFactor(inp.faultVoltageLevel, inp.cVariant),
    unit: "-",
    normRef: `${REF} Tab. 1`,
  });

  let rk = 0;
  let xk = 0;

  // ── Concessionária (rede de alimentação) ───────────────────────────────
  // ZQ = cQ · Un_Q² / S"kQ , referida depois ao lado de falta.
  const transformerRatio = inp.transformer
    ? inp.transformer.unLvV / (inp.transformer.unHvKV * 1000)
    : 1;
  const feederUnV = inp.feeder.unHvKV * 1000;
  const cQ = feederUnV > 1000 ? 1.1 : 1.05;
  const zqHv = (cQ * feederUnV * feederUnV) / (inp.feeder.skMVA * 1e6);
  const xqHv = zqHv / Math.sqrt(1 + inp.feeder.rxRatio ** 2);
  const rqHv = inp.feeder.rxRatio * xqHv;
  const refFactor = transformerRatio ** 2;
  const rqLv = rqHv * refFactor;
  const xqLv = xqHv * refFactor;
  rk += rqLv;
  xk += xqLv;
  trace.step({
    label: "Impedância da concessionária referida à falta",
    formula: "ZQ = cQ·UnQ²/S\"kQ ; refere por (Un_falta/UnQ)²",
    inputs: { skMVA: inp.feeder.skMVA, unHvKV: inp.feeder.unHvKV, rxRatio: inp.feeder.rxRatio },
    result: Math.hypot(rqLv, xqLv),
    unit: "Ω",
    normRef: `${REF} §6.2`,
  });

  // ── Transformador ──────────────────────────────────────────────────────
  if (inp.transformer) {
    const t = inp.transformer;
    const srVA = t.srKVA * 1000;
    const unLv = t.unLvV;
    const zBase = (unLv * unLv) / srVA;
    const zt = (t.ukrPercent / 100) * zBase;
    let rt: number;
    if (t.copperLossKW !== undefined) {
      rt = (t.copperLossKW * 1000 * unLv * unLv) / (srVA * srVA);
    } else if (t.urrPercent !== undefined) {
      rt = (t.urrPercent / 100) * zBase;
    } else {
      rt = 0;
      trace.warn(
        "TX_NO_R",
        "Resistência do transformador não informada (sem perdas no cobre nem uRr); RT=0 — I\"k levemente superestimada.",
      );
    }
    const xt = Math.sqrt(Math.max(0, zt * zt - rt * rt));

    let kt = 1;
    if (t.applyKT) {
      const xtPu = (xt * srVA) / (unLv * unLv); // reatância relativa
      const cmaxLv = voltageFactor("LV", "max");
      kt = (0.95 * cmaxLv) / (1 + 0.6 * xtPu);
    }
    rk += kt * rt;
    xk += kt * xt;
    trace.step({
      label: "Impedância do transformador (com correção KT)",
      formula: "ZT = (ukr/100)·U²/Sr ; RT=Pcu·U²/Sr² ; KT=0,95·cmax/(1+0,6·xT)",
      inputs: { srKVA: t.srKVA, ukrPercent: t.ukrPercent, KT: round(kt, 4) },
      result: kt * Math.hypot(rt, xt),
      unit: "Ω",
      normRef: `${REF} §6.3.3 / §3.3.3`,
    });
  }

  // ── Cabos / linhas ─────────────────────────────────────────────────────
  for (let i = 0; i < inp.cables.length; i++) {
    const cb = inp.cables[i];
    const rCable = (cb.rOhmPerKm * cb.lengthM) / 1000 / cb.parallel;
    const xCable = (cb.xOhmPerKm * cb.lengthM) / 1000 / cb.parallel;
    rk += rCable;
    xk += xCable;
    trace.step({
      label: `Impedância do cabo/linha #${i + 1}`,
      formula: "Z = (r + jx)·L / n_paralelo",
      inputs: { rOhmPerKm: cb.rOhmPerKm, xOhmPerKm: cb.xOhmPerKm, lengthM: cb.lengthM, parallel: cb.parallel },
      result: Math.hypot(rCable, xCable),
      unit: "Ω",
      normRef: `${REF} §6.4`,
    });
  }

  // ── Impedância equivalente e correntes ─────────────────────────────────
  const zk = Math.hypot(rk, xk);
  const rOverX = xk > 0 ? rk / xk : 0;
  trace.step({
    label: "Impedância equivalente no ponto de falta",
    formula: "Zk = √(Rk² + Xk²)",
    inputs: { rkOhm: round(rk, 6), xkOhm: round(xk, 6) },
    result: zk,
    unit: "Ω",
    normRef: `${REF} §6`,
  });

  const ikSymA = (c * un) / (Math.sqrt(3) * zk);
  trace.step({
    label: "Corrente de curto-circuito inicial simétrica I\"k",
    formula: 'I"k = c·Un / (√3·Zk)',
    inputs: { c, unV: un, zkOhm: round(zk, 6) },
    result: ikSymA,
    unit: "A",
    normRef: `${REF} §4.2 Eq.`,
  });

  const kappa = 1.02 + 0.98 * Math.exp((-3 * rk) / xk);
  trace.step({
    label: "Fator κ (corrente de pico)",
    formula: "κ = 1,02 + 0,98·e^(−3·R/X)",
    inputs: { rOverX: round(rOverX, 4) },
    result: kappa,
    unit: "-",
    normRef: `${REF} §8.1.1`,
  });

  const ipA = kappa * Math.SQRT2 * ikSymA;
  trace.step({
    label: "Corrente de pico ip",
    formula: 'ip = κ·√2·I"k',
    inputs: { kappa: round(kappa, 4) },
    result: ipA,
    unit: "A",
    normRef: `${REF} §8.1.1`,
  });

  const skVA = Math.sqrt(3) * un * ikSymA;

  const canonical = canonicalJson({ input: inp, engineVersion: ENGINE_VERSION, norm: REF });
  const inputHash = await sha256Hex(canonical);

  return {
    traceId: `SC-${inputHash.slice(0, 12)}`,
    inputHash,
    engineVersion: ENGINE_VERSION,
    timestamp: new Date().toISOString(),
    cFactor: c,
    rkOhm: round(rk, 6),
    xkOhm: round(xk, 6),
    zkOhm: round(zk, 6),
    rOverX: round(rOverX, 4),
    ikSymKA: round(ikSymA / 1000, 3),
    kappa: round(kappa, 4),
    ipKA: round(ipA / 1000, 3),
    skMVA: round(skVA / 1e6, 2),
    steps: trace.steps,
    warnings: trace.warnings,
  };
}
