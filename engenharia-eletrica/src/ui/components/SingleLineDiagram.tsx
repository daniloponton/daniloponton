import type { SingleLineElement, ComplianceStatus } from "@core/index";

interface Props {
  elements: readonly SingleLineElement[];
  /** Se fornecido, os elementos ficam clicáveis (modo editor). */
  onSelect?: (kind: SingleLineElement["kind"]) => void;
  selected?: SingleLineElement["kind"] | null;
}

const W = 560;
const ROW = 96;
const TOP = 34;
const CX = 90;

const statusColor: Record<ComplianceStatus, string> = {
  ok: "#2e7d32",
  warning: "#b26a00",
  fail: "#c62828",
};

/** Diagrama unifilar vertical (fonte → carga) renderizado em SVG puro. */
export function SingleLineDiagram({ elements, onSelect, selected }: Props) {
  if (elements.length === 0) return null;
  const height = TOP + elements.length * ROW;
  const cy = (i: number) => TOP + i * ROW + 20;
  const interactive = !!onSelect;

  return (
    <svg viewBox={`0 0 ${W} ${height}`} className="single-line" role="img" aria-label="Diagrama unifilar">
      {/* barramento vertical conectando os elementos */}
      <line x1={CX} y1={cy(0)} x2={CX} y2={cy(elements.length - 1)} stroke="#111" strokeWidth={2} />

      {elements.map((el, i) => {
        const y = cy(i);
        const color = el.status ? statusColor[el.status] : "#111";
        const isSel = selected === el.kind;
        return (
          <g
            key={i}
            className={interactive ? "sld-clickable" : undefined}
            onClick={interactive ? () => onSelect!(el.kind) : undefined}
          >
            {interactive && (
              <rect
                x={4}
                y={y - ROW / 2 + 8}
                width={W - 8}
                height={ROW - 8}
                rx={8}
                fill={isSel ? "rgba(47,129,247,0.12)" : "transparent"}
                stroke={isSel ? "#2f81f7" : "transparent"}
              />
            )}
            <Symbol kind={el.kind} cx={CX} cy={y} color={color} />
            <text x={150} y={y - 4} className="sld-label">{el.label}</text>
            {el.details.map((d, k) => (
              <text key={k} x={150} y={y + 14 + k * 14} className="sld-detail">{d}</text>
            ))}
          </g>
        );
      })}
    </svg>
  );
}

function Symbol({ kind, cx, cy, color }: { kind: SingleLineElement["kind"]; cx: number; cy: number; color: string }) {
  const s = { stroke: color, fill: "none", strokeWidth: 2 } as const;
  switch (kind) {
    case "utility":
      return (
        <g>
          <circle cx={cx} cy={cy} r={15} {...s} />
          <path d={`M ${cx - 8} ${cy} q 4 -7 8 0 q 4 7 8 0`} {...s} />
        </g>
      );
    case "transformer":
      return (
        <g>
          <circle cx={cx} cy={cy - 7} r={11} {...s} />
          <circle cx={cx} cy={cy + 7} r={11} {...s} />
        </g>
      );
    case "busbar":
      return <line x1={cx - 34} y1={cy} x2={cx + 34} y2={cy} stroke={color} strokeWidth={5} />;
    case "protection":
      return (
        <g>
          <rect x={cx - 13} y={cy - 13} width={26} height={26} {...s} />
          <line x1={cx - 13} y1={cy + 13} x2={cx + 13} y2={cy - 13} {...s} />
        </g>
      );
    case "cable":
      return <rect x={cx - 8} y={cy - 16} width={16} height={32} rx={6} {...s} />;
    case "load":
      return (
        <polygon points={`${cx - 14},${cy - 12} ${cx + 14},${cy - 12} ${cx},${cy + 15}`} {...s} />
      );
  }
}
