import type { ComplianceStatus } from "../engine/types";
import type { Circuit } from "../project/types";
import type { CircuitResults } from "./memorial";

/**
 * Modelo do diagrama unifilar: lista ordenada de elementos do topo (fonte) à
 * base (carga), montada a partir das ENTRADAS do circuito e dos RESULTADOS já
 * calculados. A renderização (SVG) fica na UI; este modelo é testável.
 */

export type SingleLineKind =
  | "utility"
  | "transformer"
  | "busbar"
  | "protection"
  | "cable"
  | "load";

export interface SingleLineElement {
  readonly kind: SingleLineKind;
  readonly label: string;
  readonly details: readonly string[];
  readonly status?: ComplianceStatus;
}

export function buildSingleLine(
  circuit: Circuit,
  results: CircuitResults,
): SingleLineElement[] {
  const elements: SingleLineElement[] = [];

  const sc = circuit.shortCircuit;
  if (sc) {
    elements.push({
      kind: "utility",
      label: "Concessionária",
      details: [`S\"k = ${sc.feeder.skMVA} MVA`, `${sc.feeder.unHvKV} kV`],
    });
    if (sc.transformer) {
      const t = sc.transformer;
      elements.push({
        kind: "transformer",
        label: "Transformador",
        details: [`${t.srKVA} kVA`, `${t.unHvKV} kV / ${t.unLvV} V`, `u_k = ${t.ukrPercent}%`],
      });
    }
  }

  // Barramento com a corrente de curto, quando disponível.
  const busDetails: string[] = [];
  const busVoltage = sc?.faultVoltageV ?? circuit.cable?.voltageV;
  if (busVoltage != null) busDetails.push(`${busVoltage} V`);
  if (results.shortCircuit) busDetails.push(`I\"k = ${results.shortCircuit.ikSymKA} kA`);
  elements.push({ kind: "busbar", label: "Barramento", details: busDetails });

  if (circuit.protection) {
    const inv = circuit.protection.downstream.stages.find((s) => s.kind === "inverse");
    const details: string[] = [];
    if (inv && inv.kind === "inverse") details.push(`Is = ${inv.pickupA} A · ${inv.curve} · TMS ${inv.tms}`);
    if (results.protection) {
      details.push(results.protection.selective ? "Seletivo" : "Não seletivo");
      if (Number.isFinite(results.protection.downstreamClearingAtFaultS)) {
        details.push(`t = ${results.protection.downstreamClearingAtFaultS} s`);
      }
    }
    elements.push({
      kind: "protection",
      label: "Proteção",
      details,
      status: results.protection ? (results.protection.selective ? "ok" : "fail") : undefined,
    });
  }

  if (circuit.cable) {
    const c = circuit.cable;
    const details: string[] = [];
    const section = results.cable?.selectedSectionMm2;
    details.push(`${section ? `${section} mm²` : "—"} ${c.insulation}`);
    details.push(`${c.lengthM} m · ${c.installMethod}`);
    if (results.cable) details.push(`ΔU = ${results.cable.voltageDropPct}%`);
    elements.push({
      kind: "cable",
      label: "Condutor",
      details,
      status: results.cable?.overall,
    });
  }

  if (circuit.cable) {
    elements.push({
      kind: "load",
      label: "Carga",
      details: [`Ib = ${circuit.cable.ibAmps} A`, `cos φ = ${circuit.cable.cosPhi}`],
    });
  }

  return elements;
}
