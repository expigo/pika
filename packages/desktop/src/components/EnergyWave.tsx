import { Activity, Zap } from "lucide-react";
import { useMemo, useState } from "react";
import { Area, AreaChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
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

export function EnergyWave({ height = 120, showBpmLine = true }: Props) {
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
    <div style={{ ...styles.container, height }}>
      {isEmpty && (
        <div style={styles.emptyOverlay}>
          <span>Drag tracks here to see the energy wave</span>
        </div>
      )}

      {/* Legend */}
      {!isEmpty && showBpmLine && (
        <div style={styles.legend}>
          <div style={styles.legendItem}>
            <span style={{ ...styles.legendDot, background: "#f97316" }} />
            Energy
          </div>
          <div style={styles.legendItem}>
            <span style={{ ...styles.legendDot, background: "#3b82f6" }} />
            BPM
          </div>
          <div style={styles.legendItem}>
            <span style={{ ...styles.legendDot, background: "#ef4444" }} />
            &gt;15 Jump
          </div>
        </div>
      )}

      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={normalizedBpmData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
          {/* Gradient definitions */}
          <defs>
            <linearGradient id="energyGradient" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.8} />
              <stop offset="40%" stopColor="#22c55e" stopOpacity={0.8} />
              <stop offset="70%" stopColor="#eab308" stopOpacity={0.8} />
              <stop offset="100%" stopColor="#ef4444" stopOpacity={0.9} />
            </linearGradient>
            <linearGradient id="energyStroke" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="#3b82f6" />
              <stop offset="40%" stopColor="#22c55e" />
              <stop offset="70%" stopColor="#eab308" />
              <stop offset="100%" stopColor="#ef4444" />
            </linearGradient>
          </defs>

          <XAxis dataKey="name" hide />
          <YAxis domain={[0, 100]} hide />

          {!isEmpty && (
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: "#64748b", strokeWidth: 1 }} />
          )}

          {/* Energy Area */}
          <Area
            type="monotone"
            dataKey="energy"
            stroke="url(#energyStroke)"
            strokeWidth={2}
            fill="url(#energyGradient)"
            animationDuration={500}
            animationEasing="ease-out"
            dot={!isEmpty ? { r: 4, fill: "#1e293b", stroke: "#64748b", strokeWidth: 2 } : false}
            activeDot={!isEmpty ? { r: 6, fill: "#f97316", stroke: "#fff", strokeWidth: 2 } : false}
          />

          {/* BPM Line (optional) */}
          {showBpmLine && !isEmpty && (
            <Line
              type="monotone"
              dataKey="normalizedBpm"
              stroke="#3b82f6"
              strokeWidth={2}
              strokeDasharray="4 2"
              dot={renderBpmDot}
              activeDot={false}
              animationDuration={500}
              connectNulls
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: "relative",
    background: "linear-gradient(180deg, #0f172a 0%, #1e293b 100%)",
    borderRadius: "8px",
    overflow: "hidden",
    border: "1px solid #334155",
  },
  emptyOverlay: {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#64748b",
    fontSize: "0.75rem",
    zIndex: 1,
    pointerEvents: "none",
  },
  legend: {
    position: "absolute",
    top: "6px",
    right: "8px",
    display: "flex",
    gap: "10px",
    fontSize: "0.65rem",
    color: "#94a3b8",
    zIndex: 2,
  },
  legendItem: {
    display: "flex",
    alignItems: "center",
    gap: "4px",
  },
  legendDot: {
    width: "8px",
    height: "8px",
    borderRadius: "50%",
  },
};
