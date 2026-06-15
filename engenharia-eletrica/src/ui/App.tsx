import { useEffect, useMemo, useState } from "react";
import {
  calculateCableSizing,
  calculateShortCircuit,
  checkSelectivity,
  createDefaultStore,
  createCircuit,
  createProject,
  evaluateCircuit,
  ENGINE_VERSION,
  type CableSizingInput,
  type CableSizingResult,
  type Circuit,
  type CircuitResults,
  type Project,
  type ProjectMeta,
  type SelectivityInput,
  type SelectivityResult,
  type ShortCircuitInput,
  type ShortCircuitResult,
} from "@core/index";
import { CableSizingForm, cableDefaults } from "./components/CableSizingForm";
import { CalculationReport } from "./components/CalculationReport";
import { ShortCircuitForm, shortCircuitDefaults } from "./components/ShortCircuitForm";
import { ShortCircuitReport } from "./components/ShortCircuitReport";
import { ProtectionForm, protectionDefaultInput } from "./components/ProtectionForm";
import { ProtectionReport } from "./components/ProtectionReport";
import { ProjectBar } from "./components/ProjectBar";
import { PowerQualityPanel } from "./components/PowerQualityPanel";
import { GroundingPanel } from "./components/GroundingPanel";
import { PvPanel } from "./components/PvPanel";
import { MemorialView } from "./components/MemorialView";
import { ArcFlashPanel } from "./components/ArcFlashPanel";
import { CircuitEditor } from "./components/CircuitEditor";

type Tab = "editor" | "cable" | "short_circuit" | "protection" | "arc_flash" | "power_quality" | "grounding" | "pv" | "memorial";

function seedCircuit(): Circuit {
  return {
    ...createCircuit("Circuito 1"),
    shortCircuit: shortCircuitDefaults,
    protection: protectionDefaultInput(),
    cable: cableDefaults,
  };
}

export function App() {
  const store = useMemo(() => createDefaultStore(), []);

  const [tab, setTab] = useState<Tab>("editor");
  const [error, setError] = useState<string | null>(null);

  const [projectName, setProjectName] = useState("Projeto sem título");
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [circuits, setCircuits] = useState<Circuit[]>(() => [seedCircuit()]);
  const [activeId, setActiveId] = useState<string>("");
  const [dirty, setDirty] = useState(false);
  const [loadNonce, setLoadNonce] = useState(0);
  const [evaluating, setEvaluating] = useState(false);

  const [cableResult, setCableResult] = useState<CableSizingResult | null>(null);
  const [scResult, setScResult] = useState<ShortCircuitResult | null>(null);
  const [selResult, setSelResult] = useState<SelectivityResult | null>(null);
  // Resultados dos módulos 4–6 (painéis avulsos), para o memorial.
  const [extraResults, setExtraResults] = useState<Partial<CircuitResults>>({});
  const patchExtra = (patch: Partial<CircuitResults>) =>
    setExtraResults((e) => ({ ...e, ...patch }));

  // Circuito ativo (fallback para o primeiro enquanto não há seleção explícita).
  const circuit = circuits.find((c) => c.id === activeId) ?? circuits[0];

  const resetResults = () => {
    setScResult(null);
    setSelResult(null);
    setCableResult(null);
    setExtraResults({});
  };

  const updateActive = (updater: (c: Circuit) => Circuit) => {
    setCircuits((list) => list.map((c) => (c.id === circuit.id ? updater(c) : c)));
    setDirty(true);
  };

  function selectCircuit(id: string) {
    setActiveId(id);
    resetResults();
    setLoadNonce((n) => n + 1);
  }
  function addCircuit() {
    const nc = { ...seedCircuit(), name: `Circuito ${circuits.length + 1}` };
    setCircuits((list) => [...list, nc]);
    setActiveId(nc.id);
    resetResults();
    setDirty(true);
    setLoadNonce((n) => n + 1);
  }
  function removeActive() {
    if (circuits.length <= 1) return;
    const remaining = circuits.filter((c) => c.id !== circuit.id);
    setCircuits(remaining);
    setActiveId(remaining[0].id);
    resetResults();
    setDirty(true);
    setLoadNonce((n) => n + 1);
  }
  function renameActive(name: string) {
    updateActive((c) => ({ ...c, name }));
  }

  // Ao trocar de aba, re-semeia os formulários a partir do circuito atual,
  // mantendo o editor visual e as abas de módulo em sincronia.
  const goTab = (t: Tab) => {
    setLoadNonce((n) => n + 1);
    setTab(t);
  };

  const refreshList = () => store.list().then(setProjects);
  useEffect(() => {
    refreshList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const linkedIkKA = scResult?.ikSymKA ?? null;
  const linkedClearingS =
    selResult && Number.isFinite(selResult.downstreamClearingAtFaultS)
      ? selResult.downstreamClearingAtFaultS
      : null;

  async function run<T>(fn: () => Promise<T>, set: (v: T | null) => void) {
    setError(null);
    try {
      set(await fn());
    } catch (e) {
      set(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function onSc(input: ShortCircuitInput) {
    updateActive((c) => ({ ...c, shortCircuit: input }));
    run(() => calculateShortCircuit(input), setScResult);
  }
  function onProt(input: SelectivityInput) {
    updateActive((c) => ({ ...c, protection: input }));
    run(() => checkSelectivity(input), setSelResult);
  }
  function onCable(input: CableSizingInput) {
    updateActive((c) => ({ ...c, cable: input }));
    run(() => calculateCableSizing(input), setCableResult);
  }

  async function onEvaluate() {
    setError(null);
    setEvaluating(true);
    try {
      const e = await evaluateCircuit(circuit);
      setScResult(e.shortCircuit);
      setSelResult(e.protection);
      setCableResult(e.cable);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setEvaluating(false);
    }
  }

  function onNew() {
    setCurrentId(null);
    setProjectName("Projeto sem título");
    const seed = seedCircuit();
    setCircuits([seed]);
    setActiveId(seed.id);
    resetResults();
    setDirty(false);
    setLoadNonce((n) => n + 1);
  }

  async function onSave() {
    const existing = currentId ? await store.get(currentId) : null;
    const project: Project = existing
      ? { ...existing, name: projectName, circuits }
      : { ...createProject(projectName), circuits };
    await store.save(project);
    setCurrentId(project.id);
    setDirty(false);
    refreshList();
  }

  async function onLoad(id: string) {
    const p = await store.get(id);
    if (!p) return;
    const cs = p.circuits.length ? p.circuits : [seedCircuit()];
    setCurrentId(p.id);
    setProjectName(p.name);
    setCircuits(cs);
    setActiveId(cs[0].id);
    resetResults();
    setDirty(false);
    setLoadNonce((n) => n + 1);
  }

  async function onDelete() {
    if (!currentId) return;
    await store.remove(currentId);
    onNew();
    refreshList();
  }

  return (
    <div className="app">
      <header className="no-print">
        <h1>Ferramenta de Engenharia Elétrica</h1>
        <p className="subtitle">
          IEC / NBR · motor v{ENGINE_VERSION} · 100% no navegador, determinístico e auditável
        </p>
      </header>

      <ProjectBar
        name={projectName}
        projects={projects}
        currentId={currentId}
        dirty={dirty}
        evaluating={evaluating}
        onNameChange={(n) => { setProjectName(n); setDirty(true); }}
        onNew={onNew}
        onSave={onSave}
        onLoad={onLoad}
        onDelete={onDelete}
        onEvaluate={onEvaluate}
      />

      <div className="card circuit-bar no-print">
        <label className="field">
          <span>Circuito ({circuits.length})</span>
          <select value={circuit.id} onChange={(e) => selectCircuit(e.target.value)}>
            {circuits.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
        <label className="field grow">
          <span>Nome do circuito</span>
          <input value={circuit.name} onChange={(e) => renameActive(e.target.value)} />
        </label>
        <div className="project-actions">
          <button type="button" onClick={addCircuit}>+ Circuito</button>
          <button type="button" className="ghost" onClick={removeActive} disabled={circuits.length <= 1}>
            Remover
          </button>
        </div>
      </div>

      <nav className="tabs no-print">
        <button className={tab === "editor" ? "tab active" : "tab"} onClick={() => goTab("editor")}>
          ◊ Editor (Unifilar)
        </button>
        <button className={tab === "short_circuit" ? "tab active" : "tab"} onClick={() => goTab("short_circuit")}>
          1 · Curto-Circuito (IEC 60909)
        </button>
        <button className={tab === "protection" ? "tab active" : "tab"} onClick={() => goTab("protection")}>
          2 · Proteção & Seletividade
        </button>
        <button className={tab === "arc_flash" ? "tab active" : "tab"} onClick={() => goTab("arc_flash")}>
          3 · Arco Elétrico
        </button>
        <button className={tab === "cable" ? "tab active" : "tab"} onClick={() => goTab("cable")}>
          4 · Dimensionamento de Cabos
        </button>
        <button className={tab === "power_quality" ? "tab active" : "tab"} onClick={() => goTab("power_quality")}>
          5 · Queda de Tensão & FP
        </button>
        <button className={tab === "grounding" ? "tab active" : "tab"} onClick={() => goTab("grounding")}>
          6 · Aterramento & SPDA
        </button>
        <button className={tab === "pv" ? "tab active" : "tab"} onClick={() => goTab("pv")}>
          7 · Fotovoltaico (GD)
        </button>
        <button className={tab === "memorial" ? "tab active" : "tab"} onClick={() => goTab("memorial")}>
          8 · Memorial
        </button>
      </nav>

      <main>
        {error && <div className="error">⚠️ {error}</div>}

        {tab === "editor" && (
          <CircuitEditor
            circuit={circuit}
            results={{ shortCircuit: scResult, protection: selResult, cable: cableResult }}
            evaluating={evaluating}
            onChange={updateActive}
            onEvaluate={onEvaluate}
          />
        )}

        {tab === "short_circuit" && (
          <>
            <ShortCircuitForm key={`sc-${loadNonce}`} initial={circuit.shortCircuit} onCalculate={onSc} />
            {scResult && <ShortCircuitReport result={scResult} />}
          </>
        )}

        {tab === "protection" && (
          <>
            <ProtectionForm key={`pr-${loadNonce}`} initial={circuit.protection} linkedIkKA={linkedIkKA} onCalculate={onProt} />
            {selResult && <ProtectionReport result={selResult} />}
          </>
        )}

        {tab === "cable" && (
          <>
            <CableSizingForm
              key={`cb-${loadNonce}`}
              initial={circuit.cable}
              linkedIkKA={linkedIkKA}
              linkedClearingS={linkedClearingS}
              onCalculate={onCable}
            />
            {cableResult && <CalculationReport result={cableResult} />}
          </>
        )}

        {tab === "arc_flash" && (
          <ArcFlashPanel
            onError={setError}
            onResult={patchExtra}
            linkedIkKA={linkedIkKA}
            linkedClearingS={linkedClearingS}
          />
        )}

        {tab === "power_quality" && (
          <PowerQualityPanel linkedSkMVA={scResult?.skMVA ?? null} onError={setError} onResult={patchExtra} />
        )}

        {tab === "grounding" && (
          <GroundingPanel
            onError={setError}
            onResult={patchExtra}
            linkedIkKA={scResult?.ikSymKA ?? null}
            linkedXR={scResult && scResult.rOverX > 0 ? Math.round((1 / scResult.rOverX) * 100) / 100 : null}
          />
        )}

        {tab === "pv" && <PvPanel onError={setError} onResult={patchExtra} />}

        {tab === "memorial" && (
          <MemorialView projectName={projectName} circuits={circuits} extras={extraResults} />
        )}
      </main>

      <footer className="no-print">
        <p>
          Fluxo sugerido: <strong>1 → 2 → 3</strong>, ou clique em <strong>Avaliar circuito completo</strong> —
          a I"k do curto alimenta a proteção e o cabo, e o tempo de atuação da proteção alimenta a verificação
          térmica do cabo (propagação feita no núcleo de cálculo).
        </p>
        <p>
          Ferramenta de apoio ao projetista. <strong>Não assina projetos</strong> —
          o memorial deve ser validado pelo engenheiro responsável.
        </p>
      </footer>
    </div>
  );
}
