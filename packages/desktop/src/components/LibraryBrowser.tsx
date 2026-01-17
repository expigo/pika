import { ask } from "@tauri-apps/plugin-dialog";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BrickWall,
  CheckSquare,
  Clock,
  FileText,
  Filter,
  Flame,
  History,
  Info,
  Music,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Tag,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { fetch } from "@tauri-apps/plugin-http";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  type AnalysisResult,
  type Track,
  type TrackPlayHistory,
  trackRepository,
} from "../db/repositories/trackRepository";
import { useSetStore } from "../hooks/useSetBuilder";
import { useSidecar } from "../hooks/useSidecar";
import { toCamelot } from "../utils/transitionEngine";
import { TrackFingerprint } from "./TrackFingerprint";
import { useLiveStore } from "../hooks/useLiveSession";
import { TagEditor } from "./TagEditor";
import { NoteEditor } from "./NoteEditor";
import { TagPill } from "./TagPill";
import { getEnergyColor, getEnergyPercent } from "../utils/trackUtils";
import { ProTooltip } from "./ProTooltip";

// New specialized hooks
import { useLibraryData } from "../hooks/useLibraryData";
import { useTrackFiltering, type SortKey, type BpmFilter } from "../hooks/useTrackFiltering";
import { useTrackSelection } from "../hooks/useTrackSelection";

import { useLibraryRefresh } from "../hooks/useLibraryRefresh";

interface Props {
  refreshTrigger?: number; // Deprecated - now uses global store via useLibraryData
}

/**
 * LibraryBrowser - A high-performance pro-grade music library explorer.
 *
 * Re-architected with specialized hooks for data, filtering, and selection.
 * Features: Virtualization, Multi-select, Advanced Filtering, Track Inspector.
 */
export function LibraryBrowser({ refreshTrigger: _legacyTrigger }: Props) {
  // 1. Data Layer
  const { triggerRefresh: triggerLibraryRefresh } = useLibraryRefresh();
  const { tracks, availableTags, loading, inTauri, refreshLibrary, updateTrackInList } =
    useLibraryData();

  // 2. Filtering & Sorting Layer
  const {
    searchQuery,
    setSearchQuery,
    bpmFilter,
    setBpmFilter,
    customBpmRange,
    setCustomBpmRange,
    selectedTags,
    setSelectedTags,
    sortKey,
    sortDirection,
    toggleSort,
    filteredAndSortedTracks,
  } = useTrackFiltering(tracks);

  // 3. Selection Layer
  const { selectedTrackIds, selectedTrackId, setSelectedTrackId, clearSelection, handleRowClick } =
    useTrackSelection(filteredAndSortedTracks);

  // 4. Stores & Settings
  const addTrack = useSetStore((state) => state.addTrack);
  const activeSet = useSetStore((state) => state.activeSet);
  const playedTrackKeys = useLiveStore((state) => state.playedTrackKeys);
  const { baseUrl: sidecarBaseUrl } = useSidecar();

  // 5. Local UI State
  const [trackPerformance, setTrackPerformance] = useState<TrackPlayHistory | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [showInspector, setShowInspector] = useState(false);
  const [analyzingTrackId, setAnalyzingTrackId] = useState<number | null>(null);
  const [tagEditorTrack, setTagEditorTrack] = useState<Track | null>(null);
  const [noteEditorTrack, setNoteEditorTrack] = useState<Track | null>(null);

  // Constants
  const selectedTrack = useMemo(
    () => tracks.find((t) => t.id === selectedTrackId) ?? null,
    [tracks, selectedTrackId],
  );

  // Load track performance when selection changes
  useEffect(() => {
    if (!selectedTrackId) {
      setTrackPerformance(null);
      return;
    }
    trackRepository
      .getTrackPlayHistory(selectedTrackId)
      .then(setTrackPerformance)
      .catch((err) => {
        console.error("Failed to load track performance:", err);
        setTrackPerformance(null);
      });
  }, [selectedTrackId]);

  // Virtualization
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: filteredAndSortedTracks.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 44,
    overscan: 10,
  });

  // Action Handlers
  const addSelectedToSet = () => {
    const selectedTracks = filteredAndSortedTracks.filter((t) => selectedTrackIds.has(t.id));
    selectedTracks.forEach(addTrack);
    clearSelection();
  };

  const handleDeleteTrack = async (track: Track) => {
    const confirmed = await ask(
      `Remove "${track.title || track.artist || "this track"}" from library?`,
      { title: "Confirm Delete", kind: "warning" },
    );
    if (!confirmed) return;

    const success = await trackRepository.deleteTrack(track.id);
    if (success) {
      refreshLibrary();
    }
  };

  const handleAnalyzeTrack = async (track: Track) => {
    if (!sidecarBaseUrl || analyzingTrackId) return;

    setAnalyzingTrackId(track.id);
    try {
      const url = `${sidecarBaseUrl}/analyze?path=${encodeURIComponent(track.filePath)}`;
      const response = await fetch(url, { method: "GET" });

      if (response.ok) {
        const result: AnalysisResult = await response.json();
        if (!result.error) {
          await trackRepository.markTrackAnalyzed(track.id, result);
          const updated = await trackRepository.getTrackById(track.id);
          if (updated) updateTrackInList(updated);
        }
      }
    } catch (e) {
      console.error("Failed to analyze track:", e);
    } finally {
      setAnalyzingTrackId(null);
    }
  };

  const getFileName = (filePath: string) => {
    const parts = filePath.split("/");
    return parts[parts.length - 1] || filePath;
  };

  const isInSet = (trackId: number) => activeSet.some((t) => t.id === trackId);

  // Rendering Helpers
  const SortIcon = ({ columnKey, className = "" }: { columnKey: SortKey; className?: string }) => {
    if (sortKey !== columnKey) {
      return <ArrowUpDown size={12} className={`opacity-20 ${className}`} />;
    }
    return sortDirection === "asc" ? (
      <ArrowUp size={12} className={`text-pika-accent ${className}`} />
    ) : (
      <ArrowDown size={12} className={`text-pika-accent ${className}`} />
    );
  };

  // Helper for parsing tags safely
  const getTrackTags = (track: Track): string[] => {
    return track.tags || [];
  };

  // Browser-mode UI
  if (!inTauri) {
    return (
      <div className="flex flex-col h-full bg-slate-950 rounded-xl overflow-hidden border border-slate-800">
        <div className="flex items-center justify-between p-3 bg-slate-900/50 border-b border-slate-800">
          <span className="flex items-center text-sm font-bold text-slate-200">
            <Music size={16} className="mr-2 text-pika-accent" />
            Library
          </span>
        </div>
        <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
          Open the desktop app to view your library.
        </div>
      </div>
    );
  }

  // Loading UI
  if (loading && tracks.length === 0) {
    return (
      <div className="flex flex-col h-full bg-slate-950 rounded-xl overflow-hidden border border-slate-800">
        <div className="flex items-center justify-between p-3 bg-slate-900/50 border-b border-slate-800">
          <span className="flex items-center text-sm font-bold text-slate-200">
            <Music size={16} className="mr-2 text-pika-accent" />
            Library
          </span>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-slate-500 gap-3">
          <RefreshCw size={24} className="animate-spin text-pika-accent opacity-50" />
          <span className="text-xs font-medium uppercase tracking-widest">
            Warming up library...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="pro-table-container">
      {/* Header with Search */}
      <div className="flex items-center justify-between p-3 border-b border-pika-border bg-pika-surface-1">
        <div className="flex items-center gap-3">
          <div className="flex items-center px-3 py-1.5 bg-pika-surface-2 border border-pika-border rounded-lg group focus-within:border-pika-accent transition-all">
            <Search size={14} className="text-slate-500 group-focus-within:text-pika-accent" />
            <input
              type="text"
              placeholder="Filter library..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent border-none outline-none text-xs ml-2 w-48 text-slate-200 placeholder:text-slate-600"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="text-slate-500 hover:text-slate-200 ml-1"
              >
                <X size={12} />
              </button>
            )}
          </div>
          <ProTooltip content="Deep Filtering Engine">
            <button
              type="button"
              onClick={() => setShowFilters(!showFilters)}
              className={`pro-btn pro-btn-secondary !p-1.5 ${showFilters || bpmFilter !== "all" ? "!bg-pika-accent/10 !border-pika-accent/30 !text-pika-accent" : ""}`}
            >
              <Filter size={14} />
            </button>
          </ProTooltip>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">
            {filteredAndSortedTracks.length} / {tracks.length} Tracks
          </span>
          <ProTooltip content="Analyze & Sync with VirtualDJ">
            <button
              type="button"
              onClick={refreshLibrary}
              className={`pro-btn pro-btn-secondary !p-1.5 ${loading ? "opacity-30 pointer-events-none" : ""}`}
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            </button>
          </ProTooltip>
        </div>
      </div>

      {showFilters && (
        <div className="flex flex-col p-3 bg-pika-surface-2 border-b border-pika-border animate-in slide-in-from-top-1 gap-2 shrink-0">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                BPM Filter:
              </span>
              <div className="flex gap-1">
                {(["all", "slow", "medium", "fast", "custom"] as BpmFilter[]).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setBpmFilter(f)}
                    className={`px-2 py-0.5 rounded text-[10px] font-medium transition-all ${
                      bpmFilter === f
                        ? "bg-pika-accent text-white shadow-lg shadow-pika-accent/20"
                        : "bg-pika-surface-3 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {bpmFilter === "custom" && (
              <div className="flex items-center gap-2 px-3 py-1 bg-slate-900/50 rounded-lg border border-slate-700/50">
                <input
                  type="number"
                  value={customBpmRange[0]}
                  onChange={(e) => setCustomBpmRange([Number(e.target.value), customBpmRange[1]])}
                  className="w-12 bg-transparent text-[10px] font-mono text-pika-accent outline-none"
                />
                <span className="text-[10px] text-slate-600">-</span>
                <input
                  type="number"
                  value={customBpmRange[1]}
                  onChange={(e) => setCustomBpmRange([customBpmRange[0], Number(e.target.value)])}
                  className="w-12 bg-transparent text-[10px] font-mono text-pika-accent outline-none"
                />
              </div>
            )}
          </div>

          {availableTags.length > 0 && (
            <div className="flex items-start gap-2 pt-1 border-t border-slate-800/50 mt-1">
              <Tag size={12} className="text-slate-600 flex-shrink-0 mt-1" />
              <div className="flex flex-wrap gap-1 select-none">
                {availableTags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => {
                      const next = new Set(selectedTags);
                      if (next.has(tag)) next.delete(tag);
                      else next.add(tag);
                      setSelectedTags(next);
                    }}
                    className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase whitespace-nowrap transition-all ${
                      selectedTags.has(tag)
                        ? "bg-pika-accent text-white"
                        : "bg-slate-800 text-slate-500 hover:text-slate-300 border border-slate-700/50"
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Selection Toolbar */}
      {selectedTrackIds.size > 0 && (
        <div className="flex items-center justify-between px-4 py-2 bg-pika-accent/10 border-b border-pika-accent/20 animate-in slide-in-from-top-2">
          <div className="flex items-center gap-2 text-pika-accent">
            <CheckSquare size={14} />
            <span className="text-xs font-bold">{selectedTrackIds.size} selected</span>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={addSelectedToSet}
              className="pro-btn pro-btn-primary !py-1 !px-3 !text-[10px]"
            >
              <Plus size={12} /> Add to Set
            </button>
            <button
              type="button"
              onClick={clearSelection}
              className="pro-btn pro-btn-secondary !py-1 !px-3 !text-[10px]"
            >
              <X size={12} /> Clear
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Table Header */}
        <div className="pro-table-header border-y border-white/5 bg-white/[0.02]">
          <div className="w-12 pro-table-cell justify-center text-[10px] opacity-40 font-black">
            ADD
          </div>
          <div
            className="flex-1 pro-table-cell cursor-pointer hover:text-slate-200 group/h"
            onClick={() => toggleSort("artist")}
          >
            <span className="text-[10px]">Artist</span>
            <SortIcon columnKey="artist" className="ml-1" />
          </div>
          <div
            className="flex-[1.5] pro-table-cell cursor-pointer hover:text-slate-200 group/h"
            onClick={() => toggleSort("title")}
          >
            <span className="text-[10px]">Title</span>
            <SortIcon columnKey="title" className="ml-1" />
          </div>
          <div
            className="w-16 pro-table-cell justify-center cursor-pointer hover:text-slate-200 group/h"
            onClick={() => toggleSort("bpm")}
          >
            <span className="text-[10px]">BPM</span>
            <SortIcon columnKey="bpm" className="ml-0.5" />
          </div>
          <div
            className="w-16 pro-table-cell justify-center cursor-pointer hover:text-slate-200 group/h"
            onClick={() => toggleSort("key")}
          >
            <span className="text-[10px]">Key</span>
            <SortIcon columnKey="key" className="ml-0.5" />
          </div>
          <div
            className="w-16 pro-table-cell justify-center cursor-pointer hover:text-slate-200 group/h"
            onClick={() => toggleSort("duration")}
          >
            <Clock size={11} className="opacity-40" />
            <SortIcon columnKey="duration" className="ml-0.5" />
          </div>
          <div
            className="w-16 pro-table-cell justify-center cursor-pointer hover:text-slate-200 group/h"
            onClick={() => toggleSort("energy")}
          >
            <span className="text-[10px]">Vibe</span>
            <SortIcon columnKey="energy" className="ml-1" />
          </div>
          <div className="w-20 pro-table-cell justify-center text-[10px] opacity-30 tracking-tighter">
            Actions
          </div>
        </div>

        {/* Virtualized List */}
        <div ref={scrollContainerRef} className="pro-scroll-area">
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const track = filteredAndSortedTracks[virtualRow.index];
              const inSet = isInSet(track.id);
              const isSelected = selectedTrackIds.has(track.id);
              const trackKey = `${track.artist}:${track.title}`;
              const isPlayed = playedTrackKeys.has(trackKey);

              return (
                <div
                  key={track.id}
                  onClick={(e) => handleRowClick(e, track.id, virtualRow.index)}
                  onDoubleClick={() => {
                    if (!inSet) addTrack(track);
                  }}
                  className={`pro-table-row group ${isSelected ? "selected" : ""} ${inSet ? "opacity-40" : ""}`}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <div className="w-12 pro-table-cell justify-center">
                    <ProTooltip content="Add to Live Set">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          addTrack(track);
                        }}
                        disabled={inSet}
                        className="p-1 text-slate-500 hover:text-pika-accent disabled:opacity-30 transition-colors"
                      >
                        <Plus size={14} />
                      </button>
                    </ProTooltip>
                  </div>
                  <div
                    className="flex-1 pro-table-cell font-bold text-slate-200 truncate"
                    title={track.artist || "Unknown"}
                  >
                    <span className="truncate">{track.artist || "Unknown"}</span>
                  </div>
                  <div
                    className="flex-[1.5] pro-table-cell text-slate-400 font-medium truncate"
                    title={track.title || getFileName(track.filePath)}
                  >
                    <span className="truncate">{track.title || getFileName(track.filePath)}</span>
                    {isPlayed && (
                      <span className="ml-1.5 text-[10px] text-emerald-500 font-black">✓</span>
                    )}
                  </div>
                  <div className="w-16 pro-table-cell justify-center font-mono text-[11px] text-slate-300 tabular-nums">
                    {track.bpm ? track.bpm.toFixed(0) : "-"}
                  </div>
                  <div className="w-16 pro-table-cell justify-center font-black text-pika-purple-light text-[10px]">
                    {track.key || "-"}
                  </div>
                  <div className="w-16 pro-table-cell justify-center font-mono text-[10px] text-slate-500 tabular-nums">
                    {track.duration
                      ? `${Math.floor(track.duration / 60)}:${(track.duration % 60).toString().padStart(2, "0")}`
                      : "-"}
                  </div>
                  <div className="w-16 pro-table-cell justify-center">
                    <div className="energy-pill">
                      <div
                        className="energy-pill-fill"
                        style={{
                          width: `${getEnergyPercent(track.energy)}%`,
                          backgroundColor: getEnergyColor(track.energy),
                        }}
                      />
                    </div>
                  </div>
                  <div className="w-20 pro-table-cell px-2 justify-center gap-1.5 relative">
                    <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <ProTooltip content="Inspector Detail">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedTrackId(track.id);
                            setShowInspector(true);
                          }}
                          className="p-1 hover:text-pika-accent transition-colors"
                        >
                          <Info size={14} />
                        </button>
                      </ProTooltip>
                      {!track.analyzed && (
                        <ProTooltip content="Deep Scan Analysis">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAnalyzeTrack(track);
                            }}
                            disabled={analyzingTrackId === track.id}
                            className="p-1 text-pika-accent hover:text-pika-accent-light transition-all haptic-pulse"
                          >
                            {analyzingTrackId === track.id ? (
                              <RefreshCw size={12} className="animate-spin" />
                            ) : (
                              <Sparkles size={14} />
                            )}
                          </button>
                        </ProTooltip>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteTrack(track);
                        }}
                        className="p-1 hover:text-red-500 transition-colors"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                    {/* Haptic Idle Status Dots */}
                    <div className="absolute group-hover:hidden">
                      {track.analyzed ? (
                        <Zap
                          size={10}
                          className="text-emerald-500 animate-pulse fill-emerald-500/20 shadow-[0_0_8px_rgba(16,185,129,0.5)]"
                        />
                      ) : (
                        <div className="w-1.5 h-1.5 rounded-full bg-slate-800" />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Track Inspector Side Panel */}
      <div
        className={`fixed inset-y-0 right-0 w-[450px] bg-pika-surface-1/95 border-l border-pika-border shadow-2xl backdrop-blur-2xl z-[60] transform transition-transform duration-300 ease-out flex flex-col ${
          showInspector && selectedTrack ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {selectedTrack && (
          <>
            <div className="flex items-center justify-between p-6 border-b border-pika-border">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-pika-accent/10 flex items-center justify-center text-pika-accent">
                  <Music size={20} />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-100 uppercase">Inspector</h2>
                  <p className="text-[10px] font-bold text-pika-accent/70 uppercase">
                    Analysis & Metadata
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowInspector(false)}
                className="p-2 hover:bg-slate-800 rounded-lg text-slate-500"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-8">
              <div className="space-y-2">
                <h1 className="text-xl font-bold text-white tracking-tight">
                  {selectedTrack.title || "Untitled"}
                </h1>
                <p className="text-lg text-slate-400 font-medium">
                  {selectedTrack.artist || "Unknown Artist"}
                </p>

                <div className="flex flex-wrap gap-2 mt-4">
                  <div className="px-3 py-1.5 bg-slate-800/50 rounded-lg border border-slate-700/50 flex items-center gap-2">
                    <Clock size={12} className="text-slate-500" />
                    <span className="text-xs font-mono text-slate-300 whitespace-nowrap">
                      {selectedTrack.bpm ? `${Math.round(selectedTrack.bpm)} BPM` : "-- BPM"}
                    </span>
                  </div>
                  <div className="px-3 py-1.5 bg-slate-800/50 rounded-lg border border-slate-700/50 flex items-center gap-2">
                    <Tag size={12} className="text-slate-500" />
                    <span className="text-xs font-mono text-pika-purple-light uppercase">
                      {selectedTrack.key ? toCamelot(selectedTrack.key) : "--"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">
                    Visual Fingerprint
                  </h3>
                  {selectedTrack.analyzed && (
                    <span className="px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded text-[9px] font-bold text-emerald-500 uppercase">
                      Analysis Complete
                    </span>
                  )}
                </div>

                <div className="p-8 bg-slate-900/40 rounded-[2.5rem] border border-white/5 flex flex-col items-center relative overflow-hidden group/chart shadow-inner">
                  {selectedTrack.analyzed ? (
                    <>
                      <div className="absolute inset-0 bg-gradient-to-b from-pika-accent/5 to-transparent opacity-0 group-hover/chart:opacity-100 transition-opacity duration-700" />
                      <TrackFingerprint metrics={selectedTrack} size={280} />
                      <div className="grid grid-cols-2 gap-8 w-full mt-8 relative z-10 px-2">
                        <div className="space-y-2">
                          <div className="flex justify-between items-end">
                            <span className="text-[10px] text-slate-500 uppercase font-black tracking-tight">
                              Energy
                            </span>
                            <span className="text-xs font-mono font-bold text-pika-accent">
                              {selectedTrack.energy}%
                            </span>
                          </div>
                          <div className="h-1.5 bg-slate-950 rounded-full overflow-hidden border border-white/5">
                            <div
                              className="h-full bg-pika-accent shadow-[0_0_10px_rgba(124,58,237,0.4)]"
                              style={{ width: `${selectedTrack.energy}%` }}
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between items-end">
                            <span className="text-[10px] text-slate-500 uppercase font-black tracking-tight">
                              Groove
                            </span>
                            <span className="text-xs font-mono font-bold text-pika-purple-light">
                              {selectedTrack.danceability}%
                            </span>
                          </div>
                          <div className="h-1.5 bg-slate-950 rounded-full overflow-hidden border border-white/5">
                            <div
                              className="h-full bg-pika-purple-light shadow-[0_0_10px_rgba(oklch(0.75_0.15_310),0.4)]"
                              style={{ width: `${selectedTrack.danceability}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="h-64 flex flex-col items-center justify-center text-center space-y-5 px-6">
                      <div className="w-16 h-16 bg-slate-950 rounded-3xl border border-white/5 flex items-center justify-center text-slate-700 shadow-xl">
                        <Sparkles size={32} strokeWidth={1.5} />
                      </div>
                      <div className="space-y-2">
                        <p className="text-sm font-bold text-slate-300">Awaiting Intelligence</p>
                        <p className="text-[11px] text-slate-500 leading-relaxed">
                          This track hasn't been processed by the engine yet. Deep scanning unlocks
                          visual fingerprints and energy flow mapping.
                        </p>
                      </div>
                      <button
                        onClick={() => handleAnalyzeTrack(selectedTrack)}
                        className="px-6 py-2.5 bg-pika-accent hover:bg-pika-accent-light text-white text-[11px] font-black rounded-xl transition-all shadow-lg shadow-pika-accent/20 flex items-center gap-2"
                      >
                        <Sparkles size={14} fill="currentColor" /> Initialize Scan
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <div className="p-4 bg-slate-900/30 rounded-xl border border-slate-800/30">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase">
                      <Tag size={12} /> Curation Tags
                    </div>
                    <button
                      onClick={() => setTagEditorTrack(selectedTrack)}
                      className="text-[10px] font-bold text-pika-accent hover:underline uppercase"
                    >
                      Edit
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {getTrackTags(selectedTrack).length > 0 ? (
                      getTrackTags(selectedTrack).map((tag) => <TagPill key={tag} tag={tag} />)
                    ) : (
                      <span className="text-[11px] text-slate-600 italic">No tags assigned</span>
                    )}
                  </div>
                </div>

                <div className="p-4 bg-slate-900/30 rounded-xl border border-white/5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase">
                      <FileText size={12} /> Personal Notes
                    </div>
                    <button
                      onClick={() => setNoteEditorTrack(selectedTrack)}
                      className="text-[10px] font-bold text-emerald-500 hover:underline uppercase"
                    >
                      {selectedTrack.notes ? "Edit" : "Add Note"}
                    </button>
                  </div>
                  {selectedTrack.notes ? (
                    <p className="text-xs text-slate-300 leading-relaxed italic">
                      "{selectedTrack.notes}"
                    </p>
                  ) : (
                    <p className="text-[11px] text-slate-600 italic">No notes for this track.</p>
                  )}
                </div>

                <div className="p-4 bg-slate-900/30 rounded-xl border border-slate-800/30">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase">
                      <History size={12} /> Performance
                    </div>
                  </div>
                  {trackPerformance ? (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <p className="text-[9px] text-slate-500 font-bold uppercase">Total Plays</p>
                        <p className="text-lg font-bold text-slate-200">
                          {trackPerformance.playCount}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[9px] text-slate-500 font-bold uppercase">
                          Reaction Score
                        </p>
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1 text-emerald-500">
                            <Flame size={12} /> {trackPerformance.peakCount}
                          </div>
                          <div className="flex items-center gap-1 text-red-500">
                            <BrickWall size={12} /> {trackPerformance.brickCount}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-600">No performance data.</p>
                  )}
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-pika-border bg-slate-900/50">
              <button
                onClick={() => {
                  addTrack(selectedTrack);
                  setShowInspector(false);
                }}
                className="w-full py-3.5 bg-pika-accent hover:bg-pika-accent-light text-white rounded-xl font-bold shadow-lg shadow-pika-accent/20 flex items-center justify-center gap-2"
              >
                <Plus size={18} /> Add to Live Set
              </button>
            </div>
          </>
        )}
      </div>

      {/* Editor Modals */}
      {tagEditorTrack && (
        <TagEditor
          track={tagEditorTrack}
          onClose={() => setTagEditorTrack(null)}
          onSave={async (tags) => {
            await trackRepository.updateTrackTags(tagEditorTrack.id, tags);
            const updated = await trackRepository.getTrackById(tagEditorTrack.id);
            if (updated) updateTrackInList(updated);
            triggerLibraryRefresh();
            setTagEditorTrack(null);
          }}
        />
      )}

      {noteEditorTrack && (
        <NoteEditor
          track={noteEditorTrack}
          onClose={() => setNoteEditorTrack(null)}
          onSave={async (notes) => {
            await trackRepository.updateTrackNotes(noteEditorTrack.id, notes);
            const updated = await trackRepository.getTrackById(noteEditorTrack.id);
            if (updated) updateTrackInList(updated);
            setNoteEditorTrack(null);
          }}
        />
      )}
    </div>
  );
}

export default LibraryBrowser;
