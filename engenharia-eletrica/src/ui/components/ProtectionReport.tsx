import type { SelectivityResult } from "@core/index";
import { TccChart } from "./TccChart";

export function ProtectionReport({ result: r }: { result: SelectivityResult }) {
  return (
    <section className="card report">
      <div className="result-header">
        <div>
          <h2>
            {r.selective ? "Seletivo" : "Não seletivo"}{" "}
            <span className={`status status-${r.selective ? "ok" : "fail"}`}>
              {r.selective ? "✅" : "❌"}
            </span>
          </h2>
          <p className="muted">
            Pior margem: <strong>{fmt(r.worstMarginS)} s</strong> em ~{Math.round(r.worstCurrentA)} A
          </p>
        </div>
        <ul className="summary">
          <li>t jusante (falta) = {fmt(r.downstreamClearingAtFaultS)} s</li>
          <li>t montante (falta) = {fmt(r.upstreamClearingAtFaultS)} s</li>
        </ul>
      </div>

      <TccChart
        faultCurrentA={r.worstCurrentA > 0 ? Math.max(...r.downstreamCurve.map((p) => p.currentA), r.worstCurrentA) : 1000}
        curves={[
          { points: r.downstreamCurve, color: "#2f81f7", label: "Jusante" },
          { points: r.upstreamCurve, color: "#f0883e", label: "Montante" },
        ]}
      />

      {r.warnings.length > 0 && (
        <ul className="warnings">
          {r.warnings.map((w) => (
            <li key={w.code}>⚠️ {w.message}</li>
          ))}
        </ul>
      )}

      <h3>Memorial de cálculo</h3>
      <table className="steps">
        <thead>
          <tr><th>#</th><th>Passo</th><th>Fórmula</th><th>Resultado</th><th>Norma</th></tr>
        </thead>
        <tbody>
          {r.steps.map((s) => (
            <tr key={s.id}>
              <td>{s.id}</td>
              <td>{s.label}</td>
              <td className="mono">{s.formula}</td>
              <td className="mono">{Number.isFinite(s.result) ? fmt(s.result) : "—"} {s.unit}</td>
              <td className="muted">{s.normRef}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <footer className="trace-meta muted">
        <span>ID: {r.traceId}</span> · <span>Motor: v{r.engineVersion}</span> · <span>{r.timestamp}</span>
        <br />
        <span className="hash">hash: {r.inputHash}</span>
      </footer>
    </section>
  );
}

function fmt(v: number): number {
  return Math.round(v * 1000) / 1000;
}
