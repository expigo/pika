import {
  AlertCircle,
  AlertTriangle,
  Check,
  Edit3,
  Gauge,
  Link2,
  Music2,
  QrCode,
  Radio,
  Settings,
  Users,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getListenerUrl, getLocalIp, getRecapUrl } from "../config";
import { createDatabaseSession } from "../hooks/live/connectionManager";
import { generateSessionId } from "../hooks/live/trackBroadcast";
import { useDjSettings } from "../hooks/useDjSettings";
import { useLiveSession } from "../hooks/useLiveSession";
import { type DetectedSession, type VdjHistoryTrack, useVdjHistory } from "../hooks/useVdjHistory";
import { virtualDjWatcher } from "../services/virtualDjWatcher";
import { logger } from "../utils/logger";
import { SessionImportModal } from "./SessionImportModal";

interface PendingTrack {
  artist: string;
  title: string;
  isStale: boolean; // True if track timestamp is old (might not be currently playing)
}

export function LiveControl() {
  const {
    status,
    nowPlaying,
    error,
    isSessionActive,
    isCloudConnected,
    sessionId,
    listenerCount,
    tempoFeedback,
    goLive,
    endSet,
    clearNowPlaying,
    registerImportedTrack,
  } = useLiveSession();
  const { djName, setDjName, hasSetDjName, isAuthenticated } = useDjSettings();
  const { detectSession, importTracks } = useVdjHistory();

  const [showQR, setShowQR] = useState(false);
  const [showNameModal, setShowNameModal] = useState(false);
  const [showDjNamePrompt, setShowDjNamePrompt] = useState(false);
  const [showEditDjName, setShowEditDjName] = useState(false);
  const [showIncludeTrackPrompt, setShowIncludeTrackPrompt] = useState(false);
  const [pendingTrack, setPendingTrack] = useState<PendingTrack | null>(null);
  const [sessionName, setSessionName] = useState("");
  const [djNameInput, setDjNameInput] = useState("");
  const [lastSessionId, setLastSessionId] = useState<string | null>(null);
  const [recapCopied, setRecapCopied] = useState(false);
  const [localIp, setLocalIp] = useState<string | null>(null);

  // VDJ Import State
  const [detectedSession, setDetectedSession] = useState<DetectedSession | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);

  // Fetch local IP once on mount for QR codes
  useEffect(() => {
    getLocalIp().then(setLocalIp);
  }, []);

  // Generate QR URL only if we have a session (uses local IP if available for LAN testing)
  const qrUrl = sessionId ? getListenerUrl(sessionId, djName, localIp) : null;
  const recapUrl = lastSessionId ? getRecapUrl(lastSessionId, djName, localIp) : null;

  const [isDetectingHistory, setIsDetectingHistory] = useState(false);

  // ...

  const handleGoLiveClick = async () => {
    if (isSessionActive) {
      if (sessionId) {
        setLastSessionId(sessionId);
      }
      endSet();
    } else {
      setLastSessionId(null);
      if (!isAuthenticated && !hasSetDjName) {
        setDjNameInput("");
        setShowDjNamePrompt(true);
      } else {
        setIsDetectingHistory(true);
        try {
          await checkForVdjHistory();
        } finally {
          setIsDetectingHistory(false);
        }
      }
    }
  };

  const [showDuplicateWarningModal, setShowDuplicateWarningModal] = useState(false);
  const [overlappingSessions, setOverlappingSessions] = useState<
    { id: number; name: string | null }[] | null
  >(null);

  // ... (inside checkForVdjHistory)
  const checkForVdjHistory = async () => {
    const session = await detectSession();

    if (session && session.tracks.length > 0) {
      // 🛡️ Fix 3: Check for overlap with existing sessions to prevent duplicates
      const firstTrackTime = session.tracks[0].timestamp;
      const lastTrackTime = session.tracks[session.tracks.length - 1].timestamp;

      try {
        const { sessionRepository } = await import("../db/repositories/sessionRepository");

        const existingSessions = await sessionRepository.getSessionsInTimeRange(
          firstTrackTime,
          lastTrackTime,
        );

        if (existingSessions.length > 0) {
          // 🛡️ Fix Scenario 5: Block import with explicit warning
          setOverlappingSessions(existingSessions);
          setDetectedSession(session);
          setShowDuplicateWarningModal(true);
          return;
        }
      } catch (e) {
        logger.warn("Live Control", "Failed to check session overlap", e);
      }

      logger.info("Live Control", `Detected ${session.tracks.length} tracks in VDJ history`);
      setDetectedSession(session);
      setShowImportModal(true);
    } else {
      checkForCurrentTrack();
    }
  };

  const handleImportAndStart = async (
    tracks: VdjHistoryTrack[],
    startIndex = 0,
    sessionName?: string,
  ) => {
    try {
      setShowImportModal(false);
      // Use provided name or default
      const name = sessionName?.trim() || `Live Set ${new Date().toLocaleDateString()}`;

      // Create IDs
      const newSessionId = generateSessionId();
      const dbSessionId = await createDatabaseSession(name, newSessionId);

      const tracksToImport = tracks.slice(startIndex);
      logger.info("Live Control", `Starting import of ${tracksToImport.length} tracks`);
      toast.info("Importing track history...");

      // Import tracks
      // 🛡️ Fix 1: Register imported tracks in the internal dedup state
      // This is crucial: we prevented the module-level recordPlay from re-recording these
      // if they are still playing or re-played shortly.
      // We pass the registration callback directly to importTracks so it only runs on success
      const imported = await importTracks(tracks, dbSessionId, startIndex, registerImportedTrack);

      if (imported > 0) {
        toast.success(`Imported ${imported} tracks from VirtualDJ`);
      }

      // 🛡️ Fix 2: Smart Current Track Handling
      // Check if the actual *currently playing* track was just imported.
      // If so, tell goLive to SKIIP broadcasting/recording it (includeCurrentTrack = false).
      // If the DJ started a NEW track since the history scan, we WANT to include it.

      const currentVdjTrack = virtualDjWatcher.getCurrentTrack();
      const lastImportedTrack = tracksToImport[tracksToImport.length - 1];

      let includeCurrentTrack = true;
      if (currentVdjTrack && lastImportedTrack) {
        // Normalize strings for comparison
        const isSameTrack =
          currentVdjTrack.artist?.toLowerCase() === lastImportedTrack.artist.toLowerCase() &&
          currentVdjTrack.title?.toLowerCase() === lastImportedTrack.title.toLowerCase();

        if (isSameTrack) {
          logger.info(
            "Live Control",
            "Current track was just imported, skipping duplicate broadcast",
          );
          includeCurrentTrack = false;
        }
      }

      // Start live session IMMEDIATELY with provided name
      await goLive(name, includeCurrentTrack, { sessionId: newSessionId, dbSessionId });
      setDetectedSession(null);
    } catch (error) {
      logger.error("Live Control", "Failed to import and start", error);
      toast.error("Failed to import session");
      // Fallback to normal flow
      checkForCurrentTrack();
    }
  };

  const handleSkipImport = (sessionName?: string) => {
    setShowImportModal(false);
    setDetectedSession(null);

    // If name provided (via "Start New" in modal), we can fast-track
    if (sessionName) {
      const name = sessionName.trim();
      // User explicitly chose "Start New" (Skip History)
      // We start fresh, ignoring any currently loaded track in VDJ to avoid confusion
      goLive(name, false);
      return;
    }

    // Default flow if no name (shouldn't happen with new modal)
    checkForCurrentTrack();
  };

  // Check if there's a track playing and prompt to include it
  const checkForCurrentTrack = () => {
    const currentTrack = virtualDjWatcher.getCurrentTrack();
    if (currentTrack) {
      // Check if track is stale (older than 10 minutes)
      // This helps detect tracks from previous sessions that are still in VirtualDJ history
      const STALE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes
      const trackTime = currentTrack.timestamp?.getTime() ?? 0;
      const isStale = Date.now() - trackTime > STALE_THRESHOLD_MS;

      setPendingTrack({
        artist: currentTrack.artist,
        title: currentTrack.title,
        isStale,
      });
      setShowIncludeTrackPrompt(true);
    } else {
      // No current track, go straight to session name
      setSessionName(`Live Set ${new Date().toLocaleDateString()}`);
      setShowNameModal(true);
    }
  };

  const handleDjNameSubmit = () => {
    const name = djNameInput.trim();
    if (name) {
      setDjName(name);
      setShowDjNamePrompt(false);
      setShowEditDjName(false);
      // If this was the initial prompt, check history then track
      if (!hasSetDjName) {
        // We use checkVdjHistory here but need to make it async/await safe or just trigger it
        void checkForVdjHistory();
      }
    }
  };

  const handleEditDjName = () => {
    setDjNameInput(djName);
    setShowEditDjName(true);
  };

  const handleIncludeTrack = (include: boolean) => {
    setShowIncludeTrackPrompt(false);
    if (!include) {
      setPendingTrack(null); // Will be skipped
    }
    // Show session name modal
    setSessionName(`Live Set ${new Date().toLocaleDateString()}`);
    setShowNameModal(true);
  };

  const handleCopyRecapLink = async () => {
    if (recapUrl) {
      await navigator.clipboard.writeText(recapUrl);
      setRecapCopied(true);
      setTimeout(() => setRecapCopied(false), 2000);
    }
  };

  const handleDismissRecap = () => {
    setLastSessionId(null);
  };

  const handleStartSession = () => {
    // Pass the pending track decision to goLive
    goLive(sessionName.trim() || undefined, pendingTrack !== null);
    setShowNameModal(false);
    setSessionName("");
    setPendingTrack(null);
  };

  const handleCancelSession = () => {
    setShowNameModal(false);
    setSessionName("");
    setPendingTrack(null);
  };

  return (
    <div className="flex items-center gap-3">
      {/* Live Button */}
      <button
        type="button"
        onClick={handleGoLiveClick}
        disabled={status === "connecting" && !isSessionActive}
        className={`px-4 py-2 rounded-xl font-bold text-xs transition-all flex items-center gap-2 shadow-lg ${
          isSessionActive
            ? "bg-red-600 text-white shadow-red-500/20 active:scale-95"
            : status === "connecting"
              ? "bg-amber-600 text-white shadow-amber-500/20 cursor-wait"
              : "bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200 border border-slate-700"
        }`}
      >
        {status === "connecting" && !isSessionActive ? (
          <>
            <Wifi size={14} className="animate-pulse" />
            <span>Connecting...</span>
          </>
        ) : isSessionActive ? (
          <>
            {isCloudConnected ? (
              <Radio size={14} className="animate-pulse" />
            ) : (
              <WifiOff size={14} className="opacity-80" />
            )}
            <span>{isCloudConnected ? "LIVE" : "SYNCING"}</span>
          </>
        ) : (
          <>
            <WifiOff size={14} />
            <span>GO LIVE</span>
          </>
        )}
      </button>

      {/* Cloud Health Indicator for Active Session */}
      {isSessionActive && !isCloudConnected && (
        <div
          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-red-500/10 border border-red-500/30 rounded-lg text-red-500 text-[10px] font-bold animate-pulse"
          title="Cloud disconnected. Updates are queued locally."
        >
          <AlertCircle size={12} />
          <span>OFFLINE</span>
        </div>
      )}

      {/* Listener Count Badge */}
      {isSessionActive && isCloudConnected && (
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-500 text-[10px] font-bold shadow-sm shadow-emerald-500/5">
          <Users size={12} />
          <span className="tabular-nums">{listenerCount}</span>
        </div>
      )}

      {/* DJ Name Badge (when active, clickable to edit) */}
      {(isSessionActive || hasSetDjName) && (
        <button
          type="button"
          onClick={handleEditDjName}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all border ${
            isSessionActive
              ? isCloudConnected
                ? "bg-pika-accent/10 border-pika-accent/30 text-pika-accent"
                : "bg-slate-800/50 border-slate-700/50 text-slate-400"
              : "bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-300"
          }`}
          title={`DJ Name: ${djName} (click to edit)`}
        >
          <span>{djName || "Set DJ Name"}</span>
          <Edit3 size={12} className="opacity-50" />
        </button>
      )}

      {/* Tempo Feedback Display */}
      {isSessionActive && tempoFeedback && tempoFeedback.total > 0 && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-500/10 border border-indigo-500/30 rounded-lg text-indigo-400 text-[10px] font-bold">
          <Gauge size={14} className="opacity-70" />
          <div className="flex items-center gap-2">
            {tempoFeedback.slower > 0 && (
              <span className="text-blue-400">S:{tempoFeedback.slower}</span>
            )}
            {tempoFeedback.perfect > 0 && (
              <span className="text-emerald-400">P:{tempoFeedback.perfect}</span>
            )}
            {tempoFeedback.faster > 0 && (
              <span className="text-orange-400">F:{tempoFeedback.faster}</span>
            )}
          </div>
        </div>
      )}
      {/* DJ Name Prompt Modal (first-time setup) */}
      {showDjNamePrompt && (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setShowDjNamePrompt(false)}
        >
          <div
            className="w-full max-w-md bg-slate-900 border border-slate-700/50 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 space-y-6">
              <div className="flex items-center gap-3 text-pika-accent">
                <Settings size={24} />
                <h3 className="text-xl font-bold text-white tracking-tight">
                  What's Your DJ Name?
                </h3>
              </div>
              <p className="text-sm text-slate-400">
                This will be shown to dancers during your live sessions.
              </p>

              <div className="space-y-2">
                <input
                  type="text"
                  value={djNameInput}
                  onChange={(e) => setDjNameInput(e.target.value)}
                  placeholder="e.g. DJ Smooth, Sarah B, etc."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder:text-slate-600 focus:border-pika-accent outline-none transition-all font-medium"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && djNameInput.trim()) handleDjNameSubmit();
                    if (e.key === "Escape") setShowDjNamePrompt(false);
                  }}
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowDjNamePrompt(false)}
                  className="flex-1 px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl transition-all border border-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDjNameSubmit}
                  disabled={!djNameInput.trim()}
                  className="flex-1 px-4 py-3 bg-pika-accent hover:bg-pika-accent-light text-white font-bold rounded-xl transition-all shadow-lg shadow-pika-accent/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Continue
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit DJ Name Modal (for changing after initial setup) */}
      {showEditDjName && (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setShowEditDjName(false)}
        >
          <div
            className="w-full max-w-md bg-slate-900 border border-slate-700/50 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 space-y-6">
              <div className="flex items-center gap-3 text-pika-accent">
                <Edit3 size={24} />
                <h3 className="text-xl font-bold text-white tracking-tight">Edit DJ Name</h3>
              </div>
              <p className="text-sm text-slate-400">Change how you appear to dancers.</p>

              <div className="space-y-2">
                <input
                  type="text"
                  value={djNameInput}
                  onChange={(e) => setDjNameInput(e.target.value)}
                  placeholder="Your DJ name"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder:text-slate-600 focus:border-pika-accent outline-none transition-all font-medium"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && djNameInput.trim()) handleDjNameSubmit();
                    if (e.key === "Escape") setShowEditDjName(false);
                  }}
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowEditDjName(false)}
                  className="flex-1 px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl transition-all border border-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDjNameSubmit}
                  disabled={!djNameInput.trim()}
                  className="flex-1 px-4 py-3 bg-pika-accent hover:bg-pika-accent-light text-white font-bold rounded-xl transition-all shadow-lg shadow-pika-accent/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* History Detection Loading State */}
      {isDetectingHistory &&
        createPortal(
          <div className="fixed inset-0 z-[999] flex items-center justify-center bg-slate-950/70 backdrop-blur-sm">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-2xl">
              <div className="flex items-center gap-4">
                <div className="w-5 h-5 border-2 border-pika-accent border-t-transparent rounded-full animate-spin" />
                <div>
                  <p className="text-white font-semibold">Checking VirtualDJ history...</p>
                  <p className="text-slate-500 text-xs mt-1">This will only take a moment</p>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* Duplicate Session Warning Modal */}
      {showDuplicateWarningModal &&
        overlappingSessions &&
        detectedSession &&
        createPortal(
          <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md">
            <div className="w-full max-w-md bg-slate-900 border border-amber-500/50 rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto flex flex-col">
              <div className="p-6 space-y-6">
                <div className="flex items-center gap-3 text-amber-500 shrink-0">
                  <AlertTriangle size={28} />
                  <h2 className="text-2xl font-bold text-white leading-tight">
                    Duplicate Session Detected
                  </h2>
                </div>

                <div className="space-y-4">
                  {/* Track Preview Context */}
                  <div className="bg-slate-950/50 rounded-xl p-3 border border-slate-800">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                        Found {detectedSession.tracks.length} Tracks
                      </span>
                      <span className="text-xs text-slate-500 tabular-nums">
                        {(() => {
                          const now = Date.now();
                          const endTime = detectedSession.endTime.getTime();
                          const minutesAgo = Math.floor((now - endTime) / 60000);

                          if (minutesAgo < 60) {
                            return `${minutesAgo}m ago`;
                          }
                          const hoursAgo = Math.floor(minutesAgo / 60);
                          const remainingMins = minutesAgo % 60;
                          return `${hoursAgo}h ${remainingMins}m ago`;
                        })()} •{" "}
                        {detectedSession.startTime.toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}{" "}
                        -{" "}
                        {detectedSession.endTime.toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {detectedSession.tracks.slice(0, 3).map((t) => (
                        <div
                          key={t.timestamp}
                          className="text-sm text-slate-300 truncate font-medium flex items-center gap-2"
                        >
                          <span className="w-1 h-1 rounded-full bg-slate-600 shrink-0" />
                          <span>
                            {t.artist} - <span className="text-slate-400">{t.title}</span>
                          </span>
                        </div>
                      ))}
                      {detectedSession.tracks.length > 3 && (
                        <div className="text-xs text-slate-500 italic pl-3">
                          + {detectedSession.tracks.length - 3} more...
                        </div>
                      )}
                    </div>
                  </div>

                  <p className="text-slate-300 leading-relaxed">
                    It looks like you've already imported the tracks above into{" "}
                    <strong>
                      {overlappingSessions[0].name || `Session #${overlappingSessions[0].id}`}
                    </strong>
                    {overlappingSessions.length > 1 &&
                      ` and ${overlappingSessions.length - 1} other(s)`}
                    .
                  </p>

                  <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl space-y-2">
                    <p className="text-sm font-semibold text-amber-500 flex items-start gap-2">
                      <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                      What happens if I "Import Anyway"?
                    </p>
                    <p className="text-xs text-slate-400">
                      You will create a <strong>new session</strong> with the same tracks, resulting
                      in double records in your history.
                    </p>
                    <p className="text-sm font-semibold text-emerald-500 flex items-start gap-2 mt-3">
                      <Check size={16} className="shrink-0 mt-0.5" />
                      Recommended Action
                    </p>
                    <p className="text-xs text-slate-400">
                      Choose <strong>Start New Session</strong> to ignore the history and start
                      fresh from this moment.
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-3 pt-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setShowDuplicateWarningModal(false);
                      // Start fresh: Skip "Include Current" check and go straight to naming
                      setSessionName(`Live Set ${new Date().toLocaleDateString()}`);
                      setShowNameModal(true);
                    }}
                    className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-lg shadow-emerald-500/20"
                  >
                    Start New Session (Recommended)
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowDuplicateWarningModal(false);
                      setShowImportModal(true); // Allow import anyway
                    }}
                    className="px-6 py-2 text-slate-500 hover:text-amber-400 text-sm font-medium border border-slate-800 hover:border-amber-500/30 rounded-lg transition-all"
                  >
                    Import Anyway (Creates Duplicates)
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowDuplicateWarningModal(false);
                      setDetectedSession(null);
                    }}
                    className="px-6 py-3 text-slate-500 hover:text-slate-300 text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* Session Import Modal */}
      {showImportModal && detectedSession && (
        <SessionImportModal
          detectedSession={detectedSession}
          currentTrack={virtualDjWatcher.getCurrentTrack()}
          onImport={handleImportAndStart}
          onSkip={handleSkipImport}
          onCancel={() => {
            setShowImportModal(false);
            setDetectedSession(null);
          }}
        />
      )}

      {/* Include Current Track Prompt */}
      {showIncludeTrackPrompt && pendingTrack && (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => handleIncludeTrack(false)}
        >
          <div
            className="w-full max-w-md bg-slate-900 border border-slate-700/50 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 space-y-6">
              <div className="flex items-center gap-3 text-pika-accent">
                <Music2 size={24} />
                <h3 className="text-xl font-bold text-white tracking-tight">
                  Include Current Track?
                </h3>
              </div>

              <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl text-center space-y-1">
                <p className="text-lg font-bold text-white truncate">{pendingTrack.title}</p>
                <p className="text-sm text-slate-500 truncate">{pendingTrack.artist}</p>
              </div>

              {pendingTrack.isStale && (
                <div className="flex items-start gap-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-500 text-xs leading-relaxed">
                  <AlertTriangle size={16} className="shrink-0" />
                  <span>
                    This track might be from an old session. Check if it's currently playing.
                  </span>
                </div>
              )}

              <p className="text-sm text-slate-400">
                {pendingTrack.isStale
                  ? "Found in history, but might be stale. Include in your live set?"
                  : "This song is currently playing. Should we add it to your live set list?"}
              </p>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => handleIncludeTrack(false)}
                  className="flex-1 px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl transition-all border border-slate-700"
                >
                  Skip
                </button>
                <button
                  type="button"
                  onClick={() => handleIncludeTrack(true)}
                  className="flex-1 px-4 py-3 bg-pika-accent hover:bg-pika-accent-light text-white font-bold rounded-xl transition-all shadow-lg shadow-pika-accent/20 flex items-center justify-center gap-2"
                >
                  <Check size={18} />
                  Include It
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Session Name Modal (Fallback for non-import flow) */}
      {showNameModal &&
        createPortal(
          <div
            className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={() => setShowNameModal(false)}
          >
            <div
              className="w-full max-w-md bg-slate-900 border border-slate-700/50 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 space-y-6">
                <div className="flex items-center gap-3 text-pika-accent">
                  <Edit3 size={24} />
                  <h3 className="text-xl font-bold text-white tracking-tight">Name Your Session</h3>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">
                    Session Title
                  </label>
                  <input
                    type="text"
                    value={sessionName}
                    onChange={(e) => setSessionName(e.target.value)}
                    placeholder="e.g. Friday Night Social"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder:text-slate-600 focus:border-pika-accent outline-none transition-all font-medium"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleStartSession();
                      if (e.key === "Escape") handleCancelSession();
                    }}
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleCancelSession}
                    className="flex-1 px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl transition-all border border-slate-700"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleStartSession}
                    className="flex-1 px-4 py-3 bg-pika-accent hover:bg-pika-accent-light text-white font-bold rounded-xl transition-all shadow-lg shadow-pika-accent/20 flex items-center justify-center gap-2"
                  >
                    <Radio size={18} />
                    Go Live
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* QR Code Button (only when connected live) */}
      {isSessionActive && isCloudConnected && sessionId && (
        <button
          type="button"
          onClick={() => setShowQR(true)}
          className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700 rounded-lg transition-all shadow-lg"
          title="Show QR Code"
        >
          <QrCode size={18} />
        </button>
      )}

      {/* Recap Link (after session ends) */}
      {!isSessionActive && lastSessionId && recapUrl && (
        <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-2 pl-3 ml-2 animate-in slide-in-from-left-4 duration-300">
          <div className="flex items-center gap-2 text-emerald-500 text-[11px] font-bold">
            <Link2 size={14} />
            <span>Recap Ready!</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleCopyRecapLink}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold rounded-lg transition-all shadow-lg shadow-emerald-500/10"
            >
              {recapCopied ? <Check size={12} /> : <Link2 size={12} />}
              {recapCopied ? "Copied!" : "Copy Link"}
            </button>
            <button
              type="button"
              onClick={handleDismissRecap}
              className="p-1.5 text-slate-500 hover:text-slate-300 transition-all"
              title="Dismiss"
            >
              <X size={12} />
            </button>
          </div>
        </div>
      )}

      {/* Status & Now Playing */}
      <div className="flex flex-col gap-1 ml-2">
        {error && (
          <div className="flex items-center gap-1.5 text-red-500 text-[10px] font-bold animate-pulse">
            <AlertCircle size={12} />
            <span>{error}</span>
          </div>
        )}

        {isSessionActive && nowPlaying && (
          <div className="flex items-center gap-3 bg-slate-800/40 border border-slate-700/50 rounded-xl px-3 py-1.5 animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="flex items-center justify-center w-6 h-6 bg-emerald-500/10 rounded-full text-emerald-500 shrink-0">
              <Music2 size={12} className="animate-[spin_4s_linear_infinite]" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[8px] font-black uppercase tracking-widest text-emerald-500 leading-none mb-0.5">
                Now Playing
              </span>
              <span className="text-[11px] font-bold text-slate-200 truncate max-w-[160px]">
                {nowPlaying.artist} - {nowPlaying.title}
              </span>
            </div>
            <button
              type="button"
              onClick={clearNowPlaying}
              className="p-1 text-slate-500 hover:text-slate-300 transition-all"
              title="Clear now playing"
            >
              <X size={12} />
            </button>
          </div>
        )}

        {isSessionActive && !nowPlaying && (
          <div className="text-[10px] font-medium text-slate-500 italic ml-1 animate-pulse">
            Waiting for track...
          </div>
        )}
      </div>

      {/* QR Code Modal */}
      {showQR && qrUrl && isCloudConnected && (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md animate-in fade-in duration-300"
          onClick={() => setShowQR(false)}
        >
          <div
            className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-8 flex flex-col items-center gap-6">
              <div className="flex items-center justify-between w-full">
                <div className="flex flex-col">
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-pika-accent">
                    Live Session
                  </span>
                  <h3 className="text-xl font-bold text-white tracking-tight mt-1">
                    Scan to Listener
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowQR(false)}
                  className="p-2 text-slate-500 hover:text-white transition-all"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="p-4 bg-white rounded-3xl shadow-inner-xl ring-8 ring-slate-800/50">
                <QRCodeSVG
                  value={qrUrl}
                  size={240}
                  bgColor="#ffffff"
                  fgColor="#000000"
                  level="H"
                  includeMargin={false}
                />
              </div>

              <div className="flex flex-col items-center gap-2 w-full">
                <p className="text-[10px] font-mono text-slate-500 break-all text-center px-4">
                  {qrUrl}
                </p>
                <div className="h-[1px] w-full bg-slate-800/50 my-2" />
                <p className="text-xs font-medium text-slate-400">Share this with your dancers!</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
