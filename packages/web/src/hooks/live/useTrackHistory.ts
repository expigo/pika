/**
 * Hook for managing track history
 * Handles NOW_PLAYING, TRACK_STOPPED, and initial history fetch
 */

import { MESSAGE_TYPES, type TrackInfo } from "@pika/shared";
import { useCallback, useRef, useState } from "react";
import { getApiBaseUrl } from "@/lib/api";
import type { HistoryTrack, MessageHandlers, WebSocketMessage } from "./types";

const MAX_HISTORY = 5;

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
}

export function useTrackHistory({ sessionId }: UseTrackHistoryProps): UseTrackHistoryReturn {
  const [currentTrack, setCurrentTrack] = useState<TrackInfo | null>(null);
  const [history, setHistory] = useState<HistoryTrack[]>([]);
  const historyFetchedRef = useRef<string | null>(null);

  // Fetch history from REST API (with deduplication)
  const fetchHistory = useCallback(async (targetSessionId: string, force = false) => {
    if (!force && historyFetchedRef.current === targetSessionId) {
      return; // Already fetched
    }

    try {
      const baseUrl = getApiBaseUrl();
      const response = await fetch(`${baseUrl}/api/session/${targetSessionId}/history`);
      if (response.ok) {
        const tracks: HistoryTrack[] = await response.json();
        historyFetchedRef.current = targetSessionId;

        // Smarter filtering: history should only contain tracks that are NOT the current one
        // Also deduplicate in case server has duplicate records
        const uniqueTracks: HistoryTrack[] = [];
        const seen = new Set<string>();

        // Skip index 0 (current track) and deduplicate the rest
        for (const t of tracks.slice(1)) {
          const key = `${t.artist}:${t.title}`;
          if (!seen.has(key)) {
            seen.add(key);
            uniqueTracks.push(t);
          }
        }

        setHistory(uniqueTracks.slice(0, MAX_HISTORY));
        console.log("[History] Fetched and deduplicated:", uniqueTracks.length, "tracks");
      }
    } catch (e) {
      console.error("[History] Failed to fetch:", e);
    }
  }, []);

  // Clear history (on session change)
  const clearHistory = useCallback(() => {
    setHistory([]);
    setCurrentTrack(null);
    historyFetchedRef.current = null;
  }, []);

  // Move current track to history
  const pushToHistory = useCallback((track: TrackInfo) => {
    setHistory((prev) => {
      // 1. Avoid exact same track being pushed twice (e.g. from rapid stop/start)
      if (prev.length > 0) {
        const last = prev[0];
        if (last.artist === track.artist && last.title === track.title) {
          return prev;
        }
      }

      // 2. Limit history size
      const newHistory = [{ ...track, playedAt: new Date().toISOString() }, ...prev];
      return newHistory.slice(0, MAX_HISTORY);
    });
  }, []);

  // Message handlers
  const trackHandlers: MessageHandlers = {
    [MESSAGE_TYPES.NOW_PLAYING]: (message: WebSocketMessage) => {
      const msg = message as unknown as {
        sessionId: string;
        track: TrackInfo;
        djName?: string;
      };

      // Filter by session if needed
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

      // Filter by session
      if (sessionId && msg.sessionId !== sessionId) {
        return;
      }

      // Move current track to history
      setCurrentTrack((prev) => {
        if (prev) {
          pushToHistory(prev);
        }
        return null;
      });
    },
  };

  return {
    currentTrack,
    history,
    setCurrentTrack,
    clearHistory,
    fetchHistory,
    trackHandlers,
  };
}
