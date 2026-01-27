import { getTrackKey, MESSAGE_TYPES, parseWebSocketMessage } from "@pika/shared";
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef } from "react";
import ReconnectingWebSocket from "reconnecting-websocket";
import { toast } from "sonner";
import { sessionRepository } from "../db/repositories/sessionRepository";
import { settingsRepository } from "../db/repositories/settingsRepository";
import { trackRepository } from "../db/repositories/trackRepository";
import { enqueueForAnalysis } from "../services/progressiveAnalysisService";
import { type NowPlayingTrack, toTrackInfo, virtualDjWatcher } from "../services/virtualDjWatcher";
import { logger } from "../utils/logger";
import { getAuthToken, getConfiguredUrls, getDjName } from "./useDjSettings";

// Re-export from useLiveStore for backwards compatibility
export { type LiveSessionStore, type LiveStatus, useLiveStore } from "./useLiveStore";

// Imports from extracted live/ modules
import {
  addToPendingLikes,
  broadcastTrack,
  clearPendingMessages,
  clearReactionListeners,
  createDatabaseSession,
  flushQueue,
  generateSessionId,
  handleAck,
  handleNack,
  notifyReactionListeners,
  prepareInitialTrackState,
  sendMessage,
  setMessageSenderSocket,
  setQueueSocketInstance,
  setSocketInstance as setReliabilitySocket,
  startVirtualDJWatcher,
} from "./live";
// Import constants
import {
  CONNECTION_TIMEOUT_MS,
  GHOST_FILE_PREFIX,
  LIKE_STORAGE_DEBOUNCE_MS,
  MAX_ANNOUNCEMENT_DURATION_SECONDS,
  MAX_ANNOUNCEMENT_LENGTH,
  MAX_POLL_DURATION_SECONDS,
  MAX_POLL_OPTIONS,
  MAX_RECONNECT_ATTEMPTS,
  MAX_RECONNECTION_DELAY_MS,
  MIN_ANNOUNCEMENT_DURATION_SECONDS,
  MIN_POLL_DURATION_SECONDS,
  MIN_POLL_OPTIONS,
  MIN_RECONNECTION_DELAY_MS,
  OPTIMISTIC_POLL_ID,
  TRACK_DEDUP_WINDOW_MS,
  FINGERPRINT_SYNC_TIMEOUT_MS,
} from "./live/constants";
import { type MessageRouterContext, messageRouter } from "./live/messageRouter";
// Import state helpers for store-based state access
import {
  addProcessedTrackKey,
  clearProcessedTrackKeys,
  getCurrentPlayId as getStoreCurrentPlayId,
  getDbSessionId as getStoreDbSessionId,
  getSessionId as getStoreSessionId,
  hasProcessedTrackKey,
  isInLiveMode,
  setLastBroadcastedTrackKey,
  setCurrentPlayId as setStoreCurrentPlayId,
  shouldSkipInitialTrackBroadcast,
} from "./live/stateHelpers";
import { useLiveStore } from "./useLiveStore";

// Re-export subscribeToReactions for external use
export { subscribeToReactions } from "./live";

// =============================================================================
// Module State
// =============================================================================

let socketInstance: ReconnectingWebSocket | null = null;

// Re-track likes PER playId to prevent attribution to wrong track
const pendingLikesByPlayId = new Map<number, number>();
let likeStorageTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * 🛡️ Singleton Watcher Subscription
 *
 * This module-level variable tracks the VirtualDJ watcher subscription across ALL
 * instances of the useLiveSession hook. This prevents redundant recordPlay calls
 * when multiple components (e.g., App shell and LiveControl) use the hook.
 *
 * It is initialized once per module load and persists until the app is closed.
 */
let watcherUnsubscribe: (() => void) | null = null;

/**
 * 🛡️ Hybrid Dedup: Track last play timestamp for each track in this session.
 * This prevents 'Rolling Window' bypassing where a 3min track gets recorded
 * multiple times if visibility toggles happen across 60s window boundaries.
 */
const sessionTrackTimestamps = new Map<string, number>();
const MIN_REPLAY_INTERVAL_MS = 120000; // 2 minutes minimum between same track

/**
 * Flush all pending likes to database (batched write per playId)
 * Uses incrementDancerLikesBy for efficient single DB write per track
 * A2 fix: Each playId gets its own count, preventing misattribution
 */
async function flushAllPendingLikes(): Promise<void> {
  if (pendingLikesByPlayId.size === 0) return;

  // Copy and clear before async work to prevent race conditions
  const likesToFlush = new Map(pendingLikesByPlayId);
  pendingLikesByPlayId.clear();
  likeStorageTimer = null;

  for (const [playId, count] of likesToFlush) {
    if (count > 0) {
      try {
        await sessionRepository.incrementDancerLikesBy(playId, count);
        logger.debug("Live", "Batched likes stored", { playId, count });
      } catch (error) {
        logger.error("Live", "Failed to store batched likes", { playId, count, error });
      }
    }
  }
}

// =============================================================================
// Router Context Factory (U3 refactor - extracted from goLive)
// =============================================================================

/**
 * Handle incoming like - debounced DB storage with per-track attribution
 * Uses module-level pendingLikesByPlayId Map for correct track attribution (A2 fix)
 */
function handleLikeReceivedCallback(trackTitle: string): void {
  // 🛡️ R1 Fix: Prevent attribution to wrong track if like arrives after track change
  // The 'trackTitle' arg comes from the server broadcast "someone liked [title]"
  // We only show it visually if it matches what we think is playing
  const currentTrack = useLiveStore.getState().nowPlaying;

  if (!currentTrack || currentTrack.title !== trackTitle) {
    logger.debug("Live", "Ignored like for previous/unknown track", {
      msgTitle: trackTitle,
      currentTitle: currentTrack?.title,
    });
    return;
  }

  logger.debug("Live", "Like received", { title: trackTitle });
  addToPendingLikes(trackTitle);
  useLiveStore.getState().incrementLiveLikes();

  // Debounced DB storage (H4 fix - prevents spam writes)
  // A2 fix: Track likes per playId to prevent misattribution on track change
  const currentPlayId = getStoreCurrentPlayId();
  if (currentPlayId) {
    // Increment count for THIS specific playId
    const currentCount = pendingLikesByPlayId.get(currentPlayId) || 0;
    pendingLikesByPlayId.set(currentPlayId, currentCount + 1);

    // Reset debounce timer (flushes ALL pending likes when it fires)
    if (likeStorageTimer) {
      clearTimeout(likeStorageTimer);
    }
    likeStorageTimer = setTimeout(() => {
      void flushAllPendingLikes();
    }, LIKE_STORAGE_DEBOUNCE_MS);
  } else {
    logger.warn("Live", "No current play ID to store like");
  }
}

/**
 * Handle poll started confirmation from server
 */
function handlePollStartedCallback(pollId: number, question: string, endsAt?: string): void {
  logger.info("Live", "Poll started confirmed", { pollId });
  const currentPoll = useLiveStore.getState().activePoll;
  if (currentPoll && currentPoll.id === OPTIMISTIC_POLL_ID && currentPoll.question === question) {
    useLiveStore.getState().setActivePoll({
      ...currentPoll,
      id: pollId,
      endsAt,
    });
  }
}

/**
 * Handle poll vote update from server
 */
function handlePollUpdateCallback(pollId: number, votes: number[], totalVotes: number): void {
  logger.debug("Live", "Poll update", { pollId, totalVotes });
  const currentPoll = useLiveStore.getState().activePoll;
  if (currentPoll && (currentPoll.id === pollId || currentPoll.id === OPTIMISTIC_POLL_ID)) {
    useLiveStore.getState().setActivePoll({
      ...currentPoll,
      id: pollId,
      votes,
      totalVotes,
    });
  }
}

/**
 * Handle poll ended notification from server
 */
function handlePollEndedCallback(pollId: number): void {
  logger.info("Live", "Poll ended", { pollId });
  const currentPoll = useLiveStore.getState().activePoll;

  if (currentPoll) {
    const maxVotes = Math.max(...currentPoll.votes);
    const winnerIndex = currentPoll.votes.indexOf(maxVotes);
    const winner = currentPoll.options[winnerIndex] || "No votes";
    const winnerPercent =
      currentPoll.totalVotes > 0 ? Math.round((maxVotes / currentPoll.totalVotes) * 100) : 0;

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

  useLiveStore.getState().setActivePoll(null);
}

/**
 * Create the MessageRouterContext with all callbacks
 * Extracted from goLive to improve readability (U3 refactor)
 */
function createRouterContext(sessionId: string, endSet: () => Promise<void>): MessageRouterContext {
  return {
    sessionId,
    onAck: handleAck,
    onNack: handleNack,
    onLikeReceived: handleLikeReceivedCallback,
    onListenerCount: (count: number) => {
      logger.debug("Live", "Listener count", { count });
      useLiveStore.getState().setListenerCount(count);
    },
    onTempoFeedback: (feedback) => {
      logger.debug("Live", "Tempo feedback", feedback);
      useLiveStore.getState().setTempoFeedback(feedback);
    },
    onPollStarted: handlePollStartedCallback,
    onPollUpdate: handlePollUpdateCallback,
    onPollEnded: handlePollEndedCallback,
    onReactionReceived: (reaction) => {
      logger.debug("Live", "Reaction received", { reaction });
      notifyReactionListeners(reaction);
    },
    onSessionRegistered: (sessionIdFromServer: string) => {
      logger.info("Live", "Session registered", { sessionId: sessionIdFromServer });
    },
    onSessionExpired: (sessionId, reason) => {
      logger.warn("Live", "Session expired", { sessionId, reason });
      toast.error(`Session expired: ${reason}`);
      // Gracefully end local state
      void endSet();
    },
    onSessionValid: (sessionId, isValid) => {
      if (!isValid) {
        logger.warn("Live", "Session validation failed", { sessionId });
        toast.error("Session no longer active on server.");
        void endSet();
      } else {
        logger.debug("Live", "Session validation successful", { sessionId });
      }
    },
  };
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
  const trackKey = getTrackKey(artist, title);

  // O(log n) indexed lookup - no table scan!
  const existing = await trackRepository.findByTrackKey(trackKey);

  if (existing) {
    // Self-healing: If BPM is missing, try to fetch it from VDJ
    if (!existing.bpm && filePath && !filePath.startsWith(GHOST_FILE_PREFIX)) {
      try {
        const vdjMeta = await invoke<VdjTrackMetadata | null>("lookup_vdj_track_metadata", {
          filePath,
        });
        if (vdjMeta?.bpm) {
          logger.debug("Live", "Healing track metadata", {
            id: existing.id,
            bpm: vdjMeta.bpm,
            key: vdjMeta.key,
          });

          // Update DB (fire and forget await, but use the value for return)
          const bpmToSave =
            typeof vdjMeta.bpm === "string"
              ? Number.parseFloat(vdjMeta.bpm)
              : (vdjMeta.bpm as number | null);

          await trackRepository.insertTrack({
            filePath,
            artist,
            title,
            bpm: bpmToSave,
            key: vdjMeta.key || existing.key,
          });

          return {
            ...existing,
            bpm: bpmToSave,
            key: vdjMeta.key || existing.key,
          };
        }
      } catch (error) {
        logger.warn("Live", "Failed to heal track metadata", error);
      }
    }

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

  if (filePath && !filePath.startsWith(GHOST_FILE_PREFIX)) {
    try {
      const vdjMeta = await invoke<VdjTrackMetadata | null>("lookup_vdj_track_metadata", {
        filePath,
      });
      if (vdjMeta) {
        vdjBpm = vdjMeta.bpm;
        vdjKey = vdjMeta.key;
        logger.debug("Live", "Got VDJ metadata", { bpm: vdjBpm, key: vdjKey });
      }
    } catch (error) {
      logger.warn("Live", "VDJ lookup failed", error);
    }
  }

  // Insert new track
  const bpmToSave =
    typeof vdjBpm === "string" ? Number.parseFloat(vdjBpm) : (vdjBpm as number | null);

  logger.debug("Live", "Creating track", { artist, title, bpm: bpmToSave });
  const newId = await trackRepository.insertTrack({
    filePath: filePath || `${GHOST_FILE_PREFIX}${artist}/${title}`,
    artist,
    title,
    bpm: bpmToSave,
    key: vdjKey,
  });

  return {
    id: newId,
    bpm: bpmToSave,
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
  if (!getStoreDbSessionId()) {
    logger.warn("Live", "No database session active");
    return null;
  }

  // Create a unique key for deduplication within the session
  const dedupWindow = Math.floor(Date.now() / TRACK_DEDUP_WINDOW_MS);
  const trackKey = `${track.artist}-${track.title}-${dedupWindow}`;

  // 🛡️ Layer 2: Absolute tracking for current session (Hybrid Dedup)
  // This blocks the same track from being recorded twice within 2 mins,
  // even if the 60s trackKey window above has rolled over.
  const absoluteKey = `${track.artist}-${track.title}`.toLowerCase();
  const lastPlayTime = sessionTrackTimestamps.get(absoluteKey);

  if (lastPlayTime !== undefined) {
    const timeSinceLastPlay = Date.now() - lastPlayTime;
    if (timeSinceLastPlay < MIN_REPLAY_INTERVAL_MS) {
      logger.debug("Live", "Track deduped (absolute interval)", {
        title: track.title,
        timeSinceLastPlayMs: timeSinceLastPlay,
      });
      return null;
    }
  }

  // 🛡️ Fix: Check AND Add immediately before any awaits to prevent race conditions
  // if multiple handleTrackChange calls happen in the same tick.
  if (hasProcessedTrackKey(trackKey)) {
    logger.debug("Live", "Track already recorded recently (window)", { title: track.title });
    return null;
  }
  addProcessedTrackKey(trackKey);
  sessionTrackTimestamps.set(absoluteKey, Date.now());

  try {
    const dbSessionId = getStoreDbSessionId();
    if (!dbSessionId) {
      logger.warn("Live", "No DB session ID, cannot record play");
      return null;
    }

    // Performance: findOrCreateTrack and addPlay are async,
    // but the trackKey already blocks other concurrent calls.
    const dbTrack = await findOrCreateTrack(track.artist, track.title, track.filePath);
    const timestamp = Math.floor(Date.now() / 1000);

    const play = await sessionRepository.addPlay(dbSessionId, dbTrack.id, timestamp);
    logger.info("Live", "Recorded play", {
      playId: play.id,
      artist: track.artist,
      title: track.title,
    });

    return { playId: play.id, trackInfo: dbTrack };
  } catch (error) {
    logger.error("Live", "Failed to record play", error);
    // Note: We don't remove the processed key on error to avoid spamming the DB
    // with failed retries for the same track in the same window.
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
      // Update UI immediately with track info
      setNowPlaying(track);

      // Reset tempo feedback when track changes (server also resets)
      setTempoFeedback(null);

      // Record to database and get fingerprint data
      let enrichedTrack = track;
      if (isInLiveMode() && getStoreDbSessionId()) {
        const result = await recordPlay(track);
        if (result) {
          setStoreCurrentPlayId(result.playId);
          setCurrentPlayId(result.playId);

          // Enrich track with fingerprint data from database
          const dbBpm =
            typeof result.trackInfo.bpm === "string"
              ? Number.parseFloat(result.trackInfo.bpm)
              : (result.trackInfo.bpm as number | null);

          const trackBpm =
            typeof track.bpm === "string"
              ? Number.parseFloat(track.bpm)
              : (track.bpm as number | undefined);

          enrichedTrack = {
            ...track,
            bpm: dbBpm ?? trackBpm ?? undefined,
            key: result.trackInfo.key ?? track.key ?? undefined,
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
      }

      // Send to cloud if session is active (sendMessage handles queueing if socket is down)
      const sessionId = getStoreSessionId();
      if (isInLiveMode() && sessionId) {
        broadcastTrack(sessionId, toTrackInfo(enrichedTrack));
      }
    },
    [setNowPlaying, setTempoFeedback, setCurrentPlayId],
  );

  // Set up track change listener ONCE per module load
  // 🛡️ Fix: Use a module-level variable to ensure only one listener is active
  // even if multiple useLiveSession hooks are mounted.
  useEffect(() => {
    if (listenerSetupRef.current) return;
    listenerSetupRef.current = true;

    // Use a shared module-level check for the actual subscription
    if (watcherUnsubscribe) {
      logger.debug("Live", "Internal listener already active, skipping re-attach");
      return;
    }

    logger.debug("Live", "Setting up global track change listener");
    watcherUnsubscribe = virtualDjWatcher.onTrackChange(handleTrackChange);

    return () => {
      // In a real production app we might keep this alive as long as ANY hook is mounted,
      // but for Pika! we assume the app shell is always up.
      // We don't delete on unmount unless we are sure we want to stop watching.
      // Since App.tsx and LiveControl stay mounted, this is safe and prevents double-recording.
    };
  }, [handleTrackChange]);

  // 🧹 M6 Fix: Cleanup socket on unmount to prevent leaks
  useEffect(() => {
    return () => {
      if (socketInstance) {
        logger.debug("Live", "Cleaning up socket on unmount");
        socketInstance.close();
        socketInstance = null;
      }
    };
  }, []);

  // 💓 Session Heartbeat & Sanity Check
  useEffect(() => {
    if (status !== "live" || !sessionId) return;

    // 🛡️ Issue 34 Fix: Frequent PING (30s) to keep connection alive
    const pingInterval = setInterval(() => {
      if (socketInstance?.readyState === WebSocket.OPEN) {
        sendMessage({ type: MESSAGE_TYPES.PING });
      }
    }, 30000);

    // Hourly sanity check (business logic validation)
    logger.debug("Live", "Setting up hourly sanity check");
    const sanityInterval = setInterval(
      () => {
        if (socketInstance?.readyState === WebSocket.OPEN) {
          logger.debug("Live", "Running hourly session validation");
          sendMessage({
            type: MESSAGE_TYPES.VALIDATE_SESSION,
            sessionId: sessionId,
          });
        }
      },
      60 * 60 * 1000,
    ); // 1 hour

    return () => {
      clearInterval(pingInterval);
      clearInterval(sanityInterval);
    };
  }, [status, sessionId]);

  // End set - disconnect and stop watching
  const endSet = useCallback(async () => {
    logger.info("Live", "Ending set");

    // Send end session message and close socket
    if (socketInstance) {
      if (socketInstance.readyState === WebSocket.OPEN) {
        // U4 Fix: Wait for server to acknowledge END_SESSION before killing socket
        // This ensures clients get the broadcast event reliably
        await sendMessage(
          {
            type: MESSAGE_TYPES.END_SESSION,
            sessionId: getStoreSessionId(),
          },
          true, // reliable
        );
      }
      socketInstance.close();
      socketInstance = null;
    }

    // Stop watcher
    virtualDjWatcher.stopWatching();

    // 🧹 Issue 22 Fix: Clear reaction listeners on session end
    clearReactionListeners();

    // 🛡️ Issue 14 Fix: Clear pending like timer
    if (likeStorageTimer) {
      clearTimeout(likeStorageTimer);
      likeStorageTimer = null;
    }

    // Sync fingerprint data to Cloud before ending (if enabled)
    const dbSessionIdToSync = getStoreDbSessionId();
    const sessionIdToSync = getStoreSessionId();
    if (dbSessionIdToSync && sessionIdToSync) {
      const syncEnabled = await settingsRepository.get("analysis.afterSession");
      if (syncEnabled) {
        try {
          const tracks = await trackRepository.getSessionTracksWithFingerprints(dbSessionIdToSync);
          if (tracks.length > 0) {
            const { apiUrl } = getConfiguredUrls();
            const CHUNK_SIZE = 500; // 🛡️ Issue 16 Fix: Batch fingerprint sync

            for (let i = 0; i < tracks.length; i += CHUNK_SIZE) {
              const chunk = tracks.slice(i, i + CHUNK_SIZE);
              const abortController = new AbortController();
              const timeoutId = setTimeout(
                () => abortController.abort(),
                FINGERPRINT_SYNC_TIMEOUT_MS,
              );

              try {
                logger.info(
                  "Live",
                  `Syncing fingerprints (Batch ${Math.floor(i / CHUNK_SIZE) + 1})`,
                );
                const response = await fetch(
                  `${apiUrl}/api/session/${sessionIdToSync}/sync-fingerprints`,
                  {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ tracks: chunk }),
                    signal: abortController.signal,
                  },
                );

                if (!response.ok) {
                  logger.error("Live", "Batch sync failed", { status: response.status });
                }
              } catch (error) {
                if (error instanceof Error && error.name === "AbortError") {
                  logger.warn("Live", "Batch sync aborted (timeout)");
                } else {
                  logger.error("Live", "Error syncing batch", error);
                }
              } finally {
                clearTimeout(timeoutId);
              }
            }
          }
        } catch (error) {
          logger.error("Live", "Error prepared fingerprint sync", error);
        }
      }
    }

    // End database session
    const dbSessionIdToEnd = getStoreDbSessionId();
    if (dbSessionIdToEnd) {
      try {
        await sessionRepository.endSession(dbSessionIdToEnd);
        logger.info("Live", "Database session ended", { dbSessionId: dbSessionIdToEnd });
      } catch (error) {
        logger.error("Live", "Failed to end database session", error);
      }
    }

    // Reset state
    // Clear session-specific tracking state
    sessionTrackTimestamps.clear();
    reset();
    // Note: store is reset via reset() below
    // Note: reset() clears all these in the store
    clearProcessedTrackKeys();
    setLastBroadcastedTrackKey(null);
    clearPendingMessages(); // Clear any pending ACK messages
    messageRouter.clearContext(); // 🛡️ Issue 3 Fix: Clear context to prevent stale callbacks
  }, [reset]);

  // Go live - connect to cloud and start watching
  // include currentTrack: if false, skip recording/broadcasting whatever is currently playing
  const goLive = useCallback(
    async (
      sessionName?: string,
      includeCurrentTrack: boolean = true,
      preCreatedSession?: { sessionId: string; dbSessionId: number },
    ) => {
      if (status === "live" || status === "connecting") {
        logger.debug("Live", "Already live or connecting");
        return;
      }

      const activeSessionId = preCreatedSession?.sessionId || generateSessionId();

      setStatus("connecting");
      setError(null);
      setSessionId(activeSessionId);

      try {
        // Create database session for history tracking (or use existing)
        let dbSessionId: number;
        if (preCreatedSession) {
          dbSessionId = preCreatedSession.dbSessionId;
          logger.info("Live", "Using pre-created session", { dbSessionId });
        } else {
          dbSessionId = await createDatabaseSession(sessionName, activeSessionId);
        }
        setDbSessionId(dbSessionId);

        // Start VirtualDJ watcher and get initial track
        const initialTrack = await startVirtualDJWatcher();

        // Prepare initial track state based on user preference
        prepareInitialTrackState(initialTrack, includeCurrentTrack);

        // 🛡️ R1 Fix: Removed redundant recordPlay(initialTrack) call.
        // startVirtualDJWatcher calls virtualDjWatcher.startWatching(), which
        // broadcasts the initial track to all listeners. handleTrackChange (the listener)
        // will then call recordPlay(initialTrack) automatically if isInLiveMode is true.
        // Calling it manually here caused double-counting on session start.
        if (initialTrack && includeCurrentTrack) {
          setNowPlaying(initialTrack);
          // Initial recording is handled by handleTrackChange listener
        }

        // Connect to cloud using ReconnectingWebSocket
        const { wsUrl } = getConfiguredUrls();
        logger.info("Live", "Connecting to cloud", { wsUrl });

        // S0.2.3 Fix: Ensure strict cleanup of existing socket before creating new one
        if (socketInstance) {
          logger.warn("Live", "Closing existing orphan socket before reconnecting");
          socketInstance.close();
          socketInstance = null;
        }

        const socket = new ReconnectingWebSocket(wsUrl, [], {
          connectionTimeout: CONNECTION_TIMEOUT_MS,
          maxRetries: MAX_RECONNECT_ATTEMPTS,
          maxReconnectionDelay: MAX_RECONNECTION_DELAY_MS,
          minReconnectionDelay: MIN_RECONNECTION_DELAY_MS,
        });

        socketInstance = socket;

        // Wire socket to all modules that need it (CRITICAL for reliability)
        const webSocket = socket as unknown as WebSocket;
        setReliabilitySocket(webSocket);
        setMessageSenderSocket(webSocket);
        setQueueSocketInstance(webSocket);

        socket.onopen = () => {
          logger.info("Live", "Connected to cloud");
          setStatus("live");
          setError(null);

          // Register session with DJ name and auth token from settings
          const token = getAuthToken();
          sendMessage({
            type: MESSAGE_TYPES.REGISTER_SESSION,
            sessionId: activeSessionId,
            djName: getDjName(),
            ...(token ? { token } : {}),
          });

          // Flush any pending messages from offline time
          flushQueue();

          // Send initial track if available AND user chose to include it
          if (!shouldSkipInitialTrackBroadcast()) {
            logger.debug("Live", "Initial track broadcast is being handled by watcher listener");
          } else {
            logger.debug("Live", "Not broadcasting initial track (user skipped)");
          }
        };

        // Initialize message router with callbacks for this session (U3 refactor)
        messageRouter.setContext(createRouterContext(activeSessionId, endSet));

        // Message handler using O(1) router dispatch
        socket.onmessage = (event) => {
          const message = parseWebSocketMessage(event.data);
          if (!message) {
            logger.error("Live", "Failed to parse message", { data: event.data });
            return;
          }

          logger.debug("Live", "Received message", { type: message.type });
          messageRouter.dispatch(message);
        };

        socket.onclose = (event) => {
          logger.info("Live", "Disconnected from cloud", {
            code: event.code,
            reason: event.reason,
          });

          // 🛡️ Issue 32 Fix: Clear pending messages on disconnect to prevent stuck promises
          clearPendingMessages();

          // 🛡️ Issue 41 Fix: Don't reconnect on fatal errors (4000-4999) or normal closure (1000)
          const isFatalClose = event.code === 1000 || (event.code >= 4000 && event.code < 5000);

          if (isFatalClose) {
            logger.warn("Live", "Session ended by server (fatal close code)", {
              code: event.code,
              reason: event.reason,
            });
            // Stop reconnection attempts properly
            socket.close(); // Ensure closure
            setStatus("offline");
            if (isInLiveMode()) {
              void endSet();
            }
            return;
          }

          if (isInLiveMode()) {
            setStatus("connecting");
            setError("Reconnecting...");
          }
        };

        socket.onerror = () => {
          logger.error("Live", "Connection error");
          // 🛡️ Issue 32 Fix: Clear pending messages on error
          clearPendingMessages();
          if (isInLiveMode()) {
            setError("Connection error - retrying...");
          }
        };
      } catch (error) {
        logger.error("Live", "Failed to go live", error);

        // 🛡️ Issue 35 Fix: Ensure watcher stops if connection/setup fails
        virtualDjWatcher.stopWatching();

        setStatus("error");
        setError(error instanceof Error ? error.message : String(error));
      }
    },
    [status, setStatus, setError, setSessionId, setDbSessionId, setNowPlaying, endSet],
  );

  // Clear now playing
  const clearNowPlaying = useCallback(() => {
    setNowPlaying(null);

    if (isInLiveMode() && socketInstance?.readyState === WebSocket.OPEN) {
      sendMessage({
        type: MESSAGE_TYPES.TRACK_STOPPED,
        sessionId: getStoreSessionId(),
      });
    }
  }, [setNowPlaying]);

  // Start a poll for dancers
  const startPoll = useCallback((question: string, options: string[], durationSeconds?: number) => {
    // Input validation
    if (!question.trim()) {
      logger.warn("Live", "Cannot start poll with empty question");
      toast.error("Poll question cannot be empty");
      return;
    }

    const sanitizedOptions = options.map((o) => o.trim()).filter(Boolean);
    if (sanitizedOptions.length < MIN_POLL_OPTIONS) {
      logger.warn("Live", "Poll requires at least 2 options", { count: sanitizedOptions.length });
      toast.error(`Poll requires at least ${MIN_POLL_OPTIONS} options`);
      return;
    }

    if (sanitizedOptions.length > MAX_POLL_OPTIONS) {
      logger.warn("Live", "Too many poll options", { count: sanitizedOptions.length });
      toast.error(`Poll cannot have more than ${MAX_POLL_OPTIONS} options`);
      return;
    }

    if (
      durationSeconds !== undefined &&
      (durationSeconds < MIN_POLL_DURATION_SECONDS || durationSeconds > MAX_POLL_DURATION_SECONDS)
    ) {
      logger.warn("Live", "Poll duration out of range", { durationSeconds });
      toast.error(
        `Poll duration must be ${MIN_POLL_DURATION_SECONDS}s - ${MAX_POLL_DURATION_SECONDS / 60} minutes`,
      );
      return;
    }

    if (!isInLiveMode() || !getStoreSessionId()) {
      logger.debug("Live", "Cannot start poll - not live");
      return;
    }

    // Calculate endsAt for timer display
    const endsAt = durationSeconds
      ? new Date(Date.now() + durationSeconds * 1000).toISOString()
      : undefined;

    // Create optimistic poll state (will be updated with real ID from server)
    const optimisticPoll = {
      id: OPTIMISTIC_POLL_ID,
      question: question.trim(),
      options: sanitizedOptions,
      votes: Array.from({ length: sanitizedOptions.length }, () => 0),
      totalVotes: 0,
      endsAt,
    };
    useLiveStore.getState().setActivePoll(optimisticPoll);

    sendMessage({
      type: MESSAGE_TYPES.START_POLL,
      sessionId: getStoreSessionId(),
      question: question.trim(),
      options: sanitizedOptions,
      durationSeconds,
    });

    logger.info("Live", "Poll started", {
      question: question.trim(),
      options: sanitizedOptions.length,
      duration: durationSeconds ?? "no timer",
    });
  }, []);

  // End the current poll
  const endCurrentPoll = useCallback(() => {
    const poll = useLiveStore.getState().activePoll;
    if (!poll) {
      logger.debug("Live", "No active poll to end");
      return;
    }

    // If poll has a valid ID, send END_POLL to server
    if (poll.id >= 0) {
      sendMessage({
        type: MESSAGE_TYPES.END_POLL,
        pollId: poll.id,
      });
      logger.info("Live", "Poll ended manually", { pollId: poll.id });
    } else {
      // Poll ID not yet assigned - send cancel by session
      sendMessage({
        type: MESSAGE_TYPES.CANCEL_POLL,
        sessionId: getStoreSessionId(),
      });
      logger.info("Live", "Poll cancelled (no ID yet)");
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
  const sendAnnouncement = useCallback(
    (message: string, durationSeconds?: number, push?: boolean) => {
      // Input validation
      const trimmedMessage = message.trim();
      if (!trimmedMessage) {
        logger.warn("Live", "Cannot send empty announcement");
        toast.error("Announcement message cannot be empty");
        return;
      }

      if (trimmedMessage.length > MAX_ANNOUNCEMENT_LENGTH) {
        logger.warn("Live", "Announcement too long", { length: trimmedMessage.length });
        toast.error(`Announcement must be under ${MAX_ANNOUNCEMENT_LENGTH} characters`);
        return;
      }

      if (
        durationSeconds !== undefined &&
        (durationSeconds < MIN_ANNOUNCEMENT_DURATION_SECONDS ||
          durationSeconds > MAX_ANNOUNCEMENT_DURATION_SECONDS)
      ) {
        logger.warn("Live", "Announcement duration out of range", { durationSeconds });
        toast.error(
          `Announcement duration must be ${MIN_ANNOUNCEMENT_DURATION_SECONDS}s - ${MAX_ANNOUNCEMENT_DURATION_SECONDS / 60} minutes`,
        );
        return;
      }

      if (!isInLiveMode() || !getStoreSessionId()) {
        logger.debug("Live", "Cannot send announcement - not live");
        return;
      }

      const endsAt = durationSeconds
        ? new Date(Date.now() + durationSeconds * 1000).toISOString()
        : undefined;

      sendMessage({
        type: MESSAGE_TYPES.SEND_ANNOUNCEMENT,
        sessionId: getStoreSessionId(),
        message: trimmedMessage,
        durationSeconds,
        push,
      });

      useLiveStore.getState().setActiveAnnouncement({
        message: trimmedMessage,
        endsAt,
      });

      toast.success(`📢 Announcement sent!`);
      logger.info("Live", "Announcement sent", {
        message: trimmedMessage,
        duration: durationSeconds ?? "no timer",
      });
    },
    [],
  );

  // Cancel active announcement
  const cancelAnnouncement = useCallback(() => {
    if (!isInLiveMode() || !getStoreSessionId()) {
      logger.debug("Live", "Cannot cancel announcement - not live");
      return;
    }

    sendMessage({
      type: MESSAGE_TYPES.CANCEL_ANNOUNCEMENT,
      sessionId: getStoreSessionId(),
    });

    useLiveStore.getState().setActiveAnnouncement(null);

    toast.success(`📢 Announcement cancelled`);
    logger.info("Live", "Announcement cancelled");
  }, []);

  // Force sync state to cloud (Panic Button)
  const forceSync = useCallback(() => {
    if (!isInLiveMode() || !getStoreSessionId() || !socketInstance) {
      logger.debug("Live", "Cannot sync - not live");
      return;
    }

    logger.info("Live", "Forcing state sync");
    toast("Syncing state...", { icon: "🔄" });

    // 1. Resend current track
    const currentTrack = virtualDjWatcher.getCurrentTrack();
    const sessionIdForSync = getStoreSessionId();
    if (currentTrack && sessionIdForSync) {
      // Force broadcast even if key matches, by resetting lastBroadcastedTrackKey
      setLastBroadcastedTrackKey(null);
      broadcastTrack(sessionIdForSync, toTrackInfo(currentTrack));
      logger.info("Live", "Resent track", { title: currentTrack.title });
    }

    // 2. Note: We intentionally DON'T resend polls in forceSync
    // Reason: If poll has a server ID (>= 0), resending START_POLL would create duplicates
    // If server truly lost state, DJ should manually restart the poll
    const poll = useLiveStore.getState().activePoll;
    if (poll && poll.id >= 0) {
      logger.debug("Live", "Active poll exists, not resending to avoid duplicates", {
        pollId: poll.id,
      });
    }

    toast.success("State synced!");
  }, []);

  // Cleanup on unmount - close socket and clear router to prevent memory leaks
  useEffect(() => {
    return () => {
      // Close socket if still open
      if (socketInstance) {
        logger.debug("Live", "Cleaning up socket on unmount");
        socketInstance.close();
        socketInstance = null;
      }
      // Clear pending message timeouts (H6 fix)
      clearPendingMessages();
      // Clear like storage timer
      if (likeStorageTimer) {
        clearTimeout(likeStorageTimer);
        likeStorageTimer = null;
      }
      // Clear message router context
      messageRouter.clearContext();
    };
  }, []);

  // Get activePoll, endedPoll, and liveLikes from store
  const { activePoll, activeAnnouncement, endedPoll, liveLikes, clearEndedPoll } = useLiveStore();

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
    activeAnnouncement,
    endedPoll,
    liveLikes,
    isLive: isInLiveMode(),
    isSessionActive: !!dbSessionId,
    isCloudConnected: status === "live",
    goLive,
    endSet,
    clearNowPlaying,
    startPoll,
    endPoll: endCurrentPoll,
    sendAnnouncement,
    cancelAnnouncement,
    clearEndedPoll,
    forceSync,
    registerImportedTrack,
  };
}

/**
 * 🛡️ Fix 1: Register imported tracks in the internal dedup state
 * This prevents the live watcher from re-recording a track that was just imported
 */
const registerImportedTrack = (artist: string, title: string, timestamp: number) => {
  const absoluteKey = `${artist}-${title}`.toLowerCase();
  sessionTrackTimestamps.set(absoluteKey, timestamp * 1000);
  logger.debug("Live", "Registered imported track for dedup", { absoluteKey, timestamp });
};
