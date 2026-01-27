/**
 * useActivePlay Hook
 * Fetches the most recent play from the current active session.
 */

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { type PlayWithTrack, sessionRepository } from "../db/repositories/sessionRepository";
import type { PlayReaction } from "../db/schema";
import { useLiveStore } from "./useLiveSession";

interface UseActivePlayResult {
  /** The current/most recent play in the session */
  currentPlay: PlayWithTrack | null;
  /** All plays in the current session */
  recentPlays: PlayWithTrack[];
  /** Whether we're loading data */
  loading: boolean;
  /** Update the reaction for the current play */
  updateReaction: (reaction: PlayReaction) => Promise<void>;
  /** Update the notes for the current play */
  updateNotes: (notes: string) => Promise<void>;
  /** Total plays in the session */
  playCount: number;
}

/**
 * Hook to track the currently playing track in a live session
 * @param pollIntervalMs - How often to poll for updates (default 1.5s)
 */
export function useActivePlay(pollIntervalMs = 1500): UseActivePlayResult {
  // Get the database session ID from the shared store
  const dbSessionId = useLiveStore((state) => state.dbSessionId);

  const [currentPlay, setCurrentPlay] = useState<PlayWithTrack | null>(null);
  const [recentPlays, setRecentPlays] = useState<PlayWithTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [playCount, setPlayCount] = useState(0);

  // Fetch the latest play
  const fetchLatestPlay = useCallback(async () => {
    // Performance: Stop polling if window is hidden/minimized to save resources
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      return;
    }

    if (!dbSessionId) {
      setCurrentPlay(null);
      setRecentPlays([]);
      setPlayCount(0);
      setLoading(false);
      return;
    }

    try {
      const plays = await sessionRepository.getSessionPlays(dbSessionId);
      setRecentPlays(plays);
      setPlayCount(plays.length);

      // Most recent play is last in the array (sorted by playedAt ASC)
      const latest = plays.length > 0 ? plays[plays.length - 1] : null;
      setCurrentPlay(latest);
    } catch (e) {
      console.error("Error fetching active play:", e);
    } finally {
      setLoading(false);
    }
  }, [dbSessionId]);

  // Poll for updates
  useEffect(() => {
    // Initial fetch
    fetchLatestPlay();

    // Set up polling interval
    const interval = setInterval(fetchLatestPlay, pollIntervalMs);

    return () => clearInterval(interval);
  }, [fetchLatestPlay, pollIntervalMs]);

  // Update reaction for current play
  const updateReaction = useCallback(
    async (reaction: PlayReaction) => {
      if (!currentPlay) return;

      try {
        await sessionRepository.updatePlayReaction(currentPlay.id, reaction);

        // Update local state immediately
        setCurrentPlay((prev) => (prev ? { ...prev, reaction } : null));
        setRecentPlays((prev) =>
          prev.map((p) => (p.id === currentPlay.id ? { ...p, reaction } : p)),
        );
      } catch (e) {
        console.error("Failed to update reaction:", e);
        toast.error("Failed to save reaction");
      }
    },
    [currentPlay],
  );

  // Update notes for current play
  const updateNotes = useCallback(
    async (notes: string) => {
      if (!currentPlay) return;

      try {
        await sessionRepository.updatePlayNotes(currentPlay.id, notes);

        // Update local state immediately
        setCurrentPlay((prev) => (prev ? { ...prev, notes } : null));
        setRecentPlays((prev) => prev.map((p) => (p.id === currentPlay.id ? { ...p, notes } : p)));
      } catch (e) {
        console.error("Failed to update notes:", e);
        toast.error("Failed to save notes");
      }
    },
    [currentPlay],
  );

  return {
    currentPlay,
    recentPlays,
    loading,
    updateReaction,
    updateNotes,
    playCount,
  };
}
