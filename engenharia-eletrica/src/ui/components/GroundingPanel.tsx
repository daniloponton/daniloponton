import { useState } from "react";
import {
  analyzeGrounding,
  analyzeGroundGrid,
  analyzeSpda,
  type CircuitResults,
  type GroundGridInput,
  type GroundGridResult,
  type GroundingInput,
  type GroundingResult,
  type SpdaInput,
  type SpdaResult,
} from "@core/index";

type ResultPatch = (patch: Partial<CircuitResults>) => void;

interface Props {
  onError: (msg: string | null) => void;
  onResult: ResultPatch;
}

export function GroundingPanel({ onError, onResult }: Props) {
  return (
    <div className="pq">
      <GroundingCard onError={onError} onResult={onResult} />
      <GridCard onError={onError} onResult={onResult} />
      <SpdaCard onError={onError} onResult={onResult} />
    </div>
  );
}

function GridCard({ onError, onResult }: { onError: (m: string | null) => void; onResult: ResultPatch }) {
  const [form, setForm] = useState<GroundGridInput>({
    soilResistivity: 400,
    gridLengthXM: 70,
    gridLengthYM: 70,
    conductorSpacingM: 7,
    conductorDiameterM: 0.01,
    gridDepthM: 0.5,
    rodCount: 0,
    rodLengthM: 2.4,
    faultCurrentA: 1900,
    faultClearingS: 0.5,
    bodyWeightKg: 70,
    surfaceLayerResistivity: 2500,
    surfaceLayerThicknessM: 0.102,
  });
  const [res, setRes] = useState<GroundGridResult | null>(null);
  const set = (patch: Partial<GroundGridInput>) => setForm((f) => ({ ...f, ...patch }));

  async function calc() {
    onError(null);
    try {
      const r = await analyzeGroundGrid(form);
      setRes(r);
      onResult({ groundGrid: r });
    } catch (e) {
      setRes(null);
      onError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <section className="card">
      <h3>Malha de aterramento — tensões de malha e passo (IEEE 80)</h3>
      <div className="grid">
        <label className="field"><span>ρ do solo [Ω·m]</span><input type="number" value={form.soilResistivity} onChange={(e) => set({ soilResistivity: Number(e.target.value) })} /></label>
        <label className="field"><span>Lx [m]</span><input type="number" value={form.gridLengthXM} onChange={(e) => set({ gridLengthXM: Number(e.target.value) })} /></label>
        <label className="field"><span>Ly [m]</span><input type="number" value={form.gridLengthYM} onChange={(e) => set({ gridLengthYM: Number(e.target.value) })} /></label>
        <label className="field"><span>Espaçamento D [m]</span><input type="number" step="0.5" value={form.conductorSpacingM} onChange={(e) => set({ conductorSpacingM: Number(e.target.value) })} /></label>
        <label className="field"><span>Diâmetro cond. [m]</span><input type="number" step="0.001" value={form.conductorDiameterM} onChange={(e) => set({ conductorDiameterM: Number(e.target.value) })} /></label>
        <label className="field"><span>Profundidade h [m]</span><input type="number" step="0.1" value={form.gridDepthM} onChange={(e) => set({ gridDepthM: Number(e.target.value) })} /></label>
        <label className="field"><span>Nº hastes</span><input type="number" value={form.rodCount} onChange={(e) => set({ rodCount: Number(e.target.value) })} /></label>
        <label className="field"><span>Comp. haste [m]</span><input type="number" step="0.1" value={form.rodLengthM} onChange={(e) => set({ rodLengthM: Number(e.target.value) })} /></label>
        <label className="field"><span>Corrente Ig [A]</span><input type="number" value={form.faultCurrentA} onChange={(e) => set({ faultCurrentA: Number(e.target.value) })} /></label>
        <label className="field"><span>Tempo falta [s]</span><input type="number" step="0.1" value={form.faultClearingS} onChange={(e) => set({ faultClearingS: Number(e.target.value) })} /></label>
        <label className="field"><span>ρ brita [Ω·m]</span><input type="number" value={form.surfaceLayerResistivity} onChange={(e) => set({ surfaceLayerResistivity: Number(e.target.value) })} /></label>
        <label className="field"><span>Esp. brita [m]</span><input type="number" step="0.05" value={form.surfaceLayerThicknessM} onChange={(e) => set({ surfaceLayerThicknessM: Number(e.target.value) })} /></label>
      </div>
      <div className="project-actions"><button type="button" onClick={calc}>Calcular malha</button></div>

      {res && (
        <div className="result-mini">
          <p>
            Em = <strong>{res.meshVoltageV} V</strong> (toque tol. {res.tolerableTouchV} V){" "}
            <span className={`status status-${res.touchSafe ? "ok" : "fail"}`}>{res.touchSafe ? "✅" : "❌"}</span>
            {" · "}Es = <strong>{res.stepVoltageV} V</strong> (passo tol. {res.tolerableStepV} V){" "}
            <span className={`status status-${res.stepSafe ? "ok" : "fail"}`}>{res.stepSafe ? "✅" : "❌"}</span>
          </p>
          <p className="muted">Rg = {res.gridResistanceOhm} Ω · GPR = {res.gprVolts} V · n = {res.nFactor} · Km = {res.kmFactor} · Ks = {res.ksFactor} · Ki = {res.kiFactor}</p>
          {res.warnings.map((w) => <p key={w.code} className="muted">⚠️ {w.message}</p>)}
        </div>
      )}
    </section>
  );
}

function GroundingCard({ onError, onResult }: { onError: (m: string | null) => void; onResult: ResultPatch }) {
  const [form, setForm] = useState<GroundingInput>({
    soilMethod: "direct",
    soilResistivity: 300,
    wennerSpacingM: 4,
    wennerResistanceOhm: 10,
    electrode: "rod",
    rodLengthM: 2.4,
    rodDiameterM: 0.015,
    rodCount: 4,
    rodEfficiency: 0.7,
    gridTotalLengthM: 200,
    gridAreaM2: 400,
    gridDepthM: 0.5,
    faultCurrentA: 1000,
    faultClearingS: 0.5,
    bodyWeightKg: 70,
    surfaceLayerResistivity: 3000,
    surfaceLayerThicknessM: 0.1,
  });
  const [res, setRes] = useState<GroundingResult | null>(null);
  const set = (patch: Partial<GroundingInput>) => setForm((f) => ({ ...f, ...patch }));

  async function calc() {
    onError(null);
    try {
      const r = await analyzeGrounding(form);
      setRes(r);
      onResult({ grounding: r });
    } catch (e) {
      setRes(null);
      onError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <section className="card">
      <h3>Aterramento — resistência, GPR e tensões toleráveis</h3>
      <div className="grid">
        <label className="field"><span>Solo</span>
          <select value={form.soilMethod} onChange={(e) => set({ soilMethod: e.target.value as GroundingInput["soilMethod"] })}>
            <option value="direct">ρ informada</option>
            <option value="wenner">Ensaio de Wenner</option>
          </select></label>
        {form.soilMethod === "direct" ? (
          <label className="field"><span>ρ do solo [Ω·m]</span>
            <input type="number" value={form.soilResistivity} onChange={(e) => set({ soilResistivity: Number(e.target.value) })} /></label>
        ) : (
          <>
            <label className="field"><span>Espaçamento a [m]</span>
              <input type="number" step="0.5" value={form.wennerSpacingM} onChange={(e) => set({ wennerSpacingM: Number(e.target.value) })} /></label>
            <label className="field"><span>R medido [Ω]</span>
              <input type="number" step="0.1" value={form.wennerResistanceOhm} onChange={(e) => set({ wennerResistanceOhm: Number(e.target.value) })} /></label>
          </>
        )}

        <label className="field"><span>Eletrodo</span>
          <select value={form.electrode} onChange={(e) => set({ electrode: e.target.value as GroundingInput["electrode"] })}>
            <option value="rod">Haste única</option>
            <option value="rods">Hastes em paralelo</option>
            <option value="grid">Malha</option>
          </select></label>

        {form.electrode !== "grid" && (
          <>
            <label className="field"><span>Comp. haste [m]</span>
              <input type="number" step="0.1" value={form.rodLengthM} onChange={(e) => set({ rodLengthM: Number(e.target.value) })} /></label>
            <label className="field"><span>Diâmetro [m]</span>
              <input type="number" step="0.001" value={form.rodDiameterM} onChange={(e) => set({ rodDiameterM: Number(e.target.value) })} /></label>
          </>
        )}
        {form.electrode === "rods" && (
          <>
            <label className="field"><span>Nº hastes</span>
              <input type="number" value={form.rodCount} onChange={(e) => set({ rodCount: Number(e.target.value) })} /></label>
            <label className="field"><span>Eficiência η</span>
              <input type="number" step="0.05" value={form.rodEfficiency} onChange={(e) => set({ rodEfficiency: Number(e.target.value) })} /></label>
          </>
        )}
        {form.electrode === "grid" && (
          <>
            <label className="field"><span>L total cond. [m]</span>
              <input type="number" value={form.gridTotalLengthM} onChange={(e) => set({ gridTotalLengthM: Number(e.target.value) })} /></label>
            <label className="field"><span>Área [m²]</span>
              <input type="number" value={form.gridAreaM2} onChange={(e) => set({ gridAreaM2: Number(e.target.value) })} /></label>
            <label className="field"><span>Profund. [m]</span>
              <input type="number" step="0.1" value={form.gridDepthM} onChange={(e) => set({ gridDepthM: Number(e.target.value) })} /></label>
          </>
        )}

        <label className="field"><span>Corrente Ig [A]</span>
          <input type="number" value={form.faultCurrentA} onChange={(e) => set({ faultCurrentA: Number(e.target.value) })} /></label>
        <label className="field"><span>Tempo falta [s]</span>
          <input type="number" step="0.1" value={form.faultClearingS} onChange={(e) => set({ faultClearingS: Number(e.target.value) })} /></label>
        <label className="field"><span>Peso [kg]</span>
          <select value={form.bodyWeightKg} onChange={(e) => set({ bodyWeightKg: Number(e.target.value) as 50 | 70 })}>
            <option value={70}>70</option>
            <option value={50}>50</option>
          </select></label>
        <label className="field"><span>ρ brita [Ω·m]</span>
          <input type="number" value={form.surfaceLayerResistivity} onChange={(e) => set({ surfaceLayerResistivity: Number(e.target.value) })} /></label>
        <label className="field"><span>Esp. brita [m]</span>
          <input type="number" step="0.05" value={form.surfaceLayerThicknessM} onChange={(e) => set({ surfaceLayerThicknessM: Number(e.target.value) })} /></label>
      </div>
      <div className="project-actions"><button type="button" onClick={calc}>Calcular aterramento</button></div>

      {res && (
        <div className="result-mini">
          <p>
            Rg = <strong>{res.electrodeResistanceOhm} Ω</strong> · GPR = <strong>{res.gprVolts} V</strong>{" "}
            <span className={`status status-${res.status}`}>{res.status === "ok" ? "✅" : "⚠️"}</span>
          </p>
          <p className="muted">
            ρ = {res.soilResistivityOhmM} Ω·m · Cs = {res.surfaceDerateCs} · toque tol. = {res.tolerableTouchV} V · passo tol. = {res.tolerableStepV} V
          </p>
          {res.warnings.map((w) => <p key={w.code} className="muted">⚠️ {w.message}</p>)}
        </div>
      )}
    </section>
  );
}

function SpdaCard({ onError, onResult }: { onError: (m: string | null) => void; onResult: ResultPatch }) {
  const [form, setForm] = useState<SpdaInput>({ protectionLevel: "II", firstStrokeCurrentKA: 10 });
  const [res, setRes] = useState<SpdaResult | null>(null);

  async function calc() {
    onError(null);
    try {
      const r = await analyzeSpda(form);
      setRes(r);
      onResult({ spda: r });
    } catch (e) {
      setRes(null);
      onError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <section className="card">
      <h3>SPDA — parâmetros por nível de proteção</h3>
      <div className="grid">
        <label className="field"><span>Nível de proteção</span>
          <select value={form.protectionLevel} onChange={(e) => setForm((f) => ({ ...f, protectionLevel: e.target.value as SpdaInput["protectionLevel"] }))}>
            <option value="I">NP I</option>
            <option value="II">NP II</option>
            <option value="III">NP III</option>
            <option value="IV">NP IV</option>
          </select></label>
        <label className="field"><span>Corrente 1ª descarga [kA]</span>
          <input type="number" value={form.firstStrokeCurrentKA} onChange={(e) => setForm((f) => ({ ...f, firstStrokeCurrentKA: Number(e.target.value) }))} /></label>
      </div>
      <div className="project-actions"><button type="button" onClick={calc}>Obter parâmetros</button></div>

      {res && (
        <div className="result-mini">
          <p>Esfera rolante: <strong>{res.rollingSphereRadiusM} m</strong> · malha: <strong>{res.meshSizeM} m</strong> · descidas: <strong>{res.downConductorSpacingM} m</strong></p>
          {res.rollingSphereFromCurrentM != null && (
            <p className="muted">Esfera pelo modelo eletrogeométrico (r = 10·I^0,65): {res.rollingSphereFromCurrentM} m</p>
          )}
        </div>
      )}
    </section>
  );
}
