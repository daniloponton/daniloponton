import { useState } from "react";
import type { RelayCurveType, SelectivityInput } from "@core/index";

interface DeviceForm {
  pickupA: number;
  tms: number;
  curve: RelayCurveType;
  instEnabled: boolean;
  instPickupA: number;
}

interface FormState {
  upstream: DeviceForm;
  downstream: DeviceForm;
  faultCurrentKA: number;
  minMarginS: number;
}

const initial: FormState = {
  downstream: { pickupA: 100, tms: 0.1, curve: "SI", instEnabled: false, instPickupA: 2000 },
  upstream: { pickupA: 300, tms: 0.2, curve: "SI", instEnabled: false, instPickupA: 6000 },
  faultCurrentKA: 5,
  minMarginS: 0.2,
};

interface Props {
  onCalculate: (input: SelectivityInput) => void;
  /** I"k vinda do módulo de curto-circuito, se houver. */
  linkedIkKA?: number | null;
}

export function ProtectionForm({ onCalculate, linkedIkKA }: Props) {
  const [form, setForm] = useState<FormState>(initial);
  const [useLinked, setUseLinked] = useState(false);

  const faultKA = useLinked && linkedIkKA ? linkedIkKA : form.faultCurrentKA;

  function dev(which: "upstream" | "downstream", patch: Partial<DeviceForm>) {
    setForm((f) => ({ ...f, [which]: { ...f[which], ...patch } }));
  }

  function toStages(d: DeviceForm): SelectivityInput["downstream"]["stages"] {
    const stages: SelectivityInput["downstream"]["stages"] = [
      { kind: "inverse", pickupA: d.pickupA, tms: d.tms, curve: d.curve },
    ];
    if (d.instEnabled) stages.push({ kind: "instantaneous", pickupA: d.instPickupA, delayS: 0.02 });
    return stages;
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    onCalculate({
      downstream: { id: "down", name: "Jusante", stages: toStages(form.downstream) },
      upstream: { id: "up", name: "Montante", stages: toStages(form.upstream) },
      faultCurrentKA: faultKA,
      minMarginS: form.minMarginS,
    });
  }

  return (
    <form className="card" onSubmit={submit}>
      <div className="device-cols">
        <DeviceFields title="Jusante (carga)" d={form.downstream} on={(p) => dev("downstream", p)} />
        <DeviceFields title="Montante (fonte)" d={form.upstream} on={(p) => dev("upstream", p)} />
      </div>

      <div className="grid" style={{ marginTop: "1rem" }}>
        <label className="field">
          <span>Corrente de falta I"k [kA]</span>
          <input
            type="number"
            step="0.1"
            value={faultKA}
            disabled={useLinked && !!linkedIkKA}
            onChange={(e) => setForm((f) => ({ ...f, faultCurrentKA: Number(e.target.value) }))}
          />
        </label>
        <label className="field">
          <span>Margem mínima [s]</span>
          <input
            type="number"
            step="0.05"
            value={form.minMarginS}
            onChange={(e) => setForm((f) => ({ ...f, minMarginS: Number(e.target.value) }))}
          />
        </label>
        {linkedIkKA != null && (
          <label className="field check">
            <span>Usar I"k do curto-circuito</span>
            <input type="checkbox" checked={useLinked} onChange={(e) => setUseLinked(e.target.checked)} />
            <small className="muted">{linkedIkKA} kA disponível</small>
          </label>
        )}
      </div>

      <div style={{ marginTop: "1rem" }}>
        <button type="submit">Verificar seletividade</button>
      </div>
    </form>
  );
}

function DeviceFields({ title, d, on }: { title: string; d: DeviceForm; on: (p: Partial<DeviceForm>) => void }) {
  return (
    <fieldset className="device">
      <legend>{title}</legend>
      <label className="field">
        <span>Pickup Is [A]</span>
        <input type="number" value={d.pickupA} onChange={(e) => on({ pickupA: Number(e.target.value) })} />
      </label>
      <label className="field">
        <span>TMS</span>
        <input type="number" step="0.01" value={d.tms} onChange={(e) => on({ tms: Number(e.target.value) })} />
      </label>
      <label className="field">
        <span>Curva</span>
        <select value={d.curve} onChange={(e) => on({ curve: e.target.value as RelayCurveType })}>
          <option value="SI">SI — normalmente inversa</option>
          <option value="VI">VI — muito inversa</option>
          <option value="EI">EI — extremamente inversa</option>
          <option value="LTI">LTI — tempo longo</option>
        </select>
      </label>
      <label className="field check">
        <span>Instantâneo (50)</span>
        <input type="checkbox" checked={d.instEnabled} onChange={(e) => on({ instEnabled: e.target.checked })} />
      </label>
      {d.instEnabled && (
        <label className="field">
          <span>Ii [A]</span>
          <input type="number" value={d.instPickupA} onChange={(e) => on({ instPickupA: Number(e.target.value) })} />
        </label>
      )}
    </fieldset>
  );
}
