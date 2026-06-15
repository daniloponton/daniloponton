import type { ComplianceStatus } from "../engine/types";
import type { ProjectMemorialDocument } from "./projectMemorial";

/**
 * Matriz de conformidade: consolida o status de cada item calculado do projeto
 * (item × norma × conformidade) numa visão executiva, derivada do memorial.
 */

export type MatrixStatus = ComplianceStatus | "info";

export interface ComplianceRow {
  readonly scope: string;
  readonly item: string;
  readonly norm: string;
  readonly status: MatrixStatus;
}

export interface ComplianceMatrixDocument {
  readonly rows: readonly ComplianceRow[];
  readonly counts: Readonly<Record<MatrixStatus, number>>;
  readonly overall: ComplianceStatus;
}

export function buildComplianceMatrix(doc: ProjectMemorialDocument): ComplianceMatrixDocument {
  const rows: ComplianceRow[] = [];

  for (const group of doc.circuits) {
    for (const s of group.sections) {
      rows.push({ scope: group.name, item: s.title, norm: s.norm, status: s.compliance ?? "info" });
    }
  }
  for (const s of doc.projectSections) {
    rows.push({ scope: "Projeto", item: s.title, norm: s.norm, status: s.compliance ?? "info" });
  }

  const counts: Record<MatrixStatus, number> = { ok: 0, warning: 0, fail: 0, info: 0 };
  for (const r of rows) counts[r.status] += 1;

  return { rows, counts, overall: doc.overallCompliance };
}
