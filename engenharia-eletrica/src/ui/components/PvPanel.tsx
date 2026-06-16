import { useState } from "react";
import {
  sizePvString,
  dcStringVoltageDrop,
  type CircuitResults,
  type PvStringInput,
  type PvStringResult,
  type DcVoltageDropResult,
} from "@core/index";
import { EmptyState } from "./common";

const SECTIONS = [1.5, 2.5, 4, 6, 10, 16, 25, 35];

type ResultPatch = (patch: Partial<CircuitResults>) => void;

interface Props {
  onError: (msg: string | null) => void;
  onResult: ResultPatch;
}

export function PvPanel({ onError, onResult }: Props) {
  return (
    <div className="pq">
      <StringCard onError={onError} onResult={onResult} />
    </div>
  );
}

function StringCard({ onError, onResult }: { onError: (m: string | null) => void; onResult: ResultPatch }) {
  const [form, setForm] = useState<PvStringInput>({
    module: { vocStcV: 49.5, vmpStcV: 41.5, iscStcA: 11.5, impStcA: 10.8, tempCoeffVocPctPerC: -0.27 },
    inverter: { maxDcVoltageV: 1100, mpptMinV: 200, mpptMaxV: 1000, maxInputCurrentA: 26 },
    minCellTempC: -10,
    maxCellTempC: 70,
  });
  const [res, setRes] = useState<PvStringResult | null>(null);
  const [dropSection, setDropSection] = useState(4);
  const [dropLength, setDropLength] = useState(30);
  const [drop, setDrop] = useState<DcVoltageDropResult | null>(null);

  const mod = (patch: Partial<PvStringInput["module"]>) =>
    setForm((f) => ({ ...f, module: { ...f.module, ...patch } }));
  const inv = (patch: Partial<PvStringInput["inverter"]>) =>
    setForm((f) => ({ ...f, inverter: { ...f.inverter, ...patch } }));

  async function calc() {
    onError(null);
    setDrop(null);
    try {
      const r = await sizePvString(form);
      setRes(r);
      onResult({ pvString: r });
    } catch (e) {
      setRes(null);
      onError(e instanceof Error ? e.message : String(e));
    }
  }

  async function calcDrop() {
    if (!res) return;
    onError(null);
    try {
      const stringVoltage = res.recommendedModulesPerString * form.module.vmpStcV;
      setDrop(
        await dcStringVoltageDrop({
          currentA: form.module.impStcA,
          lengthM: dropLength,
          sectionMm2: dropSection,
          stringVoltageV: stringVoltage,
          maxDropPct: 1,
        }),
      );
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <section className="card">
      <h3>Dimensionamento de string fotovoltaica</h3>
      <div className="device-cols">
        <fieldset className="device">
          <legend>Módulo (STC)</legend>
          <label className="field"><span>Voc [V]</span><input type="number" step="0.1" value={form.module.vocStcV} onChange={(e) => mod({ vocStcV: Number(e.target.value) })} /></label>
          <label className="field"><span>Vmp [V]</span><input type="number" step="0.1" value={form.module.vmpStcV} onChange={(e) => mod({ vmpStcV: Number(e.target.value) })} /></label>
          <label className="field"><span>Isc [A]</span><input type="number" step="0.1" value={form.module.iscStcA} onChange={(e) => mod({ iscStcA: Number(e.target.value) })} /></label>
          <label className="field"><span>Imp [A]</span><input type="number" step="0.1" value={form.module.impStcA} onChange={(e) => mod({ impStcA: Number(e.target.value) })} /></label>
          <label className="field"><span>β Voc [%/°C]</span><input type="number" step="0.01" value={form.module.tempCoeffVocPctPerC} onChange={(e) => mod({ tempCoeffVocPctPerC: Number(e.target.value) })} /></label>
        </fieldset>
        <fieldset className="device">
          <legend>Inversor</legend>
          <label className="field"><span>V CC máx [V]</span><input type="number" value={form.inverter.maxDcVoltageV} onChange={(e) => inv({ maxDcVoltageV: Number(e.target.value) })} /></label>
          <label className="field"><span>MPPT mín [V]</span><input type="number" value={form.inverter.mpptMinV} onChange={(e) => inv({ mpptMinV: Number(e.target.value) })} /></label>
          <label className="field"><span>MPPT máx [V]</span><input type="number" value={form.inverter.mpptMaxV} onChange={(e) => inv({ mpptMaxV: Number(e.target.value) })} /></label>
          <label className="field"><span>I entrada máx [A]</span><input type="number" value={form.inverter.maxInputCurrentA} onChange={(e) => inv({ maxInputCurrentA: Number(e.target.value) })} /></label>
        </fieldset>
      </div>
      <div className="grid" style={{ marginTop: "1rem" }}>
        <label className="field"><span>Temp. célula mín [°C]</span><input type="number" value={form.minCellTempC} onChange={(e) => setForm((f) => ({ ...f, minCellTempC: Number(e.target.value) }))} /></label>
        <label className="field"><span>Temp. célula máx [°C]</span><input type="number" value={form.maxCellTempC} onChange={(e) => setForm((f) => ({ ...f, maxCellTempC: Number(e.target.value) }))} /></label>
      </div>
      <div className="project-actions"><button type="button" onClick={calc}>Dimensionar string</button></div>

      {!res && (
        <EmptyState icon="🔆">
          Informe os dados do módulo (STC) e do inversor; o resultado traz o número de
          módulos por string (mín. e recomendado), os limites de tensão na temperatura e a
          queda CC da string.
        </EmptyState>
      )}
      {res && (
        <div className="result-mini">
          <p>
            Módulos por string: <strong>{res.minModulesByMppt} a {res.recommendedModulesPerString}</strong>{" "}
            (recomendado {res.recommendedModulesPerString}) · strings em paralelo: <strong>{res.maxParallelStrings}</strong>{" "}
            <span className={`status status-${res.status}`}>{res.status === "ok" ? "✅" : res.status === "warning" ? "⚠️" : "❌"}</span>
          </p>
          <p className="muted">
            Voc(mín) = {res.vocAtMinTempV} V · Vmp(máx T) = {res.vmpAtMaxTempV} V · Vmp(mín T) = {res.vmpAtMinTempV} V
          </p>
          {res.warnings.map((w) => <p key={w.code} className="muted">⚠️ {w.message}</p>)}

          <div className="grid" style={{ marginTop: "0.8rem" }}>
            <label className="field"><span>Cabo CC — seção [mm²]</span>
              <select value={dropSection} onChange={(e) => setDropSection(Number(e.target.value))}>
                {SECTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select></label>
            <label className="field"><span>Comprimento [m]</span>
              <input type="number" value={dropLength} onChange={(e) => setDropLength(Number(e.target.value))} /></label>
            <div className="field" style={{ justifyContent: "flex-end" }}>
              <button type="button" className="ghost" onClick={calcDrop}>Queda CC da string</button>
            </div>
          </div>
          {drop && (
            <p>
              Queda CC: <strong>{drop.dropPct}%</strong> ({drop.dropV} V){" "}
              <span className={`status status-${drop.status}`}>{drop.status === "ok" ? "✅" : drop.status === "warning" ? "⚠️" : "❌"}</span>
            </p>
          )}
        </div>
      )}
    </section>
  );
}
