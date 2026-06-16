import type { ShortCircuitResult } from "@core/index";

export function ShortCircuitReport({ result: r }: { result: ShortCircuitResult }) {
  return (
    <section className="card report">
      <div className="result-header">
        <div>
          <h2>I"k = {r.ikSymKA} kA</h2>
          <p className="muted">
            Pico ip = {r.ipKA} kA · S"k = {r.skMVA} MVA · c = {r.cFactor}
          </p>
        </div>
        <ul className="summary">
          <li>Rk = {r.rkOhm} Ω</li>
          <li>Xk = {r.xkOhm} Ω</li>
          <li>R/X = {r.rOverX} · κ = {r.kappa}</li>
        </ul>
      </div>

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
          <tr>
            <th>#</th>
            <th>Passo</th>
            <th>Fórmula</th>
            <th>Resultado</th>
            <th>Norma</th>
          </tr>
        </thead>
        <tbody>
          {r.steps.map((s) => (
            <tr key={s.id}>
              <td>{s.id}</td>
              <td>{s.label}</td>
              <td className="mono">{s.formula}</td>
              <td className="mono">
                {Number.isFinite(s.result) ? round3(s.result) : "—"} {s.unit}
              </td>
              <td className="muted">{s.normRef}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <footer className="trace-meta muted">
        <span>ID: {r.traceId}</span> · <span>Motor: v{r.engineVersion}</span> ·{" "}
        <span>{r.timestamp}</span>
        <br />
        <span className="hash">hash: {r.inputHash}</span>
      </footer>
    </section>
  );
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}
