import { useState } from "react";
import {
  buildMemorial,
  type CableSizingResult,
  type ComplianceStatus,
  type SelectivityResult,
  type ShortCircuitResult,
} from "@core/index";

interface Props {
  projectName: string;
  shortCircuit: ShortCircuitResult | null;
  protection: SelectivityResult | null;
  cable: CableSizingResult | null;
}

const badge: Record<ComplianceStatus, string> = { ok: "✅ Conforme", warning: "⚠️ Com ressalvas", fail: "❌ Não conforme" };

export function MemorialView({ projectName, shortCircuit, protection, cable }: Props) {
  const [engineer, setEngineer] = useState("");
  const [title, setTitle] = useState("");
  const [crea, setCrea] = useState("");
  const [art, setArt] = useState("");

  const hasAny = shortCircuit || protection || cable;
  if (!hasAny) {
    return (
      <div className="card">
        <p className="muted">
          Nenhum resultado para documentar ainda. Calcule os módulos 1–3 (ou use
          <strong> Avaliar circuito completo</strong>) e volte a esta aba para gerar o memorial.
        </p>
      </div>
    );
  }

  const doc = buildMemorial(projectName, { shortCircuit, protection, cable });

  return (
    <>
      <div className="card no-print">
        <h3>Dados do responsável técnico</h3>
        <div className="grid">
          <label className="field"><span>Engenheiro responsável</span><input value={engineer} onChange={(e) => setEngineer(e.target.value)} /></label>
          <label className="field"><span>Título profissional</span><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Eng. Eletricista" /></label>
          <label className="field"><span>CREA</span><input value={crea} onChange={(e) => setCrea(e.target.value)} /></label>
          <label className="field"><span>ART/RRT</span><input value={art} onChange={(e) => setArt(e.target.value)} /></label>
        </div>
        <div className="project-actions">
          <button type="button" className="primary" onClick={() => window.print()}>🖨 Imprimir / Salvar PDF</button>
        </div>
      </div>

      <article className="memorial">
        <header className="memorial-head">
          <h1>Memorial de Cálculo Elétrico</h1>
          <p className="memorial-project">{doc.projectName}</p>
          <table className="memorial-meta">
            <tbody>
              <tr><th>Responsável técnico</th><td>{engineer || "—"}{title ? `, ${title}` : ""}</td>
                  <th>CREA</th><td>{crea || "—"}</td></tr>
              <tr><th>ART/RRT</th><td>{art || "—"}</td>
                  <th>Emitido em</th><td>{new Date(doc.generatedAt).toLocaleString("pt-BR")}</td></tr>
              <tr><th>Motor de cálculo</th><td>v{doc.engineVersion}</td>
                  <th>Conformidade geral</th><td>{badge[doc.overallCompliance]}</td></tr>
            </tbody>
          </table>
        </header>

        {doc.sections.map((s, i) => (
          <section className="memorial-section" key={s.id}>
            <h2>{i + 1}. {s.title}</h2>
            <p className="memorial-norm">Norma de referência: <strong>{s.norm}</strong>{s.compliance ? ` · ${badge[s.compliance]}` : ""}</p>

            <table className="memorial-table">
              <tbody>
                {s.summary.map((kv, k) => (
                  <tr key={k}><th>{kv.label}</th><td>{kv.value}</td></tr>
                ))}
              </tbody>
            </table>

            <h3>Memória de cálculo</h3>
            <table className="memorial-table steps">
              <thead><tr><th>#</th><th>Passo</th><th>Fórmula</th><th>Resultado</th><th>Referência</th></tr></thead>
              <tbody>
                {s.steps.map((st) => (
                  <tr key={st.id}>
                    <td>{st.id}</td><td>{st.label}</td><td className="mono">{st.formula}</td>
                    <td className="mono">{Number.isFinite(st.result) ? round3(st.result) : "—"} {st.unit}</td>
                    <td>{st.normRef}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {s.warnings.length > 0 && (
              <ul className="memorial-warnings">
                {s.warnings.map((w) => <li key={w.code}>⚠️ {w.message}</li>)}
              </ul>
            )}

            <p className="memorial-trace">ID: {s.traceId} · hash SHA-256: {s.inputHash}</p>
          </section>
        ))}

        <footer className="memorial-foot">
          <p>
            Este memorial foi gerado por ferramenta de apoio ao projeto e <strong>não substitui a
            responsabilidade técnica do engenheiro habilitado</strong>. Os valores e a conformidade aqui
            apresentados devem ser conferidos e validados pelo responsável técnico, que assume a
            anotação de responsabilidade (ART/RRT) correspondente.
          </p>
          <div className="memorial-sign">
            <div>______________________________________</div>
            <div>{engineer || "Engenheiro responsável"}{title ? `, ${title}` : ""}</div>
            <div>{crea ? `CREA ${crea}` : ""}{art ? ` · ART ${art}` : ""}</div>
          </div>
        </footer>
      </article>
    </>
  );
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}
