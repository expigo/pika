import { useMemo } from "react";
import { useSetStore, getSetStats } from "../hooks/useSetBuilder";
import { TrackFingerprint } from "./TrackFingerprint";
import type { Track } from "../db/repositories/trackRepository";

export function CrateWorkspaceStats() {
  const { activeSet } = useSetStore();
  const stats = useMemo(() => getSetStats(activeSet), [activeSet]);

  const setAverageMetrics = useMemo(() => {
    if (activeSet.length === 0) return null;
    const analyzed = activeSet.filter((t) => t.analyzed);
    if (analyzed.length === 0) return null;

    const avg = (fn: (t: Track) => number | null) => {
      const vals = analyzed.map(fn).filter((v) => v !== null) as number[];
      return vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
    };

    return {
      energy: avg((t) => t.energy),
      danceability: avg((t) => t.danceability),
      brightness: avg((t) => t.brightness),
      acousticness: avg((t) => t.acousticness),
      groove: avg((t) => t.groove),
    };
  }, [activeSet]);

  // Calculate total duration string
  const durationStr = useMemo(() => {
    if (stats.totalDuration === 0) {
      return activeSet.length > 0 ? "~ --" : "0s";
    }
    const h = Math.floor(stats.totalDuration / 3600);
    const m = Math.floor((stats.totalDuration % 3600) / 60);
    const s = stats.totalDuration % 60;

    if (h > 0) return `${h}H ${m}M`;
    if (m > 0) return `${m}M ${s}S`;
    return `${s}S`;
  }, [stats.totalDuration, activeSet.length]);

  return (
    <div className="h-full flex flex-col p-4 gap-3 bg-pika-surface/30">
      {/* Compact Pro Header */}
      <div className="flex items-center justify-between px-1">
        <div className="flex flex-col">
          <span className="text-[10px] font-black text-pika-accent uppercase tracking-[0.2em] mb-1">
            Vibe Profile
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-white leading-none tracking-tighter">
              {stats.totalTracks}
            </span>
            <span className="text-[9px] font-black text-slate-500 uppercase">Tracked</span>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1.5">
          <div className="flex items-center gap-1.5">
            <div className="flex items-center gap-1 px-2 py-0.5 bg-pika-accent/10 border border-pika-accent/20 rounded-md text-[9px] text-pika-accent font-black uppercase tracking-tighter">
              <div className="w-1 h-1 rounded-full bg-pika-accent animate-pulse" />
              {stats.avgEnergy} <span className="opacity-60">Intensity</span>
            </div>
            <div className="flex items-center gap-2 px-2 py-0.5 bg-pika-purple/5 border border-pika-purple/10 rounded-md text-[10px] text-pika-purple-light font-bold font-mono">
              {stats.avgBpm} <span className="opacity-40 text-[8px]">BPM</span>
            </div>
          </div>
          <div className="flex items-baseline gap-1.5 leading-none">
            <span className="text-sm font-bold text-slate-300 tracking-tight">{durationStr}</span>
            <span className="text-[8px] font-black text-slate-600 uppercase">Run</span>
          </div>
        </div>
      </div>

      {/* Main Chart Area */}
      <div className="flex-1 min-h-0 relative flex flex-col bg-slate-950/40 rounded-2xl border border-white/5 shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)] overflow-hidden">
        {setAverageMetrics ? (
          <div className="flex-1 min-h-0 w-full relative">
            <TrackFingerprint metrics={setAverageMetrics} />
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 opacity-20">
            <div className="w-16 h-16 rounded-full border-2 border-dashed border-slate-700 flex items-center justify-center">
              <div className="w-8 h-8 rounded-full bg-slate-800" />
            </div>
            <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">
              Analyzing Set...
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
