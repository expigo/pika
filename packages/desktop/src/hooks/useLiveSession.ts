import { useEffect, useCallback, useRef } from "react";
import { create } from "zustand";
import ReconnectingWebSocket from "reconnecting-websocket";
import { toast } from "sonner";
import { parseWebSocketMessage, type TrackInfo } from "@pika/shared";
import {
    virtualDjWatcher,
    toTrackInfo,
    type NowPlayingTrack,
} from "../services/virtualDjWatcher";
import { sessionRepository } from "../db/repositories/sessionRepository";
import { trackRepository } from "../db/repositories/trackRepository";
import { getDjName } from "./useDjSettings";

// Cloud server URL - use env variable in production
const CLOUD_WS_URL = import.meta.env.VITE_CLOUD_WS_URL || "ws://localhost:3001/ws";

console.log("[Live] Cloud WS URL:", CLOUD_WS_URL);

export type LiveStatus = "offline" | "connecting" | "live" | "error";

// ============================================================================
// Zustand Store for Shared State
// ============================================================================

interface LiveSessionStore {
    status: LiveStatus;
    nowPlaying: NowPlayingTrack | null;
    error: string | null;
    sessionId: string | null;      // Cloud session ID
    dbSessionId: number | null;    // Database session ID for history/plays
    currentPlayId: number | null;  // Current play ID in database
    listenerCount: number;         // Number of connected dancers
    tempoFeedback: { faster: number; slower: number; perfect: number; total: number } | null;

    // Actions
    setStatus: (status: LiveStatus) => void;
    setNowPlaying: (track: NowPlayingTrack | null) => void;
    setError: (error: string | null) => void;
    setSessionId: (sessionId: string | null) => void;
    setDbSessionId: (dbSessionId: number | null) => void;
    setCurrentPlayId: (playId: number | null) => void;
    setListenerCount: (count: number) => void;
    setTempoFeedback: (feedback: { faster: number; slower: number; perfect: number; total: number } | null) => void;
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

    setStatus: (status) => set({ status }),
    setNowPlaying: (nowPlaying) => set({ nowPlaying }),
    setError: (error) => set({ error }),
    setSessionId: (sessionId) => set({ sessionId }),
    setDbSessionId: (dbSessionId) => set({ dbSessionId }),
    setCurrentPlayId: (currentPlayId) => set({ currentPlayId }),
    setListenerCount: (listenerCount) => set({ listenerCount }),
    setTempoFeedback: (tempoFeedback) => set({ tempoFeedback }),
    reset: () => set({
        status: "offline",
        nowPlaying: null,
        error: null,
        sessionId: null,
        dbSessionId: null,
        currentPlayId: null,
        listenerCount: 0,
        tempoFeedback: null,
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
let processedTrackKeys = new Set<string>(); // Track which tracks we've already recorded
let lastBroadcastedTrackKey: string | null = null; // Prevent duplicate cloud broadcasts
let skipInitialTrackBroadcast = false; // Explicit flag to skip initial track broadcast
let lastProcessedLikeKey: string | null = null; // Prevent duplicate like notifications

function sendMessage(message: object) {
    if (socketInstance?.readyState === WebSocket.OPEN) {
        socketInstance.send(JSON.stringify(message));
        console.log("[Live] Sent:", message);
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
 * Normalize text for matching tracks
 */
function normalizeText(text: string): string {
    return text.toLowerCase().trim().replace(/\s+/g, " ");
}

/**
 * Find or create a track in the database by artist/title
 */
async function findOrCreateTrack(artist: string, title: string): Promise<number> {
    const allTracks = await trackRepository.getAllTracks();
    const normalizedArtist = normalizeText(artist);
    const normalizedTitle = normalizeText(title);

    // Try to find existing track
    const match = allTracks.find(
        (t) =>
            normalizeText(t.artist || "") === normalizedArtist &&
            normalizeText(t.title || "") === normalizedTitle
    );

    if (match) {
        return match.id;
    }

    // Create a ghost track for tracking purposes
    console.log("[Live] Creating ghost track:", artist, "-", title);
    return await trackRepository.insertTrack({
        filePath: `ghost://${artist}/${title}`,
        artist,
        title,
    });
}

/**
 * Record a track play to the database
 */
async function recordPlay(track: NowPlayingTrack): Promise<number | null> {
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
        const trackId = await findOrCreateTrack(track.artist, track.title);
        const timestamp = Math.floor(Date.now() / 1000);

        const play = await sessionRepository.addPlay(currentDbSessionId, trackId, timestamp);
        console.log("[Live] Recorded play:", play.id, "-", track.artist, "-", track.title);

        return play.id;
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
        status, nowPlaying, error, sessionId, dbSessionId, currentPlayId, listenerCount, tempoFeedback,
        setStatus, setNowPlaying, setError, setSessionId, setDbSessionId, setCurrentPlayId, reset
    } = useLiveStore();

    // Use ref to track if this hook instance has set up the track listener
    const listenerSetupRef = useRef(false);

    // Handle track changes from VirtualDJ
    const handleTrackChange = useCallback(async (track: NowPlayingTrack) => {
        console.log("[Live] Track changed:", track.artist, "-", track.title);
        console.log("[Live] State check - isLiveFlag:", isLiveFlag, "currentDbSessionId:", currentDbSessionId);
        setNowPlaying(track);

        // Record to database
        if (isLiveFlag && currentDbSessionId) {
            console.log("[Live] Recording play to database...");
            const playId = await recordPlay(track);
            console.log("[Live] Play recorded with ID:", playId);
            if (playId) {
                currentPlayIdRef = playId; // Update singleton ref for likes
                setCurrentPlayId(playId);
            }
        } else {
            console.log("[Live] Not recording - isLiveFlag:", isLiveFlag, "currentDbSessionId:", currentDbSessionId);
        }

        // Send to cloud if live (with deduplication)
        if (isLiveFlag && socketInstance?.readyState === WebSocket.OPEN && currentSessionId) {
            broadcastTrack(currentSessionId, toTrackInfo(track));
        }
    }, [setNowPlaying, setCurrentPlayId]);

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
    const goLive = useCallback(async (sessionName?: string, includeCurrentTrack: boolean = true) => {
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
                    const playId = await recordPlay(initialTrack);
                    if (playId) {
                        setCurrentPlayId(playId);
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
            console.log("[Live] Connecting to cloud:", CLOUD_WS_URL);

            const socket = new ReconnectingWebSocket(CLOUD_WS_URL, [], {
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

                // Register session with DJ name from settings
                sendMessage({
                    type: "REGISTER_SESSION",
                    sessionId: newSessionId,
                    djName: getDjName(),
                });

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

                // Handle likes from listeners (with deduplication)
                if (message.type === "LIKE_RECEIVED") {
                    const track = message.payload?.track;
                    if (track) {
                        // Create a unique key for this like to prevent duplicates
                        const likeKey = `${track.artist}:${track.title}:${Math.floor(Date.now() / 1000)}`;

                        // Skip if we've already processed a like for this track in the last second
                        if (lastProcessedLikeKey === likeKey) {
                            console.log("[Live] Skipping duplicate like notification for:", track.title);
                        } else {
                            lastProcessedLikeKey = likeKey;
                            console.log("[Live] Like received for:", track.title);
                            toast(`Someone liked "${track.title}"`, {
                                icon: "❤️",
                                duration: 3000,
                            });

                            // Store the like in the database
                            if (currentPlayIdRef) {
                                sessionRepository.incrementDancerLikes(currentPlayIdRef)
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
    }, [status, setStatus, setError, setSessionId, setDbSessionId, setNowPlaying, setCurrentPlayId]);

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

    // Cleanup on unmount (only cleanup socket, not state - state is global)
    useEffect(() => {
        return () => {
            // Don't cleanup on unmount - state is global
        };
    }, []);

    return {
        status,
        nowPlaying,
        error,
        sessionId,
        dbSessionId,
        currentPlayId,
        listenerCount,
        tempoFeedback,
        isLive: status === "live",
        goLive,
        endSet,
        clearNowPlaying,
    };
}
