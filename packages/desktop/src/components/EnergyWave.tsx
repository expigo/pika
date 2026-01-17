import { Activity, Zap } from "lucide-react";
import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useSetStore } from "../hooks/useSetBuilder";

interface ChartDataPoint {
  index: number;
  name: string;
  energy: number;
  artist: string;
  bpm: number | null;
  bpmJump: number; // Absolute BPM change from previous track
}

// Custom tooltip component
interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: ChartDataPoint }>;
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const jumpColor =
      Math.abs(data.bpmJump) > 15 ? "#ef4444" : Math.abs(data.bpmJump) > 10 ? "#eab308" : "#22c55e";
    return (
      <div style={tooltipStyles.container}>
        <div style={tooltipStyles.title}>{data.name}</div>
        <div style={tooltipStyles.artist}>{data.artist}</div>
        <div style={tooltipStyles.metrics}>
          <div style={tooltipStyles.energy}>
            <Zap size={12} color="#f97316" />
            <span>Energy: {Math.round(data.energy)}</span>
          </div>
          {data.bpm && (
            <div style={tooltipStyles.bpm}>
              <Activity size={12} color="#60a5fa" />
              <span>BPM: {Math.round(data.bpm)}</span>
            </div>
          )}
          {data.bpmJump !== 0 && (
            <div style={{ ...tooltipStyles.jump, color: jumpColor }}>
              {data.bpmJump > 0 ? "+" : ""}
              {data.bpmJump} BPM
            </div>
          )}
        </div>
      </div>
    );
  }
  return null;
}

const tooltipStyles: Record<string, React.CSSProperties> = {
  container: {
    background: "rgba(15, 23, 42, 0.95)",
    border: "1px solid #334155",
    borderRadius: "8px",
    padding: "0.75rem",
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)",
  },
  title: {
    fontWeight: "bold",
    fontSize: "0.875rem",
    marginBottom: "0.25rem",
  },
  artist: {
    fontSize: "0.75rem",
    opacity: 0.7,
    marginBottom: "0.5rem",
  },
  metrics: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  energy: {
    display: "flex",
    alignItems: "center",
    gap: "0.25rem",
    fontSize: "0.75rem",
    color: "#f97316",
  },
  bpm: {
    display: "flex",
    alignItems: "center",
    gap: "0.25rem",
    fontSize: "0.75rem",
    color: "#60a5fa",
  },
  jump: {
    fontSize: "0.7rem",
    fontWeight: 600,
    marginTop: "2px",
  },
};

interface Props {
  height?: number;
  showBpmLine?: boolean;
}

export function EnergyWave({ showBpmLine = true }: Props) {
  const activeSet = useSetStore((state) => state.activeSet);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // Transform tracks into chart data with BPM jumps
  const chartData = useMemo(() => {
    if (activeSet.length === 0) {
      return [
        { index: 0, name: "", energy: 50, artist: "", bpm: null, bpmJump: 0 },
        { index: 1, name: "", energy: 50, artist: "", bpm: null, bpmJump: 0 },
      ];
    }

    return activeSet.map((track, index) => {
      const prevBpm = index > 0 ? activeSet[index - 1]?.bpm : null;
      const currentBpm = track.bpm ?? null;
      const bpmJump = prevBpm && currentBpm ? Math.round(currentBpm - prevBpm) : 0;

      return {
        index,
        name: track.title || "Untitled",
        energy: track.energy ?? 50,
        artist: track.artist || "Unknown",
        bpm: currentBpm,
        bpmJump,
      };
    });
  }, [activeSet]);

  // Normalize BPM values for chart display (scale 60-160 BPM to 0-100)
  const normalizedBpmData = useMemo(() => {
    return chartData.map((point) => ({
      ...point,
      normalizedBpm: point.bpm ? ((point.bpm - 60) / 100) * 100 : null,
    }));
  }, [chartData]);

  const isEmpty = activeSet.length === 0;

  // Custom dot renderer for BPM line (shows warning colors)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderBpmDot = (props: any) => {
    const { cx, cy, payload, index } = props;
    if (cx == null || cy == null || !payload?.bpm) return null;

    const jumpAbs = Math.abs(payload.bpmJump || 0);
    const fillColor = jumpAbs > 15 ? "#ef4444" : jumpAbs > 10 ? "#eab308" : "#3b82f6";
    const isWarning = jumpAbs > 10;

    return (
      <circle
        key={`bpm-dot-${index}`}
        cx={cx}
        cy={cy}
        r={isWarning ? 5 : 3}
        fill={fillColor}
        stroke={hoveredIndex === index ? "#fff" : "transparent"}
        strokeWidth={2}
        style={{ cursor: "pointer" }}
        onMouseEnter={() => setHoveredIndex(index)}
        onMouseLeave={() => setHoveredIndex(null)}
      />
    );
  };

  return (
    <div className="relative w-full h-full bg-slate-950/20 group">
      {isEmpty && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-600 space-y-3 pointer-events-none z-20">
          <div className="w-12 h-12 bg-slate-900/50 rounded-2xl border border-white/5 flex items-center justify-center">
            <Activity size={24} className="opacity-20 animate-pulse" />
          </div>
          <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-40">
            Energy Flow Analysis Pending
          </span>
        </div>
      )}

      {/* Legend - Moved to bottom for better room */}
      {!isEmpty && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-4 text-[8px] font-bold uppercase tracking-widest text-slate-600 z-10 bg-slate-900/40 px-3 py-1 rounded-full border border-slate-800/50 backdrop-blur-sm">
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-pika-accent shadow-[0_0_8px_rgba(249,115,22,0.4)]" />
            Energy
          </div>
          {showBpmLine && (
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-pika-purple-light shadow-[0_0_8px_rgba(168,85,247,0.4)]" />
              Tempo
            </div>
          )}
        </div>
      )}

      {!isEmpty && (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={normalizedBpmData} margin={{ top: 60, right: 15, left: 15, bottom: 25 }}>
            <defs>
              <linearGradient id="energyGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-pika-accent)" stopOpacity={0.8} />
                <stop offset="100%" stopColor="var(--color-pika-accent)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="bpmGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-pika-purple-light)" stopOpacity={0.4} />
                <stop offset="100%" stopColor="var(--color-pika-purple-light)" stopOpacity={0} />
              </linearGradient>
            </defs>

            {/* Guidelines */}
            <XAxis
              dataKey="index"
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => (value + 1).toString()}
              interval="preserveStartEnd"
              minTickGap={1}
              style={{ fontSize: "0.6rem", fill: "#64748b" }}
            />
            <YAxis
              yAxisId="left"
              orientation="left"
              stroke="var(--color-pika-accent)"
              tickLine={false}
              axisLine={false}
              domain={[0, 100]}
              ticks={[25, 50, 75, 100]}
              tickFormatter={(value) => `${value}%`}
              style={{ fontSize: "0.6rem", fill: "#475569" }}
            />
            {showBpmLine && (
              <YAxis
                yAxisId="right"
                orientation="right"
                stroke="var(--color-pika-purple-light)"
                tickLine={false}
                axisLine={false}
                domain={[0, 100]}
                tickFormatter={(value) => `${Math.round((value / 100) * 100 + 60)}`}
                style={{ fontSize: "0.6rem", fill: "#475569" }}
              />
            )}

            <Tooltip
              content={<CustomTooltip />}
              cursor={{ stroke: "rgba(148, 163, 184, 0.4)", strokeWidth: 1 }}
            />

            {/* Grid Lines for Reading Energy */}
            <ReferenceLine yAxisId="left" y={25} stroke="#1e293b" strokeDasharray="3 3" />
            <ReferenceLine yAxisId="left" y={50} stroke="#334155" strokeDasharray="3 3" />
            <ReferenceLine yAxisId="left" y={75} stroke="#1e293b" strokeDasharray="3 3" />

            <Area
              yAxisId="left"
              type="monotone"
              dataKey="energy"
              stroke="var(--color-pika-accent)"
              strokeWidth={3}
              fill="url(#energyGradient)"
              animationDuration={1000}
              connectNulls
            />
            {showBpmLine && (
              <Area
                yAxisId="right"
                type="monotone"
                dataKey="normalizedBpm"
                stroke="var(--color-pika-purple-light)"
                strokeWidth={2}
                strokeDasharray="6 6"
                fill="url(#bpmGradient)"
                dot={renderBpmDot}
                activeDot={false}
                animationDuration={1000}
                connectNulls
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
