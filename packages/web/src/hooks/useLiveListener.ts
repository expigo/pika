"use client";

import { useState, useEffect, useRef } from "react";
import ReconnectingWebSocket from "reconnecting-websocket";

// Get WebSocket URL dynamically based on page location
// This allows mobile devices on the same network to connect
function getWebSocketUrl(): string {
    // Allow override via env variable
    if (process.env.NEXT_PUBLIC_CLOUD_WS_URL) {
        return process.env.NEXT_PUBLIC_CLOUD_WS_URL;
    }

    // In browser, use same host as page but port 3001
    if (typeof window !== "undefined") {
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const hostname = window.location.hostname;
        return `${protocol}//${hostname}:3001/ws`;
    }

    // Fallback for SSR
    return "ws://localhost:3001/ws";
}

export type ConnectionStatus = "connecting" | "connected" | "disconnected";

interface LiveState {
    status: ConnectionStatus;
    currentTrack: { artist: string; title: string } | null;
    djName: string | null;
    sessionId: string | null;
}

interface WSMessage {
    type: string;
    sessionId?: string;
    djName?: string;
    track?: {
        artist: string;
        title: string;
    };
    sessions?: Array<{
        sessionId: string;
        djName: string;
        currentTrack?: {
            artist: string;
            title: string;
        };
    }>;
}

export function useLiveListener() {
    const [state, setState] = useState<LiveState>({
        status: "connecting",
        currentTrack: null,
        djName: null,
        sessionId: null,
    });

    const socketRef = useRef<ReconnectingWebSocket | null>(null);

    useEffect(() => {
        const wsUrl = getWebSocketUrl();
        console.log("[Listener] Connecting to:", wsUrl);

        const socket = new ReconnectingWebSocket(wsUrl, [], {
            connectionTimeout: 5000,
            maxRetries: Infinity, // Keep trying forever
            maxReconnectionDelay: 10000,
            minReconnectionDelay: 1000,
        });

        socketRef.current = socket;

        socket.onopen = () => {
            console.log("[Listener] Connected to cloud");
            setState((prev) => ({ ...prev, status: "connected" }));

            // Subscribe to live updates
            socket.send(JSON.stringify({ type: "SUBSCRIBE" }));
        };

        socket.onmessage = (event) => {
            try {
                const message: WSMessage = JSON.parse(event.data);
                console.log("[Listener] Received:", message);

                switch (message.type) {
                    case "SESSIONS_LIST": {
                        // Initial sessions list when we subscribe
                        if (message.sessions && message.sessions.length > 0) {
                            const session = message.sessions[0]; // Take first active session
                            setState((prev) => ({
                                ...prev,
                                sessionId: session.sessionId,
                                djName: session.djName,
                                currentTrack: session.currentTrack || null,
                            }));
                        }
                        break;
                    }

                    case "SESSION_STARTED": {
                        setState((prev) => ({
                            ...prev,
                            sessionId: message.sessionId || null,
                            djName: message.djName || null,
                            currentTrack: null,
                        }));
                        break;
                    }

                    case "NOW_PLAYING": {
                        if (message.track) {
                            setState((prev) => ({
                                ...prev,
                                sessionId: message.sessionId || prev.sessionId,
                                djName: message.djName || prev.djName,
                                currentTrack: message.track || null,
                            }));
                        }
                        break;
                    }

                    case "TRACK_STOPPED": {
                        setState((prev) => ({
                            ...prev,
                            currentTrack: null,
                        }));
                        break;
                    }

                    case "SESSION_ENDED": {
                        setState((prev) => ({
                            ...prev,
                            sessionId: null,
                            djName: null,
                            currentTrack: null,
                        }));
                        break;
                    }
                }
            } catch (e) {
                console.error("[Listener] Failed to parse message:", e);
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
    }, []);

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

