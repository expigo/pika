import {
  AlertCircle,
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
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { getListenerUrl, getLocalIp, getRecapUrl, getStageListenerUrl } from "../config";
import { createDatabaseSession, detectInitialTrack } from "../hooks/live/connectionManager";
import { generateSessionId } from "../hooks/live/trackBroadcast";
import { useDjSettings } from "../hooks/useDjSettings";
import { useLiveSession } from "../hooks/useLiveSession";
import { type DetectedSession, useVdjHistory } from "../hooks/useVdjHistory";
import { logger } from "../utils/logger";
import { type StartOptions, StartSessionModal } from "./StartSessionModal";

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
  const [showDjNamePrompt, setShowDjNamePrompt] = useState(false);
  const [showEditDjName, setShowEditDjName] = useState(false);
  const [djNameInput, setDjNameInput] = useState("");
  const [lastSessionId, setLastSessionId] = useState<string | null>(null);
  const [recapCopied, setRecapCopied] = useState(false);
  const [localIp, setLocalIp] = useState<string | null>(null);
  const [isDetectingHistory, setIsDetectingHistory] = useState(false);
  // Stage this session is broadcasting to (set in the Go-Live modal). Drives the
  // QR target so dancers join the stage and survive DJ rotation.
  const [selectedStageId, setSelectedStageId] = useState<string | undefined>(undefined);

  // Single "Start Session" modal context (null = closed). Replaces the old
  // duplicate-warning → import → name modal chain.
  const [startModal, setStartModal] = useState<{
    currentTrack: { artist: string; title: string } | null;
    detectedSession: DetectedSession | null;
    overlap: { id: number; name: string | null }[] | null;
  } | null>(null);

  // Fetch local IP once on mount for QR codes
  useEffect(() => {
    getLocalIp().then(setLocalIp);
  }, []);

  // Generate QR URL only if we have a session (uses local IP if available for LAN testing).
  // When broadcasting to a stage, the QR targets the stage so dancers survive DJ rotation.
  const qrUrl = selectedStageId
    ? getStageListenerUrl(selectedStageId, localIp)
    : sessionId
      ? getListenerUrl(sessionId, djName, localIp)
      : null;
  const recapUrl = lastSessionId ? getRecapUrl(lastSessionId, djName, localIp) : null;

  const handleGoLiveClick = async () => {
    if (isSessionActive) {
      if (sessionId) {
        setLastSessionId(sessionId);
      }
      setSelectedStageId(undefined); // clear stage so the next session starts standalone
      endSet();
    } else {
      setLastSessionId(null);
      if (!isAuthenticated && !hasSetDjName) {
        setDjNameInput("");
        setShowDjNamePrompt(true);
      } else {
        await openStartModal();
      }
    }
  };

  /**
   * Gather everything the Start modal needs, then open it:
   * - the genuinely-playing current track (staleness-gated; null when VDJ idle/closed)
   * - an optional earlier set (tracks before a 30-min gap)
   * - whether that earlier set overlaps an existing local session (duplicate risk)
   */
  const openStartModal = async () => {
    setIsDetectingHistory(true);
    try {
      const fresh = await detectInitialTrack();
      const detected = await detectSession();

      let overlap: { id: number; name: string | null }[] | null = null;
      if (detected && detected.tracks.length > 0) {
        try {
          const { sessionRepository } = await import("../db/repositories/sessionRepository");
          const first = detected.tracks[0].timestamp;
          const last = detected.tracks[detected.tracks.length - 1].timestamp;
          const existing = await sessionRepository.getSessionsInTimeRange(first, last);
          overlap = existing.length > 0 ? existing : null;
        } catch (e) {
          logger.warn("Live Control", "Failed to check session overlap", e);
        }
      }

      setStartModal({
        currentTrack: fresh ? { artist: fresh.artist, title: fresh.title } : null,
        detectedSession: detected,
        overlap,
      });
    } finally {
      setIsDetectingHistory(false);
    }
  };

  const handleStart = async (opts: StartOptions) => {
    setStartModal(null);
    const name = opts.name.trim() || `Live Set ${new Date().toLocaleDateString()}`;
    setSelectedStageId(opts.stageId); // drives the QR target (stage vs session)

    try {
      if (opts.importEarlier) {
        // Backfill the earlier set, then go live. registerImportedTrack seeds the
        // dedup state so the live watcher won't re-record the just-imported tracks.
        const newSessionId = generateSessionId();
        const dbSessionId = await createDatabaseSession(name, newSessionId);
        toast.info("Importing track history...");

        const imported = await importTracks(
          opts.importEarlier.tracks,
          dbSessionId,
          opts.importEarlier.startIndex,
          registerImportedTrack,
        );
        if (imported > 0) {
          toast.success(`Imported ${imported} tracks from VirtualDJ`);
        }

        const tracksToSync = opts.importEarlier.tracks
          .slice(opts.importEarlier.startIndex)
          .map((t) => ({ artist: t.artist, title: t.title, bpm: t.bpm, key: t.key }));

        await goLive(
          name,
          opts.includeCurrentTrack,
          { sessionId: newSessionId, dbSessionId },
          tracksToSync,
          opts.stageId,
        );
      } else {
        await goLive(name, opts.includeCurrentTrack, undefined, undefined, opts.stageId);
      }
    } catch (error) {
      logger.error("Live Control", "Failed to start session", error);
      toast.error("Failed to start session");
    }
  };

  const handleDjNameSubmit = () => {
    const name = djNameInput.trim();
    if (name) {
      setDjName(name);
      setShowDjNamePrompt(false);
      setShowEditDjName(false);
      // If this was the initial prompt, continue into the Start flow
      if (!hasSetDjName) {
        void openStartModal();
      }
    }
  };

  const handleEditDjName = () => {
    setDjNameInput(djName);
    setShowEditDjName(true);
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

      {/* Unified Start Session Modal */}
      {startModal && (
        <StartSessionModal
          currentTrack={startModal.currentTrack}
          detectedSession={startModal.detectedSession}
          overlap={startModal.overlap}
          defaultName={`Live Set ${new Date().toLocaleDateString()}`}
          onStart={handleStart}
          onCancel={() => setStartModal(null)}
        />
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
