import { Radio, Wifi, WifiOff, Music2, AlertCircle, X } from "lucide-react";
import { useLiveSession } from "../hooks/useLiveSession";

export function LiveControl() {
    const { status, nowPlaying, error, isLive, goLive, endSet, clearNowPlaying } = useLiveSession();

    return (
        <div style={styles.container}>
            {/* Live Button */}
            <button
                type="button"
                onClick={isLive ? endSet : goLive}
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
};
