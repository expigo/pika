import { useMemo, useState } from "react";
import type { Track } from "../db/repositories/trackRepository";
import { useSettings } from "./useSettings";

export type SortKey = "artist" | "title" | "bpm" | "key" | "energy" | "analyzed" | "duration";
export type SortDirection = "asc" | "desc";
export type BpmFilter = "all" | "slow" | "medium" | "fast" | "custom";
export type MetricFilter = "all" | "low" | "med" | "high" | "custom";

/** Shared 0–100 buckets for energy + danceability (both on the Pika 0–100 scale). */
const METRIC_BUCKETS: Record<"low" | "med" | "high", [number, number]> = {
  low: [0, 33],
  med: [34, 66],
  high: [67, 100],
};

/** Resolve a metric filter to a [min,max] range, or null when inactive ("all"). */
function metricRange(filter: MetricFilter, custom: [number, number]): [number, number] | null {
  if (filter === "all") return null;
  if (filter === "custom") return custom;
  return METRIC_BUCKETS[filter];
}

/**
 * Hook for track filtering and sorting logic.
 * @param playedTrackKeys live "played this session" set (keyed `artist:title`) for the unplayed filter.
 */
export function useTrackFiltering(tracks: Track[], playedTrackKeys: Set<string> = new Set()) {
  const [searchQuery, setSearchQuery] = useState("");
  const [bpmFilter, setBpmFilter] = useState<BpmFilter>("all");
  const [customBpmRange, setCustomBpmRange] = useState<[number, number]>([80, 130]);
  const [energyFilter, setEnergyFilter] = useState<MetricFilter>("all");
  const [customEnergyRange, setCustomEnergyRange] = useState<[number, number]>([0, 100]);
  const [danceFilter, setDanceFilter] = useState<MetricFilter>("all");
  const [customDanceRange, setCustomDanceRange] = useState<[number, number]>([0, 100]);
  const [unplayedOnly, setUnplayedOnly] = useState(false);
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>("artist");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  const { settings } = useSettings();
  const bpmThresholds = settings["library.bpmThresholds"];

  const filteredAndSortedTracks = useMemo(() => {
    let filtered = tracks;

    // 1. Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter((t) => {
        const artist = (t.artist || "").toLowerCase();
        const title = (t.title || "").toLowerCase();
        const filePath = (t.filePath || "").toLowerCase();
        const tags = t.tags;
        const tagMatch = tags.some((tag) => tag.toLowerCase().includes(query));
        const notes = (t.notes || "").toLowerCase();

        return (
          artist.includes(query) ||
          title.includes(query) ||
          filePath.includes(query) ||
          tagMatch ||
          notes.includes(query)
        );
      });
    }

    // 2. Filter by tags
    if (selectedTags.size > 0) {
      filtered = filtered.filter((t) => {
        const trackTags = t.tags;
        return Array.from(selectedTags).every((tag) => trackTags.includes(tag));
      });
    }

    // 3. Filter by BPM
    if (bpmFilter !== "all") {
      let minBpm = 0;
      let maxBpm = 999;

      if (bpmFilter === "custom") {
        [minBpm, maxBpm] = customBpmRange;
      } else if (bpmFilter === "slow") {
        maxBpm = bpmThresholds.slow;
      } else if (bpmFilter === "medium") {
        minBpm = bpmThresholds.slow;
        maxBpm = bpmThresholds.medium;
      } else if (bpmFilter === "fast") {
        minBpm = bpmThresholds.medium;
      }

      filtered = filtered.filter((t) => {
        if (t.bpm === null) return false;
        return t.bpm >= minBpm && t.bpm <= maxBpm;
      });
    }

    // 3b. Filter by energy (0–100, nullable — dropped when a bucket/range is active).
    const energyR = metricRange(energyFilter, customEnergyRange);
    if (energyR) {
      const [min, max] = energyR;
      filtered = filtered.filter((t) => t.energy !== null && t.energy >= min && t.energy <= max);
    }

    // 3c. Filter by danceability (same 0–100 scale + null handling).
    const danceR = metricRange(danceFilter, customDanceRange);
    if (danceR) {
      const [min, max] = danceR;
      filtered = filtered.filter(
        (t) => t.danceability !== null && t.danceability >= min && t.danceability <= max,
      );
    }

    // 3d. "Unplayed this session" — exclude tracks in the live played set (keyed artist:title).
    if (unplayedOnly) {
      filtered = filtered.filter((t) => !playedTrackKeys.has(`${t.artist}:${t.title}`));
    }

    // 4. Sort
    return [...filtered].sort((a, b) => {
      let aVal: string | number | boolean | null;
      let bVal: string | number | boolean | null;

      if (sortKey === "duration") {
        aVal = a.duration;
        bVal = b.duration;
      } else if (
        sortKey === "analyzed" ||
        sortKey === "artist" ||
        sortKey === "title" ||
        sortKey === "bpm" ||
        sortKey === "key" ||
        sortKey === "energy"
      ) {
        aVal = a[sortKey];
        bVal = b[sortKey];
      } else {
        aVal = "";
        bVal = "";
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
  }, [
    tracks,
    searchQuery,
    bpmFilter,
    customBpmRange,
    energyFilter,
    customEnergyRange,
    danceFilter,
    customDanceRange,
    unplayedOnly,
    playedTrackKeys,
    selectedTags,
    bpmThresholds,
    sortKey,
    sortDirection,
  ]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
  };

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  };

  // Panel filters active (excludes the header search box, which has its own clear).
  const activeFilterCount =
    (bpmFilter !== "all" ? 1 : 0) +
    (energyFilter !== "all" ? 1 : 0) +
    (danceFilter !== "all" ? 1 : 0) +
    (selectedTags.size > 0 ? 1 : 0) +
    (unplayedOnly ? 1 : 0);

  const resetFilters = () => {
    setBpmFilter("all");
    setEnergyFilter("all");
    setDanceFilter("all");
    setSelectedTags(new Set());
    setUnplayedOnly(false);
  };

  return {
    searchQuery,
    setSearchQuery,
    bpmFilter,
    setBpmFilter,
    customBpmRange,
    setCustomBpmRange,
    energyFilter,
    setEnergyFilter,
    customEnergyRange,
    setCustomEnergyRange,
    danceFilter,
    setDanceFilter,
    customDanceRange,
    setCustomDanceRange,
    unplayedOnly,
    setUnplayedOnly,
    selectedTags,
    setSelectedTags,
    toggleTag,
    sortKey,
    sortDirection,
    toggleSort,
    activeFilterCount,
    resetFilters,
    filteredAndSortedTracks,
  };
}
