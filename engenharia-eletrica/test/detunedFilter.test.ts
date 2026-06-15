import { describe, it, expect } from "vitest";
import { sizeDetunedFilter } from "@core/modules/powerQuality";

describe("Filtro/banco dessintonizado", () => {
  it("p=7% → h_r ≈ 3,78 e f_r ≈ 226,9 Hz (60 Hz)", async () => {
    const r = await sizeDetunedFilter({ systemVoltageV: 380, frequencyHz: 60, reactivePowerKvar: 50, detuningFactorPercent: 7 });
    expect(r.tuningOrder).toBeCloseTo(3.78, 1);
    expect(r.tuningFrequencyHz).toBeCloseTo(226.9, 0);
    expect(r.status).toBe("ok");
  });

  it("aplica sobretensão no capacitor: U_C e Q_C = valor/(1−p)", async () => {
    const r = await sizeDetunedFilter({ systemVoltageV: 380, reactivePowerKvar: 50, detuningFactorPercent: 7 });
    expect(r.capacitorRatedVoltageV).toBeCloseTo(380 / 0.93, 0); // ≈ 408,6 V
    expect(r.capacitorReactiveKvar).toBeCloseTo(50 / 0.93, 1); // ≈ 53,76 kvar
  });

  it("sintonia muito alta (p baixo) ressoa na 5ª → falha", async () => {
    // p=4% → h_r=5,0
    const r = await sizeDetunedFilter({ systemVoltageV: 380, reactivePowerKvar: 50, detuningFactorPercent: 4 });
    expect(r.tuningOrder).toBeCloseTo(5.0, 1);
    expect(r.status).toBe("fail");
    expect(r.warnings.some((w) => w.code === "RESONANCE_RISK")).toBe(true);
  });

  it("é determinístico", async () => {
    const a = await sizeDetunedFilter({ systemVoltageV: 380, reactivePowerKvar: 50, detuningFactorPercent: 7 });
    const b = await sizeDetunedFilter({ systemVoltageV: 380, reactivePowerKvar: 50, detuningFactorPercent: 7 });
    expect(a.inputHash).toBe(b.inputHash);
  });
});
