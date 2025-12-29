import { useState, useEffect, useMemo } from "react";
import {
    CheckCircle,
    Circle,
    Music,
    ArrowUpDown,
    ArrowUp,
    ArrowDown,
    Plus,
} from "lucide-react";
import {
    trackRepository,
    type Track,
} from "../db/repositories/trackRepository";
import { useSetStore } from "../hooks/useSetBuilder";

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

    const addTrack = useSetStore((state) => state.addTrack);
    const activeSet = useSetStore((state) => state.activeSet);

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
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
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
};
