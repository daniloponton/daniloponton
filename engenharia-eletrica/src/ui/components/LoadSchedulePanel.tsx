import { useState } from "react";
import {
  analyzeLoadSchedule,
  type CircuitResults,
  type LoadConnection,
  type LoadItemInput,
  type LoadScheduleInput,
  type LoadScheduleResult,
} from "@core/index";

type ResultPatch = (patch: Partial<CircuitResults>) => void;

interface Props {
  onError: (msg: string | null) => void;
  onResult: ResultPatch;
}

const CONNECTIONS: LoadConnection[] = ["L1", "L2", "L3", "L12", "L23", "L31", "L123"];

function defaultLoads(): LoadItemInput[] {
  return [
    { name: "Iluminação", activePowerW: 2500, powerFactor: 1, quantity: 1, demandFactor: 1, connection: "L1" },
    { name: "Tomadas (TUG)", activePowerW: 3000, powerFactor: 0.92, quantity: 1, demandFactor: 1, connection: "L2" },
    { name: "Ar-condicionado", activePowerW: 3500, powerFactor: 0.9, quantity: 1, demandFactor: 1, connection: "L3" },
    { name: "Motor trifásico", activePowerW: 7500, powerFactor: 0.85, quantity: 1, demandFactor: 0.8, connection: "L123" },
  ];
}

export function LoadSchedulePanel({ onError, onResult }: Props) {
  const [lineV, setLineV] = useState(380);
  const [phaseV, setPhaseV] = useState(220);
  const [maxUnbalance, setMaxUnbalance] = useState(15);
  const [loads, setLoads] = useState<LoadItemInput[]>(defaultLoads);
  const [res, setRes] = useState<LoadScheduleResult | null>(null);

  const setLoad = (i: number, patch: Partial<LoadItemInput>) =>
    setLoads((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const addLoad = () =>
    setLoads((ls) => [...ls, { name: `Carga ${ls.length + 1}`, activePowerW: 1000, powerFactor: 0.92, quantity: 1, demandFactor: 1, connection: "L1" }]);
  const removeLoad = (i: number) => setLoads((ls) => (ls.length > 1 ? ls.filter((_, j) => j !== i) : ls));

  async function calc() {
    onError(null);
    try {
      const input: LoadScheduleInput = { lineVoltageV: lineV, phaseVoltageV: phaseV, maxUnbalancePct: maxUnbalance, loads };
      const r = await analyzeLoadSchedule(input);
      setRes(r);
      onResult({ loadSchedule: r });
    } catch (e) {
      setRes(null);
      onError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="pq">
      <section className="card">
        <h3>Quadro de cargas — demanda e equilíbrio de fases (NBR 5410)</h3>
        <div className="grid">
          <label className="field"><span>Tensão de linha V_LL [V]</span>
            <input type="number" value={lineV} onChange={(e) => setLineV(Number(e.target.value))} /></label>
          <label className="field"><span>Tensão de fase V_LN [V]</span>
            <input type="number" value={phaseV} onChange={(e) => setPhaseV(Number(e.target.value))} /></label>
          <label className="field"><span>Desequilíbrio alvo [%]</span>
            <input type="number" value={maxUnbalance} onChange={(e) => setMaxUnbalance(Number(e.target.value))} /></label>
        </div>

        <table className="steps" style={{ marginTop: "1rem" }}>
          <thead>
            <tr>
              <th>Carga</th><th>P [W]</th><th>FP</th><th>Qtd.</th><th>Fd</th><th>Ligação</th><th></th>
            </tr>
          </thead>
          <tbody>
            {loads.map((l, i) => (
              <tr key={i}>
                <td><input value={l.name} onChange={(e) => setLoad(i, { name: e.target.value })} /></td>
                <td><input type="number" value={l.activePowerW} onChange={(e) => setLoad(i, { activePowerW: Number(e.target.value) })} /></td>
                <td><input type="number" step="0.01" value={l.powerFactor ?? 0.92} onChange={(e) => setLoad(i, { powerFactor: Number(e.target.value) })} /></td>
                <td><input type="number" value={l.quantity ?? 1} onChange={(e) => setLoad(i, { quantity: Number(e.target.value) })} /></td>
                <td><input type="number" step="0.05" value={l.demandFactor ?? 1} onChange={(e) => setLoad(i, { demandFactor: Number(e.target.value) })} /></td>
                <td>
                  <select value={l.connection ?? "L123"} onChange={(e) => setLoad(i, { connection: e.target.value as LoadConnection })}>
                    {CONNECTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </td>
                <td><button type="button" className="ghost" onClick={() => removeLoad(i)} disabled={loads.length <= 1}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="project-actions" style={{ marginTop: "0.6rem" }}>
          <button type="button" className="ghost" onClick={addLoad}>+ Carga</button>
          <button type="button" className="primary" onClick={calc}>Calcular quadro</button>
        </div>

        {res && (
          <div className="result-mini">
            <p>
              Demanda: <strong>{res.demandedApparentKVA} kVA</strong> ({res.demandedActiveKW} kW · FP {res.demandPowerFactor}) ·
              corrente <strong>{res.demandCurrentA} A</strong>{" "}
              <span className={`status status-${res.status}`}>{res.status === "ok" ? "✅" : res.status === "warning" ? "⚠️" : "❌"}</span>
            </p>
            <p className="muted">
              Por fase — {res.phaseLoads.map((p) => `${p.phase}: ${p.currentA} A`).join(" · ")} · neutro {res.neutralCurrentA} A ·
              desequilíbrio <strong>{res.phaseUnbalancePct}%</strong>
            </p>
            <p className="muted">Instalada: {res.installedActiveKW} kW</p>
            {res.warnings.map((w) => <p key={w.code} className="muted">⚠️ {w.message}</p>)}
          </div>
        )}
      </section>
    </div>
  );
}
