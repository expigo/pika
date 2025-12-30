import { useMemo } from "react";
import { Lightbulb, Plus, Music, Zap, Key } from "lucide-react";
import type { Track } from "../db/repositories/trackRepository";
import {
    getRecommendations,
    hasRecommendationData,
    type RecommendedTrack,
} from "../utils/recommendationEngine";
import { toCamelot } from "../utils/transitionEngine";
import { useSetStore } from "../hooks/useSetBuilder";

interface Props {
    currentTrack: Track | null;
    library: Track[];
}

/**
 * SmartCrate Component
 * Displays AI-powered track recommendations based on the currently selected track.
 */
export function SmartCrate({ currentTrack, library }: Props) {
    const addTrack = useSetStore((state) => state.addTrack);
    const activeSet = useSetStore((state) => state.activeSet);

    // Calculate recommendations when current track changes
    const recommendations: RecommendedTrack[] = useMemo(() => {
        if (!currentTrack) return [];
        if (!hasRecommendationData(currentTrack)) return [];
        return getRecommendations(currentTrack, library, 7);
    }, [currentTrack, library]);

    // Check if track is already in set
    const isInSet = (trackId: number) =>
        activeSet.some((t) => t.id === trackId);

    // Get match color based on percentage
    const getMatchColor = (percent: number) => {
        if (percent >= 80) return "#22c55e"; // Green - excellent
        if (percent >= 60) return "#84cc16"; // Lime - good
        if (percent >= 40) return "#eab308"; // Yellow - decent
        return "#f97316"; // Orange - marginal
    };

    // Empty state - no track selected
    if (!currentTrack) {
        return (
            <div style={styles.container}>
                <div style={styles.header}>
                    <Lightbulb size={16} />
                    <span>Smart Recommendations</span>
                </div>
                <div style={styles.emptyState}>
                    <Lightbulb size={32} style={{ opacity: 0.3 }} />
                    <p style={styles.emptyText}>
                        Click the 👁️ on a track to see recommendations
                    </p>
                </div>
            </div>
        );
    }

    // Track selected but no recommendations (not analyzed or no matches)
    if (recommendations.length === 0) {
        return (
            <div style={styles.container}>
                <div style={styles.header}>
                    <Lightbulb size={16} />
                    <span>Smart Recommendations</span>
                </div>
                <div style={styles.emptyState}>
                    <Music size={32} style={{ opacity: 0.3 }} />
                    <p style={styles.emptyText}>
                        {hasRecommendationData(currentTrack)
                            ? "No compatible tracks found"
                            : "Analyze this track to get recommendations"}
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div style={styles.container}>
            {/* Header */}
            <div style={styles.header}>
                <Lightbulb size={16} color="#eab308" />
                <span>Smart Recommendations</span>
            </div>

            {/* Source Track */}
            <div style={styles.sourceTrack}>
                <span style={styles.sourceLabel}>Based on:</span>
                <span style={styles.sourceTitle}>
                    {currentTrack.title || "Untitled"} - {currentTrack.artist || "Unknown"}
                </span>
            </div>

            {/* Recommendations List */}
            <div style={styles.list}>
                {recommendations.map((track) => {
                    const inSet = isInSet(track.id);
                    const camelot = toCamelot(track.key);

                    return (
                        <div
                            key={track.id}
                            style={{
                                ...styles.row,
                                opacity: inSet ? 0.5 : 1,
                            }}
                        >
                            {/* Match Badge */}
                            <div
                                style={{
                                    ...styles.matchBadge,
                                    backgroundColor: getMatchColor(track.matchPercent),
                                }}
                            >
                                {track.matchPercent}%
                            </div>

                            {/* Track Info */}
                            <div style={styles.trackInfo}>
                                <span style={styles.title}>
                                    {track.title || "Untitled"}
                                </span>
                                <span style={styles.artist}>
                                    {track.artist || "Unknown"}
                                </span>
                            </div>

                            {/* Meta */}
                            <div style={styles.meta}>
                                {track.bpm && (
                                    <span style={styles.metaItem}>
                                        {Math.round(track.bpm)}
                                    </span>
                                )}
                                {camelot && (
                                    <span style={styles.metaItem}>
                                        <Key size={10} />
                                        {camelot}
                                    </span>
                                )}
                                {track.energy !== null && (
                                    <span style={styles.metaItem}>
                                        <Zap size={10} color="#f97316" />
                                        {Math.round(track.energy)}
                                    </span>
                                )}
                            </div>

                            {/* Add Button */}
                            <button
                                type="button"
                                onClick={() => addTrack(track)}
                                disabled={inSet}
                                style={{
                                    ...styles.addButton,
                                    opacity: inSet ? 0.3 : 1,
                                    cursor: inSet ? "not-allowed" : "pointer",
                                }}
                                title={inSet ? "Already in set" : "Add to set"}
                            >
                                <Plus size={14} />
                            </button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

const styles: Record<string, React.CSSProperties> = {
    container: {
        display: "flex",
        flexDirection: "column",
        background: "#0f172a",
        borderRadius: "8px",
        border: "1px solid #1e293b",
        overflow: "hidden",
    },
    header: {
        display: "flex",
        alignItems: "center",
        gap: "0.5rem",
        padding: "0.75rem 1rem",
        background: "#1e293b",
        borderBottom: "1px solid #334155",
        fontSize: "0.875rem",
        fontWeight: "bold",
    },
    sourceTrack: {
        display: "flex",
        flexDirection: "column",
        gap: "0.125rem",
        padding: "0.5rem 1rem",
        background: "rgba(234, 179, 8, 0.1)",
        borderBottom: "1px solid #334155",
    },
    sourceLabel: {
        fontSize: "0.625rem",
        textTransform: "uppercase",
        color: "#64748b",
        fontWeight: "bold",
    },
    sourceTitle: {
        fontSize: "0.75rem",
        color: "#eab308",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
    },
    list: {
        display: "flex",
        flexDirection: "column",
        flex: 1,
        overflowY: "auto",
    },
    row: {
        display: "flex",
        alignItems: "center",
        gap: "0.5rem",
        padding: "0.5rem 0.75rem",
        borderBottom: "1px solid #1e293b",
        transition: "background 0.15s",
    },
    matchBadge: {
        flexShrink: 0,
        padding: "0.125rem 0.375rem",
        borderRadius: "4px",
        fontSize: "0.625rem",
        fontWeight: "bold",
        color: "#0f172a",
    },
    trackInfo: {
        flex: 1,
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
    },
    title: {
        fontSize: "0.875rem",
        fontWeight: 500,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
    },
    artist: {
        fontSize: "0.75rem",
        color: "#64748b",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
    },
    meta: {
        display: "flex",
        alignItems: "center",
        gap: "0.625rem",
        fontSize: "0.75rem",
        color: "#94a3b8",
        flexShrink: 0,
    },
    metaItem: {
        display: "flex",
        alignItems: "center",
        gap: "0.125rem",
    },
    addButton: {
        flexShrink: 0,
        padding: "0.25rem",
        background: "#22c55e",
        color: "white",
        border: "none",
        borderRadius: "4px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
    },
    emptyState: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "1.5rem",
        gap: "0.5rem",
    },
    emptyText: {
        fontSize: "0.75rem",
        color: "#64748b",
        textAlign: "center",
        margin: 0,
    },
};
