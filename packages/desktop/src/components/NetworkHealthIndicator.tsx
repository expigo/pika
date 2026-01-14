import { Activity, WifiOff } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

export type ConnectionStatus = "connecting" | "connected" | "disconnected";

interface Props {
  status: ConnectionStatus;
  latency?: number; // External latency (if available)
  pingEndpoint?: string; // Optional endpoint to ping for latency
}

export function NetworkHealthIndicator({ status, latency: externalLatency, pingEndpoint }: Props) {
  const [measuredLatency, setMeasuredLatency] = useState<number | null>(null);

  // Ping loop
  useEffect(() => {
    if (!pingEndpoint || status !== "connected") {
      setMeasuredLatency(null);
      return;
    }

    const checkLatency = async () => {
      const start = performance.now();
      try {
        await fetch(pingEndpoint, { method: "GET", cache: "no-store" });
        const end = performance.now();
        setMeasuredLatency(Math.round(end - start));
      } catch (e) {
        // Ping failed
        setMeasuredLatency(null);
      }
    };

    // Check immediately
    checkLatency();

    // Loop
    const interval = setInterval(checkLatency, 5000); // Every 5 seconds
    return () => clearInterval(interval);
  }, [pingEndpoint, status]);

  const displayLatency = externalLatency || measuredLatency || 0;

  const health = useMemo(() => {
    if (status !== "connected") return "critical";
    if (displayLatency > 500) return "poor";
    if (displayLatency > 200) return "fair";
    return "good";
  }, [status, displayLatency]);

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
        <span>{displayLatency}ms</span>
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
