import { useState } from "react";
import {
  calculateCableSizing,
  calculateShortCircuit,
  checkSelectivity,
  ENGINE_VERSION,
  type CableSizingInput,
  type CableSizingResult,
  type SelectivityInput,
  type SelectivityResult,
  type ShortCircuitInput,
  type ShortCircuitResult,
} from "@core/index";
import { CableSizingForm } from "./components/CableSizingForm";
import { CalculationReport } from "./components/CalculationReport";
import { ShortCircuitForm } from "./components/ShortCircuitForm";
import { ShortCircuitReport } from "./components/ShortCircuitReport";
import { ProtectionForm } from "./components/ProtectionForm";
import { ProtectionReport } from "./components/ProtectionReport";

type Tab = "cable" | "short_circuit" | "protection";

export function App() {
  const [tab, setTab] = useState<Tab>("short_circuit");
  const [error, setError] = useState<string | null>(null);
  const [cableResult, setCableResult] = useState<CableSizingResult | null>(null);
  const [scResult, setScResult] = useState<ShortCircuitResult | null>(null);
  const [selResult, setSelResult] = useState<SelectivityResult | null>(null);

  // Valores compartilhados entre módulos (fecham o ciclo de cálculo).
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

  return (
    <div className="app">
      <header>
        <h1>Ferramenta de Engenharia Elétrica</h1>
        <p className="subtitle">
          IEC / NBR · motor v{ENGINE_VERSION} · 100% no navegador, determinístico e auditável
        </p>
      </header>

      <nav className="tabs">
        <button className={tab === "short_circuit" ? "tab active" : "tab"} onClick={() => setTab("short_circuit")}>
          1 · Curto-Circuito (IEC 60909)
        </button>
        <button className={tab === "protection" ? "tab active" : "tab"} onClick={() => setTab("protection")}>
          2 · Proteção & Seletividade
        </button>
        <button className={tab === "cable" ? "tab active" : "tab"} onClick={() => setTab("cable")}>
          3 · Dimensionamento de Cabos
        </button>
      </nav>

      <main>
        {error && <div className="error">⚠️ {error}</div>}

        {tab === "short_circuit" && (
          <>
            <ShortCircuitForm onCalculate={(i: ShortCircuitInput) => run(() => calculateShortCircuit(i), setScResult)} />
            {scResult && <ShortCircuitReport result={scResult} />}
          </>
        )}

        {tab === "protection" && (
          <>
            <ProtectionForm
              linkedIkKA={linkedIkKA}
              onCalculate={(i: SelectivityInput) => run(() => checkSelectivity(i), setSelResult)}
            />
            {selResult && <ProtectionReport result={selResult} />}
          </>
        )}

        {tab === "cable" && (
          <>
            <CableSizingForm
              linkedIkKA={linkedIkKA}
              linkedClearingS={linkedClearingS}
              onCalculate={(i: CableSizingInput) => run(() => calculateCableSizing(i), setCableResult)}
            />
            {cableResult && <CalculationReport result={cableResult} />}
          </>
        )}
      </main>

      <footer>
        <p>
          Fluxo sugerido: <strong>1 → 2 → 3</strong>. A I"k do curto alimenta a proteção e o cabo;
          o tempo de atuação da proteção alimenta a verificação térmica do cabo.
        </p>
        <p>
          Ferramenta de apoio ao projetista. <strong>Não assina projetos</strong> —
          o memorial deve ser validado pelo engenheiro responsável.
        </p>
      </footer>
    </div>
  );
}
