/**
 * Live Session Zustand Store
 *
 * Centralized state for live DJ sessions.
 * Extracted from useLiveSession.ts for cleaner architecture.
 */

import { create } from "zustand";
import type { NowPlayingTrack } from "../services/virtualDjWatcher";

export type LiveStatus = "offline" | "connecting" | "live" | "error";

// ============================================================================
// Store Interface
// ============================================================================

export interface LiveSessionStore {
  status: LiveStatus;
  nowPlaying: NowPlayingTrack | null;
  error: string | null;
  sessionId: string | null; // Cloud session ID
  dbSessionId: number | null; // Database session ID for history/plays
  currentPlayId: number | null; // Current play ID in database
  listenerCount: number; // Number of connected dancers
  tempoFeedback: { faster: number; slower: number; perfect: number; total: number } | null;

  // Poll state
  activePoll: {
    id: number;
    question: string;
    options: string[];
    votes: number[];
    totalVotes: number;
    endsAt?: string; // ISO timestamp for auto-close timer
  } | null;

  // Announcement state
  activeAnnouncement: {
    message: string;
    endsAt?: string;
  } | null;

  // Ended poll (kept visible until dismissed)
  endedPoll: {
    id: number;
    question: string;
    options: string[];
    votes: number[];
    totalVotes: number;
    winner: string;
    winnerPercent: number;
  } | null;

  // Live likes from dancers (real-time)
  liveLikes: number;

  // Played tracks in current session (for repeat prevention)
  playedTrackKeys: Set<string>;

  // ===========================================================================
  // Internal State (consolidated from module-level variables)
  // ===========================================================================

  // Track broadcast deduplication
  lastBroadcastedTrackKey: string | null;

  // Tracks already processed in this session (for DB dedup)
  processedTrackKeys: Set<string>;

  // Skip initial track broadcast flag
  skipInitialTrackBroadcast: boolean;

  // Offline queue flush state
  isFlushingQueue: boolean;

  // Like batching info (for UI visibility if needed)
  pendingLikeInfo: { count: number; trackTitle: string | null };

  // Actions
  setStatus: (status: LiveStatus) => void;
  setNowPlaying: (track: NowPlayingTrack | null) => void;
  setError: (error: string | null) => void;
  setSessionId: (sessionId: string | null) => void;
  setDbSessionId: (dbSessionId: number | null) => void;
  setCurrentPlayId: (playId: number | null) => void;
  setListenerCount: (count: number) => void;
  setTempoFeedback: (
    feedback: { faster: number; slower: number; perfect: number; total: number } | null,
  ) => void;
  setActivePoll: (
    poll: {
      id: number;
      question: string;
      options: string[];
      votes: number[];
      totalVotes: number;
      endsAt?: string;
    } | null,
  ) => void;
  setActiveAnnouncement: (
    announcement: {
      message: string;
      endsAt?: string;
    } | null,
  ) => void;
  setEndedPoll: (
    poll: {
      id: number;
      question: string;
      options: string[];
      votes: number[];
      totalVotes: number;
      winner: string;
      winnerPercent: number;
    } | null,
  ) => void;
  clearEndedPoll: () => void;
  setLiveLikes: (count: number) => void;
  incrementLiveLikes: () => void;
  addPlayedTrack: (trackKey: string) => void;
  clearPlayedTracks: () => void;
  reset: () => void;

  // Internal state actions
  setLastBroadcastedTrackKey: (key: string | null) => void;
  addProcessedTrackKey: (key: string) => void;
  clearProcessedTrackKeys: () => void;
  setSkipInitialTrackBroadcast: (skip: boolean) => void;
  setIsFlushingQueue: (flushing: boolean) => void;
  setPendingLikeInfo: (info: { count: number; trackTitle: string | null }) => void;
}

// ============================================================================
// Store Implementation
// ============================================================================

export const useLiveStore = create<LiveSessionStore>((set) => ({
  status: "offline",
  nowPlaying: null,
  error: null,
  sessionId: null,
  dbSessionId: null,
  currentPlayId: null,
  listenerCount: 0,
  tempoFeedback: null,
  activePoll: null,
  activeAnnouncement: null,
  endedPoll: null,
  liveLikes: 0,
  playedTrackKeys: new Set<string>(),

  // Internal state defaults
  lastBroadcastedTrackKey: null,
  processedTrackKeys: new Set<string>(),
  skipInitialTrackBroadcast: false,
  isFlushingQueue: false,
  pendingLikeInfo: { count: 0, trackTitle: null },

  setStatus: (status) => set({ status }),
  setNowPlaying: (nowPlaying) => set({ nowPlaying }),
  setError: (error) => set({ error }),
  setSessionId: (sessionId) => set({ sessionId }),
  setDbSessionId: (dbSessionId) => set({ dbSessionId }),
  setCurrentPlayId: (currentPlayId) => set({ currentPlayId }),
  setListenerCount: (listenerCount) => set({ listenerCount }),
  setTempoFeedback: (tempoFeedback) => set({ tempoFeedback }),
  setActivePoll: (activePoll) => set({ activePoll }),
  setActiveAnnouncement: (activeAnnouncement) => set({ activeAnnouncement }),
  setEndedPoll: (endedPoll) => set({ endedPoll }),
  clearEndedPoll: () => set({ endedPoll: null }),
  setLiveLikes: (liveLikes) => set({ liveLikes }),
  incrementLiveLikes: () => set((state) => ({ liveLikes: state.liveLikes + 1 })),
  addPlayedTrack: (trackKey: string) =>
    set((state) => ({
      playedTrackKeys: new Set([...state.playedTrackKeys, trackKey]),
    })),
  clearPlayedTracks: () => set({ playedTrackKeys: new Set() }),

  // Internal state actions
  setLastBroadcastedTrackKey: (lastBroadcastedTrackKey) => set({ lastBroadcastedTrackKey }),
  addProcessedTrackKey: (key: string) =>
    set((state) => ({
      processedTrackKeys: new Set([...state.processedTrackKeys, key]),
    })),
  clearProcessedTrackKeys: () => set({ processedTrackKeys: new Set() }),
  setSkipInitialTrackBroadcast: (skipInitialTrackBroadcast) => set({ skipInitialTrackBroadcast }),
  setIsFlushingQueue: (isFlushingQueue) => set({ isFlushingQueue }),
  setPendingLikeInfo: (pendingLikeInfo) => set({ pendingLikeInfo }),

  reset: () =>
    set({
      status: "offline",
      nowPlaying: null,
      error: null,
      sessionId: null,
      dbSessionId: null,
      currentPlayId: null,
      listenerCount: 0,
      tempoFeedback: null,
      activePoll: null,
      activeAnnouncement: null,
      endedPoll: null,
      liveLikes: 0,
      playedTrackKeys: new Set(),
      // Reset internal state too
      lastBroadcastedTrackKey: null,
      processedTrackKeys: new Set(),
      skipInitialTrackBroadcast: false,
      isFlushingQueue: false,
      pendingLikeInfo: { count: 0, trackTitle: null },
    }),
}));
