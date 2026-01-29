import { Check, Music2, Radio, X } from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";
import type { DetectedSession, VdjHistoryTrack } from "../hooks/useVdjHistory";

interface Props {
  detectedSession: DetectedSession;
  currentTrack: { artist: string; title: string } | null;
  onImport: (tracks: VdjHistoryTrack[], fromIndex?: number, sessionName?: string) => void;
  onSkip: (sessionName?: string) => void;
  onCancel: () => void;
}

export function SessionImportModal({
  detectedSession,
  currentTrack,
  onImport,
  onSkip,
  onCancel,
}: Props) {
  const [selectedStartIndex, setSelectedStartIndex] = useState(0);
  const [showFullList, setShowFullList] = useState(false);
  const [sessionName, setSessionName] = useState(`Live Set ${new Date().toLocaleDateString()}`);

  const selectedTracks = detectedSession.tracks.slice(selectedStartIndex);
  const duration = Math.round(
    (detectedSession.endTime.getTime() - detectedSession.startTime.getTime()) / 60000,
  );

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-3xl shadow-2xl max-h-[90vh] overflow-y-auto flex flex-col">
        <div className="p-6 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3 text-pika-accent">
              <Music2 size={28} />
              <div>
                <h2 className="text-2xl font-bold text-white">Import VirtualDJ History?</h2>
                <p className="text-sm text-slate-400 mt-1">
                  Found {detectedSession.tracks.length} tracks ({duration} minutes)
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onCancel}
              className="p-2 text-slate-500 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            >
              <X size={24} />
            </button>
          </div>

          {/* Body Content - Scrollable */}
          <div className="space-y-4">
            {/* Session Name Input (Seamless Flow) */}
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">
                Session Name
              </label>
              <input
                type="text"
                value={sessionName}
                onChange={(e) => setSessionName(e.target.value)}
                className="w-full bg-slate-950/80 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder:text-slate-600 focus:border-pika-accent outline-none transition-all font-medium"
              />
            </div>

            {/* Session Info */}
            <div className="grid grid-cols-2 gap-4 p-4 bg-slate-950/50 rounded-xl border border-slate-800 shrink-0">
              {/* ... (start/end info) ... */}
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Session Start
                </p>
                <p className="text-sm font-semibold text-white">
                  {detectedSession.startTime.toLocaleTimeString()}
                </p>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Last Track
                </p>
                <p className="text-sm font-semibold text-white">
                  {detectedSession.endTime.toLocaleTimeString()}
                </p>
              </div>
            </div>

            {currentTrack && (
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl shrink-0">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <p className="text-[10px] font-black uppercase tracking-widest text-emerald-500">
                      Deck Status: Playing Now
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4 bg-slate-950/40 p-3 rounded-xl border border-emerald-500/10">
                  <div className="w-10 h-10 bg-emerald-500/20 rounded-lg flex items-center justify-center shrink-0">
                    <Music2 size={20} className="text-emerald-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-white truncate">{currentTrack.title}</p>
                    <p className="text-xs text-slate-400 truncate">{currentTrack.artist}</p>
                  </div>
                </div>

                {(() => {
                  const isInImport = detectedSession.tracks.some(
                    (t) =>
                      t.artist.toLowerCase() === currentTrack.artist.toLowerCase() &&
                      t.title.toLowerCase() === currentTrack.title.toLowerCase(),
                  );
                  return isInImport ? (
                    <div className="flex items-center gap-2 mt-3 text-[10px] font-bold text-slate-400 uppercase tracking-tight">
                      <div className="w-4 h-4 rounded-full bg-slate-800 flex items-center justify-center shrink-0">
                        <Check size={10} className="text-emerald-500" />
                      </div>
                      <span>Seamless Transition: This track is already in your history</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 mt-3 text-[10px] font-bold text-amber-500 uppercase tracking-tight">
                      <div className="w-4 h-4 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0 border border-amber-500/20">
                        <span className="text-[10px]">!</span>
                      </div>
                      <span>Bridge Required: This song will be added to the end of your set</span>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Track Preview */}
            <div className="space-y-2">
              <div className="flex items-center justify-between shrink-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">
                  History Timeline
                </p>
                <button
                  type="button"
                  onClick={() => setShowFullList(!showFullList)}
                  className="text-[10px] font-bold text-pika-accent hover:underline cursor-pointer uppercase tracking-wider"
                >
                  {showFullList ? "Collapse" : "View All"}
                </button>
              </div>

              <div className="max-h-56 overflow-y-auto bg-slate-950/30 rounded-2xl border border-slate-800/50 p-2 space-y-1.5 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
                {(showFullList ? selectedTracks : selectedTracks.slice(0, 5)).map((track, idx) => (
                  <div
                    key={`${track.timestamp}-${track.title}`}
                    className="flex items-center gap-3 p-2 hover:bg-slate-800/40 rounded-xl transition-colors group"
                  >
                    <div className="flex-shrink-0 w-7 h-7 bg-slate-800 group-hover:bg-pika-accent/10 rounded-lg flex items-center justify-center transition-colors">
                      <span className="text-[10px] font-black text-slate-500 group-hover:text-pika-accent">
                        {selectedStartIndex + idx + 1}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-white truncate">{track.title}</p>
                      <p className="text-[10px] text-slate-500 truncate font-medium">
                        {track.artist}
                      </p>
                    </div>
                    <span className="text-[10px] text-slate-600 tabular-nums flex items-center gap-1.5 font-mono">
                      {new Date(track.timestamp * 1000).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {idx > 0 &&
                        (() => {
                          const prevTrack = selectedTracks[idx - 1];
                          const gapMinutes = Math.floor(
                            (track.timestamp - prevTrack.timestamp) / 60,
                          );
                          return gapMinutes >= 10 ? (
                            <span className="text-[9px] text-amber-500 font-black bg-amber-500/10 px-1 py-0.5 rounded border border-amber-500/10">
                              +{gapMinutes}M
                            </span>
                          ) : null;
                        })()}
                    </span>
                  </div>
                ))}

                {!showFullList && selectedTracks.length > 5 && (
                  <div className="text-[10px] font-bold text-slate-600 text-center py-2 uppercase tracking-widest bg-slate-900/50 rounded-lg border border-dashed border-slate-800">
                    + {selectedTracks.length - 5} history items hidden
                  </div>
                )}
              </div>
            </div>

            {/* Import Options (Improved List Option) */}
            <div className="space-y-3 shrink-0">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">
                Playback Configuration
              </p>

              <div className="flex items-center gap-3 bg-slate-950/50 border border-slate-800 rounded-2xl p-1 relative hover:border-slate-700 transition-colors">
                <label className="flex-1 text-[11px] font-bold text-slate-400 pl-4 uppercase tracking-tight">
                  Timeline Start:
                </label>
                <select
                  value={selectedStartIndex}
                  onChange={(e) => setSelectedStartIndex(Number(e.target.value))}
                  className="bg-slate-900 border-l border-slate-800 text-white text-xs py-2.5 px-4 rounded-r-xl outline-none cursor-pointer hover:bg-slate-800 transition-colors appearance-none min-w-[220px] text-right font-bold"
                  style={{ textAlignLast: "right" }}
                >
                  <option value={0}>From First Song (Full Session)</option>
                  {detectedSession.tracks.map(
                    (_, idx) =>
                      idx > 0 && (
                        <option key={`start-option-${idx}`} value={idx}>
                          Track #{idx + 1} ({detectedSession.tracks.length - idx} items)
                        </option>
                      ),
                  )}
                </select>
                <div className="absolute right-4 pointer-events-none text-slate-500 opacity-50">
                  <div className="w-2 h-2 border-r-2 border-b-2 border-current rotate-45" />
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="p-6 bg-slate-950/50 border-t border-slate-800 rounded-b-3xl">
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => onSkip(sessionName)}
                className="flex-1 px-6 py-4 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white text-sm font-bold rounded-2xl transition-all border border-slate-800 cursor-pointer uppercase tracking-widest shadow-lg active:scale-95"
              >
                Start Fresh
              </button>
              <button
                type="button"
                onClick={() => onImport(selectedTracks, selectedStartIndex, sessionName)}
                className="flex-[2] px-6 py-4 bg-pika-accent hover:bg-pika-accent-light text-white text-sm font-black rounded-2xl transition-all shadow-xl shadow-pika-accent/20 cursor-pointer uppercase tracking-widest active:scale-95 flex items-center justify-center gap-3"
              >
                <Radio size={18} className="animate-pulse" />
                Go Live With {selectedTracks.length} tracks
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
