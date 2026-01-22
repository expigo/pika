/**
 * Logbook Component
 * History browser for past DJ sessions with detailed reports.
 */

import { ask } from "@tauri-apps/plugin-dialog";
import {
  BarChart3,
  BrickWall,
  Calendar,
  Check,
  ChevronRight,
  Clock,
  Download,
  FileText,
  Flame,
  Heart,
  Link2,
  Music,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { getRecapUrl } from "../config";
import {
  type AllSessionsSummary,
  type PlayWithTrack,
  type Session,
  type SessionDetails,
  sessionRepository,
} from "../db/repositories/sessionRepository";
import { trackRepository } from "../db/repositories/trackRepository";
import { getConfiguredUrls } from "../hooks/useDjSettings";

// ============================================================================
// Helper Functions
// ============================================================================

function formatDate(timestamp: number | null | undefined): string {
  if (!timestamp || Number.isNaN(timestamp)) {
    return "Unknown Date";
  }
  return new Date(timestamp * 1000).toLocaleDateString("en-US", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatTime(timestamp: number | null | undefined): string {
  if (!timestamp || Number.isNaN(timestamp)) {
    return "--:--";
  }
  return new Date(timestamp * 1000).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || Number.isNaN(seconds) || seconds < 0) {
    return "0m";
  }
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function sanitizeCsvField(value: string | null | undefined): string {
  if (!value) return "";
  const str = String(value);
  // Escape quotes
  const escaped = str.replace(/"/g, '""');
  // Prevent formula injection (OWASP)
  if (/^[=\+\-@]/.test(str)) {
    return `"'${escaped}"`; // Prepend single quote and wrap in quotes
  }
  return `"${escaped}"`;
}

function generateCsv(session: Session, plays: PlayWithTrack[]): string {
  const header = ["#", "Time", "Artist", "Title", "BPM", "Key", "Reaction", "Notes", "Likes"];

  const rows = plays.map((play, index) => [
    index + 1,
    formatTime(play.playedAt),
    sanitizeCsvField(play.artist || "Unknown"),
    sanitizeCsvField(play.title || "Unknown"),
    play.bpm?.toFixed(1) || "",
    play.key || "",
    play.reaction,
    sanitizeCsvField(play.notes || ""),
    play.dancerLikes,
  ]);

  return [
    `# Session: ${session.name || "Untitled Session"}`,
    `# Date: ${formatDate(session.startedAt)}`,
    `# Tracks: ${plays.length}`,
    "",
    header.join(","),
    ...rows.map((row) => row.join(",")),
  ].join("\n");
}

async function downloadCsv(session: Session, plays: PlayWithTrack[]): Promise<void> {
  const csv = generateCsv(session, plays);

  // Check if running in Tauri
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    try {
      // Use Tauri's save dialog
      const { save } = await import("@tauri-apps/plugin-dialog");
      const { writeTextFile } = await import("@tauri-apps/plugin-fs");

      const defaultName = `pika-session-${formatDate(session.startedAt).replace(/[,\s]+/g, "-")}.csv`;

      const filePath = await save({
        defaultPath: defaultName,
        filters: [{ name: "CSV Files", extensions: ["csv"] }],
      });

      if (filePath) {
        await writeTextFile(filePath, csv);
        console.log("CSV exported to:", filePath);
      }
    } catch (e) {
      console.error("Failed to export CSV via Tauri:", e);
      // Fallback to browser method
      browserDownload(csv, session);
    }
  } else {
    // Browser fallback
    browserDownload(csv, session);
  }
}

function browserDownload(csv: string, session: Session): void {
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `pika-session-${formatDate(session.startedAt).replace(/[,\s]+/g, "-")}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ============================================================================
// Component
// ============================================================================

export function Logbook() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [sessionDetails, setSessionDetails] = useState<SessionDetails | null>(null);
  const [summary, setSummary] = useState<AllSessionsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSummary, setShowSummary] = useState(false);
  const [recapCopied, setRecapCopied] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Load all sessions and summary
  useEffect(() => {
    async function loadData() {
      try {
        const [allSessions, allSummary] = await Promise.all([
          sessionRepository.getAllSessions(100),
          sessionRepository.getAllSessionsSummary(),
        ]);
        setSessions(allSessions);
        setSummary(allSummary);

        // Auto-select first session
        if (allSessions.length > 0 && !selectedSessionId) {
          setSelectedSessionId(allSessions[0].id);
        }
      } catch (e) {
        console.error("Failed to load sessions:", e);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [selectedSessionId]);

  // Load session details when selection changes
  useEffect(() => {
    async function loadDetails() {
      if (!selectedSessionId || showSummary) {
        setSessionDetails(null);
        return;
      }

      try {
        const details = await sessionRepository.getSessionDetails(selectedSessionId);
        setSessionDetails(details);
      } catch (e) {
        console.error("Failed to load session details:", e);
      }
    }
    loadDetails();
  }, [selectedSessionId, showSummary]);

  const handleExportCsv = useCallback(() => {
    if (!sessionDetails) return;
    downloadCsv(sessionDetails.session, sessionDetails.plays);
  }, [sessionDetails]);

  const handleCopyRecapLink = useCallback(async () => {
    if (!sessionDetails?.session.cloudSessionId) return;

    const recapUrl = getRecapUrl(
      sessionDetails.session.cloudSessionId,
      sessionDetails.session.djIdentity,
    );
    await navigator.clipboard.writeText(recapUrl);
    setRecapCopied(true);
    toast.success("Recap link copied to clipboard!");
    setTimeout(() => setRecapCopied(false), 2000);
  }, [sessionDetails]);

  const handleRefreshAnalysis = useCallback(async () => {
    if (!sessionDetails?.session.cloudSessionId || !sessionDetails.session.id) return;

    setIsSyncing(true);
    try {
      // Get track fingerprints for this session
      const tracks = await trackRepository.getSessionTracksWithFingerprints(
        sessionDetails.session.id,
      );

      if (tracks.length === 0) {
        toast.info("No tracks to sync in this session");
        return;
      }

      const { apiUrl } = getConfiguredUrls();
      const response = await fetch(
        `${apiUrl}/api/session/${sessionDetails.session.cloudSessionId}/sync-fingerprints`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tracks }),
        },
      );

      if (response.ok) {
        const result = await response.json();
        toast.success(`Synced ${result.synced}/${result.total} tracks to Cloud`);
      } else {
        toast.error("Failed to sync fingerprints");
      }
    } catch (e) {
      console.error("Error syncing fingerprints:", e);
      toast.error("Failed to sync fingerprints");
    } finally {
      setIsSyncing(false);
    }
  }, [sessionDetails]);

  const handleDeleteSession = useCallback(
    async (sessionId: number) => {
      // Use Tauri's ask dialog for proper confirmation
      const confirmed = await ask(
        "Are you sure you want to delete this session? This cannot be undone.",
        {
          title: "Delete Session",
          kind: "warning",
        },
      );
      if (!confirmed) return;

      try {
        await sessionRepository.deleteSession(sessionId);
        // Refresh sessions list
        const [allSessions, allSummary] = await Promise.all([
          sessionRepository.getAllSessions(100),
          sessionRepository.getAllSessionsSummary(),
        ]);
        setSessions(allSessions);
        setSummary(allSummary);

        // Select another session if the deleted one was selected
        if (selectedSessionId === sessionId) {
          setSelectedSessionId(allSessions.length > 0 ? allSessions[0].id : null);
        }
      } catch (e) {
        console.error("Failed to delete session:", e);
      }
    },
    [selectedSessionId],
  );

  const handleShowSummary = useCallback(() => {
    setShowSummary(true);
    setSelectedSessionId(null);
  }, []);

  // Memoize rankings to avoid conditional hook violation and performance issues
  const rankingsContent = useMemo(() => {
    if (!summary) return null;
    return (
      <div style={styles.rankingsContainer}>
        {/* Top Liked Tracks */}
        {summary.topLikedTracks.length > 0 && (
          <div style={styles.rankingSection}>
            <h4 style={styles.rankingTitle}>
              <Heart size={16} color="#ef4444" />
              Most Liked Tracks
            </h4>
            <ol style={styles.rankingList}>
              {summary.topLikedTracks.map((track, i) => (
                <li key={track.trackId} style={styles.rankingItem}>
                  <span style={styles.rankNumber}>{i + 1}</span>
                  <span style={styles.rankTrack}>
                    {track.title || "Unknown"} - {track.artist || "Unknown"}
                  </span>
                  <span style={styles.rankValue}>❤️ {track.totalLikes}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* Top Peaked Tracks */}
        {summary.topPeakedTracks.length > 0 && (
          <div style={styles.rankingSection}>
            <h4 style={styles.rankingTitle}>
              <Flame size={16} color="#f97316" />
              Top Peak Moments
            </h4>
            <ol style={styles.rankingList}>
              {summary.topPeakedTracks.map((track, i) => (
                <li key={track.trackId} style={styles.rankingItem}>
                  <span style={styles.rankNumber}>{i + 1}</span>
                  <span style={styles.rankTrack}>
                    {track.title || "Unknown"} - {track.artist || "Unknown"}
                  </span>
                  <span style={styles.rankValue}>🔥 {track.peakCount}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* Best Sessions */}
        {summary.topSessions.length > 0 && (
          <div style={styles.rankingSection}>
            <h4 style={styles.rankingTitle}>
              <Calendar size={16} color="#3b82f6" />
              Best Sessions
            </h4>
            <ol style={styles.rankingList}>
              {summary.topSessions.map((session, i) => (
                <li key={session.sessionId} style={styles.rankingItem}>
                  <span style={styles.rankNumber}>{i + 1}</span>
                  <span style={styles.rankTrack}>
                    {session.sessionName || `Session ${session.sessionId}`}
                  </span>
                  <span style={styles.rankValue}>
                    🔥 {session.peakCount}/{session.trackCount} tracks
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    );
  }, [summary]);

  // Empty state
  if (!loading && sessions.length === 0) {
    return (
      <div style={styles.container}>
        <div style={styles.emptyStateContainer}>
          <div style={styles.emptyStateCard}>
            <Calendar size={48} style={{ opacity: 0.4, color: "#3b82f6" }} />
            <h3 style={styles.emptyTitle}>No Sessions Yet</h3>
            <p style={styles.emptyText}>
              Go live and play some tracks to start building your logbook.
            </p>
            <div style={styles.emptyHint}>
              <span style={styles.emptyStep}>1. Click "GO LIVE" to start a session</span>
              <span style={styles.emptyStep}>2. Play tracks in VirtualDJ</span>
              <span style={styles.emptyStep}>3. Your history will appear here</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Left Pane - Session List */}
      <div style={styles.leftPane}>
        <div style={styles.listHeader}>
          <Calendar size={18} />
          <span>Session History</span>
          <span style={styles.sessionCount}>{sessions.length}</span>
        </div>

        {/* Summary Button */}
        <button
          type="button"
          onClick={handleShowSummary}
          style={{
            ...styles.summaryButton,
            ...(showSummary ? styles.summaryButtonActive : {}),
          }}
        >
          <BarChart3 size={16} />
          <span>All Sessions Summary</span>
        </button>

        <div style={styles.sessionList}>
          {sessions.map((session) => (
            <div
              key={session.id}
              style={{
                ...styles.sessionItem,
                ...(selectedSessionId === session.id && !showSummary
                  ? styles.sessionItemActive
                  : {}),
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setShowSummary(false);
                  setSelectedSessionId(session.id);
                }}
                style={styles.sessionItemButton}
              >
                <div style={styles.sessionInfo}>
                  <span style={styles.sessionName}>{session.name || "Untitled Session"}</span>
                  <span style={styles.sessionDate}>{formatDate(session.startedAt)}</span>
                </div>
                <div style={styles.sessionMeta}>
                  {session.endedAt && (
                    <span style={styles.sessionDuration}>
                      <Clock size={12} />
                      {formatDuration(session.endedAt - session.startedAt)}
                    </span>
                  )}
                  <ChevronRight size={16} style={{ opacity: 0.5 }} />
                </div>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteSession(session.id);
                }}
                style={styles.deleteButton}
                title="Delete session"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Right Pane - Session Detail */}
      <div style={styles.rightPane}>
        {showSummary && summary ? (
          /* Summary View */
          <>
            <div style={styles.detailHeader}>
              <div>
                <h2 style={styles.detailTitle}>All Sessions Summary</h2>
                <p style={styles.detailDate}>
                  Aggregated stats across all {summary.totalSessions} sessions
                </p>
              </div>
            </div>

            <div style={styles.summaryGrid}>
              <div style={styles.summaryCard}>
                <Calendar size={24} color="#3b82f6" />
                <span style={styles.summaryValue}>{summary.totalSessions}</span>
                <span style={styles.summaryLabel}>Sessions</span>
              </div>
              <div style={styles.summaryCard}>
                <Music size={24} color="#22c55e" />
                <span style={styles.summaryValue}>{summary.totalPlays}</span>
                <span style={styles.summaryLabel}>Total Plays</span>
              </div>
              <div style={styles.summaryCard}>
                <Music size={24} color="#8b5cf6" />
                <span style={styles.summaryValue}>{summary.uniqueTracks}</span>
                <span style={styles.summaryLabel}>Unique Tracks</span>
              </div>
              <div style={styles.summaryCard}>
                <Clock size={24} color="#f59e0b" />
                <span style={styles.summaryValue}>{formatDuration(summary.totalDuration)}</span>
                <span style={styles.summaryLabel}>Total Time</span>
              </div>
              <div style={styles.summaryCard}>
                <Flame size={24} color="#f97316" />
                <span style={styles.summaryValue}>{summary.totalPeaks}</span>
                <span style={styles.summaryLabel}>Total Peaks</span>
              </div>
              <div style={styles.summaryCard}>
                <BrickWall size={24} color="#64748b" />
                <span style={styles.summaryValue}>{summary.totalBricks}</span>
                <span style={styles.summaryLabel}>Total Bricks</span>
              </div>
              <div style={styles.summaryCard}>
                <Heart size={24} color="#ef4444" />
                <span style={styles.summaryValue}>{summary.totalLikes}</span>
                <span style={styles.summaryLabel}>Total Likes</span>
              </div>
            </div>

            {/* Rankings */}
            {useMemo(
              () => (
                <div style={styles.rankingsContainer}>
                  {/* Top Liked Tracks */}
                  {summary.topLikedTracks.length > 0 && (
                    <div style={styles.rankingSection}>
                      <h4 style={styles.rankingTitle}>
                        <Heart size={16} color="#ef4444" />
                        Most Liked Tracks
                      </h4>
                      <ol style={styles.rankingList}>
                        {summary.topLikedTracks.map((track, i) => (
                          <li key={track.trackId} style={styles.rankingItem}>
                            <span style={styles.rankNumber}>{i + 1}</span>
                            <span style={styles.rankTrack}>
                              {track.title || "Unknown"} - {track.artist || "Unknown"}
                            </span>
                            <span style={styles.rankValue}>❤️ {track.totalLikes}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}

                  {/* Top Peaked Tracks */}
                  {summary.topPeakedTracks.length > 0 && (
                    <div style={styles.rankingSection}>
                      <h4 style={styles.rankingTitle}>
                        <Flame size={16} color="#f97316" />
                        Top Peak Moments
                      </h4>
                      <ol style={styles.rankingList}>
                        {summary.topPeakedTracks.map((track, i) => (
                          <li key={track.trackId} style={styles.rankingItem}>
                            <span style={styles.rankNumber}>{i + 1}</span>
                            <span style={styles.rankTrack}>
                              {track.title || "Unknown"} - {track.artist || "Unknown"}
                            </span>
                            <span style={styles.rankValue}>🔥 {track.peakCount}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}

                  {/* Best Sessions */}
                  {summary.topSessions.length > 0 && (
                    <div style={styles.rankingSection}>
                      <h4 style={styles.rankingTitle}>
                        <Calendar size={16} color="#3b82f6" />
                        Best Sessions
                      </h4>
                      <ol style={styles.rankingList}>
                        {summary.topSessions.map((session, i) => (
                          <li key={session.sessionId} style={styles.rankingItem}>
                            <span style={styles.rankNumber}>{i + 1}</span>
                            <span style={styles.rankTrack}>
                              {session.sessionName || `Session ${session.sessionId}`}
                            </span>
                            <span style={styles.rankValue}>
                              🔥 {session.peakCount}/{session.trackCount} tracks
                            </span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </div>
              ),
              [summary],
            )}
          </>
        ) : sessionDetails ? (
          <>
            {/* Detail Header */}
            <div style={styles.detailHeader}>
              <div>
                <h2 style={styles.detailTitle}>
                  {sessionDetails.session.name || "Untitled Session"}
                </h2>
                <p style={styles.detailDate}>
                  {formatDate(sessionDetails.session.startedAt)} at{" "}
                  {formatTime(sessionDetails.session.startedAt)}
                </p>
              </div>
              <div style={styles.headerActions}>
                {/* Recap Link Button (only if cloud session ID exists) */}
                {sessionDetails.session.cloudSessionId && (
                  <>
                    <button
                      type="button"
                      onClick={handleCopyRecapLink}
                      style={styles.recapButton}
                      title="Copy public recap link"
                    >
                      {recapCopied ? <Check size={16} /> : <Link2 size={16} />}
                      {recapCopied ? "Copied!" : "Recap Link"}
                    </button>
                    <button
                      type="button"
                      onClick={handleRefreshAnalysis}
                      disabled={isSyncing}
                      style={{
                        ...styles.refreshButton,
                        opacity: isSyncing ? 0.6 : 1,
                        cursor: isSyncing ? "wait" : "pointer",
                      }}
                      title="Re-sync analysis data to Cloud recap"
                    >
                      <RefreshCw
                        size={16}
                        style={isSyncing ? { animation: "spin 1s linear infinite" } : undefined}
                      />
                      {isSyncing ? "Syncing..." : "Refresh"}
                    </button>
                  </>
                )}
                <button type="button" onClick={handleExportCsv} style={styles.exportButton}>
                  <Download size={16} />
                  Export CSV
                </button>
              </div>
            </div>

            {/* Stats */}
            <div style={styles.statsRow}>
              <div style={styles.statItem}>
                <Music size={18} color="#3b82f6" />
                <span style={styles.statValue}>{sessionDetails.stats.totalTracks}</span>
                <span style={styles.statLabel}>Tracks</span>
              </div>
              <div style={styles.statItem}>
                <Clock size={18} color="#8b5cf6" />
                <span style={styles.statValue}>
                  {formatDuration(sessionDetails.stats.duration)}
                </span>
                <span style={styles.statLabel}>Duration</span>
              </div>
              <div style={styles.statItem}>
                <Flame size={18} color="#f97316" />
                <span style={styles.statValue}>{sessionDetails.stats.peakCount}</span>
                <span style={styles.statLabel}>Peaks</span>
              </div>
              <div style={styles.statItem}>
                <BrickWall size={18} color="#64748b" />
                <span style={styles.statValue}>{sessionDetails.stats.brickCount}</span>
                <span style={styles.statLabel}>Bricks</span>
              </div>
            </div>

            {/* Tracklist */}
            <div style={styles.tracklistContainer}>
              <table style={styles.tracklist}>
                <thead>
                  <tr>
                    <th style={styles.th}>#</th>
                    <th style={styles.th}>Time</th>
                    <th style={{ ...styles.th, textAlign: "left" }}>Track</th>
                    <th style={styles.th}>BPM</th>
                    <th style={styles.th}>Key</th>
                    <th style={styles.th}>Reaction</th>
                    <th style={styles.th}>Likes</th>
                    <th style={{ ...styles.th, textAlign: "left" }}>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {sessionDetails.plays.map((play, index) => (
                    <tr
                      key={play.id}
                      style={{
                        ...styles.tr,
                        ...(play.reaction === "peak" ? styles.peakRow : {}),
                        ...(play.reaction === "brick" ? styles.brickRow : {}),
                      }}
                    >
                      <td style={styles.td}>{index + 1}</td>
                      <td style={styles.td}>{formatTime(play.playedAt)}</td>
                      <td style={styles.tdTrack}>
                        <span style={styles.trackTitle}>{play.title || "Unknown"}</span>
                        <span style={styles.trackArtist}>{play.artist || "Unknown Artist"}</span>
                      </td>
                      <td style={styles.td}>{play.bpm ? Math.round(play.bpm) : "-"}</td>
                      <td style={styles.td}>{play.key || "-"}</td>
                      <td style={styles.td}>
                        {play.reaction === "peak" && <Flame size={16} color="#f97316" />}
                        {play.reaction === "brick" && <BrickWall size={16} color="#64748b" />}
                      </td>
                      <td style={styles.td}>
                        {play.dancerLikes > 0 && (
                          <span style={styles.likes}>
                            <Heart size={12} fill="#ef4444" color="#ef4444" />
                            {play.dancerLikes}
                          </span>
                        )}
                      </td>
                      <td style={styles.tdNotes}>
                        {play.notes && (
                          <span style={styles.noteText}>
                            <FileText size={12} />
                            {play.notes}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div style={styles.emptyDetail}>
            <FileText size={48} style={{ opacity: 0.3 }} />
            <p>Select a session to view details</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    height: "100%",
    background: "#0f172a",
    borderRadius: "12px",
    overflow: "hidden",
  },
  // Left Pane
  leftPane: {
    width: "280px",
    flexShrink: 0,
    borderRight: "1px solid #1e293b",
    display: "flex",
    flexDirection: "column",
  },
  listHeader: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    padding: "1rem",
    borderBottom: "1px solid #1e293b",
    fontWeight: "bold",
    fontSize: "0.875rem",
  },
  sessionCount: {
    marginLeft: "auto",
    padding: "0.125rem 0.5rem",
    background: "#334155",
    borderRadius: "9999px",
    fontSize: "0.75rem",
  },
  sessionList: {
    flex: 1,
    overflowY: "auto",
  },
  sessionItem: {
    display: "flex",
    alignItems: "center",
    width: "100%",
    borderBottom: "1px solid #1e293b",
    transition: "background 0.15s",
  },
  sessionItemButton: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0.875rem 0.5rem 0.875rem 1rem",
    background: "transparent",
    border: "none",
    color: "inherit",
    cursor: "pointer",
    textAlign: "left",
  },
  sessionItemActive: {
    background: "#1e293b",
  },
  deleteButton: {
    padding: "0.5rem",
    marginRight: "0.5rem",
    background: "transparent",
    border: "none",
    color: "#64748b",
    cursor: "pointer",
    borderRadius: "4px",
    opacity: 0.5,
    transition: "all 0.15s",
  },
  sessionInfo: {
    display: "flex",
    flexDirection: "column",
    gap: "0.25rem",
  },
  sessionName: {
    fontSize: "0.875rem",
    fontWeight: 500,
  },
  sessionDate: {
    fontSize: "0.75rem",
    color: "#64748b",
  },
  sessionMeta: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
  },
  sessionDuration: {
    display: "flex",
    alignItems: "center",
    gap: "0.25rem",
    fontSize: "0.75rem",
    color: "#64748b",
  },
  // Right Pane
  rightPane: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  detailHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    padding: "1.5rem",
    borderBottom: "1px solid #1e293b",
  },
  detailTitle: {
    margin: 0,
    fontSize: "1.5rem",
    fontWeight: "bold",
  },
  detailDate: {
    margin: "0.25rem 0 0",
    fontSize: "0.875rem",
    color: "#64748b",
  },
  headerActions: {
    display: "flex",
    gap: "0.5rem",
    alignItems: "center",
  },
  recapButton: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    padding: "0.625rem 1rem",
    background: "#3b82f6",
    color: "white",
    border: "none",
    borderRadius: "8px",
    fontSize: "0.875rem",
    fontWeight: "bold",
    cursor: "pointer",
  },
  refreshButton: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    padding: "0.625rem 1rem",
    background: "#8b5cf6",
    color: "white",
    border: "none",
    borderRadius: "8px",
    fontSize: "0.875rem",
    fontWeight: "bold",
    cursor: "pointer",
  },
  exportButton: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    padding: "0.625rem 1rem",
    background: "#22c55e",
    color: "white",
    border: "none",
    borderRadius: "8px",
    fontSize: "0.875rem",
    fontWeight: "bold",
    cursor: "pointer",
  },
  statsRow: {
    display: "flex",
    gap: "1.5rem",
    padding: "1rem 1.5rem",
    borderBottom: "1px solid #1e293b",
  },
  statItem: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
  },
  statValue: {
    fontSize: "1.25rem",
    fontWeight: "bold",
  },
  statLabel: {
    fontSize: "0.75rem",
    color: "#64748b",
  },
  // Tracklist
  tracklistContainer: {
    flex: 1,
    overflowY: "auto",
    padding: "0 1rem 1rem",
  },
  tracklist: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: "0.8125rem",
  },
  th: {
    padding: "0.75rem 0.5rem",
    textAlign: "center",
    fontSize: "0.6875rem",
    fontWeight: "bold",
    textTransform: "uppercase",
    color: "#64748b",
    borderBottom: "1px solid #1e293b",
    position: "sticky",
    top: 0,
    background: "#0f172a",
  },
  tr: {
    borderBottom: "1px solid #1e293b",
  },
  peakRow: {
    background: "rgba(249, 115, 22, 0.1)",
  },
  brickRow: {
    background: "rgba(100, 116, 139, 0.1)",
  },
  td: {
    padding: "0.625rem 0.5rem",
    textAlign: "center",
    whiteSpace: "nowrap",
  },
  tdTrack: {
    padding: "0.625rem 0.5rem",
    display: "flex",
    flexDirection: "column",
    gap: "0.125rem",
  },
  trackTitle: {
    fontWeight: 500,
  },
  trackArtist: {
    fontSize: "0.75rem",
    color: "#64748b",
  },
  tdNotes: {
    padding: "0.625rem 0.5rem",
    textAlign: "left",
    maxWidth: "200px",
  },
  noteText: {
    display: "flex",
    alignItems: "center",
    gap: "0.375rem",
    fontSize: "0.75rem",
    color: "#a855f7",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  likes: {
    display: "flex",
    alignItems: "center",
    gap: "0.25rem",
    color: "#ef4444",
  },
  // Empty States
  emptyState: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    gap: "1rem",
    color: "#64748b",
  },
  emptyStateContainer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    padding: "2rem",
  },
  emptyStateCard: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "1rem",
    padding: "3rem 4rem",
    background: "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)",
    borderRadius: "16px",
    border: "1px solid #334155",
    maxWidth: "400px",
  },
  emptyHint: {
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
    marginTop: "1rem",
    padding: "1rem",
    background: "#0f172a",
    borderRadius: "8px",
    border: "1px solid #1e293b",
  },
  emptyStep: {
    fontSize: "0.8rem",
    color: "#94a3b8",
  },
  emptyTitle: {
    margin: 0,
    fontSize: "1.25rem",
    fontWeight: "bold",
    color: "#e2e8f0",
  },
  emptyText: {
    margin: 0,
    fontSize: "0.875rem",
    textAlign: "center",
    maxWidth: "300px",
    color: "#64748b",
  },
  emptyDetail: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    gap: "1rem",
    color: "#64748b",
  },
  // Summary styles
  summaryButton: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    width: "100%",
    padding: "0.75rem 1rem",
    background: "#1e293b",
    border: "none",
    borderBottom: "1px solid #334155",
    color: "#94a3b8",
    fontSize: "0.8125rem",
    fontWeight: 500,
    cursor: "pointer",
    transition: "all 0.15s",
  },
  summaryButtonActive: {
    background: "#334155",
    color: "#e2e8f0",
  },
  summaryGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: "1rem",
    padding: "1.5rem",
  },
  summaryCard: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "0.75rem",
    padding: "1.5rem",
    background: "#1e293b",
    borderRadius: "12px",
    border: "1px solid #334155",
  },
  summaryValue: {
    fontSize: "2rem",
    fontWeight: "bold",
    color: "#e2e8f0",
  },
  summaryLabel: {
    fontSize: "0.75rem",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  // Rankings styles
  rankingsContainer: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
    gap: "1rem",
    padding: "0 1.5rem 1.5rem",
  },
  rankingSection: {
    background: "#1e293b",
    borderRadius: "12px",
    padding: "1rem",
    border: "1px solid #334155",
  },
  rankingTitle: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    margin: "0 0 0.75rem 0",
    fontSize: "0.875rem",
    fontWeight: "bold",
    color: "#e2e8f0",
  },
  rankingList: {
    listStyle: "none",
    margin: 0,
    padding: 0,
  },
  rankingItem: {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
    padding: "0.5rem 0",
    borderBottom: "1px solid #334155",
  },
  rankNumber: {
    width: "1.5rem",
    height: "1.5rem",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#334155",
    borderRadius: "50%",
    fontSize: "0.75rem",
    fontWeight: "bold",
    color: "#94a3b8",
    flexShrink: 0,
  },
  rankTrack: {
    flex: 1,
    fontSize: "0.8125rem",
    color: "#e2e8f0",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  rankValue: {
    fontSize: "0.75rem",
    color: "#94a3b8",
    flexShrink: 0,
  },
};
