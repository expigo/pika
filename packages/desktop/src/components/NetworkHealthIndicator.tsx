import { Activity, WifiOff } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

export type ConnectionStatus = "connecting" | "connected" | "disconnected";

interface Props {
  status: ConnectionStatus;
  latency?: number; // External latency (if available)
  pingEndpoint?: string; // Optional endpoint to ping for latency
  env?: string;
}

export function NetworkHealthIndicator({
  status,
  latency: externalLatency,
  pingEndpoint,
  env,
}: Props) {
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
        await fetch(pingEndpoint, {
          method: "GET",
          cache: "no-store",
          signal: AbortSignal.timeout(5000), // 🛡️ Issue 15 Fix: Prevent hanging requests
        });
        const end = performance.now();
        setMeasuredLatency(Math.round(end - start));
      } catch {
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
    if (displayLatency > 400) return "poor";
    if (displayLatency > 150) return "fair";
    return "good";
  }, [status, displayLatency]);

  if (status !== "connected") {
    return (
      <div className="flex items-center">
        <div
          className="flex items-center gap-2 px-4 py-2 bg-red-600 border-2 border-white text-white rounded-xl text-sm font-[1000] animate-pulse-fast shadow-[0_0_40px_rgba(220,38,38,0.8)]"
          style={{ animationDuration: "0.4s" }}
        >
          <WifiOff size={18} />
          <span className="tracking-tighter">OFFLINE</span>
        </div>
      </div>
    );
  }

  const statusConfig = {
    good: { color: "text-emerald-400", border: "border-emerald-500/30", bg: "bg-emerald-500/10" },
    fair: { color: "text-amber-400", border: "border-amber-500/30", bg: "bg-amber-500/10" },
    poor: {
      color: "text-orange-500",
      border: "border-orange-500 text-orange-500 animate-pulse",
      bg: "bg-orange-500/10",
    },
    critical: {
      color: "text-white",
      border: "border-white animate-pulse-fast",
      bg: "bg-red-600 shadow-[0_0_50px_rgba(220,38,38,0.5)]",
    },
  }[health];

  return (
    <div className="flex items-center gap-2">
      {env && (
        <div className="px-2 py-1 bg-white/5 border border-white/10 rounded-lg text-[9px] font-black text-slate-500 uppercase tracking-widest hidden sm:block">
          {env}
        </div>
      )}
      <div
        className={`flex items-center gap-2 px-3 py-1.5 border rounded-xl text-sm font-black transition-all ${statusConfig.border} ${statusConfig.bg} ${statusConfig.color}`}
      >
        <Activity size={16} />
        <span className="tabular-nums">{displayLatency}ms</span>
      </div>
    </div>
  );
}
