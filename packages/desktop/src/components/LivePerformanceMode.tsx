/**
 * Live Performance Mode Component
 * Full-screen, high-contrast overlay for gig performance.
 */

import {
  Activity,
  BarChart2,
  Clock,
  Flame,
  Gauge,
  Heart,
  Music,
  QrCode,
  RefreshCcw,
  Square,
  StickyNote,
  Users,
  X,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";
import { getListenerUrl } from "../config";
import type { PlayReaction } from "../db/schema";
import { useActivePlay } from "../hooks/useActivePlay";
import type { LiveStatus } from "../hooks/useLiveSession";
import { NetworkHealthIndicator } from "./NetworkHealthIndicator";

// Poll countdown timer component
function PollCountdown({ endsAt }: { endsAt: string }) {
  const [timeLeft, setTimeLeft] = useState<number>(0);

  useEffect(() => {
    const endTime = new Date(endsAt).getTime();

    const updateCountdown = () => {
      const remaining = Math.max(0, endTime - Date.now());
      setTimeLeft(remaining);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [endsAt]);

  if (timeLeft <= 0) {
    return <span style={{ color: "#fbbf24" }}>⏰ Closing...</span>;
  }

  const seconds = Math.floor(timeLeft / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  const timeStr =
    minutes > 0 ? `${minutes}:${remainingSeconds.toString().padStart(2, "0")}` : `${seconds}s`;

  return (
    <span
      style={{
        color: "#a78bfa",
        fontFamily: "monospace",
        display: "flex",
        alignItems: "center",
        gap: "4px",
      }}
    >
      <Clock size={14} />
      {timeStr}
    </span>
  );
}

export interface TempoFeedback {
  slower: number;
  perfect: number;
  faster: number;
  total: number;
}

export interface ActivePoll {
  id: number;
  question: string;
  options: string[];
  votes: number[];
  totalVotes: number;
  endsAt?: string; // ISO timestamp for auto-close timer
}

interface Props {
  onExit: () => void;
  listenerCount?: number;
  tempoFeedback?: TempoFeedback | null;
  liveLikes?: number; // Real-time likes from cloud
  activePoll?: ActivePoll | null;
  onStartPoll?: (question: string, options: string[], durationSeconds?: number) => void;
  onEndPoll?: () => void;
  sessionId?: string | null;
  djName?: string;
  liveStatus?: LiveStatus;
  onForceSync?: () => void;
  baseUrl?: string | null;
}

export function LivePerformanceMode({
  onExit,
  listenerCount = 0,
  tempoFeedback,
  liveLikes = 0,
  activePoll,
  onStartPoll,
  onEndPoll,
  sessionId,
  djName,
  liveStatus = "live",
  onForceSync,
  baseUrl,
}: Props) {
  const { currentPlay, recentPlays, loading, updateReaction, updateNotes, playCount } =
    useActivePlay(1000); // Poll every 1 second for responsiveness

  const [showNoteModal, setShowNoteModal] = useState(false);
  const [noteText, setNoteText] = useState("");

  // Poll creation state
  const [showPollModal, setShowPollModal] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState(["", ""]);
  const [pollDuration, setPollDuration] = useState<number | null>(null); // Duration in seconds, null = no limit

  // QR Code Modal
  const [showQrModal, setShowQrModal] = useState(false);

  const handleReaction = async (reaction: PlayReaction) => {
    await updateReaction(reaction);
  };

  const handleSaveNote = async () => {
    if (noteText.trim()) {
      await updateNotes(noteText);
    }
    setShowNoteModal(false);
    setNoteText("");
  };

  const openNoteModal = () => {
    setNoteText(currentPlay?.notes || "");
    setShowNoteModal(true);
  };

  return (
    <div style={styles.overlay}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.liveIndicator}>
          <span style={styles.liveDot} />
          <span style={styles.liveText}>LIVE</span>
          <span style={styles.playCount}>{playCount} tracks played</span>

          {/* Listener Count */}
          {listenerCount > 0 && (
            <span style={styles.listenerBadge}>
              <Users size={14} />
              {listenerCount}
            </span>
          )}

          {/* Tempo Feedback */}
          {tempoFeedback && tempoFeedback.total > 0 && (
            <span style={styles.tempoBadge}>
              <Gauge size={14} />
              {tempoFeedback.slower > 0 && (
                <span style={styles.tempoSlower}>🐢{tempoFeedback.slower}</span>
              )}
              {tempoFeedback.perfect > 0 && (
                <span style={styles.tempoPerfect}>👌{tempoFeedback.perfect}</span>
              )}
              {tempoFeedback.faster > 0 && (
                <span style={styles.tempoFaster}>🐇{tempoFeedback.faster}</span>
              )}
            </span>
          )}

          {/* Live Likes */}
          {liveLikes > 0 && (
            <span style={styles.livelikesBadge}>
              <Heart size={14} fill="#ef4444" color="#ef4444" />
              {liveLikes}
            </span>
          )}

          {/* Network Health & Panic Button */}
          <NetworkHealthIndicator
            status={
              liveStatus === "live"
                ? "connected"
                : liveStatus === "connecting"
                  ? "connecting"
                  : "disconnected"
            }
            pingEndpoint={`${baseUrl || ""}/api/health`}
          />

          {onForceSync && (
            <button
              type="button"
              onClick={onForceSync}
              style={{ ...styles.qrButton, padding: "0.4rem 0.8rem", marginLeft: "0.5rem" }}
              title="Force State Sync (Panic Button)"
            >
              <RefreshCcw size={14} />
              <span style={{ fontSize: "0.8rem" }}>Sync</span>
            </button>
          )}
        </div>

        <div style={{ display: "flex", gap: "1rem" }}>
          <button
            type="button"
            onClick={() => setShowQrModal(true)}
            style={styles.qrButton}
            title="Show QR Code for Dancers"
          >
            <QrCode size={20} />
            <span>Share Set</span>
          </button>

          <button
            type="button"
            onClick={onExit}
            style={styles.exitButton}
            title="Exit Performance Mode"
          >
            <X size={24} />
            <span>Exit</span>
          </button>
        </div>
      </header>

      {/* Main Content - Current Track */}
      <main style={styles.main}>
        {loading ? (
          <div style={styles.waitingState}>
            <Activity size={64} style={{ opacity: 0.3 }} />
            <p style={styles.waitingText}>Loading...</p>
          </div>
        ) : currentPlay ? (
          <div style={styles.nowPlaying}>
            {/* Track Number */}
            <div style={styles.trackNumber}>#{playCount}</div>

            {/* Title */}
            <h1 style={styles.title}>{currentPlay.title || "Unknown Title"}</h1>

            {/* Artist */}
            <p style={styles.artist}>{currentPlay.artist || "Unknown Artist"}</p>

            {/* Metadata */}
            <div style={styles.metadata}>
              {currentPlay.bpm && (
                <span style={styles.metaItem}>{Math.round(currentPlay.bpm)} BPM</span>
              )}
              {currentPlay.key && <span style={styles.metaItem}>{currentPlay.key}</span>}
            </div>

            {/* Likes */}
            {currentPlay.dancerLikes > 0 && (
              <div style={styles.likes}>
                <Heart size={20} fill="#ef4444" color="#ef4444" />
                <span>{currentPlay.dancerLikes}</span>
              </div>
            )}

            {/* Current Status */}
            {currentPlay.reaction !== "neutral" && (
              <div
                style={{
                  ...styles.reactionBadge,
                  backgroundColor: currentPlay.reaction === "peak" ? "#ea580c" : "#1e3a5f",
                }}
              >
                {currentPlay.reaction === "peak" ? "🔥 PEAK" : "🧱 BRICK"}
              </div>
            )}
          </div>
        ) : (
          <div style={styles.waitingState}>
            <Music size={64} style={{ opacity: 0.3 }} />
            <p style={styles.waitingText}>Waiting for first track...</p>
            <p style={styles.subText}>Play a track in VirtualDJ to get started</p>
          </div>
        )}
      </main>

      {/* Footer - Reaction Controls */}
      <footer style={styles.footer}>
        <button
          type="button"
          onClick={() => handleReaction("peak")}
          style={{
            ...styles.reactionButton,
            ...styles.peakButton,
            ...(currentPlay?.reaction === "peak" ? styles.activeButton : {}),
          }}
          disabled={!currentPlay}
        >
          <Flame size={32} />
          <span>Peak</span>
        </button>

        <button
          type="button"
          onClick={() => handleReaction("brick")}
          style={{
            ...styles.reactionButton,
            ...styles.brickButton,
            ...(currentPlay?.reaction === "brick" ? styles.activeButton : {}),
          }}
          disabled={!currentPlay}
        >
          <Square size={32} />
          <span>Brick</span>
        </button>

        <button
          type="button"
          onClick={openNoteModal}
          style={{
            ...styles.reactionButton,
            ...styles.noteButton,
            ...(currentPlay?.notes ? styles.hasNote : {}),
          }}
          disabled={!currentPlay}
        >
          <StickyNote size={32} />
          <span>Note</span>
        </button>

        <button
          type="button"
          onClick={() => setShowPollModal(true)}
          style={{
            ...styles.reactionButton,
            ...styles.pollButton,
            ...(activePoll ? styles.activeButton : {}),
          }}
          disabled={!!activePoll}
        >
          <BarChart2 size={32} />
          <span>Poll</span>
        </button>
      </footer>

      {/* Recent Plays (Mini Timeline) - Shows previous plays, not current */}
      {recentPlays.length > 1 && (
        <div style={styles.timeline}>
          {recentPlays.slice(-6, -1).map((play, idx, arr) => (
            <div
              key={play.id}
              style={{
                ...styles.timelineItem,
                opacity: idx === arr.length - 1 ? 0.7 : 0.4,
              }}
            >
              {play.reaction === "peak" && "🔥"}
              {play.reaction === "brick" && "🧱"}
              {play.reaction === "neutral" && "•"}
            </div>
          ))}
        </div>
      )}

      {/* Note Modal */}
      {showNoteModal && (
        <div style={styles.modalOverlay} onClick={() => setShowNoteModal(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>Add Note</h3>
            <p style={styles.modalSubtitle}>
              {currentPlay?.artist} - {currentPlay?.title}
            </p>
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="What happened during this track?"
              style={styles.textarea}
              autoFocus
            />
            <div style={styles.modalActions}>
              <button
                type="button"
                onClick={() => setShowNoteModal(false)}
                style={styles.cancelButton}
              >
                Cancel
              </button>
              <button type="button" onClick={handleSaveNote} style={styles.saveButton}>
                Save Note
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Poll Creation Modal */}
      {showPollModal && (
        <div style={styles.modalOverlay} onClick={() => setShowPollModal(false)}>
          <div style={styles.pollModal} onClick={(e) => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>📊 Create Poll</h3>
            <p style={styles.modalSubtitle}>Ask your dancers a question!</p>

            <input
              type="text"
              value={pollQuestion}
              onChange={(e) => setPollQuestion(e.target.value)}
              placeholder="What vibe next?"
              style={styles.pollInput}
              autoFocus
            />

            <div style={styles.pollOptionsContainer}>
              {pollOptions.map((option, idx) => (
                <div key={idx} style={styles.pollOptionRow}>
                  <input
                    type="text"
                    value={option}
                    onChange={(e) => {
                      const newOptions = [...pollOptions];
                      newOptions[idx] = e.target.value;
                      setPollOptions(newOptions);
                    }}
                    placeholder={`Option ${idx + 1}`}
                    style={styles.pollOptionInput}
                  />
                  {pollOptions.length > 2 && (
                    <button
                      type="button"
                      onClick={() => {
                        setPollOptions(pollOptions.filter((_, i) => i !== idx));
                      }}
                      style={styles.removeOptionButton}
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
              {pollOptions.length < 5 && (
                <button
                  type="button"
                  onClick={() => setPollOptions([...pollOptions, ""])}
                  style={styles.addOptionButton}
                >
                  + Add Option
                </button>
              )}
            </div>

            {/* Duration Selector */}
            <div style={styles.durationSection}>
              <label style={styles.pollLabel}>Poll Duration</label>
              <div style={styles.durationButtons}>
                {[
                  { label: "30s", value: 30 },
                  { label: "1m", value: 60 },
                  { label: "2m", value: 120 },
                  { label: "5m", value: 300 },
                  { label: "No limit", value: null },
                ].map((opt) => (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => setPollDuration(opt.value)}
                    style={{
                      ...styles.durationButton,
                      ...(pollDuration === opt.value ? styles.durationButtonActive : {}),
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={styles.modalActions}>
              <button
                type="button"
                onClick={() => {
                  setShowPollModal(false);
                  setPollQuestion("");
                  setPollOptions(["", ""]);
                  setPollDuration(null);
                }}
                style={styles.cancelButton}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const validOptions = pollOptions.filter((o) => o.trim());
                  if (pollQuestion.trim() && validOptions.length >= 2) {
                    onStartPoll?.(pollQuestion, validOptions, pollDuration ?? undefined);
                    setShowPollModal(false);
                    setPollQuestion("");
                    setPollOptions(["", ""]);
                    setPollDuration(null);
                  }
                }}
                style={styles.saveButton}
                disabled={!pollQuestion.trim() || pollOptions.filter((o) => o.trim()).length < 2}
              >
                Start Poll
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Active Poll Results Display */}
      {activePoll && (
        <div style={styles.activePollContainer}>
          <div style={styles.activePollHeader}>
            <BarChart2 size={20} />
            <span>{activePoll.question}</span>
            <span style={styles.pollVoteCount}>{activePoll.totalVotes} votes</span>
            {activePoll.endsAt && <PollCountdown endsAt={activePoll.endsAt} />}
          </div>
          <div style={styles.activePollOptions}>
            {activePoll.options.map((option, idx) => {
              const votes = activePoll.votes[idx] ?? 0;
              const percentage =
                activePoll.totalVotes > 0 ? Math.round((votes / activePoll.totalVotes) * 100) : 0;
              const isWinning = votes === Math.max(...activePoll.votes);
              return (
                <div key={idx} style={styles.pollOptionResult}>
                  <div style={styles.pollOptionLabel}>
                    <span>{option}</span>
                    <span>
                      {votes} ({percentage}%)
                    </span>
                  </div>
                  <div style={styles.pollOptionBarBg}>
                    <div
                      style={{
                        ...styles.pollOptionBar,
                        width: `${percentage}%`,
                        backgroundColor: isWinning ? "#22c55e" : "#6366f1",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <button type="button" onClick={onEndPoll} style={styles.endPollButton}>
            End Poll
          </button>
        </div>
      )}

      {/* QR Code Modal */}
      {showQrModal && sessionId && (
        <div style={styles.modalOverlay} onClick={() => setShowQrModal(false)}>
          <div style={styles.qrModal} onClick={(e) => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>Join the Dance! 🕺💃</h3>
            <p style={styles.modalSubtitle}>Scan to vote & send love</p>

            <div
              style={{
                background: "white",
                padding: "1.5rem",
                borderRadius: "16px",
                margin: "1rem 0",
              }}
            >
              <QRCodeSVG value={getListenerUrl(sessionId, djName)} size={300} level="H" />
            </div>

            <p
              style={{
                fontFamily: "monospace",
                color: "#a1a1aa",
                fontSize: "1.2rem",
                background: "#27272a",
                padding: "0.5rem 1rem",
                borderRadius: "8px",
              }}
            >
              pika.stream
            </p>

            <button
              type="button"
              onClick={() => setShowQrModal(false)}
              style={styles.saveButton} // Reuse save button style for "Done"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    zIndex: 9999,
    background: "#09090b",
    display: "flex",
    flexDirection: "column",
    color: "#fafafa",
    fontFamily: "Inter, system-ui, sans-serif",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "1.5rem 2rem",
    borderBottom: "1px solid #27272a",
  },
  liveIndicator: {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
  },
  liveDot: {
    width: "12px",
    height: "12px",
    borderRadius: "50%",
    background: "#ef4444",
    animation: "pulse 2s infinite",
    boxShadow: "0 0 0 4px rgba(239, 68, 68, 0.3)",
  },
  liveText: {
    fontSize: "1.25rem",
    fontWeight: "bold",
    color: "#ef4444",
    textTransform: "uppercase",
    letterSpacing: "0.1em",
  },
  playCount: {
    fontSize: "0.875rem",
    color: "#71717a",
    marginLeft: "1rem",
  },
  listenerBadge: {
    display: "flex",
    alignItems: "center",
    gap: "0.4rem",
    padding: "0.3rem 0.6rem",
    background: "rgba(34, 197, 94, 0.2)",
    border: "1px solid rgba(34, 197, 94, 0.4)",
    borderRadius: "6px",
    color: "#22c55e",
    fontSize: "0.875rem",
    marginLeft: "0.5rem",
  },
  tempoBadge: {
    display: "flex",
    alignItems: "center",
    gap: "0.4rem",
    padding: "0.3rem 0.6rem",
    background: "rgba(139, 92, 246, 0.2)",
    border: "1px solid rgba(139, 92, 246, 0.4)",
    borderRadius: "6px",
    color: "#a78bfa",
    fontSize: "0.875rem",
    marginLeft: "0.5rem",
  },
  tempoSlower: {
    color: "#60a5fa",
  },
  tempoPerfect: {
    color: "#34d399",
  },
  tempoFaster: {
    color: "#f97316",
  },
  livelikesBadge: {
    display: "flex",
    alignItems: "center",
    gap: "0.4rem",
    padding: "0.3rem 0.6rem",
    background: "rgba(239, 68, 68, 0.2)",
    border: "1px solid rgba(239, 68, 68, 0.4)",
    borderRadius: "6px",
    color: "#ef4444",
    fontSize: "0.875rem",
    marginLeft: "0.5rem",
  },
  exitButton: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    padding: "0.75rem 1.25rem",
    background: "#27272a",
    color: "#a1a1aa",
    border: "none",
    borderRadius: "8px",
    fontSize: "1rem",
    cursor: "pointer",
    transition: "background 0.2s",
  },
  main: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "2rem",
  },
  waitingState: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "1rem",
    color: "#71717a",
  },
  waitingText: {
    fontSize: "2rem",
    fontWeight: "bold",
    margin: 0,
  },
  subText: {
    fontSize: "1rem",
    opacity: 0.6,
    margin: 0,
  },
  nowPlaying: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textAlign: "center",
    gap: "1rem",
  },
  trackNumber: {
    fontSize: "1rem",
    color: "#71717a",
    fontWeight: "bold",
  },
  title: {
    fontSize: "4rem",
    fontWeight: "bold",
    margin: 0,
    lineHeight: 1.1,
    maxWidth: "90vw",
    wordBreak: "break-word",
  },
  artist: {
    fontSize: "2.5rem",
    color: "#a1a1aa",
    margin: 0,
    fontWeight: 500,
  },
  metadata: {
    display: "flex",
    gap: "2rem",
    marginTop: "1rem",
  },
  metaItem: {
    fontSize: "1.25rem",
    color: "#52525b",
    fontWeight: "bold",
  },
  likes: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    marginTop: "1rem",
    fontSize: "1.5rem",
    color: "#ef4444",
  },
  reactionBadge: {
    marginTop: "1.5rem",
    padding: "0.5rem 1.5rem",
    borderRadius: "9999px",
    fontSize: "1.25rem",
    fontWeight: "bold",
    textTransform: "uppercase",
  },
  footer: {
    display: "flex",
    justifyContent: "center",
    gap: "2rem",
    padding: "2rem",
    borderTop: "1px solid #27272a",
  },
  reactionButton: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "0.5rem",
    padding: "1.5rem 3rem",
    border: "2px solid transparent",
    borderRadius: "16px",
    fontSize: "1.25rem",
    fontWeight: "bold",
    cursor: "pointer",
    transition: "all 0.2s",
    opacity: 1,
  },
  peakButton: {
    background: "#7c2d12",
    color: "#fed7aa",
  },
  brickButton: {
    background: "#1e3a5f",
    color: "#bfdbfe",
  },
  noteButton: {
    background: "#3f3f46",
    color: "#d4d4d8",
  },
  activeButton: {
    borderColor: "#fafafa",
    transform: "scale(1.05)",
  },
  hasNote: {
    borderColor: "#a855f7",
  },
  timeline: {
    position: "absolute",
    bottom: "12rem", // Moved higher to avoid overlapping with footer buttons
    left: "50%",
    transform: "translateX(-50%)",
    display: "flex",
    gap: "0.75rem",
    fontSize: "1.5rem",
  },
  timelineItem: {
    transition: "opacity 0.3s",
  },
  // Modal styles
  modalOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0, 0, 0, 0.8)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10000,
  },
  modal: {
    background: "#18181b",
    borderRadius: "16px",
    padding: "2rem",
    width: "90%",
    maxWidth: "500px",
    border: "1px solid #27272a",
  },
  modalTitle: {
    margin: "0 0 0.5rem 0",
    fontSize: "1.5rem",
    fontWeight: "bold",
  },
  modalSubtitle: {
    margin: "0 0 1.5rem 0",
    color: "#71717a",
    fontSize: "1rem",
  },
  textarea: {
    width: "100%",
    height: "120px",
    padding: "1rem",
    background: "#09090b",
    border: "1px solid #27272a",
    borderRadius: "8px",
    color: "#fafafa",
    fontSize: "1rem",
    resize: "vertical",
    fontFamily: "inherit",
  },
  modalActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "1rem",
    marginTop: "1.5rem",
  },
  qrButton: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    padding: "0.75rem 1.25rem",
    background: "#3f3f46",
    color: "#fafafa",
    border: "none",
    borderRadius: "8px",
    fontSize: "1rem",
    cursor: "pointer",
    transition: "background 0.2s",
  },
  qrModal: {
    background: "#18181b",
    borderRadius: "24px",
    padding: "3rem",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textAlign: "center",
    border: "1px solid #27272a",
    boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
  },
  cancelButton: {
    padding: "0.75rem 1.5rem",
    background: "transparent",
    color: "#a1a1aa",
    border: "1px solid #27272a",
    borderRadius: "8px",
    fontSize: "1rem",
    cursor: "pointer",
  },
  saveButton: {
    padding: "0.75rem 1.5rem",
    background: "#a855f7",
    color: "white",
    border: "none",
    borderRadius: "8px",
    fontSize: "1rem",
    fontWeight: "bold",
    cursor: "pointer",
  },

  // Poll styles
  pollButton: {
    background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
  },
  pollModal: {
    background: "#18181b",
    padding: "2rem",
    borderRadius: "16px",
    width: "90%",
    maxWidth: "500px",
    maxHeight: "80vh",
    overflow: "auto",
  },
  pollInput: {
    width: "100%",
    padding: "1rem",
    background: "#27272a",
    border: "1px solid #3f3f46",
    borderRadius: "8px",
    color: "white",
    fontSize: "1.25rem",
    marginBottom: "1rem",
  },
  pollOptionsContainer: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "0.75rem",
  },
  pollOptionRow: {
    display: "flex",
    gap: "0.5rem",
  },
  pollOptionInput: {
    flex: 1,
    padding: "0.75rem",
    background: "#27272a",
    border: "1px solid #3f3f46",
    borderRadius: "8px",
    color: "white",
    fontSize: "1rem",
  },
  removeOptionButton: {
    width: "40px",
    background: "rgba(239, 68, 68, 0.2)",
    border: "1px solid rgba(239, 68, 68, 0.4)",
    borderRadius: "8px",
    color: "#ef4444",
    fontSize: "1.25rem",
    cursor: "pointer",
  },
  addOptionButton: {
    padding: "0.75rem",
    background: "rgba(99, 102, 241, 0.2)",
    border: "1px solid rgba(99, 102, 241, 0.4)",
    borderRadius: "8px",
    color: "#818cf8",
    fontSize: "0.9rem",
    cursor: "pointer",
    marginTop: "0.5rem",
  },
  activePollContainer: {
    position: "fixed" as const,
    bottom: "8rem",
    left: "50%",
    transform: "translateX(-50%)",
    background: "rgba(24, 24, 27, 0.95)",
    border: "1px solid #6366f1",
    borderRadius: "16px",
    padding: "1.5rem",
    minWidth: "400px",
    maxWidth: "600px",
    boxShadow: "0 4px 20px rgba(99, 102, 241, 0.3)",
  },
  activePollHeader: {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
    marginBottom: "1rem",
    color: "#e4e4e7",
    fontSize: "1.1rem",
    fontWeight: "bold",
  },
  pollVoteCount: {
    marginLeft: "auto",
    color: "#6366f1",
    fontSize: "0.9rem",
  },
  activePollOptions: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "0.75rem",
  },
  pollOptionResult: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "0.25rem",
  },
  pollOptionLabel: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: "0.9rem",
    color: "#a1a1aa",
  },
  pollOptionBarBg: {
    height: "8px",
    background: "#27272a",
    borderRadius: "4px",
    overflow: "hidden",
  },
  pollOptionBar: {
    height: "100%",
    borderRadius: "4px",
    transition: "width 0.3s ease",
  },
  endPollButton: {
    marginTop: "1rem",
    width: "100%",
    padding: "0.75rem",
    background: "rgba(239, 68, 68, 0.2)",
    border: "1px solid rgba(239, 68, 68, 0.4)",
    borderRadius: "8px",
    color: "#ef4444",
    fontSize: "1rem",
    fontWeight: "bold",
    cursor: "pointer",
  },
  durationSection: {
    marginBottom: "1.5rem",
  },
  durationButtons: {
    display: "flex",
    gap: "0.5rem",
    flexWrap: "wrap",
  },
  durationButton: {
    padding: "0.5rem 0.75rem",
    background: "rgba(255, 255, 255, 0.05)",
    border: "1px solid rgba(255, 255, 255, 0.2)",
    borderRadius: "6px",
    color: "#a1a1aa",
    fontSize: "0.85rem",
    cursor: "pointer",
    transition: "all 0.2s ease",
  },
  durationButtonActive: {
    background: "rgba(139, 92, 246, 0.3)",
    borderColor: "rgba(139, 92, 246, 0.6)",
    color: "#c4b5fd",
  },
};

// Add CSS animation for pulsing dot
if (typeof document !== "undefined") {
  const styleSheet = document.createElement("style");
  styleSheet.textContent = `
        @keyframes pulse {
            0% { opacity: 1; }
            50% { opacity: 0.5; }
            100% { opacity: 1; }
        }
    `;
  document.head.appendChild(styleSheet);
}
