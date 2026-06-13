import { useState } from "react";
import type { CableSizingInput } from "@core/index";

export const cableDefaults: CableSizingInput = {
  ibAmps: 45,
  system: "three",
  voltageV: 380,
  lengthM: 85,
  cosPhi: 0.85,
  conductor: "Cu",
  insulation: "PVC",
  installMethod: "B1",
  ambientTempC: 38,
  groupingCircuits: 3,
  maxVoltageDropPct: 4,
  shortCircuitKA: 12,
  faultClearingS: 0.2,
};

interface Props {
  onCalculate: (input: CableSizingInput) => void;
  /** I"k [kA] vinda do módulo de curto-circuito. */
  linkedIkKA?: number | null;
  /** Tempo de atuação [s] vindo do módulo de proteção. */
  linkedClearingS?: number | null;
  initial?: CableSizingInput;
}

export function CableSizingForm({ onCalculate, linkedIkKA, linkedClearingS, initial }: Props) {
  const [form, setForm] = useState<CableSizingInput>(initial ? { ...cableDefaults, ...initial } : cableDefaults);
  const [useLinked, setUseLinked] = useState(false);

  const hasLinks = linkedIkKA != null || linkedClearingS != null;
  const effShortCircuitKA = useLinked && linkedIkKA != null ? linkedIkKA : form.shortCircuitKA;
  const effClearingS = useLinked && linkedClearingS != null ? linkedClearingS : form.faultClearingS;

  function num(key: keyof CableSizingInput) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [key]: Number(e.target.value) }));
  }
  function sel<K extends keyof CableSizingInput>(key: K) {
    return (e: React.ChangeEvent<HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  return (
    <form
      className="card grid"
      onSubmit={(e) => {
        e.preventDefault();
        onCalculate({ ...form, shortCircuitKA: effShortCircuitKA, faultClearingS: effClearingS });
      }}
    >
      <Field label="Corrente de projeto Ib [A]">
        <input type="number" step="0.1" value={form.ibAmps} onChange={num("ibAmps")} />
      </Field>
      <Field label="Sistema">
        <select value={form.system} onChange={sel("system")}>
          <option value="single">Monofásico</option>
          <option value="three">Trifásico</option>
        </select>
      </Field>
      <Field label="Tensão U [V]">
        <input type="number" step="1" value={form.voltageV} onChange={num("voltageV")} />
      </Field>
      <Field label="Comprimento L [m]">
        <input type="number" step="1" value={form.lengthM} onChange={num("lengthM")} />
      </Field>
      <Field label="Fator de potência cos φ">
        <input type="number" step="0.01" value={form.cosPhi} onChange={num("cosPhi")} />
      </Field>
      <Field label="Isolação">
        <select value={form.insulation} onChange={sel("insulation")}>
          <option value="PVC">PVC (70 °C)</option>
          <option value="XLPE">XLPE/EPR (90 °C)</option>
        </select>
      </Field>
      <Field label="Método de instalação">
        <select value={form.installMethod} onChange={sel("installMethod")}>
          <option value="B1">B1</option>
          <option value="B2">B2</option>
          <option value="C">C</option>
        </select>
      </Field>
      <Field label="Temp. ambiente [°C]">
        <input type="number" step="1" value={form.ambientTempC} onChange={num("ambientTempC")} />
      </Field>
      <Field label="Circuitos agrupados">
        <input type="number" step="1" value={form.groupingCircuits} onChange={num("groupingCircuits")} />
      </Field>
      <Field label="Queda máx. [%]">
        <input type="number" step="0.5" value={form.maxVoltageDropPct} onChange={num("maxVoltageDropPct")} />
      </Field>
      <Field label="Icc presumida [kA]">
        <input
          type="number"
          step="0.5"
          value={effShortCircuitKA}
          disabled={useLinked && linkedIkKA != null}
          onChange={num("shortCircuitKA")}
        />
      </Field>
      <Field label="Tempo de atuação [s]">
        <input
          type="number"
          step="0.05"
          value={effClearingS}
          disabled={useLinked && linkedClearingS != null}
          onChange={num("faultClearingS")}
        />
      </Field>

      {hasLinks && (
        <label className="field check">
          <span>Usar valores calculados</span>
          <input type="checkbox" checked={useLinked} onChange={(e) => setUseLinked(e.target.checked)} />
          <small className="muted">
            {linkedIkKA != null ? `I"k=${linkedIkKA} kA` : ""}
            {linkedClearingS != null ? ` · t=${linkedClearingS} s` : ""}
          </small>
        </label>
      )}

      <div className="full">
        <button type="submit">Calcular</button>
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
