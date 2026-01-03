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

// ============================================================================
// Persistent Client ID - survives page reloads
// ============================================================================
const CLIENT_ID_KEY = "pika_client_id";

function getOrCreateClientId(): string {
    if (typeof window === "undefined") {
        return `server_${Date.now()}`;
    }

    let clientId = localStorage.getItem(CLIENT_ID_KEY);
    if (!clientId) {
        // Generate a UUID-like ID
        clientId = `client_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
        localStorage.setItem(CLIENT_ID_KEY, clientId);
    }
    return clientId;
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
    likedTracks: Set<string>; // Track keys that user has liked (artist:title)
    listenerCount: number;    // Number of connected dancers
}

const MAX_HISTORY = 5;

function getTrackKey(track: TrackInfo): string {
    return `${track.artist}:${track.title}`;
}

// ============================================================================
// Persist liked tracks in localStorage (per session)
// ============================================================================
const LIKED_TRACKS_KEY = "pika_liked_tracks";

function loadLikedTracks(): Set<string> {
    if (typeof window === "undefined") return new Set();
    try {
        const stored = localStorage.getItem(LIKED_TRACKS_KEY);
        if (stored) {
            return new Set(JSON.parse(stored));
        }
    } catch (e) {
        console.error("Failed to load liked tracks:", e);
    }
    return new Set();
}

function saveLikedTracks(tracks: Set<string>): void {
    if (typeof window === "undefined") return;
    try {
        localStorage.setItem(LIKED_TRACKS_KEY, JSON.stringify([...tracks]));
    } catch (e) {
        console.error("Failed to save liked tracks:", e);
    }
}

function clearLikedTracks(): void {
    if (typeof window === "undefined") return;
    localStorage.removeItem(LIKED_TRACKS_KEY);
}

/**
 * Hook for listening to live DJ sessions via WebSocket.
 * 
 * @param targetSessionId - Optional. If provided, only listen to this specific session.
 *                          If undefined, auto-join the first active session.
 */
export function useLiveListener(targetSessionId?: string) {
    const [state, setState] = useState<LiveState>(() => ({
        status: "connecting",
        currentTrack: null,
        djName: null,
        // If targeting a specific session, set it immediately
        sessionId: targetSessionId ?? null,
        history: [],
        likedTracks: loadLikedTracks(), // Restore from localStorage
        listenerCount: 0,
    }));

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
        const clientId = getOrCreateClientId();
        console.log("[Listener] Connecting to:", wsUrl, "as client:", clientId);
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
            // Send SUBSCRIBE with persistent clientId for like tracking
            socket.send(JSON.stringify({
                type: "SUBSCRIBE",
                clientId,
            }));

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
                    if (message.sessions && message.sessions.length > 0) {
                        if (targetSessionId) {
                            // Find the specific session we're targeting
                            const targetSession = message.sessions.find(
                                (s: { sessionId: string }) => s.sessionId === targetSessionId
                            );
                            if (targetSession) {
                                setState((prev) => ({
                                    ...prev,
                                    sessionId: targetSession.sessionId,
                                    djName: targetSession.djName,
                                    currentTrack: targetSession.currentTrack || null,
                                }));
                                // Fetch history for target session
                                fetchHistory(targetSession.sessionId);
                            }
                        } else {
                            // Auto-join first session if not targeting specific one
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

                    // Clear liked tracks for new session
                    clearLikedTracks();

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
                            likedTracks: new Set(), // Reset likes
                            listenerCount: 0, // Reset count
                        };
                    });
                    break;
                }

                case "LISTENER_COUNT": {
                    const count = (message as { type: "LISTENER_COUNT"; count: number }).count;
                    setState((prev) => ({ ...prev, listenerCount: count }));
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

    // Send a like for the current track (returns true if sent, false if already liked)
    const sendLike = useCallback((track: { artist: string; title: string }): boolean => {
        const trackKey = getTrackKey(track as TrackInfo);

        // Check if already liked
        if (state.likedTracks.has(trackKey)) {
            console.log("[Listener] Already liked:", track.title);
            return false;
        }

        if (socketRef.current?.readyState === WebSocket.OPEN) {
            socketRef.current.send(JSON.stringify({
                type: "SEND_LIKE",
                clientId: getOrCreateClientId(),
                payload: { track },
            }));

            // Optimistically mark as liked and persist to localStorage
            const newLikedTracks = new Set([...state.likedTracks, trackKey]);
            setState((prev) => ({
                ...prev,
                likedTracks: newLikedTracks,
            }));
            saveLikedTracks(newLikedTracks);

            console.log("[Listener] Sent like for:", track.title);
            return true;
        }
        return false;
    }, [state.likedTracks]);

    // Check if a track has been liked
    const hasLiked = useCallback((track: { artist: string; title: string }): boolean => {
        return state.likedTracks.has(getTrackKey(track as TrackInfo));
    }, [state.likedTracks]);

    return { ...state, sendLike, hasLiked };
}
