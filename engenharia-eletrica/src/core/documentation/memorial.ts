import type { CalculationStep, ComplianceStatus, EngineeringWarning } from "../engine/types";
import type { CableSizingResult } from "../modules/cableSizing";
import type { ShortCircuitResult } from "../modules/shortCircuit";
import type { SelectivityResult } from "../modules/protection";
import type {
  CapacitorBankResult,
  DetunedFilterResult,
  HarmonicsResult,
  MotorStartingResult,
  VoltageDropResult,
} from "../modules/powerQuality";
import type { GroundingResult, GroundGridResult, SpdaResult } from "../modules/grounding";
import type { ArcFlashResult } from "../modules/arcFlash";
import type { PvStringResult } from "../modules/pv";
import { ENGINE_VERSION } from "../version";

/**
 * Documento de memorial de cálculo: representação normalizada e independente de
 * apresentação, montada a partir dos resultados dos módulos (que já carregam
 * passos rastreáveis e hash de auditoria). A UI apenas formata este documento.
 */

export interface MemorialKeyValue {
  readonly label: string;
  readonly value: string;
}

export interface MemorialSection {
  readonly id: string;
  readonly title: string;
  readonly norm: string;
  readonly traceId: string;
  readonly inputHash: string;
  readonly summary: readonly MemorialKeyValue[];
  readonly steps: readonly CalculationStep[];
  readonly warnings: readonly EngineeringWarning[];
  /** Conformidade da seção, quando aplicável (curto-circuito é informativo). */
  readonly compliance?: ComplianceStatus;
}

export interface MemorialDocument {
  readonly projectName: string;
  readonly generatedAt: string;
  readonly engineVersion: string;
  readonly sections: readonly MemorialSection[];
  /** Pior conformidade entre as seções que a possuem. */
  readonly overallCompliance: ComplianceStatus;
}

export interface CircuitResults {
  readonly shortCircuit?: ShortCircuitResult | null;
  readonly protection?: SelectivityResult | null;
  readonly arcFlash?: ArcFlashResult | null;
  readonly cable?: CableSizingResult | null;
  readonly voltageDrop?: VoltageDropResult | null;
  readonly capacitorBank?: CapacitorBankResult | null;
  readonly motorStarting?: MotorStartingResult | null;
  readonly harmonics?: HarmonicsResult | null;
  readonly detunedFilter?: DetunedFilterResult | null;
  readonly grounding?: GroundingResult | null;
  readonly groundGrid?: GroundGridResult | null;
  readonly spda?: SpdaResult | null;
  readonly pvString?: PvStringResult | null;
}

function sectionFromShortCircuit(r: ShortCircuitResult): MemorialSection {
  return {
    id: "short_circuit",
    title: "Cálculo de Curto-Circuito",
    norm: "IEC 60909-0 / NBR IEC 60909",
    traceId: r.traceId,
    inputHash: r.inputHash,
    summary: [
      { label: 'Corrente de curto simétrica I"k', value: `${r.ikSymKA} kA` },
      { label: "Corrente de pico ip", value: `${r.ipKA} kA` },
      { label: 'Potência de curto S"k', value: `${r.skMVA} MVA` },
      { label: "Fator de tensão c", value: String(r.cFactor) },
      { label: "Impedância equivalente Zk", value: `${r.zkOhm} Ω` },
    ],
    steps: r.steps,
    warnings: r.warnings,
  };
}

function sectionFromProtection(r: SelectivityResult): MemorialSection {
  return {
    id: "protection",
    title: "Proteção e Coordenação Seletiva",
    norm: "IEC 60255-151 / IEC 60364",
    traceId: r.traceId,
    inputHash: r.inputHash,
    compliance: r.selective ? "ok" : "fail",
    summary: [
      { label: "Seletividade", value: r.selective ? "Atendida" : "NÃO atendida" },
      { label: "Pior margem de coordenação", value: `${r.worstMarginS} s @ ${Math.round(r.worstCurrentA)} A` },
      { label: "Tempo de atuação (jusante) na falta", value: `${fmt(r.downstreamClearingAtFaultS)} s` },
      { label: "Tempo de atuação (montante) na falta", value: `${fmt(r.upstreamClearingAtFaultS)} s` },
    ],
    steps: r.steps,
    warnings: r.warnings,
  };
}

function sectionFromArcFlash(r: ArcFlashResult): MemorialSection {
  return {
    id: "arc_flash",
    title: "Análise de Arco Elétrico",
    norm: "IEEE Std 1584-2018 / NFPA 70E",
    traceId: r.traceId,
    inputHash: r.inputHash,
    compliance: r.status,
    summary: [
      { label: "Energia incidente", value: `${r.incidentEnergyCalCm2} cal/cm²` },
      { label: "Corrente de arco I″arc", value: `${r.arcingCurrentKA} kA` },
      { label: "Fronteira de arco", value: `${r.arcFlashBoundaryM} m` },
      { label: "EPI recomendado", value: r.ppeCategory },
    ],
    steps: r.steps,
    warnings: [],
  };
}

function sectionFromCable(r: CableSizingResult): MemorialSection {
  return {
    id: "cable",
    title: "Dimensionamento de Condutores",
    norm: r.normId,
    traceId: r.traceId,
    inputHash: r.inputHash,
    compliance: r.overall,
    summary: [
      { label: "Seção selecionada", value: r.selectedSectionMm2 ? `${r.selectedSectionMm2} mm²` : "—" },
      { label: "Critério determinante", value: governing(r.governingCriterion) },
      { label: "Capacidade corrigida I'z", value: `${r.correctedAmpacityA} A` },
      { label: "Queda de tensão", value: `${r.voltageDropPct} %` },
      { label: "Capacidade de condução", value: r.criteria.ampacity.detail },
      { label: "Queda de tensão (critério)", value: r.criteria.voltageDrop.detail },
      { label: "Curto-circuito (térmico)", value: r.criteria.shortCircuit.detail },
      { label: "Seção mínima (Tab. 47)", value: r.criteria.minimumSection.detail },
    ],
    steps: r.steps,
    warnings: r.warnings,
  };
}

function sectionFromVoltageDrop(r: VoltageDropResult): MemorialSection {
  return {
    id: "voltage_drop",
    title: "Queda de Tensão em Alimentador",
    norm: "IEC 60364-5-52 / NBR 5410",
    traceId: r.traceId,
    inputHash: r.inputHash,
    compliance: r.status,
    summary: [
      { label: "Queda de tensão total acumulada", value: `${r.totalDropPct} %` },
      { label: "Tensão no nó final", value: `${r.nodes[r.nodes.length - 1]?.voltageAtNodeV ?? "—"} V` },
      { label: "Nº de trechos", value: String(r.nodes.length) },
    ],
    steps: r.steps,
    warnings: r.warnings,
  };
}

function sectionFromCapacitorBank(r: CapacitorBankResult): MemorialSection {
  return {
    id: "capacitor_bank",
    title: "Correção de Fator de Potência",
    norm: "IEC 60364 / IEEE 18",
    traceId: r.traceId,
    inputHash: r.inputHash,
    summary: [
      { label: "Potência reativa necessária", value: `${r.requiredKvar} kvar` },
      { label: "Banco comercial recomendado", value: `${r.recommendedKvar} kvar` },
      { label: "Potência aparente (antes → depois)", value: `${r.apparentBeforeKVA} → ${r.apparentAfterKVA} kVA` },
      { label: "Redução de corrente", value: `${r.currentReductionPct} %` },
    ],
    steps: r.steps,
    warnings: r.warnings,
  };
}

function sectionFromMotorStarting(r: MotorStartingResult): MemorialSection {
  return {
    id: "motor_starting",
    title: "Partida de Motor",
    norm: "NEMA MG-1 / IEC 60034 / IEEE 399",
    traceId: r.traceId,
    inputHash: r.inputHash,
    compliance: r.status,
    summary: [
      { label: "Afundamento de tensão na partida", value: `${r.voltageDipPct} %` },
      { label: "Tensão residual", value: `${r.residualVoltagePct} %` },
      { label: "Corrente nominal / de partida", value: `${r.ratedCurrentA} A / ${r.startingCurrentA} A` },
      { label: "Torque de partida (rel. DOL)", value: `${r.startingTorqueFactor}×` },
    ],
    steps: r.steps,
    warnings: r.warnings,
  };
}

function sectionFromHarmonics(r: HarmonicsResult): MemorialSection {
  return {
    id: "harmonics",
    title: "Distorção Harmônica",
    norm: "IEEE Std 519-2014",
    traceId: r.traceId,
    inputHash: r.inputHash,
    compliance: r.status,
    summary: [
      { label: "Relação Isc/IL", value: String(r.shortCircuitRatio) },
      { label: "TDD", value: `${r.tddPercent}% (limite ${r.tddLimitPercent}%) ${r.tddOk ? "✓" : "✗"}` },
      ...(r.voltageThdPercent != null
        ? [{ label: "THD de tensão", value: `${r.voltageThdPercent}% (limite ${r.voltageThdLimitPercent}%) ${r.voltageThdOk ? "✓" : "✗"}` }]
        : []),
      { label: "Ordens fora do limite", value: r.perHarmonic.filter((h) => !h.ok).map((h) => h.order).join(", ") || "nenhuma" },
    ],
    steps: r.steps,
    warnings: r.warnings,
  };
}

function sectionFromDetunedFilter(r: DetunedFilterResult): MemorialSection {
  return {
    id: "detuned_filter",
    title: "Banco Dessintonizado (anti-harmônico)",
    norm: "IEC 61642 / IEEE 1531",
    traceId: r.traceId,
    inputHash: r.inputHash,
    compliance: r.status,
    summary: [
      { label: "Ordem de sintonia", value: `${r.tuningOrder} (${r.tuningFrequencyHz} Hz)` },
      { label: "Capacitor (tensão / potência nominais)", value: `${r.capacitorRatedVoltageV} V · ${r.capacitorReactiveKvar} kvar` },
      { label: "Reator", value: `${r.reactorReactanceOhm} Ω · ${r.reactorInductanceMh} mH` },
    ],
    steps: r.steps,
    warnings: r.warnings,
  };
}

function sectionFromGrounding(r: GroundingResult): MemorialSection {
  return {
    id: "grounding",
    title: "Aterramento",
    norm: "IEEE Std 80 / NBR 7117",
    traceId: r.traceId,
    inputHash: r.inputHash,
    compliance: r.status,
    summary: [
      { label: "Resistividade do solo", value: `${r.soilResistivityOhmM} Ω·m` },
      { label: "Resistência de aterramento", value: `${r.electrodeResistanceOhm} Ω` },
      { label: "Elevação de potencial (GPR)", value: `${r.gprVolts} V` },
      { label: "Tensão de toque tolerável", value: `${r.tolerableTouchV} V` },
      { label: "Tensão de passo tolerável", value: `${r.tolerableStepV} V` },
    ],
    steps: r.steps,
    warnings: r.warnings,
  };
}

function sectionFromGroundGrid(r: GroundGridResult): MemorialSection {
  return {
    id: "ground_grid",
    title: "Malha de Aterramento (cálculo detalhado)",
    norm: "IEEE Std 80",
    traceId: r.traceId,
    inputHash: r.inputHash,
    compliance: r.status,
    summary: [
      { label: "Tensão de malha Em", value: `${r.meshVoltageV} V (toque tol. ${r.tolerableTouchV} V) ${r.touchSafe ? "✓" : "✗"}` },
      { label: "Tensão de passo Es", value: `${r.stepVoltageV} V (passo tol. ${r.tolerableStepV} V) ${r.stepSafe ? "✓" : "✗"}` },
      { label: "Resistência da malha", value: `${r.gridResistanceOhm} Ω` },
      { label: "Elevação de potencial (GPR)", value: `${r.gprVolts} V` },
      { label: "Fatores", value: `n=${r.nFactor} · Km=${r.kmFactor} · Ks=${r.ksFactor} · Ki=${r.kiFactor}` },
    ],
    steps: r.steps,
    warnings: r.warnings,
  };
}

function sectionFromSpda(r: SpdaResult): MemorialSection {
  return {
    id: "spda",
    title: "Proteção contra Descargas Atmosféricas (SPDA)",
    norm: "IEC 62305-3 / NBR 5419",
    traceId: r.traceId,
    inputHash: r.inputHash,
    summary: [
      { label: "Nível de proteção", value: `NP ${r.protectionLevel}` },
      { label: "Raio da esfera rolante", value: `${r.rollingSphereRadiusM} m` },
      { label: "Largura da malha de captação", value: `${r.meshSizeM} m` },
      { label: "Espaçamento entre descidas", value: `${r.downConductorSpacingM} m` },
      ...(r.rollingSphereFromCurrentM != null
        ? [{ label: "Raio (modelo eletrogeométrico)", value: `${r.rollingSphereFromCurrentM} m` }]
        : []),
    ],
    steps: r.steps,
    warnings: [],
  };
}

function sectionFromPvString(r: PvStringResult): MemorialSection {
  return {
    id: "pv_string",
    title: "Dimensionamento de String Fotovoltaica",
    norm: "ABNT NBR 16690 / IEC 62548",
    traceId: r.traceId,
    inputHash: r.inputHash,
    compliance: r.status,
    summary: [
      { label: "Módulos por string (mín. – recomendado)", value: `${r.minModulesByMppt} – ${r.recommendedModulesPerString}` },
      { label: "Strings em paralelo por MPPT", value: String(r.maxParallelStrings) },
      { label: "Voc na temperatura mínima", value: `${r.vocAtMinTempV} V` },
      { label: "Vmp (T máx / T mín)", value: `${r.vmpAtMaxTempV} V / ${r.vmpAtMinTempV} V` },
    ],
    steps: r.steps,
    warnings: r.warnings,
  };
}

const RANK: Record<ComplianceStatus, number> = { ok: 0, warning: 1, fail: 2 };

/** Monta o documento de memorial a partir dos resultados disponíveis. */
export function buildMemorial(projectName: string, results: CircuitResults): MemorialDocument {
  const sections: MemorialSection[] = [];
  if (results.shortCircuit) sections.push(sectionFromShortCircuit(results.shortCircuit));
  if (results.protection) sections.push(sectionFromProtection(results.protection));
  if (results.arcFlash) sections.push(sectionFromArcFlash(results.arcFlash));
  if (results.cable) sections.push(sectionFromCable(results.cable));
  if (results.voltageDrop) sections.push(sectionFromVoltageDrop(results.voltageDrop));
  if (results.capacitorBank) sections.push(sectionFromCapacitorBank(results.capacitorBank));
  if (results.motorStarting) sections.push(sectionFromMotorStarting(results.motorStarting));
  if (results.harmonics) sections.push(sectionFromHarmonics(results.harmonics));
  if (results.detunedFilter) sections.push(sectionFromDetunedFilter(results.detunedFilter));
  if (results.grounding) sections.push(sectionFromGrounding(results.grounding));
  if (results.groundGrid) sections.push(sectionFromGroundGrid(results.groundGrid));
  if (results.spda) sections.push(sectionFromSpda(results.spda));
  if (results.pvString) sections.push(sectionFromPvString(results.pvString));

  let overall: ComplianceStatus = "ok";
  for (const s of sections) {
    if (s.compliance && RANK[s.compliance] > RANK[overall]) overall = s.compliance;
  }

  return {
    projectName: projectName || "Projeto sem título",
    generatedAt: new Date().toISOString(),
    engineVersion: ENGINE_VERSION,
    sections,
    overallCompliance: overall,
  };
}

function fmt(v: number): string {
  return Number.isFinite(v) ? String(v) : "não atua";
}
function governing(c: CableSizingResult["governingCriterion"]): string {
  return {
    ampacity: "capacidade de condução",
    voltage_drop: "queda de tensão",
    short_circuit: "curto-circuito",
    minimum_section: "seção mínima (mecânica)",
    none: "—",
  }[c];
}
