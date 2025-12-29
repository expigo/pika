import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { createBunWebSocket } from "hono/bun";
import type { ServerWebSocket } from "bun";
import {
    PIKA_VERSION,
    WebSocketMessageSchema,
    type WebSocketMessage,
    type TrackInfo,
} from "@pika/shared";

// Create WebSocket upgrader for Hono + Bun
const { upgradeWebSocket, websocket } = createBunWebSocket<ServerWebSocket>();

const app = new Hono();

// Middleware
app.use("*", logger());
app.use("*", cors());

// Active sessions store (for REST API)
interface LiveSession {
    sessionId: string;
    djName: string;
    startedAt: string;
    currentTrack?: TrackInfo;
}

const activeSessions = new Map<string, LiveSession>();

// Health check endpoint
app.get("/health", (c) => {
    return c.json({
        status: "ok",
        version: PIKA_VERSION,
        timestamp: new Date().toISOString(),
        activeSessions: activeSessions.size,
    });
});

// Root endpoint
app.get("/", (c) => {
    return c.json({
        name: "Pika! Cloud",
        version: PIKA_VERSION,
        message: "Welcome to Pika! Cloud API",
    });
});

// Get active sessions (REST endpoint)
app.get("/sessions", (c) => {
    const sessions = Array.from(activeSessions.values());
    return c.json(sessions);
});

// WebSocket route
app.get(
    "/ws",
    upgradeWebSocket((c) => {
        return {
            onOpen(event, ws) {
                console.log("🔌 Client connected");

                // Subscribe all clients to the live-session channel
                // This allows them to receive broadcasted messages
                const rawWs = ws.raw as ServerWebSocket;
                rawWs.subscribe("live-session");
            },

            onMessage(event, ws) {
                try {
                    const data = event.data.toString();
                    const json = JSON.parse(data);

                    // Validate message against Zod schema
                    const result = WebSocketMessageSchema.safeParse(json);

                    if (!result.success) {
                        console.error("❌ Invalid message schema:", result.error.format());
                        return; // Guard clause: reject malformed messages
                    }

                    const message: WebSocketMessage = result.data;
                    const rawWs = ws.raw as ServerWebSocket;

                    console.log(`📨 Received: ${message.type}`);

                    switch (message.type) {
                        case "REGISTER_SESSION": {
                            const sessionId = message.sessionId || `session_${Date.now()}`;
                            const session: LiveSession = {
                                sessionId,
                                djName: message.djName || "DJ",
                                startedAt: new Date().toISOString(),
                            };
                            activeSessions.set(sessionId, session);
                            console.log(`🎧 DJ going live: ${session.djName} (${sessionId})`);

                            // Confirm registration to the client
                            ws.send(JSON.stringify({
                                type: "SESSION_REGISTERED",
                                sessionId,
                            }));

                            // Broadcast to all subscribers that a new session started
                            rawWs.publish("live-session", JSON.stringify({
                                type: "SESSION_STARTED",
                                sessionId,
                                djName: session.djName,
                            }));
                            break;
                        }

                        case "BROADCAST_TRACK": {
                            const session = activeSessions.get(message.sessionId);
                            if (session) {
                                session.currentTrack = message.track;
                                console.log(`🎵 Now playing: ${message.track.artist} - ${message.track.title}`);

                                // CRITICAL: Broadcast to all subscribers
                                rawWs.publish("live-session", JSON.stringify({
                                    type: "NOW_PLAYING",
                                    sessionId: message.sessionId,
                                    djName: session.djName,
                                    track: message.track,
                                }));
                            }
                            break;
                        }

                        case "TRACK_STOPPED": {
                            const session = activeSessions.get(message.sessionId);
                            if (session) {
                                delete session.currentTrack;
                                console.log(`⏸️ Track stopped for session: ${message.sessionId}`);

                                rawWs.publish("live-session", JSON.stringify({
                                    type: "TRACK_STOPPED",
                                    sessionId: message.sessionId,
                                }));
                            }
                            break;
                        }

                        case "END_SESSION": {
                            const session = activeSessions.get(message.sessionId);
                            if (session) {
                                console.log(`👋 Session ended: ${session.djName}`);
                                activeSessions.delete(message.sessionId);

                                rawWs.publish("live-session", JSON.stringify({
                                    type: "SESSION_ENDED",
                                    sessionId: message.sessionId,
                                }));
                            }
                            break;
                        }

                        case "SEND_LIKE": {
                            // A listener sent a like for the current track
                            const track = message.payload.track;
                            console.log(`❤️ Like received for: ${track.title}`);

                            // Broadcast to all clients (including DJ)
                            rawWs.publish("live-session", JSON.stringify({
                                type: "LIKE_RECEIVED",
                                payload: { track },
                            }));
                            break;
                        }

                        case "SUBSCRIBE": {
                            // Client wants to subscribe to updates (web frontend)
                            console.log("👀 Listener subscribed to live-session channel");

                            // Send current sessions list
                            const sessions = Array.from(activeSessions.values());
                            ws.send(JSON.stringify({
                                type: "SESSIONS_LIST",
                                sessions,
                            }));
                            break;
                        }

                        // Server messages (should not be received from clients)
                        case "SESSION_REGISTERED":
                        case "SESSION_STARTED":
                        case "NOW_PLAYING":
                        case "SESSION_ENDED":
                        case "SESSIONS_LIST":
                        case "LIKE_RECEIVED": {
                            console.log(`⚠️ Unexpected server message from client: ${message.type}`);
                            break;
                        }
                    }
                } catch (e) {
                    console.error("❌ Failed to parse message:", e);
                }
            },

            onClose(event, ws) {
                console.log("❌ Client disconnected");

                // Note: We could clean up sessions here if we tracked which socket owns which session
                // For MVP, sessions persist until explicitly ended
            },

            onError(event, ws) {
                console.error("⚠️ WebSocket error:", event);
            },
        };
    })
);

// Start the server
const port = Number(process.env["PORT"] ?? 3001);

console.log(`🚀 Pika! Cloud server starting on http://localhost:${port}`);
console.log(`📡 WebSocket endpoint: ws://localhost:${port}/ws`);

export default {
    port,
    fetch: app.fetch,
    websocket, // CRITICAL: Export websocket handler for Bun
};
