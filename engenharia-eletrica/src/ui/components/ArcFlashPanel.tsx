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
    systemVoltageKV: 0.38,
    boltedFaultKA: 20,
    gapMm: 32,
    workingDistanceMm: 455,
    equipmentClass: "switchgear_lv",
    electrodeConfig: "box",
    grounded: true,
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
        <h3>Arco elétrico — energia incidente e EPI (IEEE 1584)</h3>
        <div className="grid">
          <label className="field"><span>Tensão [kV]</span>
            <input type="number" step="0.01" value={form.systemVoltageKV} onChange={(e) => set({ systemVoltageKV: Number(e.target.value) })} /></label>
          <label className="field"><span>Ibf (curto) [kA]</span>
            <input type="number" step="0.1" value={ikKA} disabled={useLinked && !!linkedIkKA} onChange={(e) => set({ boltedFaultKA: Number(e.target.value) })} /></label>
          <label className="field"><span>Tempo de arco [s]</span>
            <input type="number" step="0.05" value={tS} disabled={useLinked && !!linkedClearingS} onChange={(e) => set({ arcDurationS: Number(e.target.value) })} /></label>
          <label className="field"><span>Classe do equipamento</span>
            <select value={form.equipmentClass} onChange={(e) => set({ equipmentClass: e.target.value as ArcFlashInput["equipmentClass"] })}>
              <option value="switchgear_lv">Painel BT (switchgear)</option>
              <option value="mcc_panel_lv">CCM / quadro BT</option>
              <option value="open_air">Ar livre</option>
              <option value="cable">Cabo</option>
              <option value="switchgear_mv">Painel MT</option>
            </select></label>
          <label className="field"><span>Gap eletrodos [mm]</span>
            <input type="number" value={form.gapMm} onChange={(e) => set({ gapMm: Number(e.target.value) })} /></label>
          <label className="field"><span>Distância de trabalho [mm]</span>
            <input type="number" value={form.workingDistanceMm} onChange={(e) => set({ workingDistanceMm: Number(e.target.value) })} /></label>
          <label className="field"><span>Eletrodos</span>
            <select value={form.electrodeConfig} onChange={(e) => set({ electrodeConfig: e.target.value as ArcFlashInput["electrodeConfig"] })}>
              <option value="box">Em caixa (VCB)</option>
              <option value="open">Ar aberto (VOA)</option>
            </select></label>
          <label className="field check"><span>Sistema aterrado</span>
            <input type="checkbox" checked={form.grounded} onChange={(e) => set({ grounded: e.target.checked })} /></label>
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
            <p className="muted">Ia = {res.arcingCurrentKA} kA · fronteira de arco = {res.arcFlashBoundaryM} m</p>
            <p><strong>EPI:</strong> {res.ppeCategory}</p>
          </div>
        )}
      </section>
    </div>
  );
}
