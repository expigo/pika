import { useMemo } from "react";
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
} from "@dnd-kit/core";
import {
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Trash2, ListMusic, Zap, Music } from "lucide-react";
import { useSetStore, getSetStats } from "../hooks/useSetBuilder";
import { EnergyWave } from "./EnergyWave";
import type { Track } from "../db/repositories/trackRepository";

interface SortableTrackRowProps {
    track: Track;
    index: number;
    onRemove: (id: number) => void;
}

function SortableTrackRow({ track, index, onRemove }: SortableTrackRowProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: track.id });

    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 1000 : "auto",
    };

    const getEnergyColor = (energy: number | null) => {
        if (energy === null) return "#4b5563";
        const normalized = energy / 100;
        if (normalized < 0.4) return "#3b82f6";
        if (normalized <= 0.7) return "#22c55e";
        return "#f97316";
    };

    return (
        <div ref={setNodeRef} style={{ ...styles.row, ...style }}>
            <div
                {...attributes}
                {...listeners}
                style={styles.dragHandle}
                title="Drag to reorder"
            >
                <GripVertical size={16} />
            </div>
            <span style={styles.index}>{index + 1}</span>
            <div style={styles.trackInfo}>
                <span style={styles.artist}>{track.artist || "Unknown"}</span>
                <span style={styles.title}>{track.title || "Untitled"}</span>
            </div>
            <span style={styles.bpm}>{track.bpm?.toFixed(0) || "-"}</span>
            <span style={styles.key}>{track.key || "-"}</span>
            <div style={styles.energyContainer}>
                <div
                    style={{
                        ...styles.energyBar,
                        width: `${Math.min(100, track.energy ?? 0)}%`,
                        backgroundColor: getEnergyColor(track.energy),
                    }}
                />
            </div>
            <button
                type="button"
                onClick={() => onRemove(track.id)}
                style={styles.removeButton}
                title="Remove from set"
            >
                <Trash2 size={14} />
            </button>
        </div>
    );
}

export function SetCanvas() {
    const { activeSet, removeTrack, reorderTracks, clearSet } = useSetStore();
    const stats = useMemo(() => getSetStats(activeSet), [activeSet]);

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            const oldIndex = activeSet.findIndex((t) => t.id === active.id);
            const newIndex = activeSet.findIndex((t) => t.id === over.id);
            reorderTracks(oldIndex, newIndex);
        }
    };

    return (
        <div style={styles.container}>
            {/* Header */}
            <div style={styles.header}>
                <div style={styles.headerTitle}>
                    <ListMusic size={20} />
                    <span>Set Builder</span>
                </div>
                {activeSet.length > 0 && (
                    <button
                        type="button"
                        onClick={clearSet}
                        style={styles.clearButton}
                    >
                        Clear All
                    </button>
                )}
            </div>

            {/* Energy Wave Visualization */}
            <div style={styles.waveContainer}>
                <EnergyWave height={100} />
            </div>

            {/* Stats */}
            <div style={styles.stats}>
                <div style={styles.stat}>
                    <Music size={14} />
                    <span>{stats.totalTracks} tracks</span>
                </div>
                {stats.totalTracks > 0 && (
                    <>
                        <div style={styles.stat}>
                            <span>Avg BPM: {stats.avgBpm}</span>
                        </div>
                        <div style={styles.stat}>
                            <Zap size={14} color="#f97316" />
                            <span>Energy: {stats.avgEnergy}</span>
                        </div>
                    </>
                )}
            </div>

            {/* Track List */}
            <div style={styles.listContainer}>
                {activeSet.length === 0 ? (
                    <div style={styles.emptyState}>
                        <ListMusic size={48} style={{ opacity: 0.3 }} />
                        <p>Click + on tracks to add them to your set</p>
                    </div>
                ) : (
                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd}
                        modifiers={[restrictToVerticalAxis]}
                    >
                        <SortableContext
                            items={activeSet.map((t) => t.id)}
                            strategy={verticalListSortingStrategy}
                        >
                            {activeSet.map((track, index) => (
                                <SortableTrackRow
                                    key={track.id}
                                    track={track}
                                    index={index}
                                    onRemove={removeTrack}
                                />
                            ))}
                        </SortableContext>
                    </DndContext>
                )}
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
        border: "1px solid #1e293b",
        overflow: "hidden",
    },
    header: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "0.75rem 1rem",
        background: "#1e293b",
        borderBottom: "1px solid #334155",
    },
    headerTitle: {
        display: "flex",
        alignItems: "center",
        gap: "0.5rem",
        fontWeight: "bold",
    },
    clearButton: {
        padding: "0.25rem 0.75rem",
        background: "transparent",
        color: "#ef4444",
        border: "1px solid #ef4444",
        borderRadius: "4px",
        cursor: "pointer",
        fontSize: "0.75rem",
    },
    waveContainer: {
        padding: "0.5rem",
        background: "#0f172a",
    },
    stats: {
        display: "flex",
        gap: "1rem",
        padding: "0.5rem 1rem",
        background: "#1e293b",
        borderBottom: "1px solid #334155",
        fontSize: "0.75rem",
        opacity: 0.8,
    },
    stat: {
        display: "flex",
        alignItems: "center",
        gap: "0.25rem",
    },
    listContainer: {
        flex: 1,
        overflowY: "auto",
        padding: "0.5rem",
    },
    emptyState: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        opacity: 0.5,
        textAlign: "center",
        padding: "2rem",
    },
    row: {
        display: "flex",
        alignItems: "center",
        gap: "0.5rem",
        padding: "0.5rem",
        background: "#1e293b",
        borderRadius: "4px",
        marginBottom: "0.25rem",
        fontSize: "0.8rem",
    },
    dragHandle: {
        cursor: "grab",
        padding: "0.25rem",
        color: "#64748b",
        display: "flex",
        alignItems: "center",
    },
    index: {
        width: "24px",
        textAlign: "center",
        color: "#64748b",
        fontSize: "0.75rem",
    },
    trackInfo: {
        flex: 1,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        gap: "0.125rem",
    },
    artist: {
        fontWeight: "500",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
    },
    title: {
        fontSize: "0.7rem",
        opacity: 0.7,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
    },
    bpm: {
        width: "40px",
        textAlign: "right",
        fontSize: "0.75rem",
    },
    key: {
        width: "32px",
        textAlign: "center",
        fontSize: "0.75rem",
    },
    energyContainer: {
        width: "40px",
        height: "8px",
        background: "#334155",
        borderRadius: "4px",
        overflow: "hidden",
    },
    energyBar: {
        height: "100%",
        transition: "width 0.2s",
    },
    removeButton: {
        padding: "0.25rem",
        background: "transparent",
        color: "#ef4444",
        border: "none",
        borderRadius: "4px",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        opacity: 0.6,
    },
};
