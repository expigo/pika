import { useMemo } from "react";
import { Activity, WifiOff } from "lucide-react";

export type ConnectionStatus = "connecting" | "connected" | "disconnected";

interface Props {
  status: ConnectionStatus;
  latency?: number; // In milliseconds
  lastPing?: number; // Timestamp of last ping
}

export function NetworkHealthIndicator({ status, latency = 0 }: Props) {
  // Determine health state
  const health = useMemo(() => {
    if (status !== "connected") return "critical";
    if (latency > 500) return "poor";
    if (latency > 200) return "fair";
    return "good";
  }, [status, latency]);

  const color = {
    good: "#22c55e", // Green
    fair: "#eab308", // Yellow
    poor: "#f97316", // Orange
    critical: "#ef4444", // Red
  }[health];

  if (status !== "connected") {
    return (
      <div style={styles.container}>
        <div style={{ ...styles.badge, borderColor: color, color }}>
          <WifiOff size={14} />
          <span>OFFLINE</span>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={{ ...styles.badge, borderColor: color, color }}>
        <Activity size={14} />
        <span>{latency}ms</span>
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: "flex",
    alignItems: "center",
    marginLeft: "1rem",
  },
  badge: {
    display: "flex",
    alignItems: "center",
    gap: "0.4rem",
    padding: "0.3rem 0.6rem",
    background: "rgba(0,0,0,0.2)",
    border: "1px solid",
    borderRadius: "6px",
    fontSize: "0.875rem",
    fontWeight: "bold" as const, // Fix for React style types
  },
};
