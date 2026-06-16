import type { TccPoint } from "@core/index";

interface Curve {
  points: readonly TccPoint[];
  color: string;
  label: string;
}

interface Props {
  curves: Curve[];
  faultCurrentA: number;
}

const W = 640;
const H = 420;
const M = { top: 16, right: 120, bottom: 44, left: 56 };

/** Gráfico tempo-corrente (TCC) log-log, renderizado em SVG puro. */
export function TccChart({ curves, faultCurrentA }: Props) {
  const all = curves.flatMap((c) => c.points);
  if (all.length === 0) return <p className="muted">Sem pontos para plotar.</p>;

  const currents = [...all.map((p) => p.currentA), faultCurrentA];
  const times = all.map((p) => p.timeS);
  const iMin = decade(Math.min(...currents), "floor");
  const iMax = decade(Math.max(...currents), "ceil");
  const tMin = decade(Math.max(0.001, Math.min(...times)), "floor");
  const tMax = decade(Math.max(...times), "ceil");

  const px = (i: number) =>
    M.left + ((Math.log10(i) - Math.log10(iMin)) / (Math.log10(iMax) - Math.log10(iMin))) * (W - M.left - M.right);
  const py = (t: number) =>
    M.top + ((Math.log10(tMax) - Math.log10(t)) / (Math.log10(tMax) - Math.log10(tMin))) * (H - M.top - M.bottom);

  const path = (pts: readonly TccPoint[]) =>
    pts.map((p, i) => `${i === 0 ? "M" : "L"}${px(p.currentA).toFixed(1)},${py(p.timeS).toFixed(1)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="tcc" role="img" aria-label="Curva tempo-corrente">
      {/* grade vertical (décadas de corrente) */}
      {decades(iMin, iMax).map((i) => (
        <g key={`x${i}`}>
          <line x1={px(i)} y1={M.top} x2={px(i)} y2={H - M.bottom} className="grid" />
          <text x={px(i)} y={H - M.bottom + 16} className="axis" textAnchor="middle">
            {fmt(i)}
          </text>
        </g>
      ))}
      {/* grade horizontal (décadas de tempo) */}
      {decades(tMin, tMax).map((t) => (
        <g key={`y${t}`}>
          <line x1={M.left} y1={py(t)} x2={W - M.right} y2={py(t)} className="grid" />
          <text x={M.left - 8} y={py(t) + 4} className="axis" textAnchor="end">
            {fmt(t)}
          </text>
        </g>
      ))}

      {/* corrente de falta */}
      <line x1={px(faultCurrentA)} y1={M.top} x2={px(faultCurrentA)} y2={H - M.bottom} className="fault-line" />
      <text x={px(faultCurrentA)} y={M.top + 12} className="axis fault-text" textAnchor="middle">
        I"k
      </text>

      {/* curvas */}
      {curves.map((c) => (
        <path key={c.label} d={path(c.points)} fill="none" stroke={c.color} strokeWidth={2} />
      ))}

      {/* legenda */}
      {curves.map((c, idx) => (
        <g key={`leg${c.label}`} transform={`translate(${W - M.right + 8},${M.top + 8 + idx * 18})`}>
          <line x1={0} y1={0} x2={18} y2={0} stroke={c.color} strokeWidth={2} />
          <text x={24} y={4} className="axis">{c.label}</text>
        </g>
      ))}

      <text x={(W - M.right + M.left) / 2} y={H - 6} className="axis" textAnchor="middle">corrente [A]</text>
      <text x={14} y={H / 2} className="axis" textAnchor="middle" transform={`rotate(-90 14 ${H / 2})`}>tempo [s]</text>
    </svg>
  );
}

function decade(v: number, mode: "floor" | "ceil"): number {
  const e = Math[mode](Math.log10(v));
  return 10 ** e;
}
function decades(min: number, max: number): number[] {
  const out: number[] = [];
  for (let e = Math.round(Math.log10(min)); e <= Math.round(Math.log10(max)); e++) {
    out.push(10 ** e);
  }
  return out;
}
function fmt(v: number): string {
  if (v >= 1) return String(Math.round(v));
  return String(v);
}
