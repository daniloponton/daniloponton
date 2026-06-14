import { CalculationTrace, canonicalJson, sha256Hex } from "../../engine/trace";
import {
  COMMERCIAL_SECTIONS_MM2,
  interpolate,
  lookupConservative,
  round,
  sinFromCosPhi,
} from "../../engine/units";
import { getNorm, conductorResistance20C, type NormProfile } from "../../norms";
import type { ComplianceStatus } from "../../engine/types";
import { ENGINE_VERSION } from "../../version";
import {
  cableSizingInputSchema,
  type CableSizingInput,
  type CableSizingParsed,
  type CableSizingResult,
  type CriterionResult,
} from "./schema";

/**
 * Dimensiona um cabo BT pela IEC 60364-5-52 / NBR 5410, selecionando a menor
 * seção comercial que satisfaz simultaneamente três critérios:
 *
 *   1. Capacidade de condução:  I'z = Iz(30°C) · Ca · Cg  ≥  Ib
 *   2. Queda de tensão:         ΔU(%)  ≤  ΔU_máx
 *   3. Curto-circuito (térmico): S  ≥  Icc·√t / k
 *
 * Todo passo é registrado num memorial auditável e o resultado carrega um hash
 * SHA-256 das entradas + versão do motor + norma.
 */
export async function calculateCableSizing(
  rawInput: CableSizingInput,
): Promise<CableSizingResult> {
  const inp = cableSizingInputSchema.parse(rawInput);
  const norm = getNorm(inp.normId);

  const trace = new CalculationTrace();
  const loadedConductors = inp.system === "single" ? 2 : 3;
  const phaseFactor = inp.system === "single" ? 2 : Math.sqrt(3);
  const ampacityTable =
    norm.ampacity[inp.conductor][inp.installMethod][inp.insulation][loadedConductors];

  // ── Fatores de correção ────────────────────────────────────────────────
  const ca = trace.step({
    label: "Fator de correção de temperatura (Ca)",
    formula: "Ca = f(θ_amb, isolação)",
    inputs: { ambientTempC: inp.ambientTempC, insulation: inp.insulation },
    result: interpolate(norm.tempCorrection[inp.insulation], inp.ambientTempC),
    unit: "-",
    normRef: `${norm.reference} — Tab. correção de temperatura`,
  });

  const cg = trace.step({
    label: "Fator de correção de agrupamento (Cg)",
    formula: "Cg = f(nº de circuitos)",
    inputs: { groupingCircuits: inp.groupingCircuits },
    result: lookupConservative(norm.groupingCorrection, inp.groupingCircuits),
    unit: "-",
    normRef: `${norm.reference} — Tab. agrupamento`,
  });

  const combined = ca * cg;
  const itRequired = trace.step({
    label: "Capacidade tabelada mínima exigida (It)",
    formula: "It = Ib / (Ca · Cg)",
    inputs: { ibAmps: inp.ibAmps, Ca: round(ca, 4), Cg: round(cg, 4) },
    result: inp.ibAmps / combined,
    unit: "A",
    normRef: `${norm.reference}`,
  });

  // ── Critério 1: ampacidade ─────────────────────────────────────────────
  const sectionsWithData = COMMERCIAL_SECTIONS_MM2.filter(
    (s) => ampacityTable[s] !== undefined,
  );
  const sAmp = sectionsWithData.find((s) => ampacityTable[s] >= itRequired) ?? null;
  trace.step({
    label: "Seção mínima por ampacidade",
    formula: "menor S tal que Iz(30°C)·Ca·Cg ≥ Ib",
    inputs: { itRequiredA: round(itRequired, 2) },
    result: sAmp ?? 0,
    unit: "mm²",
    normRef: `${norm.reference}`,
  });

  // ── Critério 2: queda de tensão ────────────────────────────────────────
  const sVD =
    sectionsWithData.find(
      (s) => voltageDropPct(s, inp, norm, phaseFactor) <= inp.maxVoltageDropPct,
    ) ?? null;
  trace.step({
    label: "Seção mínima por queda de tensão",
    formula: "menor S tal que ΔU(%) ≤ ΔU_máx",
    inputs: { maxVoltageDropPct: inp.maxVoltageDropPct },
    result: sVD ?? 0,
    unit: "mm²",
    normRef: `${norm.reference} — limite de queda de tensão`,
  });

  // ── Critério 3: curto-circuito (térmico) ───────────────────────────────
  let sMinShortCircuit = 0;
  let sSC: number | null = sectionsWithData[0] ?? null;
  const scEnabled = inp.shortCircuitKA > 0;
  if (scEnabled) {
    const k = norm.kFactor[`${inp.conductor}_${inp.insulation}`];
    const iccA = inp.shortCircuitKA * 1000;
    sMinShortCircuit = (iccA * Math.sqrt(inp.faultClearingS)) / k;
    sSC = sectionsWithData.find((s) => s >= sMinShortCircuit) ?? null;
    trace.step({
      label: "Seção mínima por curto-circuito (térmico)",
      formula: "S_min = Icc·√t / k",
      inputs: {
        shortCircuitKA: inp.shortCircuitKA,
        faultClearingS: inp.faultClearingS,
        k,
      },
      result: sMinShortCircuit,
      unit: "mm²",
      normRef: `${norm.reference} / IEC 60364-5-54 (fator k)`,
    });
  }

  // ── Seleção final: a maior dentre as seções mínimas dos três critérios ──
  const candidates: Array<{
    section: number | null;
    criterion: CableSizingResult["governingCriterion"];
  }> = [
    { section: sAmp, criterion: "ampacity" },
    { section: sVD, criterion: "voltage_drop" },
    { section: sSC, criterion: "short_circuit" },
  ];

  const failed = candidates.some((c) => c.section === null);
  let selected: number | null = null;
  let governing: CableSizingResult["governingCriterion"] = "none";
  if (!failed) {
    for (const c of candidates) {
      if (c.section !== null && (selected === null || c.section > selected)) {
        selected = c.section;
        governing = c.criterion;
      }
    }
  }

  trace.step({
    label: "Seção selecionada",
    formula: "S = max(S_ampacidade, S_queda, S_curto)",
    inputs: {
      sAmp: sAmp ?? 0,
      sVD: sVD ?? 0,
      sSC: scEnabled ? (sSC ?? 0) : "n/a",
    },
    result: selected ?? 0,
    unit: "mm²",
    normRef: `${norm.reference}`,
  });

  // ── Métricas finais para a seção selecionada ───────────────────────────
  const correctedAmpacity = selected ? ampacityTable[selected] * combined : 0;
  const vdPct = selected ? voltageDropPct(selected, inp, norm, phaseFactor) : Infinity;

  if (selected) {
    trace.step({
      label: "Capacidade corrigida da seção selecionada (I'z)",
      formula: "I'z = Iz(30°C) · Ca · Cg",
      inputs: { iz30: ampacityTable[selected], Ca: round(ca, 4), Cg: round(cg, 4) },
      result: correctedAmpacity,
      unit: "A",
      normRef: `${norm.reference}`,
    });
    trace.step({
      label: "Queda de tensão da seção selecionada",
      formula: "ΔU(%) = k·Ib·L·(R·cosφ + X·senφ) / U · 100",
      inputs: { lengthM: inp.lengthM, cosPhi: inp.cosPhi, voltageV: inp.voltageV },
      result: vdPct,
      unit: "%",
      normRef: `${norm.reference} — queda de tensão`,
    });
  }

  // ── Advertências de engenharia (edge cases) ────────────────────────────
  if (inp.ambientTempC > 40)
    trace.warn("HIGH_TEMP", `Temperatura ambiente elevada (${inp.ambientTempC} °C): verifique a tabela de correção aplicável.`);
  if (inp.groupingCircuits > 6)
    trace.warn("HIGH_GROUPING", `Agrupamento elevado (${inp.groupingCircuits} circuitos): fator de redução significativo.`);
  if (!scEnabled)
    trace.warn("NO_SHORT_CIRCUIT", "Corrente de curto-circuito não informada: critério térmico de curto NÃO verificado.");
  if (inp.conductor === "Al")
    trace.warn("AL_RESISTANCE_APPROX", "Resistência do alumínio estimada por ρAl/ρCu≈1,65 (queda de tensão aproximada): conferir contra a tabela do fabricante.");

  // ── Avaliação de conformidade ──────────────────────────────────────────
  const ampacityCriterion: CriterionResult =
    selected && correctedAmpacity >= inp.ibAmps
      ? { status: "ok", detail: `I'z = ${round(correctedAmpacity, 1)} A ≥ Ib = ${inp.ibAmps} A` }
      : { status: "fail", detail: "Nenhuma seção da série atende à capacidade de condução." };

  let vdStatus: ComplianceStatus = "fail";
  if (selected && vdPct <= inp.maxVoltageDropPct) vdStatus = vdPct > 0.9 * inp.maxVoltageDropPct ? "warning" : "ok";
  const voltageDropCriterion: CriterionResult = {
    status: vdStatus,
    detail: selected
      ? `ΔU = ${round(vdPct, 2)}% (limite ${inp.maxVoltageDropPct}%)`
      : "Não avaliado.",
  };

  const shortCircuitCriterion: CriterionResult = !scEnabled
    ? { status: "warning", detail: "Não verificado (Icc não informada)." }
    : selected && selected >= sMinShortCircuit
      ? { status: "ok", detail: `S = ${selected} mm² ≥ S_min = ${round(sMinShortCircuit, 2)} mm²` }
      : { status: "fail", detail: `S_min exigida = ${round(sMinShortCircuit, 2)} mm² não atendida.` };

  const overall: ComplianceStatus = [
    ampacityCriterion.status,
    voltageDropCriterion.status,
    shortCircuitCriterion.status,
  ].includes("fail")
    ? "fail"
    : [ampacityCriterion.status, voltageDropCriterion.status, shortCircuitCriterion.status].includes("warning")
      ? "warning"
      : "ok";

  // ── Hash de auditoria + identificador ──────────────────────────────────
  const canonical = canonicalJson({
    input: inp,
    engineVersion: ENGINE_VERSION,
    norm: `${norm.id}:${norm.version}`,
  });
  const inputHash = await sha256Hex(canonical);
  const timestamp = new Date().toISOString();
  const traceId = `CS-${inp.installMethod}-${inputHash.slice(0, 12)}`;

  return {
    traceId,
    inputHash,
    engineVersion: ENGINE_VERSION,
    normId: `${norm.id}:${norm.version}`,
    timestamp,
    selectedSectionMm2: selected,
    correctedAmpacityA: round(correctedAmpacity, 2),
    voltageDropPct: selected ? round(vdPct, 3) : 0,
    minSectionByShortCircuitMm2: round(sMinShortCircuit, 3),
    governingCriterion: governing,
    criteria: {
      ampacity: ampacityCriterion,
      voltageDrop: voltageDropCriterion,
      shortCircuit: shortCircuitCriterion,
    },
    overall,
    steps: trace.steps,
    warnings: trace.warnings,
  };
}

/**
 * Queda de tensão percentual para uma seção, com resistência corrigida para a
 * temperatura máxima de operação do isolante (condição mais desfavorável).
 */
function voltageDropPct(
  section: number,
  inp: CableSizingParsed,
  norm: NormProfile,
  phaseFactor: number,
): number {
  const r20 = conductorResistance20C(norm, section, inp.conductor) ?? 0;
  const x = norm.reactanceOhmPerKm[section];
  const tMax = norm.insulationMaxTempC[inp.insulation];
  const alpha = norm.tempCoeff[inp.conductor];
  const rOp = r20 * (1 + alpha * (tMax - 20));
  const sinPhi = sinFromCosPhi(inp.cosPhi);
  const dropV =
    (phaseFactor * inp.ibAmps * inp.lengthM * (rOp * inp.cosPhi + x * sinPhi)) / 1000;
  return (dropV / inp.voltageV) * 100;
}
