import { AlertTriangle, Check, Music2, Radio, X } from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";
import type { DetectedSession, VdjHistoryTrack } from "../hooks/useVdjHistory";

export interface OverlapSession {
  id: number;
  name: string | null;
}

export interface StartOptions {
  name: string;
  /** Broadcast/record the currently-playing track (only meaningful if one exists). */
  includeCurrentTrack: boolean;
  /** Backfill an earlier VirtualDJ set into this session, or null to start clean. */
  importEarlier: { tracks: VdjHistoryTrack[]; startIndex: number } | null;
}

interface Props {
  /** The genuinely-playing current track (already staleness-gated), or null. */
  currentTrack: { artist: string; title: string } | null;
  /** A detected earlier set (before a 30-min gap), or null. */
  detectedSession: DetectedSession | null;
  /** Existing local sessions that overlap the detected set (duplicate-import risk). */
  overlap: OverlapSession[] | null;
  defaultName: string;
  onStart: (opts: StartOptions) => void;
  onCancel: () => void;
}

/**
 * One modal for going live. Replaces the previous duplicate-warning → import →
 * name modal chain. Title is always shown; "Start with this track" appears only
 * when something is actually playing; "Add my earlier set" is an opt-in.
 */
export function StartSessionModal({
  currentTrack,
  detectedSession,
  overlap,
  defaultName,
  onStart,
  onCancel,
}: Props) {
  const [sessionName, setSessionName] = useState(defaultName);
  const [includeCurrentTrack, setIncludeCurrentTrack] = useState(true);
  const [addEarlierSet, setAddEarlierSet] = useState(false);
  const [selectedStartIndex, setSelectedStartIndex] = useState(0);
  const [showFullList, setShowFullList] = useState(false);

  const earlierTracks = detectedSession?.tracks ?? [];
  const hasEarlierSet = earlierTracks.length > 0;
  const selectedTracks = earlierTracks.slice(selectedStartIndex);
  const earlierDurationMin = detectedSession
    ? Math.round((detectedSession.endTime.getTime() - detectedSession.startTime.getTime()) / 60000)
    : 0;
  const hasOverlap = !!overlap && overlap.length > 0;

  const handleStart = () => {
    onStart({
      name: sessionName.trim() || defaultName,
      includeCurrentTrack: currentTrack ? includeCurrentTrack : false,
      importEarlier:
        addEarlierSet && detectedSession
          ? { tracks: detectedSession.tracks, startIndex: selectedStartIndex }
          : null,
    });
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md bg-slate-900 border border-slate-700/50 rounded-3xl shadow-2xl max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-8 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 text-pika-accent">
              <Radio size={28} className="animate-pulse" />
              <h3 className="text-2xl font-bold text-white tracking-tight">Start New Session</h3>
            </div>
            <button
              type="button"
              onClick={onCancel}
              className="p-2 text-slate-500 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            >
              <X size={22} />
            </button>
          </div>

          {/* Set title */}
          <div className="space-y-3">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">
              Set Title
            </label>
            <input
              type="text"
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
              placeholder="e.g. Friday Night Social"
              className="w-full bg-slate-950 border border-slate-700 rounded-2xl px-5 py-4 text-white placeholder:text-slate-600 focus:border-pika-accent outline-none transition-all font-bold text-lg"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleStart();
                if (e.key === "Escape") onCancel();
              }}
            />
          </div>

          {/* Now Playing — only when a track is genuinely playing */}
          {currentTrack && (
            <button
              type="button"
              onClick={() => setIncludeCurrentTrack((v) => !v)}
              className={`w-full text-left rounded-2xl border p-4 transition-all ${
                includeCurrentTrack
                  ? "bg-emerald-500/10 border-emerald-500/30"
                  : "bg-slate-950/50 border-slate-800 hover:border-slate-700"
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 border transition-all ${
                    includeCurrentTrack
                      ? "bg-emerald-500 border-emerald-500 text-white"
                      : "bg-slate-900 border-slate-700 text-transparent"
                  }`}
                >
                  <Check size={14} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-emerald-500 leading-none mb-1">
                    Start with this track
                  </p>
                  <p className="text-sm font-bold text-white truncate">{currentTrack.title}</p>
                  <p className="text-xs text-slate-400 truncate">{currentTrack.artist}</p>
                </div>
                <Music2 size={18} className="text-slate-500 shrink-0" />
              </div>
            </button>
          )}

          {/* Earlier set — opt-in backfill */}
          {hasEarlierSet && (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setAddEarlierSet((v) => !v)}
                className={`w-full text-left rounded-2xl border p-4 transition-all ${
                  addEarlierSet
                    ? "bg-pika-accent/10 border-pika-accent/30"
                    : "bg-slate-950/50 border-slate-800 hover:border-slate-700"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 border transition-all ${
                      addEarlierSet
                        ? "bg-pika-accent border-pika-accent text-white"
                        : "bg-slate-900 border-slate-700 text-transparent"
                    }`}
                  >
                    <Check size={14} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-white">Add my earlier set</p>
                    <p className="text-xs text-slate-400">
                      {earlierTracks.length} tracks · ~{earlierDurationMin}m before now
                    </p>
                  </div>
                </div>
              </button>

              {addEarlierSet && (
                <div className="space-y-3 pl-1">
                  {hasOverlap && (
                    <div className="flex items-start gap-2.5 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-500/90 text-[11px] leading-relaxed font-medium">
                      <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                      <span>
                        You may have already saved these into{" "}
                        <strong>{overlap?.[0].name || `Session #${overlap?.[0].id}`}</strong>.
                        Adding them again creates duplicate history.
                      </span>
                    </div>
                  )}

                  {/* Timeline start */}
                  <div className="flex items-center gap-3 bg-slate-950/50 border border-slate-800 rounded-2xl p-1">
                    <label className="flex-1 text-[11px] font-bold text-slate-400 pl-4 uppercase tracking-tight">
                      Start From:
                    </label>
                    <select
                      value={selectedStartIndex}
                      onChange={(e) => setSelectedStartIndex(Number(e.target.value))}
                      className="bg-slate-900 border-l border-slate-800 text-white text-xs py-2.5 px-4 rounded-r-xl outline-none cursor-pointer hover:bg-slate-800 transition-colors min-w-[200px] text-right font-bold"
                    >
                      <option value={0}>First song (full set)</option>
                      {earlierTracks.map(
                        (_, idx) =>
                          idx > 0 && (
                            <option key={`start-${idx}`} value={idx}>
                              Track #{idx + 1} ({earlierTracks.length - idx} items)
                            </option>
                          ),
                      )}
                    </select>
                  </div>

                  {/* Preview */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">
                        Timeline
                      </p>
                      <button
                        type="button"
                        onClick={() => setShowFullList((v) => !v)}
                        className="text-[10px] font-bold text-pika-accent hover:underline uppercase tracking-wider"
                      >
                        {showFullList ? "Collapse" : "View all"}
                      </button>
                    </div>
                    <div className="max-h-44 overflow-y-auto bg-slate-950/30 rounded-2xl border border-slate-800/50 p-2 space-y-1.5">
                      {(showFullList ? selectedTracks : selectedTracks.slice(0, 4)).map(
                        (track, idx) => (
                          <div
                            key={`${track.timestamp}-${track.title}`}
                            className="flex items-center gap-3 p-2 rounded-xl"
                          >
                            <div className="shrink-0 w-7 h-7 bg-slate-800 rounded-lg flex items-center justify-center">
                              <span className="text-[10px] font-black text-slate-500">
                                {selectedStartIndex + idx + 1}
                              </span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-bold text-white truncate">{track.title}</p>
                              <p className="text-[10px] text-slate-500 truncate">{track.artist}</p>
                            </div>
                          </div>
                        ),
                      )}
                      {!showFullList && selectedTracks.length > 4 && (
                        <div className="text-[10px] font-bold text-slate-600 text-center py-2 uppercase tracking-widest">
                          + {selectedTracks.length - 4} more
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 px-6 py-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-2xl transition-all border border-slate-700 uppercase text-xs tracking-widest"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleStart}
              className="flex-[2] px-6 py-4 bg-pika-accent hover:bg-pika-accent-light text-white font-black rounded-2xl transition-all shadow-xl shadow-pika-accent/20 flex items-center justify-center gap-2 uppercase text-xs tracking-widest"
            >
              <Radio size={16} />
              Go Live
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
