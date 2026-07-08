/**
 * The Signature radar (D.1) — a dependency-free SVG that plots the p25–p75 band as a RING.
 *
 * Doctrine: ranges, never averages. A classic radar polygon is a single-value plot, so this
 * component never draws one — no median polygon, only the band annulus (p75 outline with the
 * p25 area cut out via fill-rule evenodd). It is decorative reinforcement of the BandRows
 * rendered beside it (the accessible text equivalent), hence aria-hidden.
 */

export interface RadarBand {
  p25: number;
  p75: number;
}

/** Bands whose p75−p25 collapses still render a visible ring (mirrors BandRow's 2%-min width). */
const MIN_BAND = 0.02;

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/**
 * Pure geometry — exported for unit tests. Returns ONE path string with two subpaths
 * (outer p75 polygon + inner p25 polygon); render it with fillRule="evenodd" to get the ring.
 * Axis 0 points up, the rest proceed clockwise.
 */
export function radarPath(bands: RadarBand[], cx: number, cy: number, r: number): string {
  const n = bands.length;
  const padded = bands.map(({ p25, p75 }) => {
    let lo = clamp01(Math.min(p25, p75));
    let hi = clamp01(Math.max(p25, p75));
    if (hi - lo < MIN_BAND) {
      const mid = (hi + lo) / 2;
      lo = clamp01(mid - MIN_BAND / 2);
      hi = clamp01(mid + MIN_BAND / 2);
    }
    return { lo, hi };
  });
  const pt = (axis: number, v: number): string => {
    const angle = (Math.PI * 2 * axis) / n - Math.PI / 2;
    const x = Math.round((cx + Math.cos(angle) * v * r) * 10) / 10;
    const y = Math.round((cy + Math.sin(angle) * v * r) * 10) / 10;
    return `${x},${y}`;
  };
  const outer = padded.map(({ hi }, i) => pt(i, hi));
  // Inner subpath walks the axes in reverse — with evenodd it cuts the hole either way,
  // but reverse winding keeps the path sane under nonzero renderers too.
  const inner = padded.map((_, i) => {
    const j = n - 1 - i;
    return pt(j, padded[j]!.lo);
  });
  return `M${outer.join("L")}Z M${inner.join("L")}Z`;
}

const CX = 140;
const CY = 120;
const R = 78;

const AXES = [
  // Vertex + label geometry per axis, in radarPath's order (up, then clockwise).
  { label: "Energy", x: CX, y: CY - R, tx: CX, ty: CY - R - 12, anchor: "middle" },
  { label: "Dance", x: CX + R, y: CY, tx: CX + R + 8, ty: CY + 3, anchor: "start" },
  { label: "Mood", x: CX, y: CY + R, tx: CX, ty: CY + R + 16, anchor: "middle" },
  { label: "Acoustic", x: CX - R, y: CY, tx: CX - R - 8, ty: CY + 3, anchor: "end" },
] as const;

interface SignatureRadarProps {
  energy: RadarBand;
  danceability: RadarBand;
  valence: RadarBand;
  acousticness: RadarBand;
}

export function SignatureRadar({
  energy,
  danceability,
  valence,
  acousticness,
}: SignatureRadarProps) {
  // Axis order must match AXES: Energy up, then clockwise Dance / Mood / Acoustic.
  const d = radarPath([energy, danceability, valence, acousticness], CX, CY, R);

  return (
    <svg
      viewBox="0 0 280 240"
      className="w-full max-w-[260px]"
      aria-hidden="true"
      data-testid="signature-radar"
    >
      {[0.25, 0.5, 0.75, 1].map((level) => (
        <circle
          key={level}
          cx={CX}
          cy={CY}
          r={R * level}
          className="fill-none stroke-white/5"
          strokeWidth="1"
        />
      ))}
      {AXES.map((axis) => (
        <line
          key={axis.label}
          x1={CX}
          y1={CY}
          x2={axis.x}
          y2={axis.y}
          className="stroke-white/5"
          strokeWidth="1"
        />
      ))}
      <path
        d={d}
        fillRule="evenodd"
        className="fill-purple-500/25 stroke-purple-400/60"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {AXES.map((axis) => (
        <text
          key={axis.label}
          x={axis.tx}
          y={axis.ty}
          textAnchor={axis.anchor}
          className="fill-slate-500 text-[9px] font-black uppercase tracking-[0.2em]"
        >
          {axis.label}
        </text>
      ))}
    </svg>
  );
}
