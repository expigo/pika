/**
 * Live Performance Mode Component
 * Full-screen, high-contrast overlay for gig performance.
 */

import { useState } from "react";
import {
    X,
    Flame,
    Square,
    StickyNote,
    Music,
    Activity,
    Heart,
} from "lucide-react";
import { useActivePlay } from "../hooks/useActivePlay";
import type { PlayReaction } from "../db/schema";

interface Props {
    onExit: () => void;
}

export function LivePerformanceMode({ onExit }: Props) {
    const {
        currentPlay,
        recentPlays,
        loading,
        updateReaction,
        updateNotes,
        playCount,
    } = useActivePlay(1000); // Poll every 1 second for responsiveness

    const [showNoteModal, setShowNoteModal] = useState(false);
    const [noteText, setNoteText] = useState("");

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
                </div>

                <button
                    type="button"
                    onClick={onExit}
                    style={styles.exitButton}
                    title="Exit Performance Mode"
                >
                    <X size={24} />
                    <span>Exit</span>
                </button>
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
                        <h1 style={styles.title}>
                            {currentPlay.title || "Unknown Title"}
                        </h1>

                        {/* Artist */}
                        <p style={styles.artist}>
                            {currentPlay.artist || "Unknown Artist"}
                        </p>

                        {/* Metadata */}
                        <div style={styles.metadata}>
                            {currentPlay.bpm && (
                                <span style={styles.metaItem}>
                                    {Math.round(currentPlay.bpm)} BPM
                                </span>
                            )}
                            {currentPlay.key && (
                                <span style={styles.metaItem}>
                                    {currentPlay.key}
                                </span>
                            )}
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
                                    backgroundColor:
                                        currentPlay.reaction === "peak"
                                            ? "#ea580c"
                                            : "#1e3a5f",
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
                        <p style={styles.subText}>
                            Play a track in VirtualDJ to get started
                        </p>
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
            </footer>

            {/* Recent Plays (Mini Timeline) */}
            <div style={styles.timeline}>
                {recentPlays.slice(-5).map((play, idx) => (
                    <div
                        key={play.id}
                        style={{
                            ...styles.timelineItem,
                            opacity: idx === recentPlays.slice(-5).length - 1 ? 1 : 0.5,
                        }}
                    >
                        {play.reaction === "peak" && "🔥"}
                        {play.reaction === "brick" && "🧱"}
                        {play.reaction === "neutral" && "•"}
                    </div>
                ))}
            </div>

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
                            <button
                                type="button"
                                onClick={handleSaveNote}
                                style={styles.saveButton}
                            >
                                Save Note
                            </button>
                        </div>
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
        bottom: "8rem",
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
