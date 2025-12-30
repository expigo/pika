import { useState, useEffect, useMemo } from "react";
import {
    CheckCircle,
    Circle,
    Music,
    ArrowUpDown,
    ArrowUp,
    ArrowDown,
    Plus,
    Trash2,
    X,
    Eye,
    Check,
} from "lucide-react";
import { ask } from "@tauri-apps/plugin-dialog";
import {
    trackRepository,
    type Track,
} from "../db/repositories/trackRepository";
import { useSetStore } from "../hooks/useSetBuilder";
import { TrackFingerprint } from "./TrackFingerprint";
import { SmartCrate } from "./SmartCrate";
import { toCamelot } from "../utils/transitionEngine";

type SortKey = "artist" | "title" | "bpm" | "key" | "energy" | "analyzed";
type SortDirection = "asc" | "desc";

interface Props {
    refreshTrigger?: number;
}

export function LibraryBrowser({ refreshTrigger }: Props) {
    const [tracks, setTracks] = useState<Track[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [sortKey, setSortKey] = useState<SortKey>("artist");
    const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
    const [selectedTrackId, setSelectedTrackId] = useState<number | null>(null);

    const addTrack = useSetStore((state) => state.addTrack);
    const activeSet = useSetStore((state) => state.activeSet);

    // Get the selected track object
    const selectedTrack = useMemo(
        () => tracks.find((t) => t.id === selectedTrackId) ?? null,
        [tracks, selectedTrackId]
    );

    // Check if we're in Tauri
    const inTauri =
        typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

    // Fetch tracks on mount and when refreshTrigger changes
    useEffect(() => {
        const fetchTracks = async () => {
            if (!inTauri) {
                setLoading(false);
                return;
            }

            setLoading(true);
            setError(null);
            try {
                const allTracks = await trackRepository.getAllTracks();
                setTracks(allTracks as Track[]);
            } catch (e) {
                console.error("Failed to fetch tracks:", e);
                setError(String(e));
            } finally {
                setLoading(false);
            }
        };
        fetchTracks();
    }, [refreshTrigger, inTauri]);

    // Sort tracks
    const sortedTracks = useMemo(() => {
        const sorted = [...tracks].sort((a, b) => {
            let aVal: string | number | boolean | null = a[sortKey];
            let bVal: string | number | boolean | null = b[sortKey];

            if (aVal === null || aVal === undefined) aVal = "";
            if (bVal === null || bVal === undefined) bVal = "";

            if (typeof aVal === "boolean") aVal = aVal ? 1 : 0;
            if (typeof bVal === "boolean") bVal = bVal ? 1 : 0;

            if (typeof aVal === "string" && typeof bVal === "string") {
                return sortDirection === "asc"
                    ? aVal.localeCompare(bVal)
                    : bVal.localeCompare(aVal);
            }

            const numA = typeof aVal === "number" ? aVal : 0;
            const numB = typeof bVal === "number" ? bVal : 0;
            return sortDirection === "asc" ? numA - numB : numB - numA;
        });
        return sorted;
    }, [tracks, sortKey, sortDirection]);

    const handleSort = (key: SortKey) => {
        if (sortKey === key) {
            setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
        } else {
            setSortKey(key);
            setSortDirection("asc");
        }
    };

    const SortIcon = ({ columnKey }: { columnKey: SortKey }) => {
        if (sortKey !== columnKey) {
            return <ArrowUpDown size={14} style={{ opacity: 0.4 }} />;
        }
        return sortDirection === "asc" ? (
            <ArrowUp size={14} />
        ) : (
            <ArrowDown size={14} />
        );
    };

    const getEnergyColor = (energy: number | null) => {
        if (energy === null) return "#4b5563";
        const normalized = energy / 100;
        if (normalized < 0.4) return "#3b82f6";
        if (normalized <= 0.7) return "#22c55e";
        return "#f97316";
    };

    const getEnergyPercent = (energy: number | null) => {
        if (energy === null) return 0;
        return Math.min(100, energy);
    };

    const getFileName = (filePath: string) => {
        const parts = filePath.split("/");
        return parts[parts.length - 1] || filePath;
    };

    const isInSet = (trackId: number) =>
        activeSet.some((t) => t.id === trackId);

    // Check if track has fingerprint data
    const hasFingerprint = (track: Track) =>
        track.analyzed && (
            track.energy !== null ||
            track.danceability !== null ||
            track.brightness !== null ||
            track.acousticness !== null ||
            track.groove !== null
        );

    // Handle delete track with confirmation
    const handleDeleteTrack = async (track: Track) => {
        // Use Tauri's native dialog (window.confirm doesn't work in Tauri)
        const confirmed = await ask(
            `Remove "${track.title || track.artist || 'this track'}" from library?`,
            { title: "Confirm Delete", kind: "warning" }
        );
        if (!confirmed) return;

        const success = await trackRepository.deleteTrack(track.id);
        if (success) {
            setTracks((prev) => prev.filter((t) => t.id !== track.id));
        }
    };

    // Browser mode placeholder
    if (!inTauri) {
        return (
            <div style={styles.container}>
                <div style={styles.header}>
                    <span style={styles.title}>
                        <Music size={18} style={{ marginRight: "0.5rem" }} />
                        Library
                    </span>
                </div>
                <div style={styles.empty}>Open the desktop app to view your library.</div>
            </div>
        );
    }

    if (loading) {
        return (
            <div style={styles.container}>
                <div style={styles.header}>
                    <span style={styles.title}>
                        <Music size={18} style={{ marginRight: "0.5rem" }} />
                        Library
                    </span>
                </div>
                <div style={styles.loading}>Loading library...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div style={styles.container}>
                <div style={styles.header}>
                    <span style={styles.title}>
                        <Music size={18} style={{ marginRight: "0.5rem" }} />
                        Library
                    </span>
                </div>
                <div style={styles.error}>Error: {error}</div>
            </div>
        );
    }

    if (tracks.length === 0) {
        return (
            <div style={styles.container}>
                <div style={styles.header}>
                    <span style={styles.title}>
                        <Music size={18} style={{ marginRight: "0.5rem" }} />
                        Library
                    </span>
                </div>
                <div style={styles.empty}>
                    No tracks in library. Import a VirtualDJ database to get started.
                </div>
            </div>
        );
    }

    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <span style={styles.title}>
                    <Music size={18} style={{ marginRight: "0.5rem" }} />
                    Library
                </span>
                <span style={styles.count}>{tracks.length} tracks</span>
            </div>

            <div style={styles.tableContainer}>
                <table style={styles.table}>
                    <thead>
                        <tr>
                            <th style={{ ...styles.th, width: "40px" }}>Add</th>
                            <th style={styles.th} onClick={() => handleSort("analyzed")}>
                                <div style={styles.thContent}>
                                    Status <SortIcon columnKey="analyzed" />
                                </div>
                            </th>
                            <th style={styles.th} onClick={() => handleSort("artist")}>
                                <div style={styles.thContent}>
                                    Artist <SortIcon columnKey="artist" />
                                </div>
                            </th>
                            <th style={styles.th} onClick={() => handleSort("title")}>
                                <div style={styles.thContent}>
                                    Title <SortIcon columnKey="title" />
                                </div>
                            </th>
                            <th
                                style={{ ...styles.th, width: "70px" }}
                                onClick={() => handleSort("bpm")}
                            >
                                <div style={styles.thContent}>
                                    BPM <SortIcon columnKey="bpm" />
                                </div>
                            </th>
                            <th
                                style={{ ...styles.th, width: "50px" }}
                                onClick={() => handleSort("key")}
                            >
                                <div style={styles.thContent}>
                                    Key <SortIcon columnKey="key" />
                                </div>
                            </th>
                            <th
                                style={{ ...styles.th, width: "80px" }}
                                onClick={() => handleSort("energy")}
                            >
                                <div style={styles.thContent}>
                                    Energy <SortIcon columnKey="energy" />
                                </div>
                            </th>
                            <th style={{ ...styles.th, width: "40px" }}></th>
                        </tr>
                    </thead>
                    <tbody>
                        {sortedTracks.map((track) => {
                            const inSet = isInSet(track.id);
                            return (
                                <tr
                                    key={track.id}
                                    style={{
                                        ...styles.tr,
                                        opacity: inSet ? 0.5 : 1,
                                    }}
                                >
                                    <td style={styles.td}>
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
                                    </td>
                                    <td style={styles.td}>
                                        {track.analyzed ? (
                                            <CheckCircle size={16} color="#22c55e" />
                                        ) : (
                                            <Circle size={16} color="#6b7280" />
                                        )}
                                    </td>
                                    <td style={styles.td}>
                                        {track.artist || (
                                            <span style={styles.unknown}>Unknown</span>
                                        )}
                                    </td>
                                    <td style={styles.td}>
                                        {track.title || (
                                            <span style={styles.filename}>
                                                {getFileName(track.filePath)}
                                            </span>
                                        )}
                                    </td>
                                    <td style={{ ...styles.td, textAlign: "right" }}>
                                        {track.bpm ? track.bpm.toFixed(0) : "-"}
                                    </td>
                                    <td style={{ ...styles.td, textAlign: "center" }}>
                                        {track.key || "-"}
                                    </td>
                                    <td style={styles.td}>
                                        <div style={styles.energyContainer}>
                                            <div
                                                style={{
                                                    ...styles.energyBar,
                                                    width: `${getEnergyPercent(track.energy)}%`,
                                                    backgroundColor: getEnergyColor(track.energy),
                                                }}
                                            />
                                            <span style={styles.energyText}>
                                                {track.energy !== null
                                                    ? Math.round(track.energy)
                                                    : "-"}
                                            </span>
                                        </div>
                                    </td>
                                    <td style={styles.td}>
                                        <div style={styles.actionButtons}>
                                            {track.analyzed && (
                                                <button
                                                    type="button"
                                                    onClick={() => setSelectedTrackId(track.id)}
                                                    style={styles.viewButton}
                                                    title="View fingerprint"
                                                >
                                                    <Eye size={14} />
                                                </button>
                                            )}
                                            <button
                                                type="button"
                                                onClick={() => handleDeleteTrack(track)}
                                                style={styles.deleteButton}
                                                title="Remove from library"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Track Details Modal */}
            {selectedTrack && (
                <div style={styles.modalOverlay} onClick={() => setSelectedTrackId(null)}>
                    <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
                        {/* Modal Header */}
                        <div style={styles.modalHeader}>
                            <div>
                                <h3 style={styles.modalTitle}>
                                    {selectedTrack.title || "Untitled"}
                                </h3>
                                <p style={styles.modalArtist}>
                                    {selectedTrack.artist || "Unknown Artist"}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setSelectedTrackId(null)}
                                style={styles.modalClose}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Track Metadata */}
                        <div style={styles.modalMeta}>
                            <div style={styles.metaItem}>
                                <span style={styles.metaLabel}>BPM</span>
                                <span style={styles.metaValue}>
                                    {selectedTrack.bpm?.toFixed(1) || "-"}
                                </span>
                            </div>
                            <div style={styles.metaItem}>
                                <span style={styles.metaLabel}>Key</span>
                                <span style={styles.metaValue}>
                                    {selectedTrack.key || "-"}
                                </span>
                                {selectedTrack.key && toCamelot(selectedTrack.key) && (
                                    <span style={styles.camelotBadge}>
                                        {toCamelot(selectedTrack.key)}
                                    </span>
                                )}
                            </div>
                            <div style={styles.metaItem}>
                                <span style={styles.metaLabel}>Energy</span>
                                <span style={styles.metaValue}>
                                    {selectedTrack.energy?.toFixed(0) || "-"}
                                </span>
                            </div>
                            <div style={styles.metaItem}>
                                <span style={styles.metaLabel}>Danceability</span>
                                <span style={styles.metaValue}>
                                    {selectedTrack.danceability?.toFixed(0) || "-"}
                                </span>
                            </div>
                        </div>

                        {/* Two-column content: Fingerprint + Recommendations */}
                        <div style={styles.modalContent}>
                            {/* Left: Fingerprint Visualization */}
                            <div style={styles.fingerprintColumn}>
                                {hasFingerprint(selectedTrack) ? (
                                    <TrackFingerprint metrics={selectedTrack} size={250} />
                                ) : (
                                    <div style={styles.noFingerprint}>
                                        <Music size={48} style={{ opacity: 0.3 }} />
                                        <p>No analysis data</p>
                                    </div>
                                )}
                            </div>

                            {/* Right: Smart Recommendations */}
                            <div style={styles.recommendationsColumn}>
                                <SmartCrate currentTrack={selectedTrack} library={tracks} />
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <div style={styles.modalActions}>
                            {isInSet(selectedTrack.id) ? (
                                <div style={styles.inSetBadge}>
                                    <Check size={16} />
                                    Already in Set
                                </div>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => {
                                        addTrack(selectedTrack);
                                    }}
                                    style={styles.modalButton}
                                >
                                    <Plus size={16} />
                                    Add to Set
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

const styles: Record<string, React.CSSProperties> = {
    container: {
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "#0f172a",
        borderRadius: "8px",
        overflow: "hidden",
        border: "1px solid #1e293b",
    },
    header: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "1rem",
        background: "#1e293b",
        borderBottom: "1px solid #334155",
    },
    title: {
        fontWeight: "bold",
        fontSize: "1rem",
        display: "flex",
        alignItems: "center",
    },
    count: {
        opacity: 0.7,
        fontSize: "0.875rem",
    },
    loading: {
        padding: "2rem",
        textAlign: "center",
        opacity: 0.7,
    },
    empty: {
        padding: "2rem",
        textAlign: "center",
        opacity: 0.7,
    },
    error: {
        padding: "2rem",
        textAlign: "center",
        color: "#ef4444",
    },
    tableContainer: {
        flex: 1,
        overflowX: "auto",
        overflowY: "auto",
    },
    table: {
        width: "100%",
        borderCollapse: "collapse",
        fontSize: "0.8rem",
    },
    th: {
        textAlign: "left",
        padding: "0.5rem 0.75rem",
        background: "#1e293b",
        borderBottom: "1px solid #334155",
        cursor: "pointer",
        userSelect: "none",
        whiteSpace: "nowrap",
        position: "sticky" as const,
        top: 0,
        zIndex: 1,
    },
    thContent: {
        display: "flex",
        alignItems: "center",
        gap: "0.25rem",
    },
    tr: {
        borderBottom: "1px solid #1e293b",
    },
    td: {
        padding: "0.4rem 0.75rem",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        maxWidth: "180px",
    },
    addButton: {
        padding: "0.25rem",
        background: "#22c55e",
        color: "white",
        border: "none",
        borderRadius: "4px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
    },
    deleteButton: {
        padding: "0.25rem",
        background: "transparent",
        color: "#64748b",
        border: "none",
        borderRadius: "4px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        opacity: 0.5,
        transition: "opacity 0.2s, color 0.2s",
    },
    unknown: {
        opacity: 0.5,
        fontStyle: "italic",
    },
    filename: {
        opacity: 0.7,
        fontSize: "0.7rem",
    },
    energyContainer: {
        position: "relative" as const,
        height: "16px",
        background: "#1e293b",
        borderRadius: "4px",
        overflow: "hidden",
    },
    energyBar: {
        position: "absolute" as const,
        left: 0,
        top: 0,
        height: "100%",
        transition: "width 0.2s ease",
        borderRadius: "4px",
    },
    energyText: {
        position: "absolute" as const,
        right: "4px",
        top: "50%",
        transform: "translateY(-50%)",
        fontSize: "0.65rem",
        fontWeight: "bold",
        textShadow: "0 1px 2px rgba(0,0,0,0.5)",
    },
    actionButtons: {
        display: "flex",
        gap: "0.25rem",
        alignItems: "center",
    },
    viewButton: {
        padding: "0.25rem",
        background: "rgba(59, 130, 246, 0.2)",
        color: "#3b82f6",
        border: "none",
        borderRadius: "4px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        transition: "background 0.2s",
    },
    // Modal styles
    modalOverlay: {
        position: "fixed" as const,
        inset: 0,
        background: "rgba(0, 0, 0, 0.85)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "2rem",
    },
    modal: {
        background: "#1e293b",
        borderRadius: "16px",
        padding: "2rem",
        width: "100%",
        maxWidth: "900px",
        maxHeight: "85vh",
        overflow: "auto",
        boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
        border: "1px solid #334155",
    },
    modalHeader: {
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        marginBottom: "1.5rem",
    },
    modalTitle: {
        margin: 0,
        fontSize: "1.5rem",
        fontWeight: "bold",
        color: "#f1f5f9",
    },
    modalArtist: {
        margin: "0.375rem 0 0 0",
        fontSize: "1rem",
        color: "#94a3b8",
    },
    modalClose: {
        padding: "0.5rem",
        background: "rgba(100, 116, 139, 0.2)",
        color: "#94a3b8",
        border: "none",
        borderRadius: "8px",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        transition: "background 0.2s",
    },
    modalMeta: {
        display: "flex",
        gap: "2rem",
        padding: "1rem 1.5rem",
        background: "#0f172a",
        borderRadius: "12px",
        marginBottom: "1.5rem",
    },
    metaItem: {
        display: "flex",
        flexDirection: "column" as const,
        alignItems: "center",
        gap: "0.375rem",
    },
    metaLabel: {
        fontSize: "0.75rem",
        textTransform: "uppercase" as const,
        color: "#64748b",
        fontWeight: "bold",
        letterSpacing: "0.05em",
    },
    metaValue: {
        fontSize: "1.25rem",
        fontWeight: "bold",
        color: "#f1f5f9",
    },
    // Two-column layout for fingerprint + recommendations
    modalContent: {
        display: "flex",
        gap: "2rem",
        marginBottom: "1.5rem",
        minHeight: "280px",
    },
    fingerprintColumn: {
        flex: "0 0 280px",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        background: "#0f172a",
        borderRadius: "12px",
        padding: "1rem",
    },
    recommendationsColumn: {
        flex: 1,
        minWidth: 0,
    },
    noFingerprint: {
        display: "flex",
        flexDirection: "column" as const,
        alignItems: "center",
        justifyContent: "center",
        gap: "0.5rem",
        color: "#64748b",
        textAlign: "center" as const,
        padding: "1rem",
    },
    modalActions: {
        display: "flex",
        justifyContent: "center",
        paddingTop: "1.5rem",
        borderTop: "1px solid #334155",
    },
    modalButton: {
        display: "flex",
        alignItems: "center",
        gap: "0.5rem",
        padding: "0.75rem 1.5rem",
        background: "#22c55e",
        color: "white",
        border: "none",
        borderRadius: "8px",
        fontSize: "1rem",
        fontWeight: "bold",
        cursor: "pointer",
        transition: "background 0.2s",
    },
    inSetBadge: {
        display: "flex",
        alignItems: "center",
        gap: "0.5rem",
        padding: "0.75rem 1.5rem",
        background: "#334155",
        color: "#94a3b8",
        borderRadius: "8px",
        fontSize: "1rem",
        fontWeight: "bold",
    },
    camelotBadge: {
        marginTop: "0.25rem",
        padding: "0.25rem 0.5rem",
        background: "rgba(168, 85, 247, 0.2)",
        color: "#a855f7",
        borderRadius: "4px",
        fontSize: "0.75rem",
        fontWeight: "bold",
    },
};
