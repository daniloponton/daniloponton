import { useState } from "react";
import {
  buildSingleLine,
  type CableSizingInput,
  type Circuit,
  type CircuitResults,
  type RelayCurveType,
  type SelectivityInput,
  type ShortCircuitInput,
} from "@core/index";
import { SingleLineDiagram } from "./SingleLineDiagram";

type ElementKind = ReturnType<typeof buildSingleLine>[number]["kind"];

interface Props {
  circuit: Circuit;
  results: CircuitResults;
  evaluating: boolean;
  onChange: (updater: (c: Circuit) => Circuit) => void;
  onEvaluate: () => void;
}

export function CircuitEditor({ circuit, results, evaluating, onChange, onEvaluate }: Props) {
  const [selected, setSelected] = useState<ElementKind | null>("cable");
  const elements = buildSingleLine(circuit, results);

  return (
    <div className="editor-grid">
      <div className="card">
        <p className="editor-hint">
          Monte o circuito clicando nos elementos do unifilar; depois clique em
          “Avaliar circuito completo” para calcular curto → proteção → cabo e ver a
          conformidade. O memorial e a matriz de conformidade saem na aba Memorial.
        </p>
        <div className="flow" aria-label="Fluxo sugerido de cálculo">
          <span className="flow-step">Concessionária / Trafo</span>
          <span className="flow-sep">→</span>
          <span className="flow-step">Curto-circuito (I″k)</span>
          <span className="flow-sep">→</span>
          <span className="flow-step">Proteção</span>
          <span className="flow-sep">→</span>
          <span className="flow-step">Cabo</span>
          <span className="flow-sep">→</span>
          <span className="flow-step">Memorial</span>
        </div>
        <div className="project-actions" style={{ margin: "0.8rem 0 0.5rem" }}>
          <button type="button" className="primary" onClick={onEvaluate} disabled={evaluating}>
            {evaluating ? "Avaliando…" : "▶ Avaliar circuito completo"}
          </button>
        </div>
        <div className="editor-diagram">
          <SingleLineDiagram elements={elements} onSelect={setSelected} selected={selected} />
        </div>
        <p className="muted" style={{ fontSize: "0.8rem" }}>Clique em um elemento para editar seus parâmetros.</p>
        <div className="sld-legend">
          <span><span className="dot" style={{ background: "#2e7d32" }} />Conforme</span>
          <span><span className="dot" style={{ background: "#b26a00" }} />Com ressalvas</span>
          <span><span className="dot" style={{ background: "#c62828" }} />Não conforme</span>
          <span><span className="dot" style={{ background: "#111", border: "1px solid #555" }} />Sem avaliação</span>
        </div>
      </div>

      <div className="card">
        <ElementEditor selected={selected} circuit={circuit} onChange={onChange} />
      </div>
    </div>
  );
}

function ElementEditor({
  selected,
  circuit,
  onChange,
}: {
  selected: ElementKind | null;
  circuit: Circuit;
  onChange: Props["onChange"];
}) {
  if (!selected) return <p className="muted">Selecione um elemento no diagrama.</p>;

  const sc = circuit.shortCircuit;
  const prot = circuit.protection;
  const cable = circuit.cable;

  const setSc = (patch: Partial<ShortCircuitInput>) =>
    onChange((c) => (c.shortCircuit ? { ...c, shortCircuit: { ...c.shortCircuit, ...patch } } : c));
  const setFeeder = (patch: Partial<ShortCircuitInput["feeder"]>) =>
    onChange((c) => (c.shortCircuit ? { ...c, shortCircuit: { ...c.shortCircuit, feeder: { ...c.shortCircuit.feeder, ...patch } } } : c));
  const setTx = (patch: Partial<NonNullable<ShortCircuitInput["transformer"]>>) =>
    onChange((c) =>
      c.shortCircuit?.transformer
        ? { ...c, shortCircuit: { ...c.shortCircuit, transformer: { ...c.shortCircuit.transformer, ...patch } } }
        : c,
    );
  const setProt = (patch: Partial<SelectivityInput>) =>
    onChange((c) => (c.protection ? { ...c, protection: { ...c.protection, ...patch } } : c));
  const setProtDown = (patch: { pickupA?: number; tms?: number; curve?: RelayCurveType }) =>
    onChange((c) => {
      if (!c.protection) return c;
      const stages = c.protection.downstream.stages.map((s) =>
        s.kind === "inverse" ? { ...s, ...patch } : s,
      );
      return { ...c, protection: { ...c.protection, downstream: { ...c.protection.downstream, stages } } };
    });
  const setCable = (patch: Partial<CableSizingInput>) =>
    onChange((c) => (c.cable ? { ...c, cable: { ...c.cable, ...patch } } : c));

  switch (selected) {
    case "utility":
      if (!sc) return <Missing what="curto-circuito" />;
      return (
        <>
          <h3>Concessionária</h3>
          <div className="grid">
            <Num label="S″k [MVA]" value={sc.feeder.skMVA} onChange={(v) => setFeeder({ skMVA: v })} />
            <Num label="Tensão da rede [kV]" value={sc.feeder.unHvKV} step={0.1} onChange={(v) => setFeeder({ unHvKV: v })} />
            <Num label="R/X" value={sc.feeder.rxRatio ?? 0.1} step={0.01} onChange={(v) => setFeeder({ rxRatio: v })} />
          </div>
        </>
      );
    case "transformer":
      if (!sc?.transformer) return <Missing what="transformador" />;
      return (
        <>
          <h3>Transformador</h3>
          <div className="grid">
            <Num label="Potência [kVA]" value={sc.transformer.srKVA} onChange={(v) => setTx({ srKVA: v })} />
            <Num label="ukr [%]" value={sc.transformer.ukrPercent} step={0.1} onChange={(v) => setTx({ ukrPercent: v })} />
            <Num label="Perdas no cobre [kW]" value={sc.transformer.copperLossKW ?? 0} step={0.5} onChange={(v) => setTx({ copperLossKW: v })} />
            <Num label="Tensão LV [V]" value={sc.transformer.unLvV} onChange={(v) => setTx({ unLvV: v })} />
          </div>
        </>
      );
    case "busbar":
      if (!sc) return <Missing what="curto-circuito" />;
      return (
        <>
          <h3>Barramento</h3>
          <div className="grid">
            <Num label="Tensão de falta [V]" value={sc.faultVoltageV} onChange={(v) => setSc({ faultVoltageV: v })} />
          </div>
          <p className="muted">A I″k é calculada no módulo de curto-circuito.</p>
        </>
      );
    case "protection":
      if (!prot) return <Missing what="proteção" />;
      {
        const inv = prot.downstream.stages.find((s) => s.kind === "inverse");
        return (
          <>
            <h3>Proteção (relé de jusante)</h3>
            <div className="grid">
              <Num label="Pickup Is [A]" value={inv?.kind === "inverse" ? inv.pickupA : 100} onChange={(v) => setProtDown({ pickupA: v })} />
              <Num label="TMS" value={inv?.kind === "inverse" ? inv.tms : 0.1} step={0.01} onChange={(v) => setProtDown({ tms: v })} />
              <Sel
                label="Curva"
                value={inv?.kind === "inverse" ? inv.curve : "SI"}
                options={[["SI", "SI"], ["VI", "VI"], ["EI", "EI"], ["LTI", "LTI"]]}
                onChange={(v) => setProtDown({ curve: v as RelayCurveType })}
              />
              <Num label="Margem mín. [s]" value={prot.minMarginS ?? 0.2} step={0.05} onChange={(v) => setProt({ minMarginS: v })} />
            </div>
          </>
        );
      }
    case "cable":
      if (!cable) return <Missing what="cabo" />;
      return (
        <>
          <h3>Condutor</h3>
          <div className="grid">
            <Num label="Corrente Ib [A]" value={cable.ibAmps} onChange={(v) => setCable({ ibAmps: v })} />
            <Num label="Tensão [V]" value={cable.voltageV} onChange={(v) => setCable({ voltageV: v })} />
            <Num label="Comprimento [m]" value={cable.lengthM} onChange={(v) => setCable({ lengthM: v })} />
            <Sel label="Condutor" value={cable.conductor ?? "Cu"} options={[["Cu", "Cobre"], ["Al", "Alumínio"]]} onChange={(v) => setCable({ conductor: v as "Cu" | "Al" })} />
            <Sel label="Isolação" value={cable.insulation} options={[["PVC", "PVC"], ["XLPE", "XLPE/EPR"]]} onChange={(v) => setCable({ insulation: v as "PVC" | "XLPE" })} />
            <Sel label="Método" value={cable.installMethod} options={[["A1", "A1"], ["A2", "A2"], ["B1", "B1"], ["B2", "B2"], ["C", "C"]]} onChange={(v) => setCable({ installMethod: v as CableSizingInput["installMethod"] })} />
          </div>
        </>
      );
    case "load":
      if (!cable) return <Missing what="carga" />;
      return (
        <>
          <h3>Carga</h3>
          <div className="grid">
            <Num label="Corrente Ib [A]" value={cable.ibAmps} onChange={(v) => setCable({ ibAmps: v })} />
            <Num label="Fator de potência" value={cable.cosPhi} step={0.01} onChange={(v) => setCable({ cosPhi: v })} />
          </div>
        </>
      );
  }
}

function Missing({ what }: { what: string }) {
  return <p className="muted">Defina os dados do módulo de {what} para editar este elemento.</p>;
}

function Num({ label, value, step = 1, onChange }: { label: string; value: number; step?: number; onChange: (v: number) => void }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type="number" step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

function Sel({ label, value, options, onChange }: { label: string; value: string; options: [string, string][]; onChange: (v: string) => void }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
      </select>
    </label>
  );
}
