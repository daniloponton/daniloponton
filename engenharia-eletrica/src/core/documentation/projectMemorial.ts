import { buildMemorial, type CircuitResults, type MemorialSection } from "./memorial";
import { buildSingleLine, type SingleLineElement } from "./singleLine";
import type { ComplianceStatus } from "../engine/types";
import type { Circuit } from "../project/types";
import { ENGINE_VERSION } from "../version";

/**
 * Memorial consolidado de um projeto com vários circuitos. Cada circuito vira
 * um grupo (com seu unifilar e seções de cálculo); as análises que valem para
 * o projeto inteiro (arco elétrico, FP, aterramento, SPDA, FV) ficam à parte.
 */

export interface MemorialCircuitGroup {
  readonly name: string;
  readonly singleLine: readonly SingleLineElement[];
  readonly sections: readonly MemorialSection[];
  readonly overall: ComplianceStatus;
}

export interface ProjectMemorialDocument {
  readonly projectName: string;
  readonly generatedAt: string;
  readonly engineVersion: string;
  readonly circuits: readonly MemorialCircuitGroup[];
  /** Seções de análises do projeto (arco, FP, aterramento, SPDA, FV). */
  readonly projectSections: readonly MemorialSection[];
  readonly overallCompliance: ComplianceStatus;
}

export interface CircuitWithResults {
  readonly circuit: Circuit;
  readonly results: CircuitResults;
}

const RANK: Record<ComplianceStatus, number> = { ok: 0, warning: 1, fail: 2 };

export function buildProjectMemorial(
  projectName: string,
  circuitResults: readonly CircuitWithResults[],
  projectExtras: CircuitResults,
): ProjectMemorialDocument {
  const circuits: MemorialCircuitGroup[] = circuitResults.map(({ circuit, results }) => {
    const doc = buildMemorial(circuit.name, {
      shortCircuit: results.shortCircuit,
      protection: results.protection,
      cable: results.cable,
    });
    return {
      name: circuit.name,
      singleLine: buildSingleLine(circuit, results),
      sections: doc.sections,
      overall: doc.overallCompliance,
    };
  });

  const projectDoc = buildMemorial(projectName, {
    arcFlash: projectExtras.arcFlash,
    voltageDrop: projectExtras.voltageDrop,
    capacitorBank: projectExtras.capacitorBank,
    motorStarting: projectExtras.motorStarting,
    harmonics: projectExtras.harmonics,
    detunedFilter: projectExtras.detunedFilter,
    grounding: projectExtras.grounding,
    groundGrid: projectExtras.groundGrid,
    spda: projectExtras.spda,
    pvString: projectExtras.pvString,
  });

  let overall: ComplianceStatus = "ok";
  for (const g of circuits) if (RANK[g.overall] > RANK[overall]) overall = g.overall;
  for (const s of projectDoc.sections)
    if (s.compliance && RANK[s.compliance] > RANK[overall]) overall = s.compliance;

  return {
    projectName: projectName || "Projeto sem título",
    generatedAt: new Date().toISOString(),
    engineVersion: ENGINE_VERSION,
    circuits,
    projectSections: projectDoc.sections,
    overallCompliance: overall,
  };
}
