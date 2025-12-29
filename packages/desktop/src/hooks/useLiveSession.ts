import { useState, useEffect, useCallback, useRef } from "react";
import { io, type Socket } from "socket.io-client";
import {
    virtualDjWatcher,
    type NowPlayingTrack,
} from "../services/virtualDjWatcher";

// Cloud server URL - use env variable in production
const CLOUD_URL = import.meta.env.VITE_CLOUD_URL || "http://localhost:3001";

export type LiveStatus = "offline" | "connecting" | "live" | "error";

interface LiveSessionState {
    status: LiveStatus;
    nowPlaying: NowPlayingTrack | null;
    error: string | null;
    sessionId: string | null;
}

export function useLiveSession() {
    const [state, setState] = useState<LiveSessionState>({
        status: "offline",
        nowPlaying: null,
        error: null,
        sessionId: null,
    });

    const socketRef = useRef<Socket | null>(null);
    const isLiveRef = useRef(false);
    const sessionIdRef = useRef<string | null>(null);

    // Keep sessionId in sync with ref for socket callbacks
    useEffect(() => {
        sessionIdRef.current = state.sessionId;
    }, [state.sessionId]);

    // Generate or retrieve session ID
    const getSessionId = useCallback(() => {
        let sessionId = localStorage.getItem("pika_session_id");
        if (!sessionId) {
            sessionId = `pika_${Date.now()}_${Math.random().toString(36).substring(7)}`;
            localStorage.setItem("pika_session_id", sessionId);
        }
        return sessionId;
    }, []);

    // Handle track changes from VirtualDJ - stable callback using refs
    const handleTrackChange = useCallback((track: NowPlayingTrack) => {
        console.log("[Live] Track changed:", track.artist, "-", track.title);

        setState((prev) => ({ ...prev, nowPlaying: track }));

        // Emit to cloud if live
        if (isLiveRef.current && socketRef.current?.connected) {
            socketRef.current.emit("now_playing", {
                sessionId: sessionIdRef.current,
                track: {
                    artist: track.artist,
                    title: track.title,
                    timestamp: track.timestamp.toISOString(),
                },
            });
            console.log("[Live] Emitted now_playing to cloud");
        }
    }, []); // Empty deps - uses refs for mutable values

    // Set up track change listener ONCE on mount
    useEffect(() => {
        console.log("[Live] Setting up track change listener");
        const unsubscribe = virtualDjWatcher.onTrackChange(handleTrackChange);
        return () => {
            console.log("[Live] Removing track change listener");
            unsubscribe();
        };
    }, [handleTrackChange]);

    // Go live - connect to cloud and start watching
    const goLive = useCallback(async () => {
        if (state.status === "live" || state.status === "connecting") {
            console.log("[Live] Already live or connecting");
            return;
        }

        const sessionId = getSessionId();
        sessionIdRef.current = sessionId;

        setState((prev) => ({
            ...prev,
            status: "connecting",
            error: null,
            sessionId,
        }));

        try {
            // Start VirtualDJ watcher FIRST so it reads the current track
            console.log("[Live] Starting VirtualDJ watcher...");
            await virtualDjWatcher.startWatching(1000);

            // Get the initial track immediately
            const initialTrack = virtualDjWatcher.getCurrentTrack();
            if (initialTrack) {
                console.log("[Live] Initial track found:", initialTrack.artist, "-", initialTrack.title);
                setState((prev) => ({ ...prev, nowPlaying: initialTrack }));
            }

            // Connect to cloud
            console.log("[Live] Connecting to cloud:", CLOUD_URL);
            const socket = io(CLOUD_URL, {
                transports: ["websocket", "polling"],
                timeout: 10000,
                reconnection: true,
                reconnectionAttempts: 5,
                reconnectionDelay: 1000,
            });

            socketRef.current = socket;

            socket.on("connect", () => {
                console.log("[Live] Connected to cloud");
                isLiveRef.current = true;

                // Register session
                socket.emit("register_session", {
                    sessionId,
                    djName: "DJ Pika", // TODO: Make configurable
                    startedAt: new Date().toISOString(),
                });

                setState((prev) => ({ ...prev, status: "live", error: null }));

                // Send initial track if available
                const currentTrack = virtualDjWatcher.getCurrentTrack();
                if (currentTrack) {
                    socket.emit("now_playing", {
                        sessionId,
                        track: {
                            artist: currentTrack.artist,
                            title: currentTrack.title,
                            timestamp: currentTrack.timestamp.toISOString(),
                        },
                    });
                }
            });

            socket.on("disconnect", (reason) => {
                console.log("[Live] Disconnected from cloud:", reason);
                if (isLiveRef.current) {
                    setState((prev) => ({
                        ...prev,
                        status: "connecting",
                        error: `Disconnected: ${reason}`,
                    }));
                }
            });

            socket.on("connect_error", (error) => {
                console.error("[Live] Connection error:", error);
                setState((prev) => ({
                    ...prev,
                    status: "error",
                    error: error.message,
                }));
            });

            socket.on("reconnect", (attempt) => {
                console.log("[Live] Reconnected after", attempt, "attempts");
                setState((prev) => ({ ...prev, status: "live", error: null }));
            });
        } catch (e) {
            console.error("[Live] Failed to go live:", e);
            setState((prev) => ({
                ...prev,
                status: "error",
                error: String(e),
            }));
        }
    }, [state.status, getSessionId]);

    // End set - disconnect and stop watching
    const endSet = useCallback(() => {
        console.log("[Live] Ending set...");
        isLiveRef.current = false;

        // Disconnect socket
        if (socketRef.current) {
            socketRef.current.emit("end_session", { sessionId: sessionIdRef.current });
            socketRef.current.disconnect();
            socketRef.current = null;
        }

        // Stop watcher
        virtualDjWatcher.stopWatching();

        setState({
            status: "offline",
            nowPlaying: null,
            error: null,
            sessionId: null,
        });
        sessionIdRef.current = null;
    }, []);

    // Clear now playing (for when track stops)
    const clearNowPlaying = useCallback(() => {
        setState((prev) => ({ ...prev, nowPlaying: null }));

        // Emit to cloud
        if (isLiveRef.current && socketRef.current?.connected) {
            socketRef.current.emit("track_stopped", {
                sessionId: sessionIdRef.current,
            });
        }
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (socketRef.current) {
                socketRef.current.disconnect();
            }
            virtualDjWatcher.stopWatching();
        };
    }, []);

    return {
        ...state,
        isLive: state.status === "live",
        goLive,
        endSet,
        clearNowPlaying,
    };
}
