import { useCallback, useEffect, useState } from "react";
import { trackRepository, type Track } from "../db/repositories/trackRepository";
import { useLibraryRefresh } from "./useLibraryRefresh";

/**
 * Hook for core library data management
 * Handles fetching tracks, tags, and basic refresh logic
 */
export function useLibraryData() {
  const { refreshTrigger } = useLibraryRefresh();
  const [tracks, setTracks] = useState<Track[]>([]);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

  const fetchData = useCallback(async () => {
    if (!inTauri) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [allTracks, allTags] = await Promise.all([
        trackRepository.getTracks(10000),
        trackRepository.getAllTags(),
      ]);
      setTracks(allTracks as Track[]);
      setAvailableTags(allTags);
    } catch (e) {
      console.error("Failed to fetch library data:", e);
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [inTauri]);

  useEffect(() => {
    fetchData();
  }, [fetchData, refreshTrigger]);

  const updateTrackInList = useCallback((updatedTrack: Track) => {
    setTracks((prev) => prev.map((t) => (t.id === updatedTrack.id ? updatedTrack : t)));
  }, []);

  const removeTrackFromList = useCallback((trackId: number) => {
    setTracks((prev) => prev.filter((t) => t.id !== trackId));
  }, []);

  return {
    tracks,
    availableTags,
    loading,
    error,
    inTauri,
    refreshLibrary: fetchData,
    updateTrackInList,
    removeTrackFromList,
  };
}
