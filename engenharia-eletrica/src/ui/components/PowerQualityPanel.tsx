import { useState } from "react";
import {
  analyzeMotorStarting,
  calculateVoltageDrop,
  checkHarmonics,
  sizeCapacitorBank,
  sizeDetunedFilter,
  type CapacitorBankResult,
  type CircuitResults,
  type DetunedFilterResult,
  type HarmonicsInput,
  type HarmonicsResult,
  type MotorStartingInput,
  type MotorStartingResult,
  type VoltageDropResult,
} from "@core/index";
import { LinkChips } from "./common";

type ResultPatch = (patch: Partial<CircuitResults>) => void;

const SECTIONS = [1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240];

interface Segment {
  sectionMm2: number;
  lengthM: number;
  currentA: number;
  cosPhi: number;
  label: string;
}

interface Props {
  /** Sk" [MVA] vindo do módulo de curto-circuito, se houver. */
  linkedSkMVA?: number | null;
  /** I"k [kA] vinda do módulo de curto-circuito, se houver. */
  linkedIkKA?: number | null;
  onError: (msg: string | null) => void;
  onResult: ResultPatch;
}

export function PowerQualityPanel({ linkedSkMVA, linkedIkKA, onError, onResult }: Props) {
  return (
    <div className="pq">
      <LinkChips chips={[
        { label: "S″k do curto", value: linkedSkMVA != null ? `${linkedSkMVA} MVA` : null },
        { label: "I″k do curto", value: linkedIkKA != null ? `${linkedIkKA} kA` : null },
      ]} />
      <VoltageDropCard onError={onError} onResult={onResult} />
      <CapacitorCard onError={onError} onResult={onResult} />
      <DetunedFilterCard onError={onError} onResult={onResult} />
      <MotorStartingCard linkedSkMVA={linkedSkMVA} onError={onError} onResult={onResult} />
      <HarmonicsCard linkedIkKA={linkedIkKA} onError={onError} onResult={onResult} />
    </div>
  );
}

function DetunedFilterCard({ onError, onResult }: { onError: (m: string | null) => void; onResult: ResultPatch }) {
  const [v, setV] = useState(380);
  const [kvar, setKvar] = useState(50);
  const [p, setP] = useState(7);
  const [res, setRes] = useState<DetunedFilterResult | null>(null);

  async function calc() {
    onError(null);
    try {
      const r = await sizeDetunedFilter({ systemVoltageV: v, reactivePowerKvar: kvar, detuningFactorPercent: p });
      setRes(r);
      onResult({ detunedFilter: r });
    } catch (e) {
      setRes(null);
      onError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <section className="card">
      <h3>Banco dessintonizado (anti-harmônico)</h3>
      <div className="grid">
        <label className="field"><span>Tensão [V]</span><input type="number" value={v} onChange={(e) => setV(Number(e.target.value))} /></label>
        <label className="field"><span>Qc a entregar [kvar]</span><input type="number" value={kvar} onChange={(e) => setKvar(Number(e.target.value))} /></label>
        <label className="field"><span>Fator de dessintonia p [%]</span><input type="number" step="0.5" value={p} onChange={(e) => setP(Number(e.target.value))} /></label>
      </div>
      <div className="project-actions"><button type="button" onClick={calc}>Dimensionar filtro</button></div>
      {res && (
        <div className="result-mini">
          <p>
            Sintonia: <strong>{res.tuningOrder}ª ({res.tuningFrequencyHz} Hz)</strong>{" "}
            <span className={`status status-${res.status}`}>{res.status === "ok" ? "✅" : res.status === "warning" ? "⚠️" : "❌"}</span>
          </p>
          <p className="muted">Capacitor: {res.capacitorRatedVoltageV} V · {res.capacitorReactiveKvar} kvar · Reator: {res.reactorInductanceMh} mH</p>
          {res.warnings.map((w) => <p key={w.code} className="muted">⚠️ {w.message}</p>)}
        </div>
      )}
    </section>
  );
}

function HarmonicsCard({ linkedIkKA, onError, onResult }: { linkedIkKA?: number | null; onError: (m: string | null) => void; onResult: ResultPatch }) {
  const [voltageKV, setVoltageKV] = useState(0.38);
  const [loadCurrentA, setLoadCurrentA] = useState(200);
  const [iscA, setIscA] = useState(20000);
  const [useLinked, setUseLinked] = useState(false);
  const [vthd, setVthd] = useState(0);
  const [rows, setRows] = useState<{ order: number; currentPercentIL: number }[]>([
    { order: 5, currentPercentIL: 18 },
    { order: 7, currentPercentIL: 12 },
    { order: 11, currentPercentIL: 7 },
    { order: 13, currentPercentIL: 5 },
  ]);
  const [res, setRes] = useState<HarmonicsResult | null>(null);

  const effIscA = useLinked && linkedIkKA ? linkedIkKA * 1000 : iscA;

  function setRow(i: number, patch: Partial<{ order: number; currentPercentIL: number }>) {
    setRows((r) => r.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  }

  async function calc() {
    onError(null);
    try {
      const input: HarmonicsInput = {
        systemVoltageKV: voltageKV,
        iscA: effIscA,
        loadCurrentA,
        harmonics: rows,
        ...(vthd > 0 ? { voltageThdPercent: vthd } : {}),
      };
      const r = await checkHarmonics(input);
      setRes(r);
      onResult({ harmonics: r });
    } catch (e) {
      setRes(null);
      onError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <section className="card">
      <h3>Harmônicas — limites de distorção (IEEE 519)</h3>
      <div className="grid">
        <label className="field"><span>Tensão [kV]</span><input type="number" step="0.01" value={voltageKV} onChange={(e) => setVoltageKV(Number(e.target.value))} /></label>
        <label className="field"><span>Isc [A]</span><input type="number" value={effIscA} disabled={useLinked && !!linkedIkKA} onChange={(e) => setIscA(Number(e.target.value))} /></label>
        <label className="field"><span>IL (demanda) [A]</span><input type="number" value={loadCurrentA} onChange={(e) => setLoadCurrentA(Number(e.target.value))} /></label>
        <label className="field"><span>THD tensão [%] (opc.)</span><input type="number" step="0.5" value={vthd} onChange={(e) => setVthd(Number(e.target.value))} /></label>
        {linkedIkKA != null && (
          <label className="field check"><span>Usar I"k do curto</span>
            <input type="checkbox" checked={useLinked} onChange={(e) => setUseLinked(e.target.checked)} />
            <small className="muted">{linkedIkKA} kA</small></label>
        )}
      </div>
      <table className="steps">
        <thead><tr><th>Ordem h</th><th>Ih [% de IL]</th><th></th></tr></thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              <td><input type="number" value={row.order} onChange={(e) => setRow(i, { order: Number(e.target.value) })} /></td>
              <td><input type="number" step="0.1" value={row.currentPercentIL} onChange={(e) => setRow(i, { currentPercentIL: Number(e.target.value) })} /></td>
              <td><button type="button" className="ghost" onClick={() => setRows((r) => r.filter((_, idx) => idx !== i))}>×</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="project-actions">
        <button type="button" className="ghost" onClick={() => setRows((r) => [...r, { order: 3, currentPercentIL: 0 }])}>+ ordem</button>
        <button type="button" onClick={calc}>Verificar IEEE 519</button>
      </div>
      {res && (
        <div className="result-mini">
          <p>
            TDD: <strong>{res.tddPercent}%</strong> (limite {res.tddLimitPercent}% · Isc/IL = {res.shortCircuitRatio}){" "}
            <span className={`status status-${res.status}`}>{res.status === "ok" ? "✅" : "❌"}</span>
          </p>
          <p className="muted">
            Ordens fora do limite: {res.perHarmonic.filter((h) => !h.ok).map((h) => h.order).join(", ") || "nenhuma"}
            {res.voltageThdPercent != null ? ` · THD tensão ${res.voltageThdPercent}% (lim. ${res.voltageThdLimitPercent}%)` : ""}
          </p>
        </div>
      )}
    </section>
  );
}

/* ───────────────────────── Queda de tensão (alimentador) ───────────────── */
function VoltageDropCard({ onError, onResult }: { onError: (m: string | null) => void; onResult: ResultPatch }) {
  const [baseV, setBaseV] = useState(380);
  const [maxPct, setMaxPct] = useState(4);
  const [segs, setSegs] = useState<Segment[]>([
    { sectionMm2: 35, lengthM: 100, currentA: 80, cosPhi: 0.9, label: "Tronco" },
    { sectionMm2: 16, lengthM: 50, currentA: 40, cosPhi: 0.9, label: "Ramal" },
  ]);
  const [res, setRes] = useState<VoltageDropResult | null>(null);

  function setSeg(i: number, patch: Partial<Segment>) {
    setSegs((s) => s.map((seg, idx) => (idx === i ? { ...seg, ...patch } : seg)));
  }

  async function calc() {
    onError(null);
    try {
      const r = await calculateVoltageDrop({ system: "three", baseVoltageV: baseV, maxVoltageDropPct: maxPct, segments: segs });
      setRes(r);
      onResult({ voltageDrop: r });
    } catch (e) {
      setRes(null);
      onError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <section className="card">
      <h3>Queda de tensão — alimentador multi-trecho</h3>
      <div className="grid">
        <label className="field"><span>Tensão base [V]</span>
          <input type="number" value={baseV} onChange={(e) => setBaseV(Number(e.target.value))} /></label>
        <label className="field"><span>Limite [%]</span>
          <input type="number" step="0.5" value={maxPct} onChange={(e) => setMaxPct(Number(e.target.value))} /></label>
      </div>

      <table className="steps">
        <thead><tr><th>Trecho</th><th>Seção [mm²]</th><th>L [m]</th><th>I [A]</th><th>cosφ</th><th></th></tr></thead>
        <tbody>
          {segs.map((s, i) => (
            <tr key={i}>
              <td><input value={s.label} onChange={(e) => setSeg(i, { label: e.target.value })} /></td>
              <td>
                <select value={s.sectionMm2} onChange={(e) => setSeg(i, { sectionMm2: Number(e.target.value) })}>
                  {SECTIONS.map((sec) => <option key={sec} value={sec}>{sec}</option>)}
                </select>
              </td>
              <td><input type="number" value={s.lengthM} onChange={(e) => setSeg(i, { lengthM: Number(e.target.value) })} /></td>
              <td><input type="number" value={s.currentA} onChange={(e) => setSeg(i, { currentA: Number(e.target.value) })} /></td>
              <td><input type="number" step="0.01" value={s.cosPhi} onChange={(e) => setSeg(i, { cosPhi: Number(e.target.value) })} /></td>
              <td><button type="button" className="ghost" onClick={() => setSegs((x) => x.filter((_, idx) => idx !== i))}>×</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="project-actions">
        <button type="button" className="ghost" onClick={() => setSegs((s) => [...s, { sectionMm2: 16, lengthM: 50, currentA: 30, cosPhi: 0.9, label: "" }])}>+ trecho</button>
        <button type="button" onClick={calc}>Calcular queda</button>
      </div>

      {res && (
        <div className="result-mini">
          <p>
            Queda total: <strong>{res.totalDropPct}%</strong>{" "}
            <span className={`status status-${res.status}`}>{res.status === "ok" ? "✅" : res.status === "warning" ? "⚠️" : "❌"}</span>
          </p>
          <table className="steps">
            <thead><tr><th>Nó</th><th>ΔU trecho [V]</th><th>ΔU acum. [V]</th><th>ΔU acum. [%]</th><th>U no nó [V]</th></tr></thead>
            <tbody>
              {res.nodes.map((n, i) => (
                <tr key={i}><td>{n.label}</td><td>{n.segmentDropV}</td><td>{n.cumulativeDropV}</td><td>{n.cumulativeDropPct}</td><td>{n.voltageAtNodeV}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/* ───────────────────────── Banco de capacitores ────────────────────────── */
function CapacitorCard({ onError, onResult }: { onError: (m: string | null) => void; onResult: ResultPatch }) {
  const [p, setP] = useState(100);
  const [cos1, setCos1] = useState(0.8);
  const [cos2, setCos2] = useState(0.95);
  const [v, setV] = useState(380);
  const [res, setRes] = useState<CapacitorBankResult | null>(null);

  async function calc() {
    onError(null);
    try {
      const r = await sizeCapacitorBank({ activePowerKW: p, currentCosPhi: cos1, targetCosPhi: cos2, voltageV: v });
      setRes(r);
      onResult({ capacitorBank: r });
    } catch (e) {
      setRes(null);
      onError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <section className="card">
      <h3>Correção de fator de potência</h3>
      <div className="grid">
        <label className="field"><span>P [kW]</span><input type="number" value={p} onChange={(e) => setP(Number(e.target.value))} /></label>
        <label className="field"><span>cosφ atual</span><input type="number" step="0.01" value={cos1} onChange={(e) => setCos1(Number(e.target.value))} /></label>
        <label className="field"><span>cosφ desejado</span><input type="number" step="0.01" value={cos2} onChange={(e) => setCos2(Number(e.target.value))} /></label>
        <label className="field"><span>Tensão [V]</span><input type="number" value={v} onChange={(e) => setV(Number(e.target.value))} /></label>
      </div>
      <div className="project-actions"><button type="button" onClick={calc}>Dimensionar banco</button></div>
      {res && (
        <div className="result-mini">
          <p>Banco necessário: <strong>{res.requiredKvar} kvar</strong> · recomendado comercial: <strong>{res.recommendedKvar} kvar</strong></p>
          <p className="muted">S: {res.apparentBeforeKVA} → {res.apparentAfterKVA} kVA · corrente: {res.currentBeforeA} → {res.currentAfterA} A (−{res.currentReductionPct}%)</p>
          {res.warnings.map((w) => <p key={w.code} className="muted">⚠️ {w.message}</p>)}
        </div>
      )}
    </section>
  );
}

/* ───────────────────────── Partida de motores ──────────────────────────── */
function MotorStartingCard({ linkedSkMVA, onError, onResult }: { linkedSkMVA?: number | null; onError: (m: string | null) => void; onResult: ResultPatch }) {
  const [form, setForm] = useState<MotorStartingInput>({
    motorPowerKW: 75, voltageV: 380, efficiency: 0.93, cosPhi: 0.86,
    lockedRotorRatio: 7, startingCosPhi: 0.3, startMethod: "DOL",
    sourceShortCircuitMVA: 8, maxVoltageDipPct: 10,
  });
  const [useLinked, setUseLinked] = useState(false);
  const [res, setRes] = useState<MotorStartingResult | null>(null);

  const skMVA = useLinked && linkedSkMVA ? linkedSkMVA : form.sourceShortCircuitMVA;
  const set = (patch: Partial<MotorStartingInput>) => setForm((f) => ({ ...f, ...patch }));

  async function calc() {
    onError(null);
    try {
      const r = await analyzeMotorStarting({ ...form, sourceShortCircuitMVA: skMVA });
      setRes(r);
      onResult({ motorStarting: r });
    } catch (e) {
      setRes(null);
      onError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <section className="card">
      <h3>Partida de motor — afundamento de tensão</h3>
      <div className="grid">
        <label className="field"><span>Potência [kW]</span><input type="number" value={form.motorPowerKW} onChange={(e) => set({ motorPowerKW: Number(e.target.value) })} /></label>
        <label className="field"><span>Tensão [V]</span><input type="number" value={form.voltageV} onChange={(e) => set({ voltageV: Number(e.target.value) })} /></label>
        <label className="field"><span>Ip/In</span><input type="number" step="0.5" value={form.lockedRotorRatio} onChange={(e) => set({ lockedRotorRatio: Number(e.target.value) })} /></label>
        <label className="field"><span>Método</span>
          <select value={form.startMethod} onChange={(e) => set({ startMethod: e.target.value as MotorStartingInput["startMethod"] })}>
            <option value="DOL">Direta (DOL)</option>
            <option value="star_delta">Estrela-triângulo</option>
            <option value="autotransformer">Autotransformador</option>
            <option value="soft_starter">Soft-starter</option>
            <option value="vfd">Inversor (VFD)</option>
          </select>
        </label>
        <label className="field"><span>Sk" fonte [MVA]</span>
          <input type="number" value={skMVA} disabled={useLinked && !!linkedSkMVA} onChange={(e) => set({ sourceShortCircuitMVA: Number(e.target.value) })} /></label>
        <label className="field"><span>Afund. máx. [%]</span><input type="number" value={form.maxVoltageDipPct} onChange={(e) => set({ maxVoltageDipPct: Number(e.target.value) })} /></label>
        {linkedSkMVA != null && (
          <label className="field check"><span>Usar Sk" do curto</span>
            <input type="checkbox" checked={useLinked} onChange={(e) => setUseLinked(e.target.checked)} />
            <small className="muted">{linkedSkMVA} MVA</small></label>
        )}
      </div>
      <div className="project-actions"><button type="button" onClick={calc}>Analisar partida</button></div>
      {res && (
        <div className="result-mini">
          <p>
            Afundamento: <strong>{res.voltageDipPct}%</strong> (residual {res.residualVoltagePct}%){" "}
            <span className={`status status-${res.status}`}>{res.status === "ok" ? "✅" : res.status === "warning" ? "⚠️" : "❌"}</span>
          </p>
          <p className="muted">In = {res.ratedCurrentA} A · I partida = {res.startingCurrentA} A · torque rel. = {res.startingTorqueFactor}× (DOL)</p>
          {res.warnings.map((w) => <p key={w.code} className="muted">⚠️ {w.message}</p>)}
        </div>
      )}
    </section>
  );
}
