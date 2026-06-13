import type { CalculationStep, ComplianceStatus, EngineeringWarning } from "../engine/types";
import type { CableSizingResult } from "../modules/cableSizing";
import type { ShortCircuitResult } from "../modules/shortCircuit";
import type { SelectivityResult } from "../modules/protection";
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
  readonly cable?: CableSizingResult | null;
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
  if (results.cable) sections.push(sectionFromCable(results.cable));

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
    none: "—",
  }[c];
}
