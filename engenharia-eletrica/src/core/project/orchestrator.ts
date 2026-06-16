import {
  calculateCableSizing,
  type CableSizingResult,
} from "../modules/cableSizing";
import {
  calculateShortCircuit,
  type ShortCircuitResult,
} from "../modules/shortCircuit";
import { checkSelectivity, type SelectivityResult } from "../modules/protection";
import { ENGINE_VERSION } from "../version";
import type { Circuit, Project } from "./types";

/**
 * Valores propagados de um módulo para o outro durante a avaliação do circuito.
 * É aqui que o ciclo se fecha — antes isso vivia espalhado na UI.
 */
export interface CircuitPropagation {
  /** I"k [kA] obtida do curto-circuito e injetada na proteção e no cabo. */
  ikSymKA: number | null;
  /** Tempo de atuação [s] da proteção, injetado na verificação térmica do cabo. */
  clearingS: number | null;
}

export interface CircuitEvaluation {
  circuitId: string;
  shortCircuit: ShortCircuitResult | null;
  protection: SelectivityResult | null;
  cable: CableSizingResult | null;
  propagation: CircuitPropagation;
}

/**
 * Avalia um circuito encadeando os três módulos:
 *
 *   curto-circuito  →  I"k  →  proteção (faixa de coordenação) e cabo (térmico)
 *   proteção        →  tempo de atuação na falta  →  cabo (térmico)
 *
 * Cada entrada ausente simplesmente não é calculada (resultado null).
 */
export async function evaluateCircuit(circuit: Circuit): Promise<CircuitEvaluation> {
  const shortCircuit = circuit.shortCircuit
    ? await calculateShortCircuit(circuit.shortCircuit)
    : null;

  const ikSymKA = shortCircuit?.ikSymKA ?? null;

  let protection: SelectivityResult | null = null;
  if (circuit.protection) {
    const input =
      ikSymKA != null
        ? { ...circuit.protection, faultCurrentKA: ikSymKA }
        : circuit.protection;
    protection = await checkSelectivity(input);
  }

  const clearingS =
    protection && Number.isFinite(protection.downstreamClearingAtFaultS)
      ? protection.downstreamClearingAtFaultS
      : null;

  let cable: CableSizingResult | null = null;
  if (circuit.cable) {
    const input = {
      ...circuit.cable,
      shortCircuitKA: ikSymKA ?? circuit.cable.shortCircuitKA,
      faultClearingS: clearingS ?? circuit.cable.faultClearingS,
    };
    cable = await calculateCableSizing(input);
  }

  return {
    circuitId: circuit.id,
    shortCircuit,
    protection,
    cable,
    propagation: { ikSymKA, clearingS },
  };
}

/** Avalia todos os circuitos de um projeto. */
export async function evaluateProject(project: Project): Promise<CircuitEvaluation[]> {
  return Promise.all(project.circuits.map((c) => evaluateCircuit(c)));
}

function newId(): string {
  return globalThis.crypto.randomUUID();
}

export function createCircuit(name: string): Circuit {
  return { id: newId(), name };
}

export function createProject(name: string): Project {
  const now = new Date().toISOString();
  return {
    id: newId(),
    name,
    createdAt: now,
    updatedAt: now,
    engineVersion: ENGINE_VERSION,
    circuits: [],
  };
}
