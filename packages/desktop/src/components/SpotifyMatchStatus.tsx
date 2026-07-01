import { Disc3, Loader2, Pause, Play, RefreshCcw, Square } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { trackRepository } from "../db/repositories/trackRepository";
import { useLibraryRefresh } from "../hooks/useLibraryRefresh";
import { useSpotifyMatcher } from "../hooks/useSpotifyMatcher";

interface Props {
  /** Whether the DJ is logged into Pika (matching needs the token — cap-free app-token search). */
  authenticated: boolean;
  onComplete?: () => void;
}

/**
 * Slice 2 — the single home (trigger + progress) for the background library pre-matcher, mirroring
 * `AnalyzerStatus`. Lives once in the App header so the job survives navigation/modal unmounts.
 */
export function SpotifyMatchStatus({ authenticated, onComplete }: Props) {
  const {
    isMatching,
    isPaused,
    currentTrack,
    progress,
    total,
    matched,
    skipped,
    error,
    start,
    stop,
    pause,
    resume,
  } = useSpotifyMatcher();

  const { triggerRefresh } = useLibraryRefresh();
  const [showDetails, setShowDetails] = useState(false);
  const [unmatched, setUnmatched] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const loadCount = useCallback(() => {
    trackRepository
      .getUnmatchedCount()
      .then(setUnmatched)
      .catch(() => setUnmatched(0));
  }, []);

  // Fresh count on mount + whenever the popover opens or a run finishes.
  useEffect(() => {
    if (!isMatching) loadCount();
  }, [isMatching, loadCount]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowDetails(false);
      }
    }
    if (showDetails) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showDetails]);

  const runThen = useCallback(async () => {
    await start();
    triggerRefresh();
    onComplete?.();
    loadCount();
  }, [start, triggerRefresh, onComplete, loadCount]);

  const handleRematch = useCallback(async () => {
    await trackRepository.clearUnmatchedAttempts();
    await runThen();
    setShowDetails(false);
  }, [runThen]);

  const progressPercent = total > 0 ? Math.round((progress / total) * 100) : 0;
  const currentTrackLabel = currentTrack
    ? `${currentTrack.artist || "Unknown"} - ${currentTrack.title || "Untitled"}`
    : "Starting…";

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setShowDetails(!showDetails)}
        className={`flex items-center gap-3 px-3 py-1.5 rounded-full border transition-all ${
          isMatching
            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
            : "bg-pika-surface-2 border-pika-border text-slate-400 hover:border-slate-600"
        }`}
      >
        <Disc3 size={14} className={isMatching && !isPaused ? "animate-spin" : ""} />
        <div className="flex flex-col items-start leading-none">
          <span className="text-[10px] font-bold uppercase tracking-tight">
            {isMatching ? (isPaused ? "Match Paused" : "Matching Library") : "Spotify Match"}
          </span>
          <span className="text-[9px] font-mono opacity-70 mt-0.5">
            {isMatching ? `${progress} / ${total} (${progressPercent}%)` : `${unmatched} unmatched`}
          </span>
        </div>
      </button>

      {showDetails && (
        <div className="absolute top-full right-0 mt-2 w-72 bg-pika-surface-1/95 border border-pika-border rounded-xl shadow-2xl backdrop-blur-xl z-[100] p-4 animate-in fade-in zoom-in-95 duration-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
              <Disc3 size={14} className="text-pika-accent" />
              Spotify Match
            </h3>
            <button
              type="button"
              onClick={() => setShowDetails(false)}
              className="text-slate-500 hover:text-slate-300"
            >
              <RefreshCcw size={12} className="rotate-45" />
            </button>
          </div>

          {isMatching ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-[10px] font-mono text-slate-400">
                  <span>
                    {matched} matched · {skipped} skipped
                  </span>
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
                <div className="text-[9px] font-bold text-slate-500 uppercase mb-1">Matching</div>
                <div className="text-[11px] text-slate-300 truncate font-medium">
                  {currentTrackLabel}
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={isPaused ? resume : pause}
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
                  onClick={stop}
                  className="px-3 bg-red-600/20 hover:bg-red-600/30 text-red-500 border border-red-600/30 rounded-lg"
                >
                  <Square size={12} />
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Match your library to Spotify so dancers see album art + "Listen on Spotify" live.
                Runs in the background; only confident matches are kept.
              </p>
              <div className="flex flex-col gap-2 pt-2">
                <button
                  type="button"
                  disabled={!authenticated || unmatched === 0}
                  onClick={runThen}
                  className="w-full py-2.5 bg-pika-accent hover:bg-pika-accent-light disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-xs font-bold shadow-lg shadow-pika-accent/20 flex items-center justify-center gap-2 transition-all"
                >
                  {authenticated ? (
                    <>
                      <Play size={14} fill="currentColor" />
                      {unmatched === 0 ? "Library fully matched" : `Match ${unmatched} tracks`}
                    </>
                  ) : (
                    <>
                      <Loader2 size={14} />
                      Connect Pika to match
                    </>
                  )}
                </button>
                {authenticated && (
                  <button
                    type="button"
                    onClick={handleRematch}
                    className="w-full py-2 text-slate-400 hover:text-slate-200 text-[10px] font-bold uppercase tracking-widest transition-colors"
                  >
                    Re-match unmatched
                  </button>
                )}
              </div>
            </div>
          )}

          {error && (
            <div className="mt-3 p-2 bg-red-500/10 border border-red-500/20 rounded text-[10px] text-red-400 italic">
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
