import { Music2, X } from "lucide-react";
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
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl shrink-0">
                <div className="flex items-center gap-2 mb-2">
                  <Music2 size={16} className="text-emerald-500" />
                  <p className="text-xs font-bold text-emerald-500 uppercase tracking-wider">
                    Currently Playing
                  </p>
                </div>
                <p className="text-sm font-semibold text-white">
                  {currentTrack.artist} - {currentTrack.title}
                </p>
                {(() => {
                  const isInImport = detectedSession.tracks.some(
                    (t) =>
                      t.artist.toLowerCase() === currentTrack.artist.toLowerCase() &&
                      t.title.toLowerCase() === currentTrack.title.toLowerCase(),
                  );
                  return isInImport ? (
                    <p className="text-xs text-slate-400 mt-1">✓ Already in import list</p>
                  ) : (
                    <p className="text-xs text-amber-400 mt-1">
                      ⚠️ Not in import list (will be added separately)
                    </p>
                  );
                })()}
              </div>
            )}

            {/* Track Preview */}
            <div className="space-y-2">
              <div className="flex items-center justify-between shrink-0">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Track List Preview
                </p>
                <button
                  type="button"
                  onClick={() => setShowFullList(!showFullList)}
                  className="text-xs text-pika-accent hover:underline cursor-pointer"
                >
                  {showFullList ? "Show Less" : "Show All"}
                </button>
              </div>

              <div className="max-h-64 overflow-y-auto bg-slate-950/30 rounded-xl border border-slate-800 p-3 space-y-2 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
                {(showFullList ? selectedTracks : selectedTracks.slice(0, 5)).map((track, idx) => (
                  <div
                    key={`${track.timestamp}-${track.title}`}
                    className="flex items-center gap-3 p-2 bg-slate-800/40 rounded-lg"
                  >
                    <div className="flex-shrink-0 w-8 h-8 bg-pika-accent/10 rounded-full flex items-center justify-center">
                      <span className="text-xs font-bold text-pika-accent">
                        {selectedStartIndex + idx + 1}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{track.title}</p>
                      <p className="text-xs text-slate-500 truncate">{track.artist}</p>
                    </div>
                    <span className="text-xs text-slate-600 tabular-nums flex items-center gap-2">
                      {new Date(track.timestamp * 1000).toLocaleTimeString()}
                      {idx > 0 &&
                        (() => {
                          const prevTrack = selectedTracks[idx - 1];
                          const gapMinutes = Math.floor(
                            (track.timestamp - prevTrack.timestamp) / 60,
                          );
                          return gapMinutes >= 10 ? (
                            <span className="text-[10px] text-amber-500 font-bold bg-amber-500/10 px-1.5 py-0.5 rounded">
                              (+{gapMinutes}m)
                            </span>
                          ) : null;
                        })()}
                    </span>
                  </div>
                ))}

                {!showFullList && selectedTracks.length > 5 && (
                  <p className="text-xs text-slate-500 text-center py-2">
                    ... and {selectedTracks.length - 5} more tracks
                  </p>
                )}
              </div>
            </div>

            {/* Import Options (Improved List Option) */}
            <div className="space-y-3 shrink-0">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Import Options
              </p>

              <div className="flex items-center gap-3 bg-slate-950/50 border border-slate-700 rounded-xl p-1 relative">
                <label className="flex-1 text-sm text-slate-300 pl-3">Start importing from:</label>
                <select
                  value={selectedStartIndex}
                  onChange={(e) => setSelectedStartIndex(Number(e.target.value))}
                  className="bg-slate-900 border-l border-slate-700 text-white text-sm py-2 px-4 rounded-r-lg outline-none cursor-pointer hover:bg-slate-800 transition-colors appearance-none min-w-[200px] text-right"
                  style={{ textAlignLast: "right" }}
                >
                  <option value={0}>Track #1 (All {detectedSession.tracks.length})</option>
                  {detectedSession.tracks.map(
                    (_, idx) =>
                      idx > 0 && (
                        <option key={`start-option-${idx}`} value={idx}>
                          Track #{idx + 1} ({detectedSession.tracks.length - idx} left)
                        </option>
                      ),
                  )}
                </select>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4 shrink-0">
            <button
              type="button"
              onClick={() => onSkip(sessionName)}
              className="flex-1 px-6 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl transition-all border border-slate-700 cursor-pointer"
            >
              Skip History (Start New)
            </button>
            <button
              type="button"
              onClick={() => onImport(selectedTracks, selectedStartIndex, sessionName)}
              className="flex-1 px-6 py-3 bg-pika-accent hover:bg-pika-accent-light text-white font-bold rounded-xl transition-all shadow-lg shadow-pika-accent/20 cursor-pointer"
            >
              Go Live with {selectedTracks.length} Track{selectedTracks.length !== 1 ? "s" : ""}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
