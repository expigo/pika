// @vitest-environment happy-dom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Track } from "../db/repositories/trackRepository";

vi.mock("./useSettings", () => ({
  useSettings: () => ({ settings: { "library.bpmThresholds": { slow: 90, medium: 110 } } }),
}));

import { useTrackFiltering } from "./useTrackFiltering";

/** Minimal Track — only the fields the filter/sort pipeline reads. */
const mk = (o: Partial<Track>): Track =>
  ({
    artist: "A",
    title: "T",
    filePath: "",
    tags: [],
    notes: null,
    bpm: 100,
    key: "Am",
    energy: 50,
    danceability: 50,
    duration: 200,
    analyzed: true,
    ...o,
  }) as unknown as Track;

const titles = (r: { filteredAndSortedTracks: Track[] }) =>
  r.filteredAndSortedTracks.map((t) => t.title);

const TRACKS = [
  mk({ title: "Low", energy: 10, danceability: 10 }),
  mk({ title: "Mid", energy: 50, danceability: 50 }),
  mk({ title: "High", energy: 90, danceability: 90 }),
  mk({ title: "NullE", energy: null, danceability: null }),
];

describe("useTrackFiltering — energy / danceability / unplayed", () => {
  it("keeps everything (incl. null metrics) when all filters are 'all'", () => {
    const { result } = renderHook(() => useTrackFiltering(TRACKS));
    expect(result.current.filteredAndSortedTracks.length).toBe(4);
    expect(result.current.activeFilterCount).toBe(0);
  });

  it("energy High keeps ≥67 and drops null-energy tracks", () => {
    const { result } = renderHook(() => useTrackFiltering(TRACKS));
    act(() => result.current.setEnergyFilter("high"));
    expect(titles(result.current)).toEqual(["High"]);
  });

  it("energy custom range filters to the band", () => {
    const { result } = renderHook(() => useTrackFiltering(TRACKS));
    act(() => {
      result.current.setEnergyFilter("custom");
      result.current.setCustomEnergyRange([40, 60]);
    });
    expect(titles(result.current)).toEqual(["Mid"]);
  });

  it("danceability Low keeps ≤33 and drops nulls", () => {
    const { result } = renderHook(() => useTrackFiltering(TRACKS));
    act(() => result.current.setDanceFilter("low"));
    expect(titles(result.current)).toEqual(["Low"]);
  });

  it("unplayedOnly excludes tracks whose artist:title is in the played set", () => {
    const played = new Set(["A:High"]);
    const { result } = renderHook(() => useTrackFiltering(TRACKS, played));
    act(() => result.current.setUnplayedOnly(true));
    expect(titles(result.current)).not.toContain("High");
    expect(result.current.filteredAndSortedTracks.length).toBe(3);
  });

  it("unplayedOnly is a safe no-op with an empty played set", () => {
    const { result } = renderHook(() => useTrackFiltering(TRACKS));
    act(() => result.current.setUnplayedOnly(true));
    expect(result.current.filteredAndSortedTracks.length).toBe(4);
  });

  it("combines BPM + energy + tag + unplayed into the expected shortlist", () => {
    const combo = [
      mk({ title: "match", artist: "X", bpm: 92, energy: 80, tags: ["blues"] }),
      mk({ title: "wrongBpm", artist: "X", bpm: 120, energy: 80, tags: ["blues"] }),
      mk({ title: "wrongEnergy", artist: "X", bpm: 92, energy: 20, tags: ["blues"] }),
      mk({ title: "noTag", artist: "X", bpm: 92, energy: 80, tags: [] }),
      mk({ title: "played", artist: "X", bpm: 92, energy: 80, tags: ["blues"] }),
    ];
    const { result } = renderHook(() => useTrackFiltering(combo, new Set(["X:played"])));
    act(() => {
      result.current.setBpmFilter("custom");
      result.current.setCustomBpmRange([90, 95]);
      result.current.setEnergyFilter("high");
      result.current.setSelectedTags(new Set(["blues"]));
      result.current.setUnplayedOnly(true);
    });
    expect(titles(result.current)).toEqual(["match"]);
    expect(result.current.activeFilterCount).toBe(4); // bpm, energy, tags, unplayed
  });

  it("resetFilters clears every panel filter", () => {
    const { result } = renderHook(() => useTrackFiltering(TRACKS));
    act(() => {
      result.current.setEnergyFilter("high");
      result.current.setUnplayedOnly(true);
    });
    expect(result.current.activeFilterCount).toBeGreaterThan(0);
    act(() => result.current.resetFilters());
    expect(result.current.activeFilterCount).toBe(0);
    expect(result.current.filteredAndSortedTracks.length).toBe(4);
  });

  it("a custom range with min>max yields no results (no crash)", () => {
    const { result } = renderHook(() => useTrackFiltering(TRACKS));
    act(() => {
      result.current.setEnergyFilter("custom");
      result.current.setCustomEnergyRange([80, 20]);
    });
    expect(result.current.filteredAndSortedTracks.length).toBe(0);
  });
});
