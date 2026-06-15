import type { ProjectMeta } from "@core/index";

interface Props {
  name: string;
  projects: ProjectMeta[];
  currentId: string | null;
  dirty: boolean;
  evaluating: boolean;
  onNameChange: (name: string) => void;
  onNew: () => void;
  onSave: () => void;
  onLoad: (id: string) => void;
  onDelete: () => void;
  onEvaluate: () => void;
  onExport: () => void;
  onImport: (file: File) => void;
}

export function ProjectBar({
  name,
  projects,
  currentId,
  dirty,
  evaluating,
  onNameChange,
  onNew,
  onSave,
  onLoad,
  onDelete,
  onEvaluate,
  onExport,
  onImport,
}: Props) {
  return (
    <div className="project-bar card">
      <div className="project-row">
        <label className="field grow">
          <span>Projeto {dirty && <em className="muted">• não salvo</em>}</span>
          <input value={name} onChange={(e) => onNameChange(e.target.value)} placeholder="Nome do projeto" />
        </label>

        <label className="field">
          <span>Abrir</span>
          <select value={currentId ?? ""} onChange={(e) => e.target.value && onLoad(e.target.value)}>
            <option value="">— salvos ({projects.length}) —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {new Date(p.updatedAt).toLocaleString()}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="project-actions">
        <button type="button" onClick={onNew}>Novo</button>
        <button type="button" onClick={onSave}>Salvar</button>
        <button type="button" className="ghost" onClick={onDelete} disabled={!currentId}>Excluir</button>
        <button type="button" className="ghost" onClick={onExport}>Exportar</button>
        <label className="ghost import-btn">
          Importar
          <input
            type="file"
            accept="application/json,.json"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onImport(f);
              e.target.value = "";
            }}
          />
        </label>
        <button type="button" className="primary" onClick={onEvaluate} disabled={evaluating}>
          {evaluating ? "Avaliando…" : "▶ Avaliar circuito completo"}
        </button>
      </div>
    </div>
  );
}
