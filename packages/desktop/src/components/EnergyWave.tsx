import { Zap } from "lucide-react";
import { useMemo } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useSetStore } from "../hooks/useSetBuilder";

interface ChartDataPoint {
  index: number;
  name: string;
  energy: number;
  artist: string;
}

// Custom tooltip component
interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: ChartDataPoint }>;
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div style={tooltipStyles.container}>
        <div style={tooltipStyles.title}>{data.name}</div>
        <div style={tooltipStyles.artist}>{data.artist}</div>
        <div style={tooltipStyles.energy}>
          <Zap size={12} color="#f97316" />
          <span>Energy: {Math.round(data.energy)}</span>
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
  energy: {
    display: "flex",
    alignItems: "center",
    gap: "0.25rem",
    fontSize: "0.75rem",
    color: "#f97316",
  },
};

interface Props {
  height?: number;
}

export function EnergyWave({ height = 120 }: Props) {
  const activeSet = useSetStore((state) => state.activeSet);

  // Transform tracks into chart data
  const chartData = useMemo(() => {
    if (activeSet.length === 0) {
      // Return a flat line for empty state
      return [
        { index: 0, name: "", energy: 50, artist: "" },
        { index: 1, name: "", energy: 50, artist: "" },
      ];
    }

    return activeSet.map((track, index) => ({
      index,
      name: track.title || "Untitled",
      energy: track.energy ?? 50,
      artist: track.artist || "Unknown",
    }));
  }, [activeSet]);

  const isEmpty = activeSet.length === 0;

  return (
    <div style={{ ...styles.container, height }}>
      {isEmpty && (
        <div style={styles.emptyOverlay}>
          <span>Drag tracks here to see the energy wave</span>
        </div>
      )}
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
          {/* Gradient definition */}
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

          {/* Hidden axes for clean look */}
          <XAxis dataKey="name" hide />
          <YAxis domain={[0, 100]} hide />

          {/* Tooltip */}
          {!isEmpty && (
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: "#64748b", strokeWidth: 1 }} />
          )}

          {/* Area */}
          <Area
            type="monotone"
            dataKey="energy"
            stroke="url(#energyStroke)"
            strokeWidth={2}
            fill="url(#energyGradient)"
            animationDuration={500}
            animationEasing="ease-out"
            dot={
              !isEmpty
                ? {
                    r: 4,
                    fill: "#1e293b",
                    stroke: "#64748b",
                    strokeWidth: 2,
                  }
                : false
            }
            activeDot={
              !isEmpty
                ? {
                    r: 6,
                    fill: "#f97316",
                    stroke: "#fff",
                    strokeWidth: 2,
                  }
                : false
            }
          />
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
};
