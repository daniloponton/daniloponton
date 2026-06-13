/**
 * Tipos compartilhados do motor de cálculo.
 *
 * O motor é determinístico e independente da UI: dadas as mesmas entradas e a
 * mesma versão do motor + norma, produz exatamente o mesmo resultado e o mesmo
 * hash de auditoria.
 */

/** Resultado de uma verificação normativa, com semáforo de conformidade. */
export type ComplianceStatus = "ok" | "warning" | "fail";

/**
 * Um passo atômico de cálculo. Cada passo é auto-explicativo: descreve o que
 * foi calculado, a fórmula simbólica aplicada, as entradas usadas, o resultado
 * e a referência normativa. É a unidade do memorial de cálculo.
 */
export interface CalculationStep {
  readonly id: number;
  /** Descrição legível do passo (ex.: "Fator de correção de temperatura"). */
  readonly label: string;
  /** Fórmula simbólica aplicada (ex.: "I'z = Iz · Ca · Cg"). */
  readonly formula: string;
  /** Entradas numéricas/textuais efetivamente usadas neste passo. */
  readonly inputs: Readonly<Record<string, number | string>>;
  /** Resultado numérico do passo. */
  readonly result: number;
  /** Unidade do resultado (ex.: "A", "%", "mm²", "-"). */
  readonly unit: string;
  /** Trecho/cláusula da norma que fundamenta o passo. */
  readonly normRef: string;
}

/** Advertência de engenharia anexada ao resultado (não bloqueia o cálculo). */
export interface EngineeringWarning {
  readonly code: string;
  readonly message: string;
}
