import { ask } from "@tauri-apps/plugin-dialog";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BrickWall,
  Check,
  CheckCircle,
  CheckSquare,
  Circle,
  Clock,
  Eye,
  Filter,
  Flame,
  Heart,
  History,
  Music,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { fetch } from "@tauri-apps/plugin-http";
import { useEffect, useMemo, useState } from "react";
import {
  type AnalysisResult,
  type Track,
  type TrackPlayHistory,
  trackRepository,
} from "../db/repositories/trackRepository";
import { useSetStore } from "../hooks/useSetBuilder";
import { useSettings } from "../hooks/useSettings";
import { useSidecar } from "../hooks/useSidecar";
import { toCamelot } from "../utils/transitionEngine";
import { SmartCrate } from "./SmartCrate";
import { TrackFingerprint } from "./TrackFingerprint";

type SortKey = "artist" | "title" | "bpm" | "key" | "energy" | "analyzed" | "duration";
type SortDirection = "asc" | "desc";
type BpmFilter = "all" | "slow" | "medium" | "fast";

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
  const [trackPerformance, setTrackPerformance] = useState<TrackPlayHistory | null>(null);

  // Search and filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [bpmFilter, setBpmFilter] = useState<BpmFilter>("all");
  const [showFilters, setShowFilters] = useState(false);

  // Multi-select state
  const [selectedTrackIds, setSelectedTrackIds] = useState<Set<number>>(new Set());
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);

  const addTrack = useSetStore((state) => state.addTrack);
  const activeSet = useSetStore((state) => state.activeSet);
  const { baseUrl: sidecarBaseUrl } = useSidecar();
  const { settings } = useSettings();
  const showAdvancedMetrics = settings["display.advancedMetrics"];

  // Single-track analysis state
  const [analyzingTrackId, setAnalyzingTrackId] = useState<number | null>(null);

  // Get the selected track object
  const selectedTrack = useMemo(
    () => tracks.find((t) => t.id === selectedTrackId) ?? null,
    [tracks, selectedTrackId],
  );

  // Load track performance when a track is selected
  useEffect(() => {
    async function loadPerformance() {
      if (!selectedTrackId) {
        setTrackPerformance(null);
        return;
      }
      try {
        const perf = await trackRepository.getTrackPlayHistory(selectedTrackId);
        setTrackPerformance(perf);
      } catch (e) {
        console.error("Failed to load track performance:", e);
        setTrackPerformance(null);
      }
    }
    loadPerformance();
  }, [selectedTrackId]);

  // Check if we're in Tauri
  const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

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

  // Get BPM range for filter presets
  const getBpmRange = (filter: BpmFilter): [number, number] => {
    switch (filter) {
      case "slow":
        return [80, 95];
      case "medium":
        return [95, 115];
      case "fast":
        return [115, 130];
      default:
        return [0, 999];
    }
  };

  // Filter and sort tracks
  const filteredAndSortedTracks = useMemo(() => {
    // First, filter by search query
    let filtered = tracks;

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = tracks.filter((t) => {
        const artist = (t.artist || "").toLowerCase();
        const title = (t.title || "").toLowerCase();
        const filePath = (t.filePath || "").toLowerCase();
        return artist.includes(query) || title.includes(query) || filePath.includes(query);
      });
    }

    // Then, filter by BPM
    if (bpmFilter !== "all") {
      const [minBpm, maxBpm] = getBpmRange(bpmFilter);
      filtered = filtered.filter((t) => {
        if (t.bpm === null) return false;
        return t.bpm >= minBpm && t.bpm <= maxBpm;
      });
    }

    // Finally, sort
    const sorted = [...filtered].sort((a, b) => {
      let aVal: string | number | boolean | null;
      let bVal: string | number | boolean | null;

      // Handle duration separately since it's a new field
      if (sortKey === "duration") {
        aVal = a.duration;
        bVal = b.duration;
      } else {
        aVal = a[sortKey as keyof Omit<Track, "duration">];
        bVal = b[sortKey as keyof Omit<Track, "duration">];
      }

      if (aVal === null || aVal === undefined) aVal = "";
      if (bVal === null || bVal === undefined) bVal = "";

      if (typeof aVal === "boolean") aVal = aVal ? 1 : 0;
      if (typeof bVal === "boolean") bVal = bVal ? 1 : 0;

      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDirection === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }

      const numA = typeof aVal === "number" ? aVal : 0;
      const numB = typeof bVal === "number" ? bVal : 0;
      return sortDirection === "asc" ? numA - numB : numB - numA;
    });
    return sorted;
  }, [tracks, searchQuery, bpmFilter, sortKey, sortDirection]);

  // Keyboard shortcuts for selection
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape: Clear selection
      if (e.key === "Escape" && selectedTrackIds.size > 0) {
        setSelectedTrackIds(new Set());
        setLastSelectedIndex(null);
      }
      // Cmd/Ctrl+A: Select all visible tracks (when not in input)
      if ((e.metaKey || e.ctrlKey) && e.key === "a") {
        const activeEl = document.activeElement;
        const isInput = activeEl?.tagName === "INPUT" || activeEl?.tagName === "TEXTAREA";
        if (!isInput && filteredAndSortedTracks.length > 0) {
          e.preventDefault();
          const allIds = new Set(filteredAndSortedTracks.map((t) => t.id));
          setSelectedTrackIds(allIds);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedTrackIds.size, filteredAndSortedTracks]);

  // Multi-select handler
  const handleRowClick = (e: React.MouseEvent, trackId: number, currentIndex: number) => {
    const isMetaKey = e.metaKey || e.ctrlKey;
    const isShiftKey = e.shiftKey;

    if (isMetaKey) {
      // Cmd/Ctrl+Click: Toggle individual selection
      setSelectedTrackIds((prev) => {
        const next = new Set(prev);
        if (next.has(trackId)) {
          next.delete(trackId);
        } else {
          next.add(trackId);
        }
        return next;
      });
      setLastSelectedIndex(currentIndex);
    } else if (isShiftKey && lastSelectedIndex !== null) {
      // Shift+Click: Range selection
      const start = Math.min(lastSelectedIndex, currentIndex);
      const end = Math.max(lastSelectedIndex, currentIndex);
      const rangeIds = filteredAndSortedTracks.slice(start, end + 1).map((t) => t.id);
      setSelectedTrackIds((prev) => {
        const next = new Set(prev);
        rangeIds.forEach((id) => next.add(id));
        return next;
      });
    } else {
      // Plain click: Single select (clear others)
      setSelectedTrackIds(new Set([trackId]));
      setLastSelectedIndex(currentIndex);
    }
  };

  // Clear selection
  const clearSelection = () => {
    setSelectedTrackIds(new Set());
    setLastSelectedIndex(null);
  };

  // Add all selected tracks to set
  const addSelectedToSet = () => {
    const selectedTracks = filteredAndSortedTracks.filter((t) => selectedTrackIds.has(t.id));
    selectedTracks.forEach((track) => addTrack(track));
    clearSelection();
  };

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
    return sortDirection === "asc" ? <ArrowUp size={14} /> : <ArrowDown size={14} />;
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

  const isInSet = (trackId: number) => activeSet.some((t) => t.id === trackId);

  // Check if track has fingerprint data
  const hasFingerprint = (track: Track) =>
    track.analyzed &&
    (track.energy !== null ||
      track.danceability !== null ||
      track.brightness !== null ||
      track.acousticness !== null ||
      track.groove !== null);

  // Handle delete track with confirmation
  const handleDeleteTrack = async (track: Track) => {
    // Use Tauri's native dialog (window.confirm doesn't work in Tauri)
    const confirmed = await ask(
      `Remove "${track.title || track.artist || "this track"}" from library?`,
      { title: "Confirm Delete", kind: "warning" },
    );
    if (!confirmed) return;

    const success = await trackRepository.deleteTrack(track.id);
    if (success) {
      setTracks((prev) => prev.filter((t) => t.id !== track.id));
    }
  };

  // Handle analyze single track
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
          // Refresh track in list
          const updated = await trackRepository.getTrackById(track.id);
          if (updated) {
            setTracks((prev) => prev.map((t) => (t.id === track.id ? updated : t)));
          }
        }
      }
    } catch (e) {
      console.error("Failed to analyze track:", e);
    } finally {
      setAnalyzingTrackId(null);
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
      {/* Header with Search */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={styles.title}>
            <Music size={18} style={{ marginRight: "0.5rem" }} />
            Library
          </span>
          <span style={styles.count}>
            {filteredAndSortedTracks.length === tracks.length
              ? `${tracks.length} tracks`
              : `${filteredAndSortedTracks.length} / ${tracks.length} tracks`}
          </span>
        </div>
        <div style={styles.headerRight}>
          {/* Search Input */}
          <div style={styles.searchContainer}>
            <Search size={16} style={styles.searchIcon} />
            <input
              type="text"
              placeholder="Search artist, title..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={styles.searchInput}
            />
            {searchQuery && (
              <button type="button" onClick={() => setSearchQuery("")} style={styles.clearButton}>
                <X size={14} />
              </button>
            )}
          </div>
          {/* Filter Toggle */}
          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            style={{
              ...styles.filterToggle,
              background: showFilters || bpmFilter !== "all" ? "#3b82f6" : "#334155",
            }}
          >
            <Filter size={16} />
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      {showFilters && (
        <div style={styles.filterBar}>
          <span style={styles.filterLabel}>BPM:</span>
          <div style={styles.filterButtons}>
            {(["all", "slow", "medium", "fast"] as BpmFilter[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setBpmFilter(f)}
                style={{
                  ...styles.filterButton,
                  background: bpmFilter === f ? "#3b82f6" : "#1e293b",
                  color: bpmFilter === f ? "#fff" : "#94a3b8",
                }}
              >
                {f === "all"
                  ? "All"
                  : f === "slow"
                    ? "Slow (80-95)"
                    : f === "medium"
                      ? "Medium (95-115)"
                      : "Fast (115-130)"}
              </button>
            ))}
          </div>
          {bpmFilter !== "all" && (
            <button
              type="button"
              onClick={() => setBpmFilter("all")}
              style={styles.clearFilterButton}
            >
              Clear
            </button>
          )}
        </div>
      )}

      {/* Selection Toolbar */}
      {selectedTrackIds.size > 0 && (
        <div style={styles.selectionToolbar}>
          <div style={styles.selectionInfo}>
            <CheckSquare size={16} />
            <span>{selectedTrackIds.size} selected</span>
          </div>
          <div style={styles.selectionActions}>
            <button type="button" onClick={addSelectedToSet} style={styles.selectionButton}>
              <Plus size={14} />
              Add to Set
            </button>
            <button type="button" onClick={clearSelection} style={styles.selectionButtonSecondary}>
              <X size={14} />
              Clear
            </button>
          </div>
        </div>
      )}

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
              <th style={{ ...styles.th, width: "70px" }} onClick={() => handleSort("bpm")}>
                <div style={styles.thContent}>
                  BPM <SortIcon columnKey="bpm" />
                </div>
              </th>
              <th style={{ ...styles.th, width: "50px" }} onClick={() => handleSort("key")}>
                <div style={styles.thContent}>
                  Key <SortIcon columnKey="key" />
                </div>
              </th>
              <th style={{ ...styles.th, width: "60px" }} onClick={() => handleSort("duration")}>
                <div style={styles.thContent}>
                  <Clock size={14} style={{ marginRight: 4 }} />
                  <SortIcon columnKey="duration" />
                </div>
              </th>
              <th style={{ ...styles.th, width: "80px" }} onClick={() => handleSort("energy")}>
                <div style={styles.thContent}>
                  Energy <SortIcon columnKey="energy" />
                </div>
              </th>
              <th style={{ ...styles.th, width: "40px" }}></th>
            </tr>
          </thead>
          <tbody>
            {filteredAndSortedTracks.map((track, index) => {
              const inSet = isInSet(track.id);
              const isSelected = selectedTrackIds.has(track.id);
              return (
                <tr
                  key={track.id}
                  onClick={(e) => handleRowClick(e, track.id, index)}
                  style={{
                    ...styles.tr,
                    opacity: inSet ? 0.5 : 1,
                    background: isSelected ? "rgba(59, 130, 246, 0.2)" : "transparent",
                    cursor: "pointer",
                    userSelect: "none",
                    WebkitUserSelect: "none",
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
                    {track.artist || <span style={styles.unknown}>Unknown</span>}
                  </td>
                  <td style={styles.td}>
                    {track.title || (
                      <span style={styles.filename}>{getFileName(track.filePath)}</span>
                    )}
                  </td>
                  <td style={{ ...styles.td, textAlign: "right" }}>
                    {track.bpm ? track.bpm.toFixed(0) : "-"}
                  </td>
                  <td style={{ ...styles.td, textAlign: "center" }}>{track.key || "-"}</td>
                  <td
                    style={{
                      ...styles.td,
                      textAlign: "right",
                      fontFamily: "monospace",
                      fontSize: "0.8rem",
                      color: "#94a3b8",
                    }}
                  >
                    {track.duration
                      ? `${Math.floor(track.duration / 60)}:${(track.duration % 60).toString().padStart(2, "0")}`
                      : "-"}
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
                        {track.energy !== null ? Math.round(track.energy) : "-"}
                      </span>
                    </div>
                  </td>
                  <td style={styles.td}>
                    <div style={styles.actionButtons}>
                      {track.analyzed ? (
                        <button
                          type="button"
                          onClick={() => setSelectedTrackId(track.id)}
                          style={styles.viewButton}
                          title="View fingerprint"
                        >
                          <Eye size={14} />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAnalyzeTrack(track);
                          }}
                          disabled={!sidecarBaseUrl || analyzingTrackId === track.id}
                          style={{
                            ...styles.analyzeButton,
                            opacity: !sidecarBaseUrl || analyzingTrackId === track.id ? 0.5 : 1,
                          }}
                          title={analyzingTrackId === track.id ? "Analyzing..." : "Analyze track"}
                        >
                          {analyzingTrackId === track.id ? "..." : "⚡"}
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
                <h3 style={styles.modalTitle}>{selectedTrack.title || "Untitled"}</h3>
                <p style={styles.modalArtist}>{selectedTrack.artist || "Unknown Artist"}</p>
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
                <span style={styles.metaValue}>{selectedTrack.bpm?.toFixed(1) || "-"}</span>
              </div>
              <div style={styles.metaItem}>
                <span style={styles.metaLabel}>Key</span>
                <span style={styles.metaValue}>{selectedTrack.key || "-"}</span>
                {selectedTrack.key && toCamelot(selectedTrack.key) && (
                  <span style={styles.camelotBadge}>{toCamelot(selectedTrack.key)}</span>
                )}
              </div>
              <div style={styles.metaItem}>
                <span style={styles.metaLabel}>Energy</span>
                <span style={styles.metaValue}>{selectedTrack.energy?.toFixed(0) || "-"}</span>
              </div>
              {showAdvancedMetrics && (
                <div style={styles.metaItem}>
                  <span style={styles.metaLabel}>Danceability</span>
                  <span style={styles.metaValue}>
                    {selectedTrack.danceability?.toFixed(0) || "-"}
                  </span>
                </div>
              )}
            </div>

            {/* Two-column content: Fingerprint + Recommendations */}
            <div style={styles.modalContent}>
              {/* Left: Fingerprint Visualization (only if advanced metrics enabled) */}
              <div style={styles.fingerprintColumn}>
                {showAdvancedMetrics && hasFingerprint(selectedTrack) ? (
                  <TrackFingerprint metrics={selectedTrack} size={250} />
                ) : (
                  <div style={styles.noFingerprint}>
                    <Music size={48} style={{ opacity: 0.3 }} />
                    <p>
                      {showAdvancedMetrics
                        ? "No analysis data"
                        : "Enable Advanced Metrics in Settings"}
                    </p>
                  </div>
                )}
              </div>

              {/* Right: Smart Recommendations */}
              <div style={styles.recommendationsColumn}>
                <SmartCrate currentTrack={selectedTrack} library={tracks} />
              </div>
            </div>

            {/* Track Performance History */}
            {trackPerformance && (
              <div style={styles.performanceSection}>
                <div style={styles.performanceHeader}>
                  <History size={16} />
                  <span>Performance History</span>
                </div>
                <div style={styles.performanceStats}>
                  <div style={styles.perfStat}>
                    <span style={styles.perfValue}>{trackPerformance.playCount}</span>
                    <span style={styles.perfLabel}>Plays</span>
                  </div>
                  <div style={styles.perfStat}>
                    <Flame size={14} color="#f97316" />
                    <span style={styles.perfValue}>{trackPerformance.peakCount}</span>
                    <span style={styles.perfLabel}>Peaks</span>
                  </div>
                  <div style={styles.perfStat}>
                    <BrickWall size={14} color="#64748b" />
                    <span style={styles.perfValue}>{trackPerformance.brickCount}</span>
                    <span style={styles.perfLabel}>Bricks</span>
                  </div>
                  <div style={styles.perfStat}>
                    <Heart size={14} color="#ef4444" />
                    <span style={styles.perfValue}>{trackPerformance.totalLikes}</span>
                    <span style={styles.perfLabel}>Likes</span>
                  </div>
                </div>
                {trackPerformance.lastNotes && (
                  <div style={styles.lastNotes}>
                    <span style={styles.notesLabel}>Last Note:</span>
                    <span style={styles.notesText}>{trackPerformance.lastNotes}</span>
                  </div>
                )}
                {trackPerformance.sessions.length > 0 && (
                  <div style={styles.sessionsList}>
                    <span style={styles.sessionsLabel}>Played in:</span>
                    {trackPerformance.sessions.slice(0, 3).map((s) => (
                      <span key={s.sessionId} style={styles.sessionTag}>
                        {s.sessionName || `Session ${s.sessionId}`}
                      </span>
                    ))}
                    {trackPerformance.sessions.length > 3 && (
                      <span style={styles.moreTag}>
                        +{trackPerformance.sessions.length - 3} more
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}

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
    padding: "0.75rem 1rem",
    background: "#1e293b",
    borderBottom: "1px solid #334155",
    gap: "1rem",
  },
  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: "1rem",
  },
  headerRight: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
  },
  title: {
    fontWeight: "bold",
    fontSize: "1rem",
    display: "flex",
    alignItems: "center",
  },
  count: {
    opacity: 0.7,
    fontSize: "0.75rem",
    background: "#334155",
    padding: "0.25rem 0.5rem",
    borderRadius: "4px",
  },
  searchContainer: {
    position: "relative",
    display: "flex",
    alignItems: "center",
  },
  searchIcon: {
    position: "absolute",
    left: "0.5rem",
    color: "#64748b",
    pointerEvents: "none",
  },
  searchInput: {
    width: "200px",
    padding: "0.4rem 0.5rem 0.4rem 2rem",
    background: "#0f172a",
    border: "1px solid #334155",
    borderRadius: "6px",
    color: "#e2e8f0",
    fontSize: "0.8rem",
    outline: "none",
  },
  clearButton: {
    position: "absolute",
    right: "0.25rem",
    padding: "0.25rem",
    background: "transparent",
    border: "none",
    color: "#64748b",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
  },
  filterToggle: {
    padding: "0.4rem",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
    color: "#e2e8f0",
    display: "flex",
    alignItems: "center",
  },
  filterBar: {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
    padding: "0.5rem 1rem",
    background: "#1e293b",
    borderBottom: "1px solid #334155",
  },
  filterLabel: {
    fontSize: "0.75rem",
    color: "#94a3b8",
    fontWeight: 500,
  },
  filterButtons: {
    display: "flex",
    gap: "0.25rem",
  },
  filterButton: {
    padding: "0.3rem 0.6rem",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    fontSize: "0.7rem",
    transition: "all 0.15s",
  },
  clearFilterButton: {
    padding: "0.25rem 0.5rem",
    background: "transparent",
    border: "1px solid #475569",
    borderRadius: "4px",
    color: "#94a3b8",
    cursor: "pointer",
    fontSize: "0.7rem",
  },
  selectionToolbar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "0.5rem 1rem",
    background: "linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)",
    borderBottom: "1px solid #2563eb",
  },
  selectionInfo: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    color: "#fff",
    fontWeight: 600,
    fontSize: "0.85rem",
  },
  selectionActions: {
    display: "flex",
    gap: "0.5rem",
  },
  selectionButton: {
    display: "flex",
    alignItems: "center",
    gap: "0.35rem",
    padding: "0.4rem 0.75rem",
    background: "#fff",
    border: "none",
    borderRadius: "6px",
    color: "#1e40af",
    fontWeight: 600,
    fontSize: "0.8rem",
    cursor: "pointer",
  },
  selectionButtonSecondary: {
    display: "flex",
    alignItems: "center",
    gap: "0.35rem",
    padding: "0.4rem 0.75rem",
    background: "transparent",
    border: "1px solid rgba(255,255,255,0.4)",
    borderRadius: "6px",
    color: "#fff",
    fontWeight: 500,
    fontSize: "0.8rem",
    cursor: "pointer",
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
  analyzeButton: {
    padding: "0.25rem 0.5rem",
    background: "rgba(34, 197, 94, 0.2)",
    color: "#22c55e",
    border: "none",
    borderRadius: "4px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    fontSize: "0.75rem",
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
  // Track Performance Section
  performanceSection: {
    padding: "1rem",
    background: "#0f172a",
    borderRadius: "8px",
    border: "1px solid #1e293b",
    marginTop: "1rem",
  },
  performanceHeader: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    color: "#94a3b8",
    fontSize: "0.75rem",
    fontWeight: "bold",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    marginBottom: "0.75rem",
  },
  performanceStats: {
    display: "flex",
    gap: "1.5rem",
  },
  perfStat: {
    display: "flex",
    alignItems: "center",
    gap: "0.375rem",
  },
  perfValue: {
    fontSize: "1rem",
    fontWeight: "bold",
    color: "#e2e8f0",
  },
  perfLabel: {
    fontSize: "0.75rem",
    color: "#64748b",
  },
  lastNotes: {
    marginTop: "0.75rem",
    padding: "0.5rem 0.75rem",
    background: "#1e293b",
    borderRadius: "6px",
    display: "flex",
    gap: "0.5rem",
  },
  notesLabel: {
    fontSize: "0.75rem",
    color: "#64748b",
    flexShrink: 0,
  },
  notesText: {
    fontSize: "0.75rem",
    color: "#94a3b8",
    fontStyle: "italic",
  },
  sessionsList: {
    marginTop: "0.75rem",
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: "0.5rem",
  },
  sessionsLabel: {
    fontSize: "0.75rem",
    color: "#64748b",
  },
  sessionTag: {
    padding: "0.25rem 0.5rem",
    background: "#334155",
    color: "#94a3b8",
    borderRadius: "4px",
    fontSize: "0.6875rem",
  },
  moreTag: {
    fontSize: "0.6875rem",
    color: "#64748b",
  },
};
