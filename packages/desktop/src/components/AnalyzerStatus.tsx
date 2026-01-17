import { useAnalyzer } from "../hooks/useAnalyzer";
import { useLibraryRefresh } from "../hooks/useLibraryRefresh";
import { FlaskConical, Play, Pause, Square, RefreshCcw, Loader2 } from "lucide-react";
import { useState } from "react";
import * as trackRepo from "../db/repositories/trackRepository";

interface Props {
  baseUrl: string | null;
  onComplete?: () => void;
}

export function AnalyzerStatus({ baseUrl, onComplete }: Props) {
  const {
    isAnalyzing,
    isPaused,
    currentTrack,
    progress,
    totalToAnalyze,
    error,
    startAnalysis,
    stopAnalysis,
    pauseAnalysis,
    resumeAnalysis,
  } = useAnalyzer();

  const { triggerRefresh } = useLibraryRefresh();
  const [showDetails, setShowDetails] = useState(false);

  const handleStart = async () => {
    if (!baseUrl) return;
    await startAnalysis(baseUrl);
    triggerRefresh();
    onComplete?.();
  };

  const progressPercent = totalToAnalyze > 0 ? Math.round((progress / totalToAnalyze) * 100) : 0;

  const currentTrackLabel = currentTrack
    ? `${currentTrack.artist || "Unknown"} - ${currentTrack.title || "Untitled"}`
    : "Initializing...";

  if (!baseUrl && !isAnalyzing) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/50 rounded-full border border-slate-700/50">
        <Loader2 size={14} className="animate-spin text-slate-600" />
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
          Engine Offline
        </span>
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setShowDetails(!showDetails)}
        className={`flex items-center gap-3 px-3 py-1.5 rounded-full border transition-all ${
          isAnalyzing
            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
            : "bg-pika-surface-2 border-pika-border text-slate-400 hover:border-slate-600"
        }`}
      >
        <FlaskConical size={14} className={isAnalyzing && !isPaused ? "animate-pulse" : ""} />

        <div className="flex flex-col items-start leading-none">
          <span className="text-[10px] font-bold uppercase tracking-tight">
            {isAnalyzing ? (isPaused ? "Analysis Paused" : "Analyzing Crate") : "Audio Analysis"}
          </span>
          {isAnalyzing && (
            <span className="text-[9px] font-mono opacity-70 mt-0.5">
              {progress} / {totalToAnalyze} ({progressPercent}%)
            </span>
          )}
        </div>
      </button>

      {showDetails && (
        <div className="absolute top-full right-0 mt-2 w-72 bg-pika-surface-1/95 border border-pika-border rounded-xl shadow-2xl backdrop-blur-xl z-[100] p-4 animate-in fade-in zoom-in-95 duration-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
              <FlaskConical size={14} className="text-pika-accent" />
              Progress Engine
            </h3>
            <button
              onClick={() => setShowDetails(false)}
              className="text-slate-500 hover:text-slate-300"
            >
              <RefreshCcw size={12} className="rotate-45" />
            </button>
          </div>

          {isAnalyzing ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-[10px] font-mono text-slate-400">
                  <span>Queue Progress</span>
                  <span>{progressPercent}%</span>
                </div>
                <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 transition-all duration-500"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>

              <div className="p-2 bg-slate-900/50 rounded-lg border border-slate-800">
                <div className="text-[9px] font-bold text-slate-500 uppercase mb-1">Processing</div>
                <div className="text-[11px] text-slate-300 truncate font-medium">
                  {currentTrackLabel}
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={isPaused ? resumeAnalysis : pauseAnalysis}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-colors ${
                    isPaused
                      ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                      : "bg-amber-600/20 hover:bg-amber-600/30 text-amber-500 border border-amber-600/30"
                  }`}
                >
                  {isPaused ? <Play size={12} /> : <Pause size={12} />}
                  {isPaused ? "Resume" : "Pause"}
                </button>
                <button
                  type="button"
                  onClick={stopAnalysis}
                  className="px-3 bg-red-600/20 hover:bg-red-600/30 text-red-500 border border-red-600/30 rounded-lg"
                >
                  <Square size={12} />
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Scan your local crate to generate visual fingerprints, BPM, and energy profiles.
              </p>
              <div className="flex flex-col gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleStart}
                  className="w-full py-2.5 bg-pika-accent hover:bg-pika-accent-light text-white rounded-lg text-xs font-bold shadow-lg shadow-pika-accent/20 flex items-center justify-center gap-2 transition-all"
                >
                  <Play size={14} fill="currentColor" />
                  Start Full Scan
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await trackRepo.trackRepository.resetAnalysis();
                    await startAnalysis(baseUrl!);
                    setShowDetails(false);
                  }}
                  className="w-full py-2 text-slate-400 hover:text-slate-200 text-[10px] font-bold uppercase tracking-widest transition-colors"
                >
                  Reset & Re-analyze All
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="mt-3 p-2 bg-red-500/10 border border-red-500/20 rounded text-[10px] text-red-400 italic">
              Error: {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
