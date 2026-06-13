import { describe, it, expect } from "vitest";
import {
  analyzeGrounding,
  analyzeSpda,
  rollingSphereRadius,
  type GroundingInput,
} from "@core/modules/grounding";

describe("Aterramento (IEEE 80 / NBR 7117)", () => {
  it("resistividade de Wenner: ρ = 2πaR", async () => {
    const r = await analyzeGrounding({
      soilMethod: "wenner",
      wennerSpacingM: 4,
      wennerResistanceOhm: 10,
      electrode: "rod",
      faultCurrentA: 100,
    });
    expect(r.soilResistivityOhmM).toBeCloseTo(251.3, 0); // 2π·4·10
  });

  it("haste única (Dwight) com ρ=300 ≈ 108,6 Ω", async () => {
    const r = await analyzeGrounding({
      soilMethod: "direct",
      soilResistivity: 300,
      electrode: "rod",
      rodLengthM: 2.4,
      rodDiameterM: 0.015,
      faultCurrentA: 100,
    });
    expect(r.electrodeResistanceOhm).toBeCloseTo(108.6, 0);
  });

  it("hastes em paralelo reduzem a resistência", async () => {
    const base: GroundingInput = {
      soilMethod: "direct",
      soilResistivity: 300,
      electrode: "rod",
      rodLengthM: 2.4,
      rodDiameterM: 0.015,
      faultCurrentA: 100,
    };
    const one = await analyzeGrounding(base);
    const many = await analyzeGrounding({ ...base, electrode: "rods", rodCount: 4, rodEfficiency: 0.7 });
    expect(many.electrodeResistanceOhm).toBeLessThan(one.electrodeResistanceOhm);
  });

  it("malha (Sverak) com ρ=300, Lt=200, A=400 ≈ 7,9 Ω", async () => {
    const r = await analyzeGrounding({
      soilMethod: "direct",
      soilResistivity: 300,
      electrode: "grid",
      gridTotalLengthM: 200,
      gridAreaM2: 400,
      gridDepthM: 0.5,
      faultCurrentA: 100,
    });
    expect(r.electrodeResistanceOhm).toBeCloseTo(7.9, 0);
    expect(r.tolerableStepV).toBeGreaterThan(r.tolerableTouchV); // passo > toque
  });

  it("GPR baixo → seguro; GPR alto → exige análise de malha", async () => {
    const safe = await analyzeGrounding({
      soilMethod: "direct", soilResistivity: 300, electrode: "grid",
      gridTotalLengthM: 200, gridAreaM2: 400, faultCurrentA: 100,
      surfaceLayerResistivity: 3000, surfaceLayerThicknessM: 0.1,
    });
    expect(safe.status).toBe("ok");

    const unsafe = await analyzeGrounding({
      soilMethod: "direct", soilResistivity: 300, electrode: "rod",
      faultCurrentA: 5000,
    });
    expect(unsafe.status).toBe("warning");
    expect(unsafe.warnings.some((w) => w.code === "MESH_ANALYSIS_REQUIRED")).toBe(true);
  });

  it("camada superficial de brita reduz Cs (< 1)", async () => {
    const r = await analyzeGrounding({
      soilMethod: "direct", soilResistivity: 300, electrode: "rod", faultCurrentA: 100,
      surfaceLayerResistivity: 3000, surfaceLayerThicknessM: 0.1,
    });
    expect(r.surfaceDerateCs).toBeLessThan(1);
    expect(r.surfaceDerateCs).toBeGreaterThan(0);
  });
});

describe("SPDA (IEC 62305-3 / NBR 5419)", () => {
  it("nível I → esfera 20 m, malha 5 m, descidas 10 m", async () => {
    const r = await analyzeSpda({ protectionLevel: "I" });
    expect(r.rollingSphereRadiusM).toBe(20);
    expect(r.meshSizeM).toBe(5);
    expect(r.downConductorSpacingM).toBe(10);
  });

  it("nível IV é menos restritivo que o nível I", async () => {
    const i = await analyzeSpda({ protectionLevel: "I" });
    const iv = await analyzeSpda({ protectionLevel: "IV" });
    expect(iv.rollingSphereRadiusM).toBeGreaterThan(i.rollingSphereRadiusM);
    expect(iv.meshSizeM).toBeGreaterThan(i.meshSizeM);
  });

  it("modelo eletrogeométrico r = 10·I^0,65 (10 kA ≈ 44,7 m)", async () => {
    expect(rollingSphereRadius(10)).toBeCloseTo(44.67, 1);
    const r = await analyzeSpda({ protectionLevel: "II", firstStrokeCurrentKA: 10 });
    expect(r.rollingSphereFromCurrentM).toBeCloseTo(44.7, 1);
  });
});
