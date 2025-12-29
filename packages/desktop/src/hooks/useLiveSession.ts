import { useState, useEffect, useCallback, useRef } from "react";
import ReconnectingWebSocket from "reconnecting-websocket";
import { toast } from "sonner";
import {
    virtualDjWatcher,
    type NowPlayingTrack,
} from "../services/virtualDjWatcher";

// Cloud server URL - use env variable in production
const CLOUD_WS_URL = import.meta.env.VITE_CLOUD_WS_URL || "ws://localhost:3001/ws";

console.log("[Live] Cloud WS URL:", CLOUD_WS_URL);

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

    const socketRef = useRef<ReconnectingWebSocket | null>(null);
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

    // Send message to cloud
    const sendMessage = useCallback((message: object) => {
        if (socketRef.current?.readyState === WebSocket.OPEN) {
            socketRef.current.send(JSON.stringify(message));
            console.log("[Live] Sent:", message);
        }
    }, []);

    // Handle track changes from VirtualDJ - stable callback using refs
    const handleTrackChange = useCallback((track: NowPlayingTrack) => {
        console.log("[Live] Track changed:", track.artist, "-", track.title);

        setState((prev) => ({ ...prev, nowPlaying: track }));

        // Send to cloud if live
        if (isLiveRef.current && socketRef.current?.readyState === WebSocket.OPEN) {
            sendMessage({
                type: "BROADCAST_TRACK",
                sessionId: sessionIdRef.current,
                track: {
                    artist: track.artist,
                    title: track.title,
                },
            });
        }
    }, [sendMessage]);

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
            await virtualDjWatcher.startWatching(2000); // Poll every 2 seconds

            // Get the initial track immediately
            const initialTrack = virtualDjWatcher.getCurrentTrack();
            if (initialTrack) {
                console.log("[Live] Initial track found:", initialTrack.artist, "-", initialTrack.title);
                setState((prev) => ({ ...prev, nowPlaying: initialTrack }));
            }

            // Connect to cloud using ReconnectingWebSocket
            console.log("[Live] Connecting to cloud:", CLOUD_WS_URL);

            const socket = new ReconnectingWebSocket(CLOUD_WS_URL, [], {
                connectionTimeout: 5000,
                maxRetries: 10,
                maxReconnectionDelay: 10000,
                minReconnectionDelay: 1000,
            });

            socketRef.current = socket;

            socket.onopen = () => {
                console.log("[Live] Connected to cloud");
                isLiveRef.current = true;
                setState((prev) => ({ ...prev, status: "live", error: null }));

                // Register session
                sendMessage({
                    type: "REGISTER_SESSION",
                    sessionId,
                    djName: "DJ Pika", // TODO: Make configurable
                });

                // Send initial track if available
                const currentTrack = virtualDjWatcher.getCurrentTrack();
                if (currentTrack) {
                    sendMessage({
                        type: "BROADCAST_TRACK",
                        sessionId,
                        track: {
                            artist: currentTrack.artist,
                            title: currentTrack.title,
                        },
                    });
                }
            };

            socket.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
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
                        }
                    }
                } catch (e) {
                    console.error("[Live] Failed to parse message:", e);
                }
            };

            socket.onclose = (event) => {
                console.log("[Live] Disconnected from cloud:", event.code, event.reason);

                // ReconnectingWebSocket handles reconnection automatically
                // Just update UI to show reconnecting state
                if (isLiveRef.current) {
                    setState((prev) => ({
                        ...prev,
                        status: "connecting",
                        error: "Reconnecting...",
                    }));
                }
            };

            socket.onerror = () => {
                console.error("[Live] Connection error");
                if (isLiveRef.current) {
                    setState((prev) => ({
                        ...prev,
                        error: "Connection error - retrying...",
                    }));
                }
            };
        } catch (e) {
            console.error("[Live] Failed to go live:", e);
            setState((prev) => ({
                ...prev,
                status: "error",
                error: String(e),
            }));
        }
    }, [state.status, getSessionId, sendMessage]);

    // End set - disconnect and stop watching
    const endSet = useCallback(() => {
        console.log("[Live] Ending set...");
        isLiveRef.current = false;

        // Send end session message and close socket
        if (socketRef.current) {
            if (socketRef.current.readyState === WebSocket.OPEN) {
                sendMessage({
                    type: "END_SESSION",
                    sessionId: sessionIdRef.current,
                });
            }
            socketRef.current.close();
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
    }, [sendMessage]);

    // Clear now playing (for when track stops)
    const clearNowPlaying = useCallback(() => {
        setState((prev) => ({ ...prev, nowPlaying: null }));

        // Emit to cloud
        if (isLiveRef.current && socketRef.current?.readyState === WebSocket.OPEN) {
            sendMessage({
                type: "TRACK_STOPPED",
                sessionId: sessionIdRef.current,
            });
        }
    }, [sendMessage]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (socketRef.current) {
                socketRef.current.close();
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
