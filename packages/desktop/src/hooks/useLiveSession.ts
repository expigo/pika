import { useEffect, useCallback, useRef } from "react";
import { create } from "zustand";
import ReconnectingWebSocket from "reconnecting-websocket";
import { toast } from "sonner";
import { parseWebSocketMessage } from "@pika/shared";
import {
    virtualDjWatcher,
    toTrackInfo,
    type NowPlayingTrack,
} from "../services/virtualDjWatcher";
import { sessionRepository } from "../db/repositories/sessionRepository";
import { trackRepository } from "../db/repositories/trackRepository";

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

    // Actions
    setStatus: (status: LiveStatus) => void;
    setNowPlaying: (track: NowPlayingTrack | null) => void;
    setError: (error: string | null) => void;
    setSessionId: (sessionId: string | null) => void;
    setDbSessionId: (dbSessionId: number | null) => void;
    setCurrentPlayId: (playId: number | null) => void;
    setListenerCount: (count: number) => void;
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

    setStatus: (status) => set({ status }),
    setNowPlaying: (nowPlaying) => set({ nowPlaying }),
    setError: (error) => set({ error }),
    setSessionId: (sessionId) => set({ sessionId }),
    setDbSessionId: (dbSessionId) => set({ dbSessionId }),
    setCurrentPlayId: (currentPlayId) => set({ currentPlayId }),
    setListenerCount: (listenerCount) => set({ listenerCount }),
    reset: () => set({
        status: "offline",
        nowPlaying: null,
        error: null,
        sessionId: null,
        dbSessionId: null,
        currentPlayId: null,
        listenerCount: 0,
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

function sendMessage(message: object) {
    if (socketInstance?.readyState === WebSocket.OPEN) {
        socketInstance.send(JSON.stringify(message));
        console.log("[Live] Sent:", message);
    }
}

function getOrCreateSessionId(): string {
    let sessionId = localStorage.getItem("pika_session_id");
    if (!sessionId) {
        sessionId = `pika_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        localStorage.setItem("pika_session_id", sessionId);
    }
    return sessionId;
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
        status, nowPlaying, error, sessionId, dbSessionId, currentPlayId, listenerCount,
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

        // Send to cloud if live
        if (isLiveFlag && socketInstance?.readyState === WebSocket.OPEN) {
            sendMessage({
                type: "BROADCAST_TRACK",
                sessionId: currentSessionId,
                track: toTrackInfo(track),
            });
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
    const goLive = useCallback(async (sessionName?: string) => {
        if (status === "live" || status === "connecting") {
            console.log("[Live] Already live or connecting");
            return;
        }

        const newSessionId = getOrCreateSessionId();
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

            // Clear processed tracks for new session
            processedTrackKeys.clear();

            // Start VirtualDJ watcher FIRST so it reads the current track
            console.log("[Live] Starting VirtualDJ watcher...");
            await virtualDjWatcher.startWatching(2000);

            // Get the initial track immediately
            const initialTrack = virtualDjWatcher.getCurrentTrack();
            if (initialTrack) {
                console.log("[Live] Initial track found:", initialTrack.artist, "-", initialTrack.title);
                setNowPlaying(initialTrack);

                // Record initial track to database
                const playId = await recordPlay(initialTrack);
                if (playId) {
                    setCurrentPlayId(playId);
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

                // Register session
                sendMessage({
                    type: "REGISTER_SESSION",
                    sessionId: newSessionId,
                    djName: "DJ Pika",
                });

                // Send initial track if available
                const currentTrack = virtualDjWatcher.getCurrentTrack();
                if (currentTrack) {
                    sendMessage({
                        type: "BROADCAST_TRACK",
                        sessionId: newSessionId,
                        track: toTrackInfo(currentTrack),
                    });
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

                // Handle likes from listeners
                if (message.type === "LIKE_RECEIVED") {
                    const track = message.payload?.track;
                    if (track) {
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

                // Handle listener count updates
                if (message.type === "LISTENER_COUNT") {
                    const count = message.count;
                    console.log("[Live] Listener count:", count);
                    useLiveStore.getState().setListenerCount(count);
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
        isLive: status === "live",
        goLive,
        endSet,
        clearNowPlaying,
    };
}
