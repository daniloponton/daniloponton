import { useState } from "react";
import type { ShortCircuitInput } from "@core/index";

export const shortCircuitDefaults: ShortCircuitInput = {
  faultVoltageV: 400,
  faultVoltageLevel: "LV",
  cVariant: "max",
  feeder: { skMVA: 500, unHvKV: 13.8, rxRatio: 0.1 },
  transformer: {
    srKVA: 1000,
    ukrPercent: 6,
    copperLossKW: 12,
    unHvKV: 13.8,
    unLvV: 400,
    applyKT: true,
  },
  cables: [],
};

interface Props {
  onCalculate: (input: ShortCircuitInput) => void;
  initial?: ShortCircuitInput;
}

export function ShortCircuitForm({ onCalculate, initial }: Props) {
  const [form, setForm] = useState(initial ? { ...shortCircuitDefaults, ...initial } : shortCircuitDefaults);

  function update(patch: Partial<ShortCircuitInput>) {
    setForm((f) => ({ ...f, ...patch }));
  }
  function feeder(patch: Partial<NonNullable<ShortCircuitInput["feeder"]>>) {
    setForm((f) => ({ ...f, feeder: { ...f.feeder, ...patch } }));
  }
  function tx(patch: Partial<NonNullable<ShortCircuitInput["transformer"]>>) {
    setForm((f) => ({ ...f, transformer: { ...f.transformer!, ...patch } }));
  }

  return (
    <form
      className="card grid"
      onSubmit={(e) => {
        e.preventDefault();
        onCalculate(form);
      }}
    >
      <Field label="Tensão no ponto de falta [V]">
        <input type="number" value={form.faultVoltageV} onChange={(e) => update({ faultVoltageV: Number(e.target.value) })} />
      </Field>
      <Field label="Nível de tensão">
        <select value={form.faultVoltageLevel} onChange={(e) => update({ faultVoltageLevel: e.target.value as ShortCircuitInput["faultVoltageLevel"] })}>
          <option value="LV">BT (≤ 1 kV)</option>
          <option value="MV">MT</option>
          <option value="HV">AT</option>
        </select>
      </Field>
      <Field label="Fator c">
        <select value={form.cVariant} onChange={(e) => update({ cVariant: e.target.value as ShortCircuitInput["cVariant"] })}>
          <option value="max">c máx (interrupção)</option>
          <option value="min">c mín (proteção)</option>
        </select>
      </Field>

      <Field label="Concessionária S″k [MVA]">
        <input type="number" value={form.feeder.skMVA} onChange={(e) => feeder({ skMVA: Number(e.target.value) })} />
      </Field>
      <Field label="Tensão da rede [kV]">
        <input type="number" step="0.1" value={form.feeder.unHvKV} onChange={(e) => feeder({ unHvKV: Number(e.target.value) })} />
      </Field>
      <Field label="R/X da rede">
        <input type="number" step="0.01" value={form.feeder.rxRatio} onChange={(e) => feeder({ rxRatio: Number(e.target.value) })} />
      </Field>

      <Field label="Trafo Sr [kVA]">
        <input type="number" value={form.transformer!.srKVA} onChange={(e) => tx({ srKVA: Number(e.target.value) })} />
      </Field>
      <Field label="Trafo ukr [%]">
        <input type="number" step="0.1" value={form.transformer!.ukrPercent} onChange={(e) => tx({ ukrPercent: Number(e.target.value) })} />
      </Field>
      <Field label="Perdas no cobre [kW]">
        <input type="number" step="0.5" value={form.transformer!.copperLossKW ?? 0} onChange={(e) => tx({ copperLossKW: Number(e.target.value) })} />
      </Field>

      <div className="full">
        <button type="submit">Calcular I″k</button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
