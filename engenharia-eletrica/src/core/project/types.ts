import type { CableSizingInput } from "../modules/cableSizing";
import type { ShortCircuitInput } from "../modules/shortCircuit";
import type { SelectivityInput } from "../modules/protection";

/**
 * Um Circuito é a entidade que amarra os três módulos para um mesmo trecho da
 * instalação: fonte → proteção → cabo → carga. Guarda as ENTRADAS de cada
 * módulo; os resultados são derivados (recalculados) por `evaluateCircuit`.
 */
export interface Circuit {
  id: string;
  name: string;
  shortCircuit?: ShortCircuitInput;
  protection?: SelectivityInput;
  cable?: CableSizingInput;
}

/** Metadados de um projeto (sem os circuitos), para listagem rápida. */
export interface ProjectMeta {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  engineVersion: string;
}

/** Um projeto completo: metadados + circuitos. É a unidade persistida. */
export interface Project extends ProjectMeta {
  circuits: Circuit[];
}

/** Versão do schema de persistência (para migrações futuras). */
export const PROJECT_SCHEMA_VERSION = 1;
