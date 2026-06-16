import type { ComplianceStatus } from "@core/index";

const badge: Record<ComplianceStatus, string> = { ok: "✅", warning: "⚠️", fail: "❌" };
const pillLabel: Record<ComplianceStatus, string> = {
  ok: "Conforme",
  warning: "Com ressalvas",
  fail: "Não conforme",
};

/** Pílula colorida de status, com rótulo opcional. */
export function StatusPill({ status, label }: { status: ComplianceStatus; label?: string }) {
  return (
    <span className={`pill pill-${status}`}>
      {badge[status]} {label ?? pillLabel[status]}
    </span>
  );
}

export interface LinkChip {
  label: string;
  value: string | number | null | undefined;
}

/**
 * Faixa de "chips" mostrando os valores herdados de outros módulos (ex.: I″k do
 * curto-circuito), deixando o encadeamento entre módulos visível.
 */
export function LinkChips({ chips }: { chips: LinkChip[] }) {
  const available = chips.filter((c) => c.value != null);
  if (available.length === 0) return null;
  return (
    <div className="link-chips" aria-label="Valores herdados de outros módulos">
      {available.map((c) => (
        <span className="link-chip" key={c.label}>
          {c.label}: <strong>{c.value}</strong>
        </span>
      ))}
    </div>
  );
}

/** Estado vazio (mostrado antes do primeiro cálculo). */
export function EmptyState({ icon = "📐", children }: { icon?: string; children: React.ReactNode }) {
  return (
    <div className="empty-state">
      <span className="empty-icon">{icon}</span>
      {children}
    </div>
  );
}
