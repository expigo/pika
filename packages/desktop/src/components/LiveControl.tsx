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
import { useEffect, useState } from "react";
import { getListenerUrl, getLocalIp, getRecapUrl } from "../config";
import { useDjSettings } from "../hooks/useDjSettings";
import { useLiveSession } from "../hooks/useLiveSession";
import { virtualDjWatcher } from "../services/virtualDjWatcher";

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
  } = useLiveSession();
  const { djName, setDjName, hasSetDjName, isAuthenticated } = useDjSettings();
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

  // Fetch local IP once on mount for QR codes
  useEffect(() => {
    getLocalIp().then(setLocalIp);
  }, []);

  // Generate QR URL only if we have a session (uses local IP if available for LAN testing)
  const qrUrl = sessionId ? getListenerUrl(sessionId, djName, localIp) : null;
  const recapUrl = lastSessionId ? getRecapUrl(lastSessionId, djName, localIp) : null;

  const handleGoLiveClick = () => {
    if (isSessionActive) {
      // Save session ID before ending so we can show recap link
      if (sessionId) {
        setLastSessionId(sessionId);
      }
      endSet();
    } else {
      // Clear last session when starting new one
      setLastSessionId(null);

      // If authenticated, skip DJ name prompt (name is synced from token)
      // Otherwise, if no DJ name set, prompt for it first
      if (!isAuthenticated && !hasSetDjName) {
        setDjNameInput("");
        setShowDjNamePrompt(true);
      } else {
        // Check for current track
        checkForCurrentTrack();
      }
    }
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
      // If this was the initial prompt, continue to track check
      if (!hasSetDjName) {
        checkForCurrentTrack();
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
    <div style={styles.container}>
      {/* Live Button */}
      <button
        type="button"
        onClick={handleGoLiveClick}
        disabled={status === "connecting" && !isSessionActive}
        style={{
          ...styles.liveButton,
          ...(isSessionActive ? styles.liveButtonActive : {}),
          ...(status === "connecting" && !isSessionActive ? styles.liveButtonConnecting : {}),
        }}
      >
        <div style={styles.buttonContent}>
          {status === "connecting" && !isSessionActive ? (
            <>
              <Wifi size={18} style={styles.pulseIcon} />
              <span>Connecting...</span>
            </>
          ) : isSessionActive ? (
            <>
              {isCloudConnected ? (
                <Radio size={18} style={styles.pulseIcon} />
              ) : (
                <WifiOff size={18} style={{ opacity: 0.8 }} />
              )}
              <span>{isCloudConnected ? "LIVE" : "SYNCING"}</span>
            </>
          ) : (
            <>
              <WifiOff size={18} />
              <span>GO LIVE</span>
            </>
          )}
        </div>
      </button>

      {/* Cloud Health Indicator for Active Session */}
      {isSessionActive && !isCloudConnected && (
        <div style={styles.syncIndicator} title="Cloud disconnected. Updates are queued locally.">
          <AlertCircle size={14} />
          <span>OFFLINE</span>
        </div>
      )}

      {/* Listener Count Badge */}
      {isSessionActive && isCloudConnected && (
        <div style={styles.listenerBadge}>
          <Users size={14} />
          <span>{listenerCount}</span>
        </div>
      )}

      {/* DJ Name Badge (when active, clickable to edit) */}
      {isSessionActive && hasSetDjName && (
        <button
          type="button"
          onClick={handleEditDjName}
          style={isCloudConnected ? styles.djNameBadge : styles.djNameBadgeSyncing}
          title={`Broadcasting as ${djName} (click to edit)`}
        >
          <span>{djName}</span>
          <Edit3 size={12} style={{ opacity: 0.6 }} />
        </button>
      )}

      {/* DJ Name Badge (when not active, just display with edit option) */}
      {!isSessionActive && hasSetDjName && (
        <button
          type="button"
          onClick={handleEditDjName}
          style={styles.djNameBadgeOffline}
          title={`DJ Name: ${djName} (click to edit)`}
        >
          <span>{djName}</span>
          <Edit3 size={12} style={{ opacity: 0.6 }} />
        </button>
      )}

      {/* Tempo Feedback Display */}
      {isSessionActive && tempoFeedback && tempoFeedback.total > 0 && (
        <div style={styles.tempoFeedback}>
          <Gauge size={14} style={{ opacity: 0.7 }} />
          <div style={styles.tempoVotes}>
            {tempoFeedback.slower > 0 && (
              <span style={styles.tempoSlower} title="Slower requests">
                🐢 {tempoFeedback.slower}
              </span>
            )}
            {tempoFeedback.perfect > 0 && (
              <span style={styles.tempoPerfect} title="Perfect">
                👌 {tempoFeedback.perfect}
              </span>
            )}
            {tempoFeedback.faster > 0 && (
              <span style={styles.tempoFaster} title="Faster requests">
                🐇 {tempoFeedback.faster}
              </span>
            )}
          </div>
        </div>
      )}

      {/* DJ Name Prompt Modal (first-time setup) */}
      {showDjNamePrompt && (
        <div style={styles.modalOverlay} onClick={() => setShowDjNamePrompt(false)}>
          <div
            style={{ ...styles.modal, ...styles.sessionModalContent }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={styles.sessionModalTitle}>
              <Settings size={20} />
              What's Your DJ Name?
            </h3>
            <p style={styles.modalSubtitle}>
              This will be shown to dancers during your live sessions.
            </p>
            <input
              type="text"
              value={djNameInput}
              onChange={(e) => setDjNameInput(e.target.value)}
              placeholder="e.g. DJ Smooth, Sarah B, etc."
              style={styles.sessionInput}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && djNameInput.trim()) handleDjNameSubmit();
                if (e.key === "Escape") setShowDjNamePrompt(false);
              }}
            />
            <div style={styles.sessionModalActions}>
              <button
                type="button"
                onClick={() => setShowDjNamePrompt(false)}
                style={styles.cancelBtn}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDjNameSubmit}
                style={styles.startBtn}
                disabled={!djNameInput.trim()}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit DJ Name Modal (for changing after initial setup) */}
      {showEditDjName && (
        <div style={styles.modalOverlay} onClick={() => setShowEditDjName(false)}>
          <div
            style={{ ...styles.modal, ...styles.sessionModalContent }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={styles.sessionModalTitle}>
              <Edit3 size={20} />
              Edit DJ Name
            </h3>
            <p style={styles.modalSubtitle}>Change how you appear to dancers.</p>
            <input
              type="text"
              value={djNameInput}
              onChange={(e) => setDjNameInput(e.target.value)}
              placeholder="Your DJ name"
              style={styles.sessionInput}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && djNameInput.trim()) handleDjNameSubmit();
                if (e.key === "Escape") setShowEditDjName(false);
              }}
            />
            <div style={styles.sessionModalActions}>
              <button
                type="button"
                onClick={() => setShowEditDjName(false)}
                style={styles.cancelBtn}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDjNameSubmit}
                style={styles.startBtn}
                disabled={!djNameInput.trim()}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Include Current Track Prompt */}
      {showIncludeTrackPrompt && pendingTrack && (
        <div style={styles.modalOverlay} onClick={() => handleIncludeTrack(false)}>
          <div
            style={{ ...styles.modal, ...styles.sessionModalContent }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={styles.sessionModalTitle}>
              <Music2 size={20} />
              Include Current Track?
            </h3>
            <div style={styles.trackPreview}>
              <p style={styles.trackPreviewTitle}>{pendingTrack.title}</p>
              <p style={styles.trackPreviewArtist}>{pendingTrack.artist}</p>
            </div>

            {/* Stale track warning */}
            {pendingTrack.isStale && (
              <div style={styles.staleWarning}>
                <AlertTriangle size={16} />
                <span>
                  This track may be from a previous session. Make sure it's actually playing before
                  including.
                </span>
              </div>
            )}

            <p style={styles.modalSubtitle}>
              {pendingTrack.isStale
                ? "The last track in VirtualDJ history. Is this actually playing now?"
                : "This song is currently playing. Include it in this session's tracklist?"}
            </p>
            <div style={styles.sessionModalActions}>
              <button
                type="button"
                onClick={() => handleIncludeTrack(false)}
                style={styles.cancelBtn}
              >
                Skip This Song
              </button>
              <button
                type="button"
                onClick={() => handleIncludeTrack(true)}
                style={styles.startBtn}
              >
                <Check size={16} />
                Include It
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Session Name Modal */}
      {showNameModal && (
        <div style={styles.modalOverlay} onClick={handleCancelSession}>
          <div
            style={{ ...styles.modal, ...styles.sessionModalContent }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={styles.sessionModalTitle}>
              <Edit3 size={20} />
              Name Your Session
            </h3>
            <input
              type="text"
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
              placeholder="e.g. Friday Night @ Club XYZ"
              style={styles.sessionInput}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleStartSession();
                if (e.key === "Escape") handleCancelSession();
              }}
            />
            <div style={styles.sessionModalActions}>
              <button type="button" onClick={handleCancelSession} style={styles.cancelBtn}>
                Cancel
              </button>
              <button type="button" onClick={handleStartSession} style={styles.startBtn}>
                <Radio size={16} />
                Start Live Session
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QR Code Button (only when connected live) */}
      {isSessionActive && isCloudConnected && sessionId && (
        <button
          type="button"
          onClick={() => setShowQR(true)}
          style={styles.qrButton}
          title="Show QR Code"
        >
          <QrCode size={20} />
        </button>
      )}

      {/* Recap Link (after session ends) */}
      {!isSessionActive && lastSessionId && recapUrl && (
        <div style={styles.recapBanner}>
          <div style={styles.recapContent}>
            <Link2 size={16} />
            <span>Session recap ready!</span>
          </div>
          <div style={styles.recapActions}>
            <button type="button" onClick={handleCopyRecapLink} style={styles.recapCopyBtn}>
              {recapCopied ? <Check size={14} /> : <Link2 size={14} />}
              {recapCopied ? "Copied!" : "Copy Link"}
            </button>
            <button
              type="button"
              onClick={handleDismissRecap}
              style={styles.recapDismissBtn}
              title="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Status & Now Playing */}
      <div style={styles.statusArea}>
        {error && (
          <div style={styles.error}>
            <AlertCircle size={14} />
            <span>{error}</span>
          </div>
        )}

        {isSessionActive && nowPlaying && (
          <div style={styles.nowPlaying}>
            <Music2 size={14} style={styles.musicIcon} />
            <div style={styles.trackInfo}>
              <span style={styles.nowPlayingLabel}>Now Playing</span>
              <span style={styles.trackTitle}>
                {nowPlaying.artist} - {nowPlaying.title}
              </span>
            </div>
            <button
              type="button"
              onClick={clearNowPlaying}
              style={styles.clearButton}
              title="Clear now playing"
            >
              <X size={12} />
            </button>
          </div>
        )}

        {isSessionActive && !nowPlaying && (
          <div style={styles.waiting}>
            <span>Waiting for track...</span>
          </div>
        )}
      </div>

      {/* QR Code Modal */}
      {showQR && qrUrl && isCloudConnected && (
        <div style={styles.modalOverlay} onClick={() => setShowQR(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>Scan to Listen</h3>
              <button type="button" onClick={() => setShowQR(false)} style={styles.modalClose}>
                <X size={20} />
              </button>
            </div>
            <div style={styles.qrContainer}>
              <QRCodeSVG
                value={qrUrl}
                size={256}
                bgColor="#ffffff"
                fgColor="#0f172a"
                level="M"
                includeMargin={true}
              />
            </div>
            <p style={styles.qrUrl}>{qrUrl}</p>
            <p style={styles.qrHint}>Share this with your audience!</p>
          </div>
        </div>
      )}
    </div>
  );
}

const pulseKeyframes = `
@keyframes pulse {
	0%, 100% { opacity: 1; }
	50% { opacity: 0.5; }
}
`;

// Inject keyframes
if (typeof document !== "undefined") {
  const styleSheet = document.createElement("style");
  styleSheet.textContent = pulseKeyframes;
  document.head.appendChild(styleSheet);
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    alignItems: "center",
    gap: "1rem",
  },
  liveButton: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0.5rem 1rem",
    background: "linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)",
    color: "white",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    fontWeight: "bold",
    fontSize: "0.875rem",
    boxShadow: "0 2px 8px rgba(220, 38, 38, 0.3)",
    transition: "all 0.2s ease",
    minWidth: "120px",
  },
  liveButtonActive: {
    background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
    boxShadow: "0 0 20px rgba(239, 68, 68, 0.5)",
  },
  liveButtonConnecting: {
    background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
    boxShadow: "0 2px 8px rgba(245, 158, 11, 0.3)",
    cursor: "wait",
  },
  buttonContent: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
  },
  pulseIcon: {
    animation: "pulse 1s ease-in-out infinite",
  },
  listenerBadge: {
    display: "flex",
    alignItems: "center",
    gap: "0.35rem",
    padding: "0.35rem 0.6rem",
    background: "rgba(34, 197, 94, 0.15)",
    border: "1px solid rgba(34, 197, 94, 0.4)",
    borderRadius: "6px",
    color: "#22c55e",
    fontSize: "0.8rem",
    fontWeight: 600,
  },
  djNameBadge: {
    display: "flex",
    alignItems: "center",
    gap: "0.4rem",
    padding: "0.35rem 0.6rem",
    background: "rgba(251, 146, 60, 0.15)",
    border: "1px solid rgba(251, 146, 60, 0.4)",
    borderRadius: "6px",
    color: "#fb923c",
    fontSize: "0.75rem",
    fontWeight: 500,
    cursor: "pointer",
    transition: "all 0.2s",
  },
  djNameBadgeSyncing: {
    display: "flex",
    alignItems: "center",
    gap: "0.4rem",
    padding: "0.35rem 0.6rem",
    background: "rgba(148, 163, 184, 0.15)",
    border: "1px dashed rgba(148, 163, 184, 0.4)",
    borderRadius: "6px",
    color: "#94a3b8",
    fontSize: "0.75rem",
    fontWeight: 500,
    cursor: "pointer",
    transition: "all 0.2s",
  },
  djNameBadgeOffline: {
    display: "flex",
    alignItems: "center",
    gap: "0.4rem",
    padding: "0.35rem 0.6rem",
    background: "rgba(100, 116, 139, 0.15)",
    border: "1px solid rgba(100, 116, 139, 0.3)",
    borderRadius: "6px",
    color: "#94a3b8",
    fontSize: "0.75rem",
    fontWeight: 500,
    cursor: "pointer",
    transition: "all 0.2s",
  },
  tempoFeedback: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    padding: "0.35rem 0.6rem",
    background: "rgba(139, 92, 246, 0.15)",
    border: "1px solid rgba(139, 92, 246, 0.3)",
    borderRadius: "6px",
    color: "#a78bfa",
    fontSize: "0.75rem",
  },
  tempoVotes: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
  },
  tempoSlower: {
    color: "#60a5fa",
    fontWeight: 500,
  },
  tempoPerfect: {
    color: "#22c55e",
    fontWeight: 500,
  },
  tempoFaster: {
    color: "#fb923c",
    fontWeight: 500,
  },
  syncIndicator: {
    display: "flex",
    alignItems: "center",
    gap: "0.4rem",
    padding: "0.35rem 0.6rem",
    background: "rgba(239, 68, 68, 0.1)",
    border: "1px solid rgba(239, 68, 68, 0.3)",
    borderRadius: "6px",
    color: "#ef4444",
    fontSize: "0.75rem",
    fontWeight: "bold",
    animation: "pulse 2s ease-in-out infinite",
  },
  qrButton: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0.5rem",
    background: "rgba(255, 255, 255, 0.1)",
    color: "white",
    border: "1px solid rgba(255, 255, 255, 0.2)",
    borderRadius: "8px",
    cursor: "pointer",
    transition: "all 0.2s ease",
  },
  recapBanner: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "0.75rem",
    padding: "0.5rem 0.75rem",
    background:
      "linear-gradient(135deg, rgba(34, 197, 94, 0.15) 0%, rgba(16, 185, 129, 0.15) 100%)",
    border: "1px solid rgba(34, 197, 94, 0.3)",
    borderRadius: "8px",
    flex: 1,
  },
  recapContent: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    color: "#22c55e",
    fontSize: "0.8rem",
    fontWeight: 500,
  },
  recapActions: {
    display: "flex",
    alignItems: "center",
    gap: "0.35rem",
  },
  recapCopyBtn: {
    display: "flex",
    alignItems: "center",
    gap: "0.35rem",
    padding: "0.35rem 0.6rem",
    background: "#22c55e",
    border: "none",
    borderRadius: "6px",
    color: "#fff",
    fontSize: "0.75rem",
    fontWeight: 600,
    cursor: "pointer",
  },
  recapDismissBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0.35rem",
    background: "transparent",
    border: "none",
    color: "#64748b",
    cursor: "pointer",
  },
  statusArea: {
    display: "flex",
    flexDirection: "column",
    gap: "0.25rem",
  },
  error: {
    display: "flex",
    alignItems: "center",
    gap: "0.25rem",
    color: "#ef4444",
    fontSize: "0.75rem",
  },
  nowPlaying: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    background: "rgba(34, 197, 94, 0.1)",
    border: "1px solid rgba(34, 197, 94, 0.3)",
    borderRadius: "6px",
    padding: "0.5rem 0.75rem",
  },
  musicIcon: {
    color: "#22c55e",
    flexShrink: 0,
  },
  trackInfo: {
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  nowPlayingLabel: {
    fontSize: "0.625rem",
    textTransform: "uppercase",
    color: "#22c55e",
    fontWeight: "bold",
  },
  trackTitle: {
    fontSize: "0.75rem",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    maxWidth: "200px",
  },
  clearButton: {
    padding: "0.25rem",
    background: "transparent",
    color: "#64748b",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    opacity: 0.6,
    marginLeft: "auto",
  },
  waiting: {
    fontSize: "0.75rem",
    color: "#64748b",
    fontStyle: "italic",
  },
  // Modal styles
  modalOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0, 0, 0, 0.8)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
  },
  modal: {
    background: "#1e293b",
    borderRadius: "16px",
    padding: "1.5rem",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "1rem",
    boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
    border: "1px solid #334155",
    maxWidth: "90vw",
  },
  modalHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
  },
  modalTitle: {
    margin: 0,
    fontSize: "1.25rem",
    fontWeight: "bold",
    color: "#f1f5f9",
  },
  modalClose: {
    padding: "0.25rem",
    background: "transparent",
    color: "#64748b",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
  },
  qrContainer: {
    background: "#ffffff",
    padding: "1rem",
    borderRadius: "12px",
  },
  qrUrl: {
    fontSize: "0.75rem",
    color: "#94a3b8",
    margin: 0,
    fontFamily: "monospace",
    wordBreak: "break-all",
    textAlign: "center",
  },
  qrHint: {
    fontSize: "0.875rem",
    color: "#64748b",
    margin: 0,
  },
  // Session name modal specific styles
  sessionInput: {
    width: "100%",
    padding: "0.75rem 1rem",
    background: "#0f172a",
    border: "1px solid #334155",
    borderRadius: "8px",
    color: "#e2e8f0",
    fontSize: "1rem",
    fontFamily: "inherit",
    boxSizing: "border-box" as const,
  },
  sessionModalActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "0.75rem",
    marginTop: "1.25rem",
    width: "100%",
  },
  cancelBtn: {
    padding: "0.625rem 1rem",
    background: "transparent",
    color: "#94a3b8",
    border: "1px solid #334155",
    borderRadius: "8px",
    fontSize: "0.875rem",
    cursor: "pointer",
  },
  startBtn: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    padding: "0.625rem 1rem",
    background: "#ef4444",
    color: "white",
    border: "none",
    borderRadius: "8px",
    fontSize: "0.875rem",
    fontWeight: "bold",
    cursor: "pointer",
  },
  sessionModalContent: {
    width: "100%",
    maxWidth: "400px",
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "stretch",
  },
  sessionModalTitle: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    margin: "0 0 1rem 0",
    fontSize: "1.125rem",
    fontWeight: "bold",
    color: "#e2e8f0",
  },
  modalSubtitle: {
    margin: "0 0 1rem 0",
    fontSize: "0.875rem",
    color: "#94a3b8",
    lineHeight: 1.5,
  },
  trackPreview: {
    padding: "1rem",
    background: "rgba(255, 255, 255, 0.05)",
    borderRadius: "8px",
    marginBottom: "1rem",
    textAlign: "center" as const,
  },
  trackPreviewTitle: {
    margin: "0 0 0.25rem 0",
    fontSize: "1rem",
    fontWeight: 600,
    color: "#ffffff",
  },
  trackPreviewArtist: {
    margin: 0,
    fontSize: "0.875rem",
    color: "#94a3b8",
  },
  staleWarning: {
    display: "flex",
    alignItems: "flex-start",
    gap: "0.5rem",
    padding: "0.75rem 1rem",
    background: "rgba(245, 158, 11, 0.15)",
    border: "1px solid rgba(245, 158, 11, 0.3)",
    borderRadius: "8px",
    color: "#fbbf24",
    fontSize: "0.8rem",
    lineHeight: 1.4,
    marginTop: "0.75rem",
  },
};
