import type { CableSizingResult, ComplianceStatus } from "@core/index";

const badge: Record<ComplianceStatus, string> = {
  ok: "✅",
  warning: "⚠️",
  fail: "❌",
};

const pillLabel: Record<ComplianceStatus, string> = {
  ok: "Conforme",
  warning: "Com ressalvas",
  fail: "Não conforme",
};

function Pill({ status }: { status: ComplianceStatus }) {
  return <span className={`pill pill-${status}`}>{badge[status]} {pillLabel[status]}</span>;
}

export function CalculationReport({ result: r }: { result: CableSizingResult }) {
  return (
    <section className="card report">
      <div className="result-header">
        <div>
          <h2>{r.selectedSectionMm2 ? `${r.selectedSectionMm2} mm²` : "Sem solução"}</h2>
          <p className="muted">
            Critério determinante: <strong>{governingLabel(r.governingCriterion)}</strong>
          </p>
        </div>
        <Pill status={r.overall} />
      </div>

      <div className="stat-grid">
        <div className="stat">
          <span className="stat-label">Capacidade corrigida I′z</span>
          <span className="stat-value">{r.correctedAmpacityA} A</span>
        </div>
        <div className="stat">
          <span className="stat-label">Queda de tensão ΔU</span>
          <span className="stat-value">{r.voltageDropPct}%</span>
        </div>
        {r.minSectionByShortCircuitMm2 > 0 && (
          <div className="stat">
            <span className="stat-label">Seção mín. (curto)</span>
            <span className="stat-value">{r.minSectionByShortCircuitMm2} mm²</span>
          </div>
        )}
      </div>

      <h3>Conformidade</h3>
      <ul className="criteria">
        <Criterion name="Capacidade de condução" {...r.criteria.ampacity} />
        <Criterion name="Queda de tensão" {...r.criteria.voltageDrop} />
        <Criterion name="Curto-circuito (térmico)" {...r.criteria.shortCircuit} />
        <Criterion name="Seção mínima (Tab. 47)" {...r.criteria.minimumSection} />
      </ul>

      {r.warnings.length > 0 && (
        <>
          <h3>Advertências de engenharia</h3>
          <ul className="warnings">
            {r.warnings.map((w) => (
              <li key={w.code}>⚠️ {w.message}</li>
            ))}
          </ul>
        </>
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
        <span>ID: {r.traceId}</span> · <span>Norma: {r.normId}</span> ·{" "}
        <span>Motor: v{r.engineVersion}</span> · <span>{r.timestamp}</span>
        <br />
        <span className="hash">hash: {r.inputHash}</span>
      </footer>
    </section>
  );
}

function Criterion({
  name,
  status,
  detail,
}: {
  name: string;
  status: ComplianceStatus;
  detail: string;
}) {
  return (
    <li>
      <span className={`status status-${status}`}>{badge[status]}</span>
      <strong>{name}:</strong> <span className="muted">{detail}</span>
    </li>
  );
}

function governingLabel(c: CableSizingResult["governingCriterion"]): string {
  return {
    ampacity: "capacidade de condução",
    voltage_drop: "queda de tensão",
    short_circuit: "curto-circuito",
    minimum_section: "seção mínima (mecânica)",
    none: "—",
  }[c];
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}
