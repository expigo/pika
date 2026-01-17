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
  FlaskConical,
  Sparkles,
  Zap,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useLibraryRefresh } from "../hooks/useLibraryRefresh";
import type { Track } from "../db/repositories/trackRepository";
import { useAnalyzer } from "../hooks/useAnalyzer";
import { useSetStore } from "../hooks/useSetBuilder";
import { useSidecar } from "../hooks/useSidecar";
import { analyzeTransition, type TransitionAnalysis } from "../utils/transitionEngine";
import { type FingerprintMetrics, TrackFingerprint } from "./TrackFingerprint";
import { TemplateManager } from "./TemplateManager";
import { getEnergyColor } from "../utils/trackUtils";

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
    zIndex: isDragging ? 10 : 0,
    position: "relative",
  };

  const showWarning = transitionWarning && transitionWarning.warningLevel !== "none";
  const warningColor =
    transitionWarning?.warningLevel === "red" ? "text-red-500" : "text-amber-500";

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`pro-table-row group ${isDragging ? "opacity-40" : "opacity-100"} bg-pika-surface-1`}
    >
      <div
        {...attributes}
        {...listeners}
        className="w-[30px] pro-table-cell justify-center cursor-grab active:cursor-grabbing text-slate-600 hover:text-slate-400"
      >
        <GripVertical size={14} />
      </div>

      <div className="w-[30px] pro-table-cell justify-center font-mono text-[10px] text-slate-500">
        {index + 1}
      </div>

      <div className="flex-1 pro-table-cell gap-2">
        <div className="flex flex-col min-w-0">
          <span className="text-[10px] font-bold text-slate-500 uppercase leading-none truncate">
            {track.artist || "Unknown"}
          </span>
          <span className="text-xs font-semibold text-slate-200 truncate">
            {track.title || "Untitled"}
          </span>
        </div>
        {showWarning && (
          <div
            className={`${warningColor} animate-pulse`}
            title={transitionWarning?.issues.join(" • ")}
          >
            <TriangleAlert size={12} />
          </div>
        )}
      </div>

      <div className="w-[50px] pro-table-cell justify-end font-mono text-xs text-slate-400">
        {track.bpm?.toFixed(0) || "-"}
      </div>

      <div className="w-[40px] pro-table-cell justify-center font-bold text-pika-purple-light text-xs">
        {track.key || "-"}
      </div>

      <div className="w-[60px] pro-table-cell">
        <div className="energy-pill">
          <div
            className="energy-pill-fill"
            style={{
              width: `${Math.min(100, track.energy ?? 0)}%`,
              backgroundColor: getEnergyColor(track.energy),
            }}
          />
        </div>
      </div>

      <div className="w-[40px] pro-table-cell justify-center opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={() => onRemove(track.id)}
          className="p-1 text-slate-500 hover:text-red-500"
          title="Remove from set"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

export function SetCanvas() {
  const { activeSet, removeTrack, reorderTracks, clearSet, refreshTracks } = useSetStore();
  const { baseUrl } = useSidecar();
  const { isAnalyzing, startSetAnalysis } = useAnalyzer();
  const { triggerRefresh: triggerLibraryRefresh } = useLibraryRefresh();
  const [isAnalyzingSet, setIsAnalyzingSet] = useState(false);
  const [showDiscoveryMode, setShowDiscoveryMode] = useState(false);

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

  // Main render

  return (
    <div className="pro-table-container h-full flex flex-col select-none">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-pika-border bg-pika-surface-1">
        <div className="flex items-center gap-3">
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter leading-none">
              The Crate
            </span>
            <span className="text-xs font-bold text-slate-100 flex items-center gap-2">
              <ListMusic size={12} className="text-pika-accent" />
              {activeSet.length > 0 ? "Mix" : "Empty"}
            </span>
          </div>
        </div>

        <div className="flex gap-1.5">
          {activeSet.length > 0 && (
            <button
              type="button"
              onClick={async () => {
                if (!baseUrl) return;
                setIsAnalyzingSet(true);
                const unanalyzedIds = activeSet.filter((t) => !t.analyzed).map((t) => t.id);
                await startSetAnalysis(baseUrl, unanalyzedIds);
                await refreshTracks();
                triggerLibraryRefresh();
                setIsAnalyzingSet(false);
              }}
              disabled={!baseUrl || isAnalyzing}
              className={`pro-btn pro-btn-secondary !p-1 flex items-center gap-1 ${isAnalyzingSet ? "animate-pulse" : ""}`}
              title={!baseUrl ? "Engine disconnected" : "Analyze Set"}
            >
              <Zap size={12} className={isAnalyzingSet ? "fill-pika-accent" : ""} />
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowDiscoveryMode(!showDiscoveryMode)}
            className={`pro-btn pro-btn-secondary !p-1 ${showDiscoveryMode ? "!bg-pika-accent/10 !border-pika-accent/30 !text-pika-accent" : ""}`}
          >
            <Sparkles size={12} />
          </button>
          <button
            type="button"
            onClick={clearSet}
            className="pro-btn pro-btn-secondary !p-1 hover:!text-red-500"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 relative overflow-hidden flex flex-col">
        {/* Table Header */}
        <div className="pro-table-header px-1">
          <div className="w-[30px] pro-table-cell"></div>
          <div className="w-[30px] pro-table-cell justify-center">#</div>
          <div className="flex-1 pro-table-cell">Track</div>
          <div className="w-[50px] pro-table-cell justify-end">BPM</div>
          <div className="w-[40px] pro-table-cell justify-center">Key</div>
          <div className="w-[60px] pro-table-cell">NRG</div>
          <div className="w-[40px] pro-table-cell"></div>
        </div>

        <div className="flex-1 pro-scroll-area">
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
              {activeSet.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-600 gap-4 opacity-40">
                  <Music size={48} />
                  <p className="text-sm font-medium">Your crate is empty.</p>
                </div>
              ) : (
                activeSet.map((track, idx) => (
                  <SortableTrackRow
                    key={track.id}
                    track={track}
                    index={idx}
                    onRemove={removeTrack}
                    nextTrack={activeSet[idx + 1]}
                    transitionWarning={
                      idx < activeSet.length - 1
                        ? analyzeTransition(track, activeSet[idx + 1])
                        : undefined
                    }
                  />
                ))
              )}
            </SortableContext>
          </DndContext>
        </div>

        {/* Discovery Overlay Sidebar */}
        {showDiscoveryMode && (
          <div className="absolute top-0 right-0 w-80 h-full bg-pika-surface-1/95 border-l border-pika-border shadow-2xl backdrop-blur-xl animate-in slide-in-from-right transition-all z-20">
            <div className="flex items-center justify-between p-4 border-b border-pika-border">
              <span className="text-xs font-bold text-slate-200 flex items-center gap-2">
                <FlaskConical size={14} className="text-pika-accent" />
                Discovery Engine
              </span>
              <button
                type="button"
                onClick={() => setShowDiscoveryMode(false)}
                className="text-slate-500 hover:text-slate-200"
              >
                <Trash2 size={14} className="rotate-45" />
              </button>
            </div>
            <div className="p-4 space-y-6 overflow-y-auto h-full">
              <p className="text-[10px] text-slate-500 leading-relaxed uppercase tracking-widest font-bold">
                Analyzing flow...
              </p>
              <div className="space-y-4">
                {activeSet.length > 0 ? (
                  <div className="space-y-4">
                    <div className="p-3 bg-pika-surface-2 border border-pika-border rounded-lg space-y-3">
                      <span className="text-[10px] font-bold text-slate-400 uppercase">
                        Set Profile
                      </span>
                      <div className="flex justify-center py-2">
                        <TrackFingerprint metrics={setAverageMetrics} size={160} />
                      </div>
                    </div>

                    <div className="p-3 bg-pika-surface-2 border border-pika-border rounded-lg space-y-3">
                      <span className="text-[10px] font-bold text-slate-400 uppercase">
                        Transitions
                      </span>
                      <div className="space-y-2">
                        {activeSet.map((t, i) => {
                          if (i === activeSet.length - 1) return null;
                          const next = activeSet[i + 1];
                          const analysis = analyzeTransition(t, next);
                          return (
                            <div
                              key={`${t.id}-${next.id}`}
                              className="flex justify-between items-center text-[10px]"
                            >
                              <span className="text-slate-500 truncate max-w-[120px]">
                                {t.title} → {next.title}
                              </span>
                              <span
                                className={
                                  analysis.warningLevel === "red"
                                    ? "text-red-500"
                                    : analysis.warningLevel === "yellow"
                                      ? "text-amber-500"
                                      : "text-emerald-500"
                                }
                              >
                                {analysis.warningLevel === "none" ? "Perfect" : analysis.issues[0]}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-[10px] text-slate-600 italic">Add tracks to analyze flow.</p>
                )}
              </div>
            </div>
          </div>
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

export default SetCanvas;
