import { parseWebSocketMessage, type TrackInfo } from "@pika/shared";
import { useCallback, useEffect, useRef } from "react";
import ReconnectingWebSocket from "reconnecting-websocket";
import { toast } from "sonner";
import { create } from "zustand";
import { sessionRepository } from "../db/repositories/sessionRepository";
import { settingsRepository } from "../db/repositories/settingsRepository";
import { trackRepository } from "../db/repositories/trackRepository";
import { enqueueForAnalysis } from "../services/progressiveAnalysisService";
import { type NowPlayingTrack, toTrackInfo, virtualDjWatcher } from "../services/virtualDjWatcher";
import { getAuthToken, getConfiguredUrls, getDjName } from "./useDjSettings";

// Cloud server URL is now dynamic based on settings
// const CLOUD_WS_URL = ... (removed)

export type LiveStatus = "offline" | "connecting" | "live" | "error";

// ============================================================================
// Zustand Store for Shared State
// ============================================================================

interface LiveSessionStore {
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
  reset: () => void;
}

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
  endedPoll: null,
  liveLikes: 0,

  setStatus: (status) => set({ status }),
  setNowPlaying: (nowPlaying) => set({ nowPlaying }),
  setError: (error) => set({ error }),
  setSessionId: (sessionId) => set({ sessionId }),
  setDbSessionId: (dbSessionId) => set({ dbSessionId }),
  setCurrentPlayId: (currentPlayId) => set({ currentPlayId }),
  setListenerCount: (listenerCount) => set({ listenerCount }),
  setTempoFeedback: (tempoFeedback) => set({ tempoFeedback }),
  setActivePoll: (activePoll) => set({ activePoll }),
  setEndedPoll: (endedPoll) => set({ endedPoll }),
  clearEndedPoll: () => set({ endedPoll: null }),
  setLiveLikes: (liveLikes) => set({ liveLikes }),
  incrementLiveLikes: () => set((state) => ({ liveLikes: state.liveLikes + 1 })),
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
      endedPoll: null,
      liveLikes: 0,
    }),
}));

// ============================================================================
// Singleton WebSocket and Watcher Management
// ============================================================================

let socketInstance: ReconnectingWebSocket | null = null;
let isLiveFlag = false;
let currentSessionId: string | null = null;
let currentDbSessionId: number | null = null;
let currentPlayIdRef: number | null = null; // Track current play for likes
const processedTrackKeys = new Set<string>(); // Track which tracks we've already recorded
let lastBroadcastedTrackKey: string | null = null; // Prevent duplicate cloud broadcasts
let skipInitialTrackBroadcast = false; // Explicit flag to skip initial track broadcast

// Like batching: collect likes and show batched toast
const LIKE_BATCH_THRESHOLD = 5; // Show toast after this many likes
const LIKE_BATCH_TIMEOUT_MS = 3000; // Or after this many ms (for small events)
let pendingLikeCount = 0;
let pendingLikeTrackTitle: string | null = null;
let likeBatchTimer: ReturnType<typeof setTimeout> | null = null;

function flushLikeBatch() {
  if (pendingLikeCount > 0 && pendingLikeTrackTitle) {
    const count = pendingLikeCount;
    const title = pendingLikeTrackTitle;
    const message = count === 1 ? `Someone liked "${title}"` : `${count} people liked "${title}"`;
    toast(message, { icon: "❤️", duration: 3000 });
    console.log(`[Live] Like batch flushed: ${count} likes for "${title}"`);
  }
  pendingLikeCount = 0;
  pendingLikeTrackTitle = null;
  if (likeBatchTimer) {
    clearTimeout(likeBatchTimer);
    likeBatchTimer = null;
  }
}

function addToPendingLikes(trackTitle: string) {
  // If track changed, flush previous batch first
  if (pendingLikeTrackTitle && pendingLikeTrackTitle !== trackTitle) {
    flushLikeBatch();
  }

  pendingLikeTrackTitle = trackTitle;
  pendingLikeCount++;

  // Start timer on first like
  if (!likeBatchTimer) {
    likeBatchTimer = setTimeout(flushLikeBatch, LIKE_BATCH_TIMEOUT_MS);
  }

  // Flush immediately if we hit threshold
  if (pendingLikeCount >= LIKE_BATCH_THRESHOLD) {
    flushLikeBatch();
  }
}

type ReactionCallback = (reaction: "thank_you") => void;
const reactionListeners = new Set<ReactionCallback>();

export function subscribeToReactions(callback: ReactionCallback) {
  reactionListeners.add(callback);
  return () => {
    reactionListeners.delete(callback);
  };
}

import { offlineQueueRepository } from "../db/repositories/offlineQueueRepository";

// ... (imports)

// Replaced in-memory queue with DB repository
// const messageQueue: { timestamp: number; payload: object }[] = [];

async function flushQueue() {
  try {
    const queue = await offlineQueueRepository.getAll();
    if (queue.length === 0) return;

    console.log(`[Live] Flushing ${queue.length} queued messages...`);
    if (queue.length > 5) {
      toast(`Syncing ${queue.length} updates...`, { icon: "🔄" });
    }

    const idsToDelete: number[] = [];

    // Process queue sequentially to maintain order
    for (const item of queue) {
      if (socketInstance?.readyState === WebSocket.OPEN) {
        socketInstance.send(JSON.stringify(item.payload));
        // item.payload is 'object', so we cast to unknown then read type
        console.log("[Live] Flushed:", (item.payload as { type: string }).type);
        idsToDelete.push(item.id);
      } else {
        // Socket closed mid-flush, stop processing
        break;
      }
    }

    // Clean up successfully sent messages
    if (idsToDelete.length > 0) {
      await offlineQueueRepository.deleteMany(idsToDelete);
      console.log(`[Live] Removed ${idsToDelete.length} flushed messages from DB`);
    }
  } catch (e) {
    console.error("[Live] Failed to flush queue:", e);
  }
}

function sendMessage(message: { type: string; [key: string]: unknown }) {
  if (socketInstance?.readyState === WebSocket.OPEN) {
    socketInstance.send(JSON.stringify(message));
    console.log("[Live] Sent:", message);
  } else {
    // Queue the message if we are "supposed" to be live
    if (isLiveFlag) {
      console.log("[Live] Socket offline - Queuing persistent message:", message.type);

      // Fire and forget enqueue to avoid blocking UI
      offlineQueueRepository.enqueue(message).catch((e) => {
        console.error("[Live] Failed to persist offline message:", e);
      });

      // Only toast for "important" updates to avoid spam
      if (message.type === "BROADCAST_TRACK") {
        toast("Offline: Track queued for sync", { icon: "📡" });
      }
    }
  }
}

/**
 * Broadcast track to cloud with deduplication
 * Prevents the same track being sent multiple times
 */
function broadcastTrack(sessionId: string, track: TrackInfo): boolean {
  const trackKey = `${track.artist}:${track.title}`;

  if (lastBroadcastedTrackKey === trackKey) {
    console.log("[Live] Skipping duplicate broadcast:", track.title);
    return false;
  }

  lastBroadcastedTrackKey = trackKey;

  // Reset live likes counter when track changes
  useLiveStore.getState().setLiveLikes(0);

  sendMessage({
    type: "BROADCAST_TRACK",
    sessionId,
    track,
  });
  return true;
}

/**
 * Generate a new unique session ID for each live session.
 * Each "Go Live" creates a new session with its own recap.
 */
function generateSessionId(): string {
  return `pika_${Date.now()}_${Math.random().toString(36).substring(7)}`;
}

/**
 * Track info from database with fingerprint data
 */
interface DbTrackInfo {
  id: number;
  bpm: number | null;
  key: string | null;
  energy: number | null;
  danceability: number | null;
  brightness: number | null;
  acousticness: number | null;
  groove: number | null;
}

/**
 * VDJ track metadata from Rust lookup
 */
interface VdjTrackMetadata {
  bpm: number | null;
  key: string | null;
  volume: number | null;
}

/**
 * Find or create a track in the database by artist/title
 * Returns the track with fingerprint data for broadcasting
 *
 * Uses O(log n) indexed lookup via track_key
 */
async function findOrCreateTrack(
  artist: string,
  title: string,
  filePath?: string,
): Promise<DbTrackInfo> {
  const { getTrackKey } = await import("@pika/shared");
  const trackKey = getTrackKey(artist, title);

  // O(log n) indexed lookup - no table scan!
  const existing = await trackRepository.findByTrackKey(trackKey);

  if (existing) {
    return {
      id: existing.id,
      bpm: existing.bpm,
      key: existing.key,
      energy: existing.energy,
      danceability: existing.danceability,
      brightness: existing.brightness,
      acousticness: existing.acousticness,
      groove: existing.groove,
    };
  }

  // New track - try VDJ lookup for BPM/key (lazy extraction)
  let vdjBpm: number | null = null;
  let vdjKey: string | null = null;

  if (filePath && !filePath.startsWith("ghost://")) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const vdjMeta = await invoke<VdjTrackMetadata | null>("lookup_vdj_track_metadata", {
        filePath,
      });
      if (vdjMeta) {
        vdjBpm = vdjMeta.bpm;
        vdjKey = vdjMeta.key;
        console.log("[Live] Got VDJ metadata:", vdjBpm, vdjKey);
      }
    } catch (e) {
      console.warn("[Live] VDJ lookup failed:", e);
    }
  }

  // Insert new track
  console.log("[Live] Creating track:", artist, "-", title, "BPM:", vdjBpm);
  const newId = await trackRepository.insertTrack({
    filePath: filePath || `ghost://${artist}/${title}`,
    artist,
    title,
    bpm: vdjBpm,
    key: vdjKey,
  });

  return {
    id: newId,
    bpm: vdjBpm,
    key: vdjKey,
    energy: null,
    danceability: null,
    brightness: null,
    acousticness: null,
    groove: null,
  };
}

/**
 * Record a track play to the database
 * Returns the DbTrackInfo with fingerprint data, or null if deduped/failed
 */
async function recordPlay(
  track: NowPlayingTrack,
): Promise<{ playId: number; trackInfo: DbTrackInfo } | null> {
  if (!currentDbSessionId) {
    console.warn("[Live] No database session active");
    return null;
  }

  // Create a unique key for deduplication within the session
  const trackKey = `${track.artist}-${track.title}-${Math.floor(Date.now() / 60000)}`; // 1 min window

  if (processedTrackKeys.has(trackKey)) {
    console.log("[Live] Track already recorded recently:", track.title);
    return null;
  }
  processedTrackKeys.add(trackKey);

  try {
    const dbTrack = await findOrCreateTrack(track.artist, track.title, track.filePath);
    const timestamp = Math.floor(Date.now() / 1000);

    const play = await sessionRepository.addPlay(currentDbSessionId, dbTrack.id, timestamp);
    console.log("[Live] Recorded play:", play.id, "-", track.artist, "-", track.title);

    return { playId: play.id, trackInfo: dbTrack };
  } catch (e) {
    console.error("[Live] Failed to record play:", e);
    return null;
  }
}

// ============================================================================
// Hook
// ============================================================================

export function useLiveSession() {
  const {
    status,
    nowPlaying,
    error,
    sessionId,
    dbSessionId,
    currentPlayId,
    listenerCount,
    tempoFeedback,
    setStatus,
    setNowPlaying,
    setError,
    setSessionId,
    setDbSessionId,
    setCurrentPlayId,
    setTempoFeedback,
    reset,
  } = useLiveStore();

  // Use ref to track if this hook instance has set up the track listener
  const listenerSetupRef = useRef(false);

  // Handle track changes from VirtualDJ
  const handleTrackChange = useCallback(
    async (track: NowPlayingTrack) => {
      console.log("[Live] Track changed:", track.artist, "-", track.title);
      console.log(
        "[Live] State check - isLiveFlag:",
        isLiveFlag,
        "currentDbSessionId:",
        currentDbSessionId,
      );

      // Update UI immediately with track info
      setNowPlaying(track);

      // Reset tempo feedback when track changes (server also resets)
      setTempoFeedback(null);

      // Record to database and get fingerprint data
      let enrichedTrack = track;
      if (isLiveFlag && currentDbSessionId) {
        console.log("[Live] Recording play to database...");
        const result = await recordPlay(track);
        console.log("[Live] Play recorded:", result?.playId);
        if (result) {
          currentPlayIdRef = result.playId; // Update singleton ref for likes
          setCurrentPlayId(result.playId);

          // Enrich track with fingerprint data from database
          enrichedTrack = {
            ...track,
            bpm: result.trackInfo.bpm ?? undefined,
            key: result.trackInfo.key ?? undefined,
            energy: result.trackInfo.energy ?? undefined,
            danceability: result.trackInfo.danceability ?? undefined,
            brightness: result.trackInfo.brightness ?? undefined,
            acousticness: result.trackInfo.acousticness ?? undefined,
            groove: result.trackInfo.groove ?? undefined,
          };

          // Queue for progressive analysis if track lacks BPM
          if (!result.trackInfo.bpm && track.filePath) {
            enqueueForAnalysis(result.trackInfo.id, track.filePath);
          }
        }
      } else {
        console.log(
          "[Live] Not recording - isLiveFlag:",
          isLiveFlag,
          "currentDbSessionId:",
          currentDbSessionId,
        );
      }

      // Send to cloud if live (with deduplication) - uses enriched track with fingerprint
      // Send to cloud if live (with deduplication) - uses enriched track with fingerprint
      // We removed the readystate check so sendMessage can queue it if offline!
      if (isLiveFlag && currentSessionId) {
        broadcastTrack(currentSessionId, toTrackInfo(enrichedTrack));
      }
    },
    [setNowPlaying, setCurrentPlayId, setTempoFeedback],
  );

  // Set up track change listener ONCE
  useEffect(() => {
    if (listenerSetupRef.current) return;
    listenerSetupRef.current = true;

    console.log("[Live] Setting up track change listener");
    const unsubscribe = virtualDjWatcher.onTrackChange(handleTrackChange);
    return () => {
      console.log("[Live] Removing track change listener");
      listenerSetupRef.current = false;
      unsubscribe();
    };
  }, [handleTrackChange]);

  // Go live - connect to cloud and start watching
  // includeCurrentTrack: if false, skip recording/broadcasting whatever is currently playing
  const goLive = useCallback(
    async (sessionName?: string, includeCurrentTrack: boolean = true) => {
      if (status === "live" || status === "connecting") {
        console.log("[Live] Already live or connecting");
        return;
      }

      const newSessionId = generateSessionId();
      currentSessionId = newSessionId;

      setStatus("connecting");
      setError(null);
      setSessionId(newSessionId);

      try {
        // Create database session for history tracking
        const name = sessionName || `Live Set ${new Date().toLocaleDateString()}`;
        console.log("[Live] Creating database session:", name);
        const dbSession = await sessionRepository.createSession(name);
        currentDbSessionId = dbSession.id;
        setDbSessionId(dbSession.id);
        console.log("[Live] Database session created:", dbSession.id);

        // Store cloud session ID for recap link
        await sessionRepository.setCloudSessionId(dbSession.id, newSessionId);
        console.log("[Live] Cloud session ID saved:", newSessionId);

        // Clear processed tracks for new session
        processedTrackKeys.clear();
        lastBroadcastedTrackKey = null;

        // Start VirtualDJ watcher FIRST so it reads the current track
        console.log("[Live] Starting VirtualDJ watcher...");
        await virtualDjWatcher.startWatching(2000);

        // Get the initial track - only record if includeCurrentTrack is true
        const initialTrack = virtualDjWatcher.getCurrentTrack();
        if (initialTrack) {
          console.log("[Live] Initial track found:", initialTrack.artist, "-", initialTrack.title);

          if (includeCurrentTrack) {
            setNowPlaying(initialTrack);
            skipInitialTrackBroadcast = false; // Will broadcast
            // Record initial track to database
            const result = await recordPlay(initialTrack);
            if (result) {
              currentPlayIdRef = result.playId;
              setCurrentPlayId(result.playId);
            }
          } else {
            console.log("[Live] Skipping initial track (user chose not to include)");
            skipInitialTrackBroadcast = true; // Skip broadcast
            // Mark it as processed so it won't be recorded when track changes
            const trackKey = `${initialTrack.artist}-${initialTrack.title}-${Math.floor(Date.now() / 60000)}`;
            processedTrackKeys.add(trackKey);
            lastBroadcastedTrackKey = `${initialTrack.artist}:${initialTrack.title}`;
          }
        }

        // Connect to cloud using ReconnectingWebSocket
        const { wsUrl } = getConfiguredUrls();
        console.log("[Live] Connecting to cloud:", wsUrl);

        const socket = new ReconnectingWebSocket(wsUrl, [], {
          connectionTimeout: 5000,
          maxRetries: 10,
          maxReconnectionDelay: 10000,
          minReconnectionDelay: 1000,
        });

        socketInstance = socket;

        socket.onopen = () => {
          console.log("[Live] Connected to cloud");
          isLiveFlag = true;
          setStatus("live");
          setError(null);

          // Register session with DJ name and auth token from settings
          const token = getAuthToken();
          sendMessage({
            type: "REGISTER_SESSION",
            sessionId: newSessionId,
            djName: getDjName(),
            ...(token ? { token } : {}), // Include token if available
          });

          // Flush any pending messages from offline time
          flushQueue();

          // Send initial track if available AND user chose to include it
          // The skipInitialTrackBroadcast flag is set based on user's choice
          if (!skipInitialTrackBroadcast) {
            const currentTrack = virtualDjWatcher.getCurrentTrack();
            if (currentTrack) {
              console.log("[Live] Broadcasting initial track:", currentTrack.title);
              broadcastTrack(newSessionId, toTrackInfo(currentTrack));
            }
          } else {
            console.log("[Live] Not broadcasting initial track (user skipped)");
          }
        };

        socket.onmessage = (event) => {
          const message = parseWebSocketMessage(event.data);
          if (!message) {
            console.error("[Live] Failed to parse message:", event.data);
            return;
          }

          console.log("[Live] Received:", message);

          if (message.type === "SESSION_REGISTERED") {
            console.log("[Live] Session registered:", message.sessionId);
          }

          // Handle likes from listeners (batched notifications)
          if (message.type === "LIKE_RECEIVED") {
            const track = message.payload?.track;
            if (track) {
              console.log("[Live] Like received for:", track.title);

              // Add to pending batch for toast notification
              addToPendingLikes(track.title);

              // Update live likes count in real-time for DJ display
              useLiveStore.getState().incrementLiveLikes();

              // Store EVERY like in the database (no deduplication here)
              if (currentPlayIdRef) {
                sessionRepository
                  .incrementDancerLikes(currentPlayIdRef)
                  .then(() => {
                    console.log("[Live] Like stored for play ID:", currentPlayIdRef);
                  })
                  .catch((e) => {
                    console.error("[Live] Failed to store like:", e);
                  });
              } else {
                console.warn("[Live] No current play ID to store like");
              }
            }
          }

          // Handle listener count updates (only for our session)
          if (message.type === "LISTENER_COUNT") {
            const sessionId = message.sessionId;
            const count = message.count;

            // Only update count if it's for our session or no session specified
            if (!sessionId || sessionId === newSessionId) {
              console.log("[Live] Listener count:", count);
              useLiveStore.getState().setListenerCount(count);
            }
          }

          // Handle tempo feedback updates
          if (message.type === "TEMPO_FEEDBACK") {
            console.log("[Live] Tempo feedback:", message);
            useLiveStore.getState().setTempoFeedback({
              faster: message.faster,
              slower: message.slower,
              perfect: message.perfect,
              total: message.total,
            });
          }

          // Handle poll started confirmation with real ID
          if (message.type === "POLL_STARTED") {
            console.log("[Live] Poll started confirmed:", message);
            const currentPoll = useLiveStore.getState().activePoll;
            // Update optimistic poll with real ID and endsAt
            if (currentPoll && currentPoll.id === -1 && currentPoll.question === message.question) {
              useLiveStore.getState().setActivePoll({
                ...currentPoll,
                id: message.pollId,
                endsAt: (message as { endsAt?: string }).endsAt,
              });
            }
          }

          // Handle poll updates (votes coming in)
          if (message.type === "POLL_UPDATE") {
            console.log("[Live] Poll update:", message);
            const currentPoll = useLiveStore.getState().activePoll;
            // Match by ID, or match any active poll (in case ID update was missed)
            if (currentPoll && (currentPoll.id === message.pollId || currentPoll.id === -1)) {
              useLiveStore.getState().setActivePoll({
                ...currentPoll,
                id: message.pollId, // Update ID in case it was -1
                votes: message.votes,
                totalVotes: message.totalVotes,
              });
            }
          }

          // Handle poll ended
          if (message.type === "POLL_ENDED") {
            console.log("[Live] Poll ended:", message);
            const currentPoll = useLiveStore.getState().activePoll;

            if (currentPoll) {
              // Calculate winner
              const maxVotes = Math.max(...currentPoll.votes);
              const winnerIndex = currentPoll.votes.indexOf(maxVotes);
              const winner = currentPoll.options[winnerIndex] || "No votes";
              const winnerPercent =
                currentPoll.totalVotes > 0
                  ? Math.round((maxVotes / currentPoll.totalVotes) * 100)
                  : 0;

              // Store ended poll for display
              useLiveStore.getState().setEndedPoll({
                id: currentPoll.id,
                question: currentPoll.question,
                options: currentPoll.options,
                votes: currentPoll.votes,
                totalVotes: currentPoll.totalVotes,
                winner,
                winnerPercent,
              });
            }

            // Clear active poll immediately
            useLiveStore.getState().setActivePoll(null);
          }

          // Handle reactions
          if (message.type === "REACTION_RECEIVED") {
            console.log("[Live] Reaction received:", message.reaction);
            reactionListeners.forEach((cb) => {
              cb(message.reaction);
            });
          }
        };

        socket.onclose = (event) => {
          console.log("[Live] Disconnected from cloud:", event.code, event.reason);

          if (isLiveFlag) {
            setStatus("connecting");
            setError("Reconnecting...");
          }
        };

        socket.onerror = () => {
          console.error("[Live] Connection error");
          if (isLiveFlag) {
            setError("Connection error - retrying...");
          }
        };
      } catch (e) {
        console.error("[Live] Failed to go live:", e);
        setStatus("error");
        setError(String(e));
      }
    },
    [status, setStatus, setError, setSessionId, setDbSessionId, setNowPlaying, setCurrentPlayId],
  );

  // End set - disconnect and stop watching
  const endSet = useCallback(async () => {
    console.log("[Live] Ending set...");
    isLiveFlag = false;

    // Send end session message and close socket
    if (socketInstance) {
      if (socketInstance.readyState === WebSocket.OPEN) {
        sendMessage({
          type: "END_SESSION",
          sessionId: currentSessionId,
        });
      }
      socketInstance.close();
      socketInstance = null;
    }

    // Stop watcher
    virtualDjWatcher.stopWatching();

    // Sync fingerprint data to Cloud before ending (if enabled)
    if (currentDbSessionId && currentSessionId) {
      const syncEnabled = await settingsRepository.get("analysis.afterSession");
      if (syncEnabled) {
        try {
          console.log("[Live] Syncing fingerprints to Cloud...");
          const tracks = await trackRepository.getSessionTracksWithFingerprints(currentDbSessionId);

          if (tracks.length > 0) {
            const { apiUrl } = getConfiguredUrls();
            const response = await fetch(
              `${apiUrl}/api/session/${currentSessionId}/sync-fingerprints`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ tracks }),
              },
            );

            if (response.ok) {
              const result = await response.json();
              console.log(`[Live] Synced fingerprints: ${result.synced}/${result.total} tracks`);
            } else {
              console.error("[Live] Failed to sync fingerprints:", response.status);
            }
          }
        } catch (e) {
          console.error("[Live] Error syncing fingerprints:", e);
        }
      }
    }

    // End database session
    if (currentDbSessionId) {
      try {
        await sessionRepository.endSession(currentDbSessionId);
        console.log("[Live] Database session ended:", currentDbSessionId);
      } catch (e) {
        console.error("[Live] Failed to end database session:", e);
      }
    }

    // Reset state
    reset();
    currentSessionId = null;
    currentDbSessionId = null;
    currentPlayIdRef = null;
    processedTrackKeys.clear();
    lastBroadcastedTrackKey = null;
  }, [reset]);

  // Clear now playing
  const clearNowPlaying = useCallback(() => {
    setNowPlaying(null);

    if (isLiveFlag && socketInstance?.readyState === WebSocket.OPEN) {
      sendMessage({
        type: "TRACK_STOPPED",
        sessionId: currentSessionId,
      });
    }
  }, [setNowPlaying]);

  // Start a poll for dancers
  const startPoll = useCallback((question: string, options: string[], durationSeconds?: number) => {
    if (!isLiveFlag || !currentSessionId) {
      console.log("[Live] Cannot start poll - not live");
      return;
    }

    // Calculate endsAt for timer display
    const endsAt = durationSeconds
      ? new Date(Date.now() + durationSeconds * 1000).toISOString()
      : undefined;

    // Create optimistic poll state (will be updated with real ID from server)
    const optimisticPoll = {
      id: -1, // Will be updated
      question,
      options,
      votes: new Array(options.length).fill(0) as number[],
      totalVotes: 0,
      endsAt,
    };
    useLiveStore.getState().setActivePoll(optimisticPoll);

    sendMessage({
      type: "START_POLL",
      sessionId: currentSessionId,
      question,
      options,
      durationSeconds,
    });

    console.log(
      "[Live] Poll started:",
      question,
      durationSeconds ? `(${durationSeconds}s)` : "(no timer)",
    );
  }, []);

  // End the current poll
  const endCurrentPoll = useCallback(() => {
    const poll = useLiveStore.getState().activePoll;
    if (!poll) {
      console.log("[Live] No active poll to end");
      return;
    }

    // If poll has a valid ID, send END_POLL to server
    if (poll.id >= 0) {
      sendMessage({
        type: "END_POLL",
        pollId: poll.id,
      });
      console.log("[Live] Poll ended manually");
    } else {
      // Poll ID not yet assigned - send cancel by session
      sendMessage({
        type: "CANCEL_POLL",
        sessionId: currentSessionId,
      });
      console.log("[Live] Poll cancelled (no ID yet)");
    }

    // Store poll results locally for DJ to see (before clearing)
    const maxVotes = Math.max(...poll.votes, 0);
    const winnerIndex = poll.votes.indexOf(maxVotes);
    const winner = poll.options[winnerIndex] || "No votes";
    const winnerPercent = poll.totalVotes > 0 ? Math.round((maxVotes / poll.totalVotes) * 100) : 0;

    useLiveStore.getState().setEndedPoll({
      id: poll.id,
      question: poll.question,
      options: poll.options,
      votes: poll.votes,
      totalVotes: poll.totalVotes,
      winner,
      winnerPercent,
    });

    // Clear active poll immediately for DJ
    useLiveStore.getState().setActivePoll(null);
  }, []);

  // Send announcement to dancers
  const sendAnnouncement = useCallback((message: string, durationSeconds?: number) => {
    if (!isLiveFlag || !currentSessionId) {
      console.log("[Live] Cannot send announcement - not live");
      return;
    }

    sendMessage({
      type: "SEND_ANNOUNCEMENT",
      sessionId: currentSessionId,
      message,
      durationSeconds,
    });

    toast.success(`📢 Announcement sent!`);
    console.log(
      "[Live] Announcement sent:",
      message,
      durationSeconds ? `(${durationSeconds}s timer)` : "",
    );
  }, []);

  // Cancel active announcement
  const cancelAnnouncement = useCallback(() => {
    if (!isLiveFlag || !currentSessionId) {
      console.log("[Live] Cannot cancel announcement - not live");
      return;
    }

    sendMessage({
      type: "CANCEL_ANNOUNCEMENT",
      sessionId: currentSessionId,
    });

    toast.success(`📢 Announcement cancelled`);
    console.log("[Live] Announcement cancelled");
  }, []);

  // Force sync state to cloud (Panic Button)
  const forceSync = useCallback(() => {
    if (!isLiveFlag || !currentSessionId || !socketInstance) {
      console.log("[Live] Cannot sync - not live");
      return;
    }

    console.log("[Live] Forcing state sync...");
    toast("Syncing state...", { icon: "🔄" });

    // 1. Resend current track
    const currentTrack = virtualDjWatcher.getCurrentTrack();
    if (currentTrack) {
      // Force broadcast even if key matches, by resetting lastBroadcastedTrackKey
      lastBroadcastedTrackKey = null;
      broadcastTrack(currentSessionId, toTrackInfo(currentTrack));
      console.log("[Live] Resent track:", currentTrack.title);
    }

    // 2. Resend active poll
    const poll = useLiveStore.getState().activePoll;
    if (poll) {
      // Resend poll start or update
      if (poll.id >= 0) {
        // If it has an ID, maybe just send an update or nothing?
        // Actually, if server lost state, we might need to "restart" it.
        // But for now let's assume server mostly kept state and we just want to ensure client is active.
        // Let's just send the track for now, as that's the most critical "missing" piece usually.
        // Actually, let's re-send the poll start just in case.
        sendMessage({
          type: "START_POLL",
          sessionId: currentSessionId,
          question: poll.question,
          options: poll.options,
          // We don't know original duration, so maybe omit?
        });
      }
    }

    toast.success("State synced!");
  }, []);

  // Cleanup on unmount (only cleanup socket, not state - state is global)
  useEffect(() => {
    return () => {
      // Don't cleanup on unmount - state is global
    };
  }, []);

  // Get activePoll, endedPoll, and liveLikes from store
  const { activePoll, endedPoll, liveLikes, clearEndedPoll } = useLiveStore();

  return {
    status,
    nowPlaying,
    error,
    sessionId,
    dbSessionId,
    currentPlayId,
    listenerCount,
    tempoFeedback,
    activePoll,
    endedPoll,
    liveLikes,
    isLive: status === "live",
    goLive,
    endSet,
    clearNowPlaying,
    startPoll,
    endPoll: endCurrentPoll,
    sendAnnouncement,
    cancelAnnouncement,
    clearEndedPoll,
    forceSync,
  };
}
