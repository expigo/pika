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
  logger.debug("Live", "Creating track", { artist, title, bpm: vdjBpm });
  const newId = await trackRepository.insertTrack({
    filePath: filePath || `${GHOST_FILE_PREFIX}${artist}/${title}`,
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
  if (!getStoreDbSessionId()) {
    logger.warn("Live", "No database session active");
    return null;
  }

  // Create a unique key for deduplication within the session
  const dedupWindow = Math.floor(Date.now() / TRACK_DEDUP_WINDOW_MS);
  const trackKey = `${track.artist}-${track.title}-${dedupWindow}`;

  if (hasProcessedTrackKey(trackKey)) {
    logger.debug("Live", "Track already recorded recently", { title: track.title });
    return null;
  }
  addProcessedTrackKey(trackKey);

  try {
    const dbSessionId = getStoreDbSessionId();
    if (!dbSessionId) {
      logger.warn("Live", "No DB session ID, cannot record play");
      return null;
    }

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
      }

      // Send to cloud if session is active (sendMessage handles queueing if socket is down)
      const sessionId = getStoreSessionId();
      if (isInLiveMode() && sessionId) {
        broadcastTrack(sessionId, toTrackInfo(enrichedTrack));
      }
    },
    [setNowPlaying, setCurrentPlayId, setTempoFeedback],
  );

  // Set up track change listener ONCE
  useEffect(() => {
    if (listenerSetupRef.current) return;
    listenerSetupRef.current = true;

    logger.debug("Live", "Setting up track change listener");
    const unsubscribe = virtualDjWatcher.onTrackChange(handleTrackChange);
    return () => {
      logger.debug("Live", "Removing track change listener");
      listenerSetupRef.current = false;
      unsubscribe();
    };
  }, [handleTrackChange]);

  // Go live - connect to cloud and start watching
  // includeCurrentTrack: if false, skip recording/broadcasting whatever is currently playing
  const goLive = useCallback(
    async (sessionName?: string, includeCurrentTrack: boolean = true) => {
      if (status === "live" || status === "connecting") {
        logger.debug("Live", "Already live or connecting");
        return;
      }

      const newSessionId = generateSessionId();

      setStatus("connecting");
      setError(null);
      setSessionId(newSessionId);

      try {
        // Create database session for history tracking
        const dbSessionId = await createDatabaseSession(sessionName, newSessionId);
        setDbSessionId(dbSessionId);

        // Start VirtualDJ watcher and get initial track
        const initialTrack = await startVirtualDJWatcher();

        // Prepare initial track state based on user preference
        prepareInitialTrackState(initialTrack, includeCurrentTrack);

        // If including current track, record it to database
        if (initialTrack && includeCurrentTrack) {
          setNowPlaying(initialTrack);
          const result = await recordPlay(initialTrack);
          if (result) {
            setStoreCurrentPlayId(result.playId);
            setCurrentPlayId(result.playId);
          }
        }

        // Connect to cloud using ReconnectingWebSocket
        const { wsUrl } = getConfiguredUrls();
        logger.info("Live", "Connecting to cloud", { wsUrl });

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
            sessionId: newSessionId,
            djName: getDjName(),
            ...(token ? { token } : {}),
          });

          // Flush any pending messages from offline time
          flushQueue();

          // Send initial track if available AND user chose to include it
          if (!shouldSkipInitialTrackBroadcast()) {
            const currentTrack = virtualDjWatcher.getCurrentTrack();
            if (currentTrack) {
              logger.info("Live", "Broadcasting initial track", { title: currentTrack.title });
              broadcastTrack(newSessionId, toTrackInfo(currentTrack));
            }
          } else {
            logger.debug("Live", "Not broadcasting initial track (user skipped)");
          }
        };

        // Initialize message router with callbacks for this session
        const routerContext: MessageRouterContext = {
          sessionId: newSessionId,
          onAck: handleAck,
          onNack: handleNack,
          onLikeReceived: (trackTitle: string) => {
            logger.debug("Live", "Like received", { title: trackTitle });
            addToPendingLikes(trackTitle);
            useLiveStore.getState().incrementLiveLikes();

            // Store like in database
            const currentPlayId = getStoreCurrentPlayId();
            if (currentPlayId) {
              void (async () => {
                try {
                  await sessionRepository.incrementDancerLikes(currentPlayId);
                  logger.debug("Live", "Like stored", { playId: currentPlayId });
                } catch (error) {
                  logger.error("Live", "Failed to store like", error);
                }
              })();
            } else {
              logger.warn("Live", "No current play ID to store like");
            }
          },
          onListenerCount: (count: number) => {
            logger.debug("Live", "Listener count", { count });
            useLiveStore.getState().setListenerCount(count);
          },
          onTempoFeedback: (feedback) => {
            logger.debug("Live", "Tempo feedback", feedback);
            useLiveStore.getState().setTempoFeedback(feedback);
          },
          onPollStarted: (pollId: number, question: string, endsAt?: string) => {
            logger.info("Live", "Poll started confirmed", { pollId });
            const currentPoll = useLiveStore.getState().activePoll;
            if (
              currentPoll &&
              currentPoll.id === OPTIMISTIC_POLL_ID &&
              currentPoll.question === question
            ) {
              useLiveStore.getState().setActivePoll({
                ...currentPoll,
                id: pollId,
                endsAt,
              });
            }
          },
          onPollUpdate: (pollId: number, votes: number[], totalVotes: number) => {
            logger.debug("Live", "Poll update", { pollId, totalVotes });
            const currentPoll = useLiveStore.getState().activePoll;
            if (
              currentPoll &&
              (currentPoll.id === pollId || currentPoll.id === OPTIMISTIC_POLL_ID)
            ) {
              useLiveStore.getState().setActivePoll({
                ...currentPoll,
                id: pollId,
                votes,
                totalVotes,
              });
            }
          },
          onPollEnded: (pollId: number) => {
            logger.info("Live", "Poll ended", { pollId });
            const currentPoll = useLiveStore.getState().activePoll;

            if (currentPoll) {
              const maxVotes = Math.max(...currentPoll.votes);
              const winnerIndex = currentPoll.votes.indexOf(maxVotes);
              const winner = currentPoll.options[winnerIndex] || "No votes";
              const winnerPercent =
                currentPoll.totalVotes > 0
                  ? Math.round((maxVotes / currentPoll.totalVotes) * 100)
                  : 0;

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
          },
          onReactionReceived: (reaction) => {
            logger.debug("Live", "Reaction received", { reaction });
            notifyReactionListeners(reaction);
          },
          onSessionRegistered: (sessionId: string) => {
            logger.info("Live", "Session registered", { sessionId });
          },
        };
        messageRouter.setContext(routerContext);

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

          if (isInLiveMode()) {
            setStatus("connecting");
            setError("Reconnecting...");
          }
        };

        socket.onerror = () => {
          logger.error("Live", "Connection error");
          if (isInLiveMode()) {
            setError("Connection error - retrying...");
          }
        };
      } catch (error) {
        logger.error("Live", "Failed to go live", error);
        setStatus("error");
        setError(error instanceof Error ? error.message : String(error));
      }
    },
    [status, setStatus, setError, setSessionId, setDbSessionId, setNowPlaying, setCurrentPlayId],
  );

  // End set - disconnect and stop watching
  const endSet = useCallback(async () => {
    logger.info("Live", "Ending set");

    // Send end session message and close socket
    if (socketInstance) {
      if (socketInstance.readyState === WebSocket.OPEN) {
        sendMessage({
          type: MESSAGE_TYPES.END_SESSION,
          sessionId: getStoreSessionId(),
        });
      }
      socketInstance.close();
      socketInstance = null;
    }

    // Stop watcher
    virtualDjWatcher.stopWatching();

    // Sync fingerprint data to Cloud before ending (if enabled)
    const dbSessionIdToSync = getStoreDbSessionId();
    const sessionIdToSync = getStoreSessionId();
    if (dbSessionIdToSync && sessionIdToSync) {
      const syncEnabled = await settingsRepository.get("analysis.afterSession");
      if (syncEnabled) {
        try {
          logger.info("Live", "Syncing fingerprints to Cloud");
          const tracks = await trackRepository.getSessionTracksWithFingerprints(dbSessionIdToSync);

          if (tracks.length > 0) {
            const { apiUrl } = getConfiguredUrls();
            const response = await fetch(
              `${apiUrl}/api/session/${getStoreSessionId()}/sync-fingerprints`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ tracks }),
              },
            );

            if (response.ok) {
              const result = await response.json();
              logger.info("Live", "Synced fingerprints", {
                synced: result.synced,
                total: result.total,
              });
            } else {
              logger.error("Live", "Failed to sync fingerprints", { status: response.status });
            }
          }
        } catch (error) {
          logger.error("Live", "Error syncing fingerprints", error);
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
    reset();
    // Note: store is reset via reset() below
    // Note: reset() clears all these in the store
    clearProcessedTrackKeys();
    setLastBroadcastedTrackKey(null);
    clearPendingMessages(); // Clear any pending ACK messages
  }, [reset]);

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
  const sendAnnouncement = useCallback((message: string, durationSeconds?: number) => {
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
  }, []);

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
          sessionId: getStoreSessionId(),
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
  };
}
