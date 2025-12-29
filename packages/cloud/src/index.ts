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
import { db, schema } from "./db";

// Create WebSocket upgrader for Hono + Bun
const { upgradeWebSocket, websocket } = createBunWebSocket<ServerWebSocket>();

const app = new Hono();

// Middleware
app.use("*", logger());
app.use("*", cors());

// Active sessions store (for WebSocket connections - in-memory)
interface LiveSession {
    sessionId: string;
    djName: string;
    startedAt: string;
    currentTrack?: TrackInfo;
}

const activeSessions = new Map<string, LiveSession>();

// ============================================================================
// Database Persistence Helpers
// ============================================================================

// Track which sessions have been persisted to avoid race conditions
const persistedSessions = new Set<string>();

/**
 * Persist session to database - MUST complete before tracks can be saved
 */
async function persistSession(sessionId: string, djName: string): Promise<boolean> {
    try {
        await db.insert(schema.sessions).values({
            id: sessionId,
            djName,
        }).onConflictDoNothing();
        persistedSessions.add(sessionId);
        console.log(`💾 Session persisted: ${sessionId}`);
        return true;
    } catch (e) {
        console.error("❌ Failed to persist session:", e);
        return false;
    }
}

/**
 * Persist played track to database
 * Only persists if session already exists in DB
 */
async function persistTrack(sessionId: string, track: TrackInfo): Promise<void> {
    // Wait for session to be persisted (with timeout)
    let attempts = 0;
    while (!persistedSessions.has(sessionId) && attempts < 10) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
    }

    if (!persistedSessions.has(sessionId)) {
        console.warn(`⚠️ Session ${sessionId} not persisted yet, skipping track`);
        return;
    }

    try {
        await db.insert(schema.playedTracks).values({
            sessionId,
            artist: track.artist,
            title: track.title,
        });
        console.log(`💾 Track persisted: ${track.artist} - ${track.title}`);
    } catch (e) {
        console.error("❌ Failed to persist track:", e);
    }
}

/**
 * Persist like to database (fire-and-forget)
 */
async function persistLike(track: TrackInfo, sessionId?: string): Promise<void> {
    try {
        await db.insert(schema.likes).values({
            sessionId: sessionId ?? null,
            trackArtist: track.artist,
            trackTitle: track.title,
        });
        console.log(`💾 Like persisted: ${track.title}`);
    } catch (e) {
        console.error("❌ Failed to persist like:", e);
    }
}

/**
 * Mark session as ended in database
 */
async function endSessionInDb(sessionId: string): Promise<void> {
    try {
        const { eq } = await import("drizzle-orm");
        await db.update(schema.sessions)
            .set({ endedAt: new Date() })
            .where(eq(schema.sessions.id, sessionId));
        persistedSessions.delete(sessionId);
        console.log(`💾 Session ended in DB: ${sessionId}`);
    } catch (e) {
        console.error("❌ Failed to end session in DB:", e);
    }
}

// ============================================================================
// REST Endpoints
// ============================================================================

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

// Get session track history (last 5 tracks)
app.get("/api/session/:sessionId/history", async (c) => {
    const sessionId = c.req.param("sessionId");

    try {
        const { desc, eq } = await import("drizzle-orm");
        const tracks = await db
            .select({
                id: schema.playedTracks.id,
                artist: schema.playedTracks.artist,
                title: schema.playedTracks.title,
                playedAt: schema.playedTracks.playedAt,
            })
            .from(schema.playedTracks)
            .where(eq(schema.playedTracks.sessionId, sessionId))
            .orderBy(desc(schema.playedTracks.playedAt))
            .limit(5);

        return c.json(tracks);
    } catch (e) {
        console.error("Failed to fetch history:", e);
        return c.json([], 500);
    }
});

// ============================================================================
// WebSocket Handler
// ============================================================================

app.get(
    "/ws",
    upgradeWebSocket((c) => {
        return {
            onOpen(event, ws) {
                console.log("🔌 Client connected");

                // Subscribe all clients to the live-session channel
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
                        return;
                    }

                    const message: WebSocketMessage = result.data;
                    const rawWs = ws.raw as ServerWebSocket;

                    console.log(`📨 Received: ${message.type}`);

                    switch (message.type) {
                        case "REGISTER_SESSION": {
                            const sessionId = message.sessionId || `session_${Date.now()}`;
                            const djName = message.djName || "DJ";
                            const session: LiveSession = {
                                sessionId,
                                djName,
                                startedAt: new Date().toISOString(),
                            };
                            activeSessions.set(sessionId, session);
                            console.log(`🎧 DJ going live: ${djName} (${sessionId})`);

                            // 💾 Persist to database
                            persistSession(sessionId, djName);

                            // Confirm registration to the client
                            ws.send(JSON.stringify({
                                type: "SESSION_REGISTERED",
                                sessionId,
                            }));

                            // Broadcast to all subscribers
                            rawWs.publish("live-session", JSON.stringify({
                                type: "SESSION_STARTED",
                                sessionId,
                                djName,
                            }));
                            break;
                        }

                        case "BROADCAST_TRACK": {
                            const session = activeSessions.get(message.sessionId);
                            if (session) {
                                session.currentTrack = message.track;
                                console.log(`🎵 Now playing: ${message.track.artist} - ${message.track.title}`);

                                // 💾 Persist to database
                                persistTrack(message.sessionId, message.track);

                                // Broadcast to all subscribers
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

                                // 💾 Update in database
                                endSessionInDb(message.sessionId);

                                rawWs.publish("live-session", JSON.stringify({
                                    type: "SESSION_ENDED",
                                    sessionId: message.sessionId,
                                }));
                            }
                            break;
                        }

                        case "SEND_LIKE": {
                            const track = message.payload.track;
                            console.log(`❤️ Like received for: ${track.title}`);

                            // 💾 Persist to database (find active session for context)
                            const activeSessionIds = Array.from(activeSessions.keys());
                            persistLike(track, activeSessionIds[0]);

                            // Broadcast to all clients (including DJ)
                            rawWs.publish("live-session", JSON.stringify({
                                type: "LIKE_RECEIVED",
                                payload: { track },
                            }));
                            break;
                        }

                        case "SUBSCRIBE": {
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
            },

            onError(event, ws) {
                console.error("⚠️ WebSocket error:", event);
            },
        };
    })
);

// ============================================================================
// Start Server
// ============================================================================

const port = Number(process.env["PORT"] ?? 3001);

console.log(`🚀 Pika! Cloud server starting on http://localhost:${port}`);
console.log(`📡 WebSocket endpoint: ws://localhost:${port}/ws`);
console.log(`💾 Database: ${process.env["DATABASE_URL"] ? "configured" : "localhost (default)"}`);

export default {
    port,
    fetch: app.fetch,
    websocket,
};
