import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical,
  LayoutTemplate,
  ListMusic,
  Music,
  Trash2,
  TriangleAlert,
  Zap,
  FlaskConical,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { Track } from "../db/repositories/trackRepository";
import { useAnalyzer } from "../hooks/useAnalyzer";
import { useLibraryRefresh } from "../hooks/useLibraryRefresh";
import { getSetStats, useSetStore } from "../hooks/useSetBuilder";
import { useSidecar } from "../hooks/useSidecar";
import { analyzeTransition, type TransitionAnalysis } from "../utils/transitionEngine";
import { EnergyWave } from "./EnergyWave";
import { SaveLoadSets } from "./SaveLoadSets";
import { type FingerprintMetrics, TrackFingerprint } from "./TrackFingerprint";
import { TemplateManager } from "./TemplateManager";

interface SortableTrackRowProps {
  track: Track;
  index: number;
  onRemove: (id: number) => void;
  nextTrack?: Track;
  transitionWarning?: TransitionAnalysis;
}

function SortableTrackRow({ track, index, onRemove, transitionWarning }: SortableTrackRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: track.id,
  });

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

  // Build tooltip for warning badge
  const warningTooltip = transitionWarning?.issues.join(" • ") || "";
  const showWarning = transitionWarning && transitionWarning.warningLevel !== "none";
  const warningColor = transitionWarning?.warningLevel === "red" ? "#ef4444" : "#eab308";

  return (
    <div ref={setNodeRef} style={{ ...styles.rowWrapper, ...style }}>
      {/* Main row content */}
      <div style={styles.row}>
        <div {...attributes} {...listeners} style={styles.dragHandle} title="Drag to reorder">
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

      {/* Transition warning badge (at bottom of row) */}
      {showWarning && (
        <div
          style={{
            ...styles.warningBadge,
            borderColor: warningColor,
            background:
              warningColor === "#ef4444" ? "rgba(239, 68, 68, 0.15)" : "rgba(234, 179, 8, 0.15)",
          }}
          title={warningTooltip}
        >
          <TriangleAlert size={12} color={warningColor} />
          <span style={{ ...styles.warningText, color: warningColor }}>
            {transitionWarning?.issues[0]}
          </span>
        </div>
      )}
    </div>
  );
}

export function SetCanvas() {
  const { activeSet, removeTrack, reorderTracks, clearSet, refreshTracks } = useSetStore();
  const stats = useMemo(() => getSetStats(activeSet), [activeSet]);
  const { baseUrl } = useSidecar();
  const { isAnalyzing, startSetAnalysis, progress, totalToAnalyze } = useAnalyzer();
  const { triggerRefresh: triggerLibraryRefresh } = useLibraryRefresh();
  const [isAnalyzingSet, setIsAnalyzingSet] = useState(false);

  // Calculate average fingerprint metrics for the set
  const setAverageMetrics: FingerprintMetrics = useMemo(() => {
    if (activeSet.length === 0) {
      return {
        energy: null,
        danceability: null,
        brightness: null,
        acousticness: null,
        groove: null,
      };
    }

    // Helper to calculate average, skipping nulls
    const avg = (getter: (t: Track) => number | null): number | null => {
      const values = activeSet.map(getter).filter((v): v is number => v !== null);
      if (values.length === 0) return null;
      return values.reduce((sum, v) => sum + v, 0) / values.length;
    };

    return {
      energy: avg((t) => t.energy),
      danceability: avg((t) => t.danceability),
      brightness: avg((t) => t.brightness),
      acousticness: avg((t) => t.acousticness),
      groove: avg((t) => t.groove),
    };
  }, [activeSet]);

  // Template Manager state
  const [showTemplateManager, setShowTemplateManager] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
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
        <div style={styles.headerActions}>
          <SaveLoadSets />
          <button
            type="button"
            onClick={() => setShowTemplateManager(true)}
            style={styles.templatesButton}
            title="Manage set templates"
          >
            <LayoutTemplate size={14} />
            Templates
          </button>
          {activeSet.length > 0 && (
            <>
              {/* Analyze Set Button */}
              <button
                type="button"
                onClick={async () => {
                  if (!baseUrl) return;
                  setIsAnalyzingSet(true);
                  const unanalyzedIds = activeSet.filter((t) => !t.analyzed).map((t) => t.id);
                  await startSetAnalysis(baseUrl, unanalyzedIds);
                  // Refresh tracks to get updated analysis data
                  await refreshTracks();
                  // Also refresh the library view
                  triggerLibraryRefresh();
                  setIsAnalyzingSet(false);
                }}
                disabled={!baseUrl || isAnalyzing}
                style={{
                  ...styles.analyzeButton,
                  opacity: !baseUrl || isAnalyzing ? 0.5 : 1,
                  cursor: !baseUrl || isAnalyzing ? "not-allowed" : "pointer",
                }}
                title={!baseUrl ? "Analysis engine not ready" : "Analyze unanalyzed tracks in set"}
              >
                <FlaskConical size={14} />
                {isAnalyzingSet ? `${progress}/${totalToAnalyze}` : "Analyze Set"}
              </button>
              <button type="button" onClick={clearSet} style={styles.clearButton}>
                Clear All
              </button>
            </>
          )}
        </div>
      </div>

      {/* Energy Wave Visualization */}
      <div style={styles.waveContainer}>
        <EnergyWave height={100} />
      </div>

      {/* Stats */}
      <div style={styles.stats}>
        <div style={styles.statsLeft}>
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

        {/* Set Fingerprint */}
        {stats.totalTracks > 0 && (
          <div style={styles.setFingerprint}>
            <TrackFingerprint
              metrics={setAverageMetrics}
              size={100}
              showLabels={false}
              title="Set Profile"
            />
          </div>
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
              {activeSet.map((track, index) => {
                // Analyze transition to next track
                const nextTrack = activeSet[index + 1];
                const transition = nextTrack ? analyzeTransition(track, nextTrack) : undefined;

                return (
                  <SortableTrackRow
                    key={track.id}
                    track={track}
                    index={index}
                    onRemove={removeTrack}
                    nextTrack={nextTrack}
                    transitionWarning={transition}
                  />
                );
              })}
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* Template Manager Modal */}
      {showTemplateManager && (
        <TemplateManager
          onClose={() => setShowTemplateManager(false)}
          currentSetTracks={activeSet.map((t, i) => ({
            position: i + 1,
            bpm: t.bpm,
            energy: t.energy,
          }))}
        />
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
  headerActions: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
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
  analyzeButton: {
    display: "flex",
    alignItems: "center",
    gap: "0.25rem",
    padding: "0.25rem 0.75rem",
    background: "#22c55e",
    color: "white",
    border: "none",
    borderRadius: "4px",
    fontSize: "0.75rem",
  },
  templatesButton: {
    display: "flex",
    alignItems: "center",
    gap: "0.25rem",
    padding: "0.25rem 0.75rem",
    background: "#6366f1",
    color: "white",
    border: "none",
    borderRadius: "4px",
    fontSize: "0.75rem",
    cursor: "pointer",
  },
  waveContainer: {
    padding: "0.5rem",
    background: "#0f172a",
  },
  stats: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "1rem",
    padding: "0.5rem 1rem",
    background: "#1e293b",
    borderBottom: "1px solid #334155",
    fontSize: "0.75rem",
    opacity: 0.8,
  },
  statsLeft: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "0.25rem",
  },
  stat: {
    display: "flex",
    alignItems: "center",
    gap: "0.25rem",
  },
  setFingerprint: {
    flexShrink: 0,
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
  rowWrapper: {
    marginBottom: "0.25rem",
  },
  row: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    padding: "0.5rem",
    background: "#1e293b",
    borderRadius: "4px",
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
  warningBadge: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "0.25rem",
    padding: "0.125rem 0.5rem",
    marginTop: "0.125rem",
    marginLeft: "auto",
    marginRight: "auto",
    width: "fit-content",
    borderRadius: "10px",
    border: "1px solid",
    fontSize: "0.65rem",
  },
  warningText: {
    fontWeight: 500,
  },
};
