/**
 * Ponto de entrada público do núcleo de cálculo. A UI (e qualquer integração
 * externa) deve depender apenas deste módulo — nunca de arquivos internos.
 */
export { ENGINE_VERSION } from "./version";
export * from "./engine/types";
export * from "./norms";
export * from "./modules/cableSizing";
export * from "./modules/shortCircuit";
export * from "./modules/protection";
export * from "./modules/powerQuality";
export * from "./modules/grounding";
export * from "./modules/arcFlash";
export * from "./modules/pv";
export * from "./modules/loadSchedule";
export * from "./project";
export * from "./documentation";
