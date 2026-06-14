import { z } from "zod";
import { DEFAULT_NORM_ID } from "../../norms";
import type { CalculationStep, ComplianceStatus, EngineeringWarning } from "../../engine/types";

/**
 * Entradas do dimensionamento de cabo BT. A validação (faixas, tipos) acontece
 * ANTES do cálculo — entradas inválidas são rejeitadas, nunca produzem um
 * resultado silenciosamente errado.
 */
export const cableSizingInputSchema = z.object({
  /** Corrente de projeto Ib [A]. */
  ibAmps: z.number().positive(),
  /** Sistema: monofásico (2 condutores) ou trifásico (3 condutores). */
  system: z.enum(["single", "three"]),
  /** Tensão de referência [V]: fase-neutro (mono) ou fase-fase (trifásico). */
  voltageV: z.number().positive(),
  /** Comprimento do circuito [m]. */
  lengthM: z.number().positive(),
  /** Fator de potência cos φ. */
  cosPhi: z.number().min(0.5).max(1),
  /** Material do condutor. */
  conductor: z.enum(["Cu", "Al"]).default("Cu"),
  /** Isolação. */
  insulation: z.enum(["PVC", "XLPE"]),
  /** Método de referência de instalação. */
  installMethod: z.enum(["A1", "A2", "B1", "B2", "C"]),
  /** Temperatura ambiente [°C]. */
  ambientTempC: z.number().min(-5).max(80),
  /** Nº de circuitos agrupados (>= 1). */
  groupingCircuits: z.number().int().min(1),
  /** Queda de tensão máxima admissível [%]. */
  maxVoltageDropPct: z.number().positive().max(10).default(4),
  /** Corrente de curto-circuito presumida simétrica [kA]. 0 desativa o critério. */
  shortCircuitKA: z.number().min(0).default(0),
  /** Tempo de atuação da proteção [s]. */
  faultClearingS: z.number().positive().default(0.1),
  /** Identificador do perfil normativo. */
  normId: z.string().default(DEFAULT_NORM_ID),
});

export type CableSizingInput = z.input<typeof cableSizingInputSchema>;
export type CableSizingParsed = z.output<typeof cableSizingInputSchema>;

export interface CriterionResult {
  readonly status: ComplianceStatus;
  readonly detail: string;
}

export interface CableSizingResult {
  /** Identificador legível do cálculo (prefixo + hash + data). */
  readonly traceId: string;
  /** Hash SHA-256 das entradas + versão do motor + norma. */
  readonly inputHash: string;
  readonly engineVersion: string;
  readonly normId: string;
  readonly timestamp: string;

  /** Seção selecionada [mm²], ou null se nenhuma da série atende. */
  readonly selectedSectionMm2: number | null;
  /** Capacidade corrigida I'z da seção selecionada [A]. */
  readonly correctedAmpacityA: number;
  /** Queda de tensão calculada para a seção selecionada [%]. */
  readonly voltageDropPct: number;
  /** Seção mínima exigida pelo curto-circuito [mm²] (0 se critério desativado). */
  readonly minSectionByShortCircuitMm2: number;
  /** Critério que governou a escolha da seção. */
  readonly governingCriterion: "ampacity" | "voltage_drop" | "short_circuit" | "none";

  readonly criteria: {
    readonly ampacity: CriterionResult;
    readonly voltageDrop: CriterionResult;
    readonly shortCircuit: CriterionResult;
  };
  readonly overall: ComplianceStatus;

  readonly steps: readonly CalculationStep[];
  readonly warnings: readonly EngineeringWarning[];
}
