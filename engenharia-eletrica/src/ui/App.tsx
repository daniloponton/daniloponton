import { useState } from "react";
import {
  calculateCableSizing,
  calculateShortCircuit,
  ENGINE_VERSION,
  type CableSizingInput,
  type CableSizingResult,
  type ShortCircuitInput,
  type ShortCircuitResult,
} from "@core/index";
import { CableSizingForm } from "./components/CableSizingForm";
import { CalculationReport } from "./components/CalculationReport";
import { ShortCircuitForm } from "./components/ShortCircuitForm";
import { ShortCircuitReport } from "./components/ShortCircuitReport";

type Tab = "cable" | "short_circuit";

export function App() {
  const [tab, setTab] = useState<Tab>("cable");
  const [error, setError] = useState<string | null>(null);
  const [cableResult, setCableResult] = useState<CableSizingResult | null>(null);
  const [scResult, setScResult] = useState<ShortCircuitResult | null>(null);

  async function handleCable(input: CableSizingInput) {
    setError(null);
    try {
      setCableResult(await calculateCableSizing(input));
    } catch (e) {
      setCableResult(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleShortCircuit(input: ShortCircuitInput) {
    setError(null);
    try {
      setScResult(await calculateShortCircuit(input));
    } catch (e) {
      setScResult(null);
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
        <button className={tab === "cable" ? "tab active" : "tab"} onClick={() => setTab("cable")}>
          Dimensionamento de Cabos
        </button>
        <button className={tab === "short_circuit" ? "tab active" : "tab"} onClick={() => setTab("short_circuit")}>
          Curto-Circuito (IEC 60909)
        </button>
      </nav>

      <main>
        {error && <div className="error">⚠️ {error}</div>}

        {tab === "cable" && (
          <>
            <CableSizingForm onCalculate={handleCable} />
            {cableResult && <CalculationReport result={cableResult} />}
          </>
        )}

        {tab === "short_circuit" && (
          <>
            <ShortCircuitForm onCalculate={handleShortCircuit} />
            {scResult && <ShortCircuitReport result={scResult} />}
          </>
        )}
      </main>

      <footer>
        <p>
          Ferramenta de apoio ao projetista. <strong>Não assina projetos</strong> —
          o memorial deve ser validado pelo engenheiro responsável.
        </p>
      </footer>
    </div>
  );
}
