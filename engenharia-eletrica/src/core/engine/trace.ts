import type { CalculationStep, EngineeringWarning } from "./types";

/**
 * Acumulador imutável-por-fora do memorial de cálculo.
 *
 * Cada chamada de `step` registra um passo numerado e devolve o próprio
 * resultado numérico, permitindo encadear o registro com o uso do valor:
 *
 *   const ca = trace.step({ label: "...", formula: "...", inputs: {...},
 *                           result: lookup(...), unit: "-", normRef: "..." });
 */
export class CalculationTrace {
  private readonly _steps: CalculationStep[] = [];
  private readonly _warnings: EngineeringWarning[] = [];

  step(input: Omit<CalculationStep, "id">): number {
    const id = this._steps.length + 1;
    this._steps.push({ id, ...input });
    return input.result;
  }

  warn(code: string, message: string): void {
    this._warnings.push({ code, message });
  }

  get steps(): readonly CalculationStep[] {
    return this._steps;
  }

  get warnings(): readonly EngineeringWarning[] {
    return this._warnings;
  }
}

/**
 * Serialização canônica: chaves ordenadas recursivamente, sem espaços.
 * Garante que o mesmo objeto sempre gere a mesma string — pré-requisito para
 * um hash de auditoria reprodutível.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortDeep((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

/** SHA-256 hex via Web Crypto (disponível no navegador e no Node 20+). */
export async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
