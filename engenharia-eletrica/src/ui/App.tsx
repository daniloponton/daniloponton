import { useState } from "react";
import {
  calculateCableSizing,
  ENGINE_VERSION,
  type CableSizingInput,
  type CableSizingResult,
} from "@core/index";
import { CableSizingForm } from "./components/CableSizingForm";
import { CalculationReport } from "./components/CalculationReport";

export function App() {
  const [result, setResult] = useState<CableSizingResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleCalculate(input: CableSizingInput) {
    setError(null);
    try {
      setResult(await calculateCableSizing(input));
    } catch (e) {
      setResult(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="app">
      <header>
        <h1>Dimensionamento de Cabos BT</h1>
        <p className="subtitle">
          IEC 60364-5-52 / NBR 5410 · motor v{ENGINE_VERSION} · 100% no navegador
        </p>
      </header>

      <main>
        <CableSizingForm onCalculate={handleCalculate} />
        {error && <div className="error">⚠️ {error}</div>}
        {result && <CalculationReport result={result} />}
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
