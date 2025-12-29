"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import ReconnectingWebSocket from "reconnecting-websocket";
import { parseWebSocketMessage, type TrackInfo } from "@pika/shared";

// Get WebSocket URL dynamically based on page location
function getWebSocketUrl(): string {
    if (process.env.NEXT_PUBLIC_CLOUD_WS_URL) {
        return process.env.NEXT_PUBLIC_CLOUD_WS_URL;
    }

    if (typeof window !== "undefined") {
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const hostname = window.location.hostname;
        return `${protocol}//${hostname}:3001/ws`;
    }

    return "ws://localhost:3001/ws";
}

// Get API base URL for REST calls
function getApiBaseUrl(): string {
    if (process.env.NEXT_PUBLIC_CLOUD_API_URL) {
        return process.env.NEXT_PUBLIC_CLOUD_API_URL;
    }

    if (typeof window !== "undefined") {
        const protocol = window.location.protocol;
        const hostname = window.location.hostname;
        return `${protocol}//${hostname}:3001`;
    }

    return "http://localhost:3001";
}

export type ConnectionStatus = "connecting" | "connected" | "disconnected";

// History track with timestamp
export interface HistoryTrack extends TrackInfo {
    id?: number;
    playedAt?: string;
}

interface LiveState {
    status: ConnectionStatus;
    currentTrack: TrackInfo | null;
    djName: string | null;
    sessionId: string | null;
    history: HistoryTrack[];
}

const MAX_HISTORY = 5;

/**
 * Hook for listening to live DJ sessions via WebSocket.
 * 
 * @param targetSessionId - Optional. If provided, only listen to this specific session.
 *                          If undefined, auto-join the first active session.
 */
export function useLiveListener(targetSessionId?: string) {
    const [state, setState] = useState<LiveState>({
        status: "connecting",
        currentTrack: null,
        djName: null,
        // If targeting a specific session, set it immediately
        sessionId: targetSessionId ?? null,
        history: [],
    });

    const socketRef = useRef<ReconnectingWebSocket | null>(null);

    // Fetch history from REST API
    const fetchHistory = useCallback(async (sessionId: string) => {
        try {
            const baseUrl = getApiBaseUrl();
            const response = await fetch(`${baseUrl}/api/session/${sessionId}/history`);
            if (response.ok) {
                const tracks: HistoryTrack[] = await response.json();
                setState((prev) => ({
                    ...prev,
                    // Skip the first track (it's the current one)
                    history: tracks.slice(1),
                }));
                console.log("[Listener] Fetched history:", tracks.length, "tracks");
            }
        } catch (e) {
            console.error("[Listener] Failed to fetch history:", e);
        }
    }, []);

    useEffect(() => {
        const wsUrl = getWebSocketUrl();
        console.log("[Listener] Connecting to:", wsUrl);
        if (targetSessionId) {
            console.log("[Listener] Targeting specific session:", targetSessionId);
        }

        const socket = new ReconnectingWebSocket(wsUrl, [], {
            connectionTimeout: 5000,
            maxRetries: Infinity,
            maxReconnectionDelay: 10000,
            minReconnectionDelay: 1000,
        });

        socketRef.current = socket;

        socket.onopen = () => {
            console.log("[Listener] Connected to cloud");
            setState((prev) => ({ ...prev, status: "connected" }));
            socket.send(JSON.stringify({ type: "SUBSCRIBE" }));

            // If targeting a specific session, fetch its history immediately
            if (targetSessionId) {
                fetchHistory(targetSessionId);
            }
        };

        socket.onmessage = (event) => {
            const message = parseWebSocketMessage(event.data);
            if (!message) {
                console.error("[Listener] Failed to parse message:", event.data);
                return;
            }

            console.log("[Listener] Received:", message);

            switch (message.type) {
                case "SESSIONS_LIST": {
                    // Only auto-join if NOT targeting a specific session
                    if (!targetSessionId && message.sessions && message.sessions.length > 0) {
                        const session = message.sessions[0];
                        setState((prev) => ({
                            ...prev,
                            sessionId: session.sessionId,
                            djName: session.djName,
                            currentTrack: session.currentTrack || null,
                        }));
                        // Fetch initial history
                        fetchHistory(session.sessionId);
                    }
                    break;
                }

                case "SESSION_STARTED": {
                    // Filter: Only handle if matches target or no target set
                    if (targetSessionId && message.sessionId !== targetSessionId) {
                        return;
                    }

                    setState((prev) => ({
                        ...prev,
                        sessionId: message.sessionId || null,
                        djName: message.djName || null,
                        currentTrack: null,
                        history: [], // Clear history for new session
                    }));
                    break;
                }

                case "NOW_PLAYING": {
                    // Filter: Only handle if matches target or no target set
                    if (targetSessionId && message.sessionId !== targetSessionId) {
                        return;
                    }

                    if (message.track) {
                        setState((prev) => {
                            // Get the previous track before updating
                            const prevTrack = prev.currentTrack;

                            // Build new history by prepending previous track (if exists and different)
                            let newHistory = prev.history;
                            if (prevTrack &&
                                (prevTrack.artist !== message.track.artist ||
                                    prevTrack.title !== message.track.title)) {
                                // Prepend previous track to history, keep max 5
                                newHistory = [
                                    { ...prevTrack, playedAt: new Date().toISOString() },
                                    ...prev.history,
                                ].slice(0, MAX_HISTORY);
                            }

                            return {
                                ...prev,
                                sessionId: message.sessionId || prev.sessionId,
                                djName: message.djName || prev.djName,
                                currentTrack: message.track || null,
                                history: newHistory,
                            };
                        });
                    }
                    break;
                }

                case "TRACK_STOPPED": {
                    // Filter: Only handle if matches target or current session
                    if (targetSessionId && message.sessionId !== targetSessionId) {
                        return;
                    }

                    setState((prev) => {
                        // Only handle if this is for our session
                        if (prev.sessionId && message.sessionId !== prev.sessionId) {
                            return prev;
                        }

                        // Move current track to history if exists
                        let newHistory = prev.history;
                        if (prev.currentTrack) {
                            newHistory = [
                                { ...prev.currentTrack, playedAt: new Date().toISOString() },
                                ...prev.history,
                            ].slice(0, MAX_HISTORY);
                        }

                        return {
                            ...prev,
                            currentTrack: null,
                            history: newHistory,
                        };
                    });
                    break;
                }

                case "SESSION_ENDED": {
                    // Filter: Only handle if matches target or current session
                    if (targetSessionId && message.sessionId !== targetSessionId) {
                        return;
                    }

                    setState((prev) => {
                        // Only reset if this is for our session
                        if (prev.sessionId && message.sessionId !== prev.sessionId) {
                            return prev;
                        }

                        return {
                            ...prev,
                            sessionId: targetSessionId ?? null, // Keep target if specified
                            djName: null,
                            currentTrack: null,
                            history: [],
                        };
                    });
                    break;
                }
            }
        };

        socket.onclose = () => {
            console.log("[Listener] Disconnected from cloud");
            setState((prev) => ({ ...prev, status: "disconnected" }));
        };

        socket.onerror = () => {
            console.error("[Listener] Connection error");
        };

        return () => {
            socket.close();
        };
    }, [targetSessionId, fetchHistory]);

    // Send a like for the current track
    const sendLike = (track: { artist: string; title: string }) => {
        if (socketRef.current?.readyState === WebSocket.OPEN) {
            socketRef.current.send(JSON.stringify({
                type: "SEND_LIKE",
                payload: { track },
            }));
            console.log("[Listener] Sent like for:", track.title);
        }
    };

    return { ...state, sendLike };
}
