import { useState } from "react";
import { Radio, Wifi, WifiOff, Music2, AlertCircle, X, QrCode, Edit3, Users } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useLiveSession } from "../hooks/useLiveSession";
import { getListenerUrl } from "../config";

export function LiveControl() {
    const { status, nowPlaying, error, isLive, sessionId, listenerCount, goLive, endSet, clearNowPlaying } = useLiveSession();
    const [showQR, setShowQR] = useState(false);
    const [showNameModal, setShowNameModal] = useState(false);
    const [sessionName, setSessionName] = useState("");

    // Generate QR URL only if we have a session
    const qrUrl = sessionId ? getListenerUrl(sessionId) : null;

    const handleGoLiveClick = () => {
        if (isLive) {
            endSet();
        } else {
            // Show modal to name the session
            setSessionName(`Live Set ${new Date().toLocaleDateString()}`);
            setShowNameModal(true);
        }
    };

    const handleStartSession = () => {
        goLive(sessionName.trim() || undefined);
        setShowNameModal(false);
        setSessionName("");
    };

    const handleCancelSession = () => {
        setShowNameModal(false);
        setSessionName("");
    };

    return (
        <div style={styles.container}>
            {/* Live Button */}
            <button
                type="button"
                onClick={handleGoLiveClick}
                disabled={status === "connecting"}
                style={{
                    ...styles.liveButton,
                    ...(isLive ? styles.liveButtonActive : {}),
                    ...(status === "connecting" ? styles.liveButtonConnecting : {}),
                }}
            >
                <div style={styles.buttonContent}>
                    {status === "connecting" ? (
                        <>
                            <Wifi size={18} style={styles.pulseIcon} />
                            <span>Connecting...</span>
                        </>
                    ) : isLive ? (
                        <>
                            <Radio size={18} style={styles.pulseIcon} />
                            <span>LIVE</span>
                        </>
                    ) : (
                        <>
                            <WifiOff size={18} />
                            <span>GO LIVE</span>
                        </>
                    )}
                </div>
            </button>

            {/* Listener Count Badge */}
            {isLive && (
                <div style={styles.listenerBadge}>
                    <Users size={14} />
                    <span>{listenerCount}</span>
                </div>
            )}

            {/* Session Name Modal */}
            {showNameModal && (
                <div style={styles.modalOverlay} onClick={handleCancelSession}>
                    <div style={{ ...styles.modal, ...styles.sessionModalContent }} onClick={(e) => e.stopPropagation()}>
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
                            <button
                                type="button"
                                onClick={handleCancelSession}
                                style={styles.cancelBtn}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleStartSession}
                                style={styles.startBtn}
                            >
                                <Radio size={16} />
                                Start Live Session
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* QR Code Button (only when live) */}
            {isLive && sessionId && (
                <button
                    type="button"
                    onClick={() => setShowQR(true)}
                    style={styles.qrButton}
                    title="Show QR Code"
                >
                    <QrCode size={20} />
                </button>
            )}

            {/* Status & Now Playing */}
            <div style={styles.statusArea}>
                {error && (
                    <div style={styles.error}>
                        <AlertCircle size={14} />
                        <span>{error}</span>
                    </div>
                )}

                {isLive && nowPlaying && (
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

                {isLive && !nowPlaying && (
                    <div style={styles.waiting}>
                        <span>Waiting for track...</span>
                    </div>
                )}
            </div>

            {/* QR Code Modal */}
            {showQR && qrUrl && (
                <div style={styles.modalOverlay} onClick={() => setShowQR(false)}>
                    <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
                        <div style={styles.modalHeader}>
                            <h3 style={styles.modalTitle}>Scan to Listen</h3>
                            <button
                                type="button"
                                onClick={() => setShowQR(false)}
                                style={styles.modalClose}
                            >
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
};
