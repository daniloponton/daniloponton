import { useEffect, useState } from "react";
import {
  buildProjectMemorial,
  evaluateCircuit,
  type Circuit,
  type CircuitResults,
  type ComplianceStatus,
  type MemorialSection,
  type ProjectMemorialDocument,
} from "@core/index";
import { SingleLineDiagram } from "./SingleLineDiagram";

interface Props {
  projectName: string;
  circuits: readonly Circuit[];
  /** Resultados de análises do projeto (arco, FP, aterramento, SPDA, FV). */
  extras: CircuitResults;
}

const badge: Record<ComplianceStatus, string> = {
  ok: "✅ Conforme",
  warning: "⚠️ Com ressalvas",
  fail: "❌ Não conforme",
};

export function MemorialView({ projectName, circuits, extras }: Props) {
  const [engineer, setEngineer] = useState("");
  const [title, setTitle] = useState("");
  const [crea, setCrea] = useState("");
  const [art, setArt] = useState("");
  const [doc, setDoc] = useState<ProjectMemorialDocument | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = await Promise.all(
        circuits.map(async (circuit) => {
          const e = await evaluateCircuit(circuit);
          const results: CircuitResults = {
            shortCircuit: e.shortCircuit,
            protection: e.protection,
            cable: e.cable,
          };
          return { circuit, results };
        }),
      );
      if (!cancelled) setDoc(buildProjectMemorial(projectName, data, extras));
    })();
    return () => {
      cancelled = true;
    };
  }, [projectName, circuits, extras]);

  if (!doc) return <div className="card"><p className="muted">Preparando memorial…</p></div>;

  const hasContent =
    doc.circuits.some((c) => c.sections.length > 0) || doc.projectSections.length > 0;
  if (!hasContent) {
    return (
      <div className="card">
        <p className="muted">
          Nenhum resultado para documentar ainda. Preencha os módulos dos circuitos (ou use
          <strong> Avaliar circuito completo</strong>) e volte aqui.
        </p>
      </div>
    );
  }

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
              <tr><th>Circuitos</th><td>{doc.circuits.length}</td>
                  <th>Análises de projeto</th><td>{doc.projectSections.length}</td></tr>
            </tbody>
          </table>
        </header>

        {doc.circuits.map((group, gi) => (
          <section className="memorial-section" key={gi}>
            <h2>Circuito {gi + 1} — {group.name} · {badge[group.overall]}</h2>
            {group.singleLine.length > 0 && <SingleLineDiagram elements={group.singleLine} />}
            {group.sections.length === 0 && <p className="muted">Sem cálculos para este circuito.</p>}
            {group.sections.map((s) => <SectionBlock key={s.id + s.title} s={s} />)}
          </section>
        ))}

        {doc.projectSections.length > 0 && (
          <section className="memorial-section">
            <h2>Análises do projeto</h2>
            {doc.projectSections.map((s) => <SectionBlock key={s.id + s.title} s={s} />)}
          </section>
        )}

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

function SectionBlock({ s }: { s: MemorialSection }) {
  return (
    <div className="memorial-subsection">
      <h3>{s.title}</h3>
      <p className="memorial-norm">Norma de referência: <strong>{s.norm}</strong>{s.compliance ? ` · ${badge[s.compliance]}` : ""}</p>

      <table className="memorial-table">
        <tbody>
          {s.summary.map((kv, k) => (
            <tr key={k}><th>{kv.label}</th><td>{kv.value}</td></tr>
          ))}
        </tbody>
      </table>

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
    </div>
  );
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}
