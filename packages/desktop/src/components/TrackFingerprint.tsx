import { useMemo } from "react";
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

export interface FingerprintMetrics {
  energy: number | null;
  danceability: number | null;
  brightness: number | null;
  acousticness: number | null;
  groove: number | null;
}

interface Props {
  metrics: FingerprintMetrics;
  showLabels?: boolean;
  size?: number | string;
}

interface DataPoint {
  metric: string;
  value: number;
  fullMark: number;
}

export function TrackFingerprint({ metrics, showLabels = true, size = "100%" }: Props) {
  const data: DataPoint[] = useMemo(
    () => [
      { metric: "Energy", value: metrics.energy ?? 0, fullMark: 100 },
      { metric: "Dance", value: metrics.danceability ?? 0, fullMark: 100 },
      { metric: "Bright", value: metrics.brightness ?? 0, fullMark: 100 },
      { metric: "Acoustic", value: metrics.acousticness ?? 0, fullMark: 100 },
      { metric: "Groove", value: metrics.groove ?? 0, fullMark: 100 },
    ],
    [metrics],
  );

  const hasData = useMemo(() => data.some((d) => d.value > 0), [data]);

  if (!hasData) {
    return (
      <div
        className="flex items-center justify-center opacity-30 bg-slate-900/10 rounded-full"
        style={{ width: size, height: size }}
      >
        <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">
          No Analysis
        </span>
      </div>
    );
  }

  return (
    <div
      className="relative group overflow-hidden"
      style={{ width: size, height: size }}
      role="img"
      aria-label="Track analysis radar chart showing Energy, Danceability, Brightness, Acousticness, and Groove"
    >
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart cx="50%" cy="50%" outerRadius="80%" data={data}>
          <defs>
            <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
            <linearGradient id="radarGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-pika-purple)" stopOpacity={0.8} />
              <stop offset="100%" stopColor="var(--color-pika-purple)" stopOpacity={0.2} />
            </linearGradient>
          </defs>

          <PolarGrid stroke="rgba(148, 163, 184, 0.08)" />

          {showLabels && (
            <PolarAngleAxis
              dataKey="metric"
              tick={{
                fill: "rgba(148, 163, 184, 0.7)",
                fontSize: 10,
                fontWeight: 800,
                fontFamily: "Outfit, sans-serif",
                letterSpacing: "0.02em",
              }}
            />
          )}

          <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />

          {/* Background Ghost Shadow - Shows the "Total potential" */}
          <Radar
            dataKey="fullMark"
            stroke="none"
            fill="rgba(255, 255, 255, 0.02)"
            fillOpacity={1}
            isAnimationActive={false}
          />

          <Radar
            name="Fingerprint"
            dataKey="value"
            stroke="var(--color-pika-purple)"
            strokeWidth={3}
            fill="url(#radarGradient)"
            fillOpacity={0.7}
            animationDuration={800}
            animationEasing="ease-out"
            filter="url(#glow)"
          />

          <Tooltip content={<CustomTooltip />} cursor={false} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

// Custom tooltip component
interface TooltipProps {
  active?: boolean;
  payload?: Array<{ payload: DataPoint }>;
}

function CustomTooltip({ active, payload }: TooltipProps) {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-slate-950/95 border border-white/10 backdrop-blur-xl rounded-xl p-3 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">
          {data.metric}
        </div>
        <div className="text-xl font-black text-pika-accent tracking-tighter">
          {Math.round(data.value)}%
        </div>
      </div>
    );
  }
  return null;
}

export default TrackFingerprint;
