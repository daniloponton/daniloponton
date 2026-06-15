import { useState } from "react";
import {
  analyzeArcFlash,
  type ArcFlashInput,
  type ArcFlashResult,
  type CircuitResults,
} from "@core/index";

type ResultPatch = (patch: Partial<CircuitResults>) => void;

interface Props {
  onError: (msg: string | null) => void;
  onResult: ResultPatch;
  /** I"k [kA] do curto-circuito e tempo de atuação [s] da proteção. */
  linkedIkKA?: number | null;
  linkedClearingS?: number | null;
}

export function ArcFlashPanel({ onError, onResult, linkedIkKA, linkedClearingS }: Props) {
  const [form, setForm] = useState<ArcFlashInput>({
    systemVoltageKV: 0.48,
    boltedFaultKA: 20,
    electrodeConfig: "VCB",
    gapMm: 32,
    workingDistanceMm: 457.2,
    enclosureWidthMm: 508,
    enclosureHeightMm: 508,
    enclosureDepthMm: 508,
    arcDurationS: 0.2,
  });
  const [useLinked, setUseLinked] = useState(false);
  const [res, setRes] = useState<ArcFlashResult | null>(null);
  const set = (patch: Partial<ArcFlashInput>) => setForm((f) => ({ ...f, ...patch }));

  const ikKA = useLinked && linkedIkKA ? linkedIkKA : form.boltedFaultKA;
  const tS = useLinked && linkedClearingS ? linkedClearingS : form.arcDurationS;

  async function calc() {
    onError(null);
    try {
      const r = await analyzeArcFlash({ ...form, boltedFaultKA: ikKA, arcDurationS: tS });
      setRes(r);
      onResult({ arcFlash: r });
    } catch (e) {
      setRes(null);
      onError(e instanceof Error ? e.message : String(e));
    }
  }

  const hasLinks = linkedIkKA != null || linkedClearingS != null;

  return (
    <div className="pq">
      <section className="card">
        <h3>Arco elétrico — energia incidente e EPI (IEEE 1584-2018)</h3>
        <div className="grid">
          <label className="field"><span>Tensão Voc [kV]</span>
            <input type="number" step="0.01" value={form.systemVoltageKV} onChange={(e) => set({ systemVoltageKV: Number(e.target.value) })} /></label>
          <label className="field"><span>Ibf (curto) [kA]</span>
            <input type="number" step="0.1" value={ikKA} disabled={useLinked && !!linkedIkKA} onChange={(e) => set({ boltedFaultKA: Number(e.target.value) })} /></label>
          <label className="field"><span>Tempo de arco [s]</span>
            <input type="number" step="0.05" value={tS} disabled={useLinked && !!linkedClearingS} onChange={(e) => set({ arcDurationS: Number(e.target.value) })} /></label>
          <label className="field"><span>Configuração de eletrodos</span>
            <select value={form.electrodeConfig} onChange={(e) => set({ electrodeConfig: e.target.value as ArcFlashInput["electrodeConfig"] })}>
              <option value="VCB">VCB — vertical em caixa</option>
              <option value="VCBB">VCBB — vertical em caixa c/ barreira</option>
              <option value="HCB">HCB — horizontal em caixa</option>
              <option value="VOA">VOA — vertical ar aberto</option>
              <option value="HOA">HOA — horizontal ar aberto</option>
            </select></label>
          <label className="field"><span>Gap eletrodos [mm]</span>
            <input type="number" value={form.gapMm} onChange={(e) => set({ gapMm: Number(e.target.value) })} /></label>
          <label className="field"><span>Distância de trabalho [mm]</span>
            <input type="number" value={form.workingDistanceMm} onChange={(e) => set({ workingDistanceMm: Number(e.target.value) })} /></label>
          <label className="field"><span>Invólucro — largura [mm]</span>
            <input type="number" value={form.enclosureWidthMm} onChange={(e) => set({ enclosureWidthMm: Number(e.target.value) })} /></label>
          <label className="field"><span>Invólucro — altura [mm]</span>
            <input type="number" value={form.enclosureHeightMm} onChange={(e) => set({ enclosureHeightMm: Number(e.target.value) })} /></label>
          <label className="field"><span>Invólucro — profundidade [mm]</span>
            <input type="number" value={form.enclosureDepthMm} onChange={(e) => set({ enclosureDepthMm: Number(e.target.value) })} /></label>
          {hasLinks && (
            <label className="field check"><span>Usar curto + proteção</span>
              <input type="checkbox" checked={useLinked} onChange={(e) => setUseLinked(e.target.checked)} />
              <small className="muted">{linkedIkKA != null ? `I"k=${linkedIkKA} kA` : ""}{linkedClearingS != null ? ` · t=${linkedClearingS} s` : ""}</small></label>
          )}
        </div>
        <div className="project-actions"><button type="button" onClick={calc}>Analisar arco elétrico</button></div>

        {res && (
          <div className="result-mini">
            <p>
              Energia incidente: <strong>{res.incidentEnergyCalCm2} cal/cm²</strong>{" "}
              <span className={`status status-${res.status}`}>{res.status === "ok" ? "✅" : res.status === "warning" ? "⚠️" : "❌"}</span>
            </p>
            <p className="muted">I″arc = {res.arcingCurrentKA} kA (reduzida {res.reducedArcingCurrentKA} kA) · CF = {res.enclosureCorrectionFactor} · fronteira de arco = {res.arcFlashBoundaryM} m</p>
            <p><strong>EPI:</strong> {res.ppeCategory}</p>
          </div>
        )}
      </section>
    </div>
  );
}
