/**
 * Modelo de dados de um perfil normativo. As normas são tratadas como DADO
 * versionado (não como código): trocar/atualizar uma norma não exige recompilar
 * o motor, e cada cálculo registra qual perfil foi usado.
 */

export type Insulation = "PVC" | "XLPE";
export type Conductor = "Cu" | "Al";
/** Métodos de referência de instalação (NBR 5410 Tab. 33 / IEC 60364-5-52). */
export type InstallMethod = "A1" | "A2" | "B1" | "B2" | "C" | "D" | "E" | "F";
/** Nº de condutores carregados: 2 (monofásico) ou 3 (trifásico). */
export type LoadedConductors = 2 | 3;

/** Tabela seção[mm²] -> valor. */
export type SectionTable = Readonly<Record<number, number>>;

export interface NormProfile {
  readonly id: string;
  readonly version: string;
  readonly title: string;
  readonly reference: string;
  /** Coeficiente de temperatura do condutor (1/°C) para correção de R. */
  readonly tempCoeff: Readonly<Record<Conductor, number>>;
  /** Temperatura máxima de operação do isolante [°C]. */
  readonly insulationMaxTempC: Readonly<Record<Insulation, number>>;
  /** Fator k para verificação térmica de curto-circuito (S = I·√t / k). */
  readonly kFactor: Readonly<Record<string, number>>; // chave: `${Conductor}_${Insulation}`
  /**
   * Capacidades de condução de corrente Iz [A] a 30 °C, indexadas por
   * material -> método -> isolante -> nº de condutores carregados -> seção.
   */
  readonly ampacity: Readonly<
    Record<
      Conductor,
      Readonly<
        Record<
          InstallMethod,
          Readonly<Record<Insulation, Readonly<Record<LoadedConductors, SectionTable>>>>
        >
      >
    >
  >;
  /** Resistência CC/CA [Ω/km] a 20 °C por seção (condutor de cobre). */
  readonly resistanceOhmPerKm20C: SectionTable;
  /** Reatância [Ω/km] por seção. */
  readonly reactanceOhmPerKm: SectionTable;
  /** Fatores de correção de temperatura ambiente por isolante (temp -> fator). */
  readonly tempCorrection: Readonly<Record<Insulation, SectionTable>>;
  /** Fatores de correção por agrupamento (nº de circuitos -> fator). */
  readonly groupingCorrection: SectionTable;
  /** Correção de temperatura do solo (método D), base 20 °C, por isolante. */
  readonly soilTempCorrection: Readonly<Record<Insulation, SectionTable>>;
  /** Correção por resistividade térmica do solo [K·m/W] (base 2,5). */
  readonly soilThermalResistivityCorrection: SectionTable;
  /** Agrupamento de cabos diretamente enterrados (nº de circuitos -> fator). */
  readonly buriedGroupingCorrection: SectionTable;
  /** Seção mínima [mm²] por tipo de circuito e material (NBR 5410 Tab. 47). */
  readonly minimumSectionMm2: Readonly<
    Record<"power" | "lighting" | "signaling", Readonly<Record<Conductor, number>>>
  >;
}
