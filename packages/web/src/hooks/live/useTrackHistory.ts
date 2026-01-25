import { MESSAGE_TYPES, type TrackInfo } from "@pika/shared";
import { useCallback, useMemo, useState } from "react";
import useSWR from "swr";
import { getApiBaseUrl } from "@/lib/api";
import type { HistoryTrack, MessageHandlers, WebSocketMessage } from "./types";

const MAX_HISTORY = 5;

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

    // Skip current track if it's the first in server history
    const startIdx = combined.length > 0 && combined[0].playedAt ? 1 : 0;

    for (const t of combined.slice(startIdx)) {
      const key = `${t.artist}:${t.title}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(t);
      }
    }
    return unique.slice(0, MAX_HISTORY);
  }, [localHistory, serverHistory]);

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
      // Avoid exact same track being pushed twice
      if (prev.length > 0) {
        const last = prev[0];
        if (last.artist === track.artist && last.title === track.title) {
          return prev;
        }
      }

      const newHistory = [{ ...track, playedAt: new Date().toISOString() }, ...prev];
      return newHistory.slice(0, MAX_HISTORY);
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
          // Push previous track to history if different
          setCurrentTrack((prev) => {
            if (prev && (prev.artist !== msg.track.artist || prev.title !== msg.track.title)) {
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
