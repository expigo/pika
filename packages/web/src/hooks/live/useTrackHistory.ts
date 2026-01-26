import { MESSAGE_TYPES, LIMITS, type TrackInfo } from "@pika/shared";
import { useCallback, useMemo, useState } from "react";
import useSWR from "swr";
import { getApiBaseUrl } from "@/lib/api";
import type { HistoryTrack, MessageHandlers, WebSocketMessage } from "./types";

// Fetcher for SWR
const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface UseTrackHistoryProps {
  sessionId: string | null;
}

interface UseTrackHistoryReturn {
  currentTrack: TrackInfo | null;
  history: HistoryTrack[];
  setCurrentTrack: (track: TrackInfo | null) => void;
  clearHistory: () => void;
  fetchHistory: (sessionId: string, force?: boolean) => Promise<void>;
  trackHandlers: MessageHandlers;
  isLoading: boolean;
}

export function useTrackHistory({ sessionId }: UseTrackHistoryProps): UseTrackHistoryReturn {
  const [currentTrack, setCurrentTrack] = useState<TrackInfo | null>(null);
  const [localHistory, setLocalHistory] = useState<HistoryTrack[]>([]);

  // SWR for server-side history (H3: Caching & Deduplication)
  const {
    data: serverHistory,
    mutate,
    isLoading,
  } = useSWR<HistoryTrack[]>(
    sessionId ? `${getApiBaseUrl()}/api/session/${sessionId}/history` : null,
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 10000,
    },
  );

  // Combine SWR data with local history additions (immediate feedback)
  const history = useMemo(() => {
    const combined = [...localHistory, ...(serverHistory || [])];
    const seen = new Set<string>();
    const unique: HistoryTrack[] = [];

    for (const t of combined) {
      if (!t.artist || !t.title) continue;

      // 🛡️ ENFORCEMENT: Never show the current track in the history list (Audit Item 2)
      // Case-insensitive comparison (Audit 10/10 Fix)
      const isCurrent =
        currentTrack &&
        t.artist.toLowerCase() === currentTrack.artist?.toLowerCase() &&
        t.title.toLowerCase() === currentTrack.title?.toLowerCase();

      if (isCurrent) {
        continue;
      }

      // Case-insensitive duplicate detection
      const key = `${t.artist.toLowerCase()}:${t.title.toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(t);
      }
    }
    return unique.slice(0, LIMITS.MAX_HISTORY_ITEMS);
  }, [localHistory, serverHistory, currentTrack]);

  const fetchHistory = useCallback(async () => {
    // SWR handles caching/deduping, but we can force a revalidation if needed
    await mutate();
  }, [mutate]);

  // Clear history (on session change)
  const clearHistory = useCallback(() => {
    setLocalHistory([]);
    setCurrentTrack(null);
    mutate([], false); // Clear SWR cache for this key
  }, [mutate]);

  // Move current track to history locally (immediate UI feedback)
  const pushToHistory = useCallback((track: TrackInfo) => {
    setLocalHistory((prev) => {
      // Avoid exact same track being pushed twice (Case-insensitive)
      if (prev.length > 0) {
        const last = prev[0];
        if (
          last.artist?.toLowerCase() === track.artist?.toLowerCase() &&
          last.title?.toLowerCase() === track.title?.toLowerCase()
        ) {
          return prev;
        }
      }

      const newHistory = [{ ...track, playedAt: new Date().toISOString() }, ...prev];
      return newHistory.slice(0, LIMITS.MAX_HISTORY_ITEMS);
    });
  }, []);

  // Message handlers (memoized to prevent parent re-renders - H4)
  const trackHandlers: MessageHandlers = useMemo(
    () => ({
      [MESSAGE_TYPES.NOW_PLAYING]: (message: WebSocketMessage) => {
        const msg = message as unknown as {
          sessionId: string;
          track: TrackInfo;
          djName?: string;
        };

        if (sessionId && msg.sessionId !== sessionId) {
          return;
        }

        if (msg.track) {
          // Push previous track to history if different (Case-insensitive)
          setCurrentTrack((prev) => {
            if (
              prev &&
              (prev.artist?.toLowerCase() !== msg.track.artist?.toLowerCase() ||
                prev.title?.toLowerCase() !== msg.track.title?.toLowerCase())
            ) {
              pushToHistory(prev);
            }
            return msg.track;
          });
        }
      },

      [MESSAGE_TYPES.TRACK_STOPPED]: (message: WebSocketMessage) => {
        const msg = message as unknown as { sessionId: string };

        if (sessionId && msg.sessionId !== sessionId) {
          return;
        }

        setCurrentTrack((prev) => {
          if (prev) {
            pushToHistory(prev);
          }
          return null;
        });
      },

      [MESSAGE_TYPES.METADATA_UPDATED]: (message: WebSocketMessage) => {
        const msg = message as unknown as {
          sessionId: string;
          track: TrackInfo;
        };

        if (sessionId && msg.sessionId !== sessionId) {
          return;
        }

        // 🛡️ Race Condition Check: Only update if it matches currently displayed track
        setCurrentTrack((prev) => {
          if (
            prev &&
            prev.artist?.toLowerCase() === msg.track.artist?.toLowerCase() &&
            prev.title?.toLowerCase() === msg.track.title?.toLowerCase()
          ) {
            // Merge metadata changes
            return {
              ...prev,
              ...msg.track,
            };
          }
          return prev;
        });
      },
    }),
    [sessionId, pushToHistory],
  );

  return {
    currentTrack,
    history,
    setCurrentTrack,
    clearHistory,
    fetchHistory,
    trackHandlers,
    isLoading,
  };
}
