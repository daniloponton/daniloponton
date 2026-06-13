import { z } from "zod";
import { CalculationTrace, canonicalJson, sha256Hex } from "../../engine/trace";
import { round } from "../../engine/units";
import { ENGINE_VERSION } from "../../version";
import type { CalculationStep, ComplianceStatus, EngineeringWarning } from "../../engine/types";

const REF = "NEMA MG-1 / IEC 60034 (partida de motores)";

export const motorStartingInputSchema = z.object({
  /** Potência nominal (mecânica) do motor [kW]. */
  motorPowerKW: z.number().positive(),
  /** Tensão de linha [V]. */
  voltageV: z.number().positive(),
  /** Rendimento. */
  efficiency: z.number().min(0.3).max(1).default(0.9),
  /** Fator de potência nominal. */
  cosPhi: z.number().min(0.5).max(1).default(0.85),
  /** Relação corrente de rotor bloqueado / nominal (Ip/In). */
  lockedRotorRatio: z.number().min(2).max(12).default(6.5),
  /** Fator de potência durante a partida. */
  startingCosPhi: z.number().min(0.1).max(0.8).default(0.3),
  /** Método de partida. */
  startMethod: z.enum(["DOL", "star_delta", "autotransformer", "soft_starter", "vfd"]).default("DOL"),
  /** Tap do autotransformador (fração), p.ex. 0,8. */
  autotransformerTap: z.number().min(0.5).max(1).default(0.8),
  /** Tensão de partida do soft-starter (fração). */
  softStarterVoltage: z.number().min(0.3).max(1).default(0.5),
  /** Potência de curto-circuito no barramento [MVA] (pode vir do IEC 60909). */
  sourceShortCircuitMVA: z.number().positive(),
  /** Relação R/X da fonte. */
  sourceRX: z.number().positive().default(0.1),
  /** Afundamento de tensão máximo admissível na partida [%]. */
  maxVoltageDipPct: z.number().positive().max(40).default(10),
});

export type MotorStartingInput = z.input<typeof motorStartingInputSchema>;

export interface MotorStartingResult {
  readonly traceId: string;
  readonly inputHash: string;
  readonly engineVersion: string;
  readonly timestamp: string;

  /** Corrente nominal [A]. */
  readonly ratedCurrentA: number;
  /** Corrente de partida pelo método escolhido [A]. */
  readonly startingCurrentA: number;
  /** Torque de partida relativo ao DOL (1,0 = DOL pleno). */
  readonly startingTorqueFactor: number;
  /** Afundamento de tensão no barramento durante a partida [%]. */
  readonly voltageDipPct: number;
  /** Tensão residual no barramento [% da nominal]. */
  readonly residualVoltagePct: number;
  readonly status: ComplianceStatus;

  readonly steps: readonly CalculationStep[];
  readonly warnings: readonly EngineeringWarning[];
}

interface Complex {
  re: number;
  im: number;
}
const add = (a: Complex, b: Complex): Complex => ({ re: a.re + b.re, im: a.im + b.im });
const abs = (a: Complex): number => Math.hypot(a.re, a.im);
const polar = (mag: number, ang: number): Complex => ({ re: mag * Math.cos(ang), im: mag * Math.sin(ang) });
function divAbs(a: Complex, b: Complex): number {
  return abs(a) / abs(b);
}

/**
 * Analisa a partida de um motor de indução: corrente de partida pelo método
 * escolhido e afundamento de tensão no barramento, pelo método do divisor de
 * tensão fasorial entre a impedância da fonte e a impedância do motor na partida.
 */
export async function analyzeMotorStarting(
  rawInput: MotorStartingInput,
): Promise<MotorStartingResult> {
  const inp = motorStartingInputSchema.parse(rawInput);
  const trace = new CalculationTrace();

  // Corrente nominal
  const inAmps = (inp.motorPowerKW * 1000) / (Math.sqrt(3) * inp.voltageV * inp.efficiency * inp.cosPhi);
  trace.step({
    label: "Corrente nominal do motor",
    formula: "In = P / (√3·U·η·cosφ)",
    inputs: { P_kW: inp.motorPowerKW, U: inp.voltageV, eta: inp.efficiency, cosPhi: inp.cosPhi },
    result: inAmps,
    unit: "A",
    normRef: REF,
  });

  // Corrente de partida (DOL) e fatores do método
  const lrcA = inp.lockedRotorRatio * inAmps;
  let currentFactor: number; // sobre a corrente DOL (LRC)
  let torqueFactor: number; // relativo ao DOL pleno
  switch (inp.startMethod) {
    case "DOL":
      currentFactor = 1;
      torqueFactor = 1;
      break;
    case "star_delta":
      currentFactor = 1 / 3;
      torqueFactor = 1 / 3;
      break;
    case "autotransformer":
      currentFactor = inp.autotransformerTap ** 2;
      torqueFactor = inp.autotransformerTap ** 2;
      break;
    case "soft_starter":
      currentFactor = inp.softStarterVoltage;
      torqueFactor = inp.softStarterVoltage ** 2;
      break;
    case "vfd":
      // VFD limita a corrente de partida a ~1,5·In, com torque controlado.
      currentFactor = (1.5 * inAmps) / lrcA;
      torqueFactor = 1; // torque pleno disponível em baixa frequência
      break;
  }
  const startingCurrentA = lrcA * currentFactor;
  trace.step({
    label: "Corrente de partida (método)",
    formula: "I_p = Ip/In · In · fator_método",
    inputs: { method: inp.startMethod, lrcA: round(lrcA, 1), currentFactor: round(currentFactor, 3) },
    result: startingCurrentA,
    unit: "A",
    normRef: REF,
  });

  // Divisor de tensão fasorial: Zfonte e Zmotor(partida)
  const zSourceMag = (inp.voltageV * inp.voltageV) / (inp.sourceShortCircuitMVA * 1e6);
  const angSource = Math.atan(1 / inp.sourceRX); // R/X dado → ângulo da impedância
  const zSource = polar(zSourceMag, angSource);

  const zMotorMag = inp.voltageV / (Math.sqrt(3) * startingCurrentA);
  const angMotor = Math.acos(inp.startingCosPhi);
  const zMotor = polar(zMotorMag, angMotor);

  const residual = divAbs(zMotor, add(zSource, zMotor)); // |Zm / (Zs+Zm)|
  const dipPct = (1 - residual) * 100;
  trace.step({
    label: "Afundamento de tensão na partida",
    formula: "V_res = |Z_motor / (Z_fonte + Z_motor)| ; afund. = (1 − V_res)·100",
    inputs: {
      zSourceOhm: round(zSourceMag, 5),
      zMotorOhm: round(zMotorMag, 5),
      sourceShortCircuitMVA: inp.sourceShortCircuitMVA,
    },
    result: dipPct,
    unit: "%",
    normRef: `${REF} / IEEE 399`,
  });

  let status: ComplianceStatus = "ok";
  if (dipPct > inp.maxVoltageDipPct) {
    status = "fail";
    trace.warn(
      "OVER_DIP",
      `Afundamento ${round(dipPct, 1)}% excede o limite ${inp.maxVoltageDipPct}%. Considere método de partida mais suave.`,
    );
  } else if (dipPct > 0.9 * inp.maxVoltageDipPct) {
    status = "warning";
  }

  const canonical = canonicalJson({ input: inp, engineVersion: ENGINE_VERSION, norm: REF });
  const inputHash = await sha256Hex(canonical);

  return {
    traceId: `MS-${inputHash.slice(0, 12)}`,
    inputHash,
    engineVersion: ENGINE_VERSION,
    timestamp: new Date().toISOString(),
    ratedCurrentA: round(inAmps, 1),
    startingCurrentA: round(startingCurrentA, 1),
    startingTorqueFactor: round(torqueFactor, 3),
    voltageDipPct: round(dipPct, 2),
    residualVoltagePct: round(residual * 100, 2),
    status,
    steps: trace.steps,
    warnings: trace.warnings,
  };
}
