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
// Listener Count Tracking (Per-Session)
// ============================================================================
// Track connected listeners (dancers) per session for accurate crowd size
// Map: sessionId -> Set<clientId>
const sessionListeners = new Map<string, Set<string>>();
const djConnections = new Set<string>(); // Track DJ connections to exclude from count

// Get listener count for a specific session
function getListenerCount(sessionId: string): number {
    return sessionListeners.get(sessionId)?.size ?? 0;
}

// Add listener to a session
function addListener(sessionId: string, clientId: string): void {
    if (!sessionListeners.has(sessionId)) {
        sessionListeners.set(sessionId, new Set());
    }
    sessionListeners.get(sessionId)!.add(clientId);
}

// Remove listener from a session
function removeListener(sessionId: string, clientId: string): void {
    sessionListeners.get(sessionId)?.delete(clientId);
}

// ============================================================================
// Rate Limiting: Track likes per client per track
// ============================================================================
// Uses persistent clientId sent from the web client (stored in localStorage)
// This survives page reloads, so users can't abuse by refreshing
const likesSent = new Map<string, Set<string>>();

function getTrackKey(track: TrackInfo): string {
    return `${track.artist}:${track.title}`;
}

// ============================================================================
// Tempo Feedback Tracking
// ============================================================================
// Track tempo preferences from dancers (faster/slower/perfect)
// Each vote has a timestamp for decay (votes fade after 5 minutes)

interface TempoVote {
    preference: "faster" | "slower" | "perfect";
    timestamp: number;
}

// Map: sessionId -> Map<clientId, TempoVote>
const tempoVotes = new Map<string, Map<string, TempoVote>>();

// Vote expires after 5 minutes (300,000ms)
const TEMPO_VOTE_TTL = 5 * 60 * 1000;

function getTempoFeedback(sessionId: string) {
    const votes = tempoVotes.get(sessionId);
    if (!votes) {
        return { faster: 0, slower: 0, perfect: 0, total: 0 };
    }

    const now = Date.now();
    let faster = 0;
    let slower = 0;
    let perfect = 0;

    // Count non-expired votes
    for (const [clientId, vote] of votes.entries()) {
        if (now - vote.timestamp > TEMPO_VOTE_TTL) {
            // Remove expired vote
            votes.delete(clientId);
            continue;
        }

        switch (vote.preference) {
            case "faster": faster++; break;
            case "slower": slower++; break;
            case "perfect": perfect++; break;
        }
    }

    return { faster, slower, perfect, total: faster + slower + perfect };
}

function hasLikedTrack(clientId: string, track: TrackInfo): boolean {
    const clientLikes = likesSent.get(clientId);
    if (!clientLikes) return false;
    return clientLikes.has(getTrackKey(track));
}

function recordLike(clientId: string, track: TrackInfo): void {
    if (!likesSent.has(clientId)) {
        likesSent.set(clientId, new Set());
    }
    likesSent.get(clientId)!.add(getTrackKey(track));
}

// Clean up likes when session ends
function clearLikesForSession(): void {
    likesSent.clear();
}

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
 * @param track - The track that was liked
 * @param sessionId - The session ID (for context)
 * @param clientId - The client who liked it (for "my likes" feature)
 */
async function persistLike(track: TrackInfo, sessionId?: string, clientId?: string): Promise<void> {
    try {
        await db.insert(schema.likes).values({
            sessionId: sessionId ?? null,
            clientId: clientId ?? null,
            trackArtist: track.artist,
            trackTitle: track.title,
        });
        console.log(`💾 Like persisted: ${track.title} (client: ${clientId?.substring(0, 20)}...)`);
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

// Get full session recap (all tracks + metadata)
app.get("/api/session/:sessionId/recap", async (c) => {
    const sessionId = c.req.param("sessionId");

    try {
        const { eq, count } = await import("drizzle-orm");

        // Get session metadata from database (activeSessions is cleared when session ends)
        const sessionData = await db
            .select({
                id: schema.sessions.id,
                djName: schema.sessions.djName,
            })
            .from(schema.sessions)
            .where(eq(schema.sessions.id, sessionId))
            .limit(1);

        const dbSession = sessionData[0];

        // Get all tracks for this session
        const tracks = await db
            .select({
                id: schema.playedTracks.id,
                artist: schema.playedTracks.artist,
                title: schema.playedTracks.title,
                playedAt: schema.playedTracks.playedAt,
            })
            .from(schema.playedTracks)
            .where(eq(schema.playedTracks.sessionId, sessionId))
            .orderBy(schema.playedTracks.playedAt);

        if (tracks.length === 0) {
            console.log(`📭 Recap not found for session: ${sessionId} (no tracks in database)`);
            return c.json({ error: "Session not found" }, 404);
        }

        // Get total likes count for this session
        const likesResult = await db
            .select({ count: count() })
            .from(schema.likes)
            .where(eq(schema.likes.sessionId, sessionId));

        const totalLikes = likesResult[0]?.count || 0;

        // Get per-track like counts
        const { and } = await import("drizzle-orm");
        const trackLikeCounts = new Map<string, number>();

        for (const track of tracks) {
            const likeCount = await db
                .select({ count: count() })
                .from(schema.likes)
                .where(and(
                    eq(schema.likes.sessionId, sessionId),
                    eq(schema.likes.trackArtist, track.artist),
                    eq(schema.likes.trackTitle, track.title)
                ));
            trackLikeCounts.set(`${track.artist}:${track.title}`, likeCount[0]?.count || 0);
        }

        // Calculate session stats
        const firstTrack = tracks[0];
        const lastTrack = tracks[tracks.length - 1];
        const startTime = firstTrack?.playedAt;
        const endTime = lastTrack?.playedAt;

        return c.json({
            sessionId,
            djName: dbSession?.djName || "DJ",
            startedAt: startTime,
            endedAt: endTime,
            trackCount: tracks.length,
            totalLikes,
            tracks: tracks.map((t, index) => ({
                position: index + 1,
                artist: t.artist,
                title: t.title,
                playedAt: t.playedAt,
                likes: trackLikeCounts.get(`${t.artist}:${t.title}`) || 0,
            })),
        });
    } catch (e) {
        console.error("Failed to fetch recap:", e);
        return c.json({ error: "Failed to fetch recap" }, 500);
    }
});

// ============================================================================
// My Likes API (for dancers to see their liked songs)
// ============================================================================

/**
 * Get all likes for a specific client.
 * Returns likes grouped by session with DJ info.
 */
app.get("/api/client/:clientId/likes", async (c) => {
    const clientId = c.req.param("clientId");

    // Basic validation: client IDs have a specific format
    if (!clientId || !clientId.startsWith("client_")) {
        return c.json({ error: "Invalid client ID" }, 400);
    }

    try {
        const { eq, desc } = await import("drizzle-orm");

        // Get all likes for this client, ordered by most recent first
        const likes = await db
            .select({
                id: schema.likes.id,
                sessionId: schema.likes.sessionId,
                trackArtist: schema.likes.trackArtist,
                trackTitle: schema.likes.trackTitle,
                createdAt: schema.likes.createdAt,
            })
            .from(schema.likes)
            .where(eq(schema.likes.clientId, clientId))
            .orderBy(desc(schema.likes.createdAt))
            .limit(100);  // Reasonable limit

        // Get session info for each unique session
        const sessionIds = [...new Set(likes.map(l => l.sessionId).filter(Boolean))];
        const sessionsMap = new Map<string, { djName: string; startedAt: Date | null }>();

        for (const sessionId of sessionIds) {
            if (!sessionId) continue;
            const session = await db
                .select({
                    djName: schema.sessions.djName,
                    startedAt: schema.sessions.startedAt,
                })
                .from(schema.sessions)
                .where(eq(schema.sessions.id, sessionId))
                .limit(1);
            if (session[0]) {
                sessionsMap.set(sessionId, session[0]);
            }
        }

        // Enrich likes with session info
        const enrichedLikes = likes.map(like => ({
            id: like.id,
            sessionId: like.sessionId,
            djName: like.sessionId ? sessionsMap.get(like.sessionId)?.djName : null,
            sessionDate: like.sessionId ? sessionsMap.get(like.sessionId)?.startedAt : null,
            artist: like.trackArtist,
            title: like.trackTitle,
            likedAt: like.createdAt,
        }));

        return c.json({
            clientId,
            totalLikes: enrichedLikes.length,
            likes: enrichedLikes,
        });
    } catch (e) {
        console.error("Failed to fetch client likes:", e);
        return c.json({ error: "Failed to fetch likes" }, 500);
    }
});

// ============================================================================
// DJ Profile API
// ============================================================================

// Helper: Convert DJ name to slug
function slugify(name: string): string {
    return name
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[\s_]+/g, "-")
        .replace(/[^a-z0-9-]/g, "")
        .replace(/-+/g, "-")
        .replace(/^-+|-+$/g, "");
}

// Get DJ profile by slug
app.get("/api/dj/:slug", async (c) => {
    const slug = c.req.param("slug");

    try {
        const { eq, count, sql, desc } = await import("drizzle-orm");

        // Find all sessions where DJ name slugifies to this slug
        const allSessions = await db
            .select({
                id: schema.sessions.id,
                djName: schema.sessions.djName,
                startedAt: schema.sessions.startedAt,
                endedAt: schema.sessions.endedAt,
            })
            .from(schema.sessions)
            .orderBy(desc(schema.sessions.startedAt));

        // Filter sessions by slug match
        const djSessions = allSessions.filter(
            (session) => slugify(session.djName) === slug
        );

        if (djSessions.length === 0) {
            return c.json({ error: "DJ not found" }, 404);
        }

        // Get the DJ name from first session (we already checked length > 0 above)
        const firstSession = djSessions[0]!;
        const djName = firstSession.djName;

        // Get track counts for each session
        const sessionsWithCounts = await Promise.all(
            djSessions.map(async (session) => {
                const trackCountResult = await db
                    .select({ count: count() })
                    .from(schema.playedTracks)
                    .where(eq(schema.playedTracks.sessionId, session.id));

                return {
                    id: session.id,
                    djName: session.djName,
                    startedAt: session.startedAt?.toISOString() || new Date().toISOString(),
                    endedAt: session.endedAt?.toISOString() || null,
                    trackCount: trackCountResult[0]?.count || 0,
                };
            })
        );

        // Calculate totals
        const totalSessions = sessionsWithCounts.length;
        const totalTracks = sessionsWithCounts.reduce((sum, s) => sum + s.trackCount, 0);

        return c.json({
            slug,
            djName,
            sessions: sessionsWithCounts.slice(0, 20), // Limit to 20 most recent
            totalSessions,
            totalTracks,
        });
    } catch (e) {
        console.error("Failed to fetch DJ profile:", e);
        return c.json({ error: "Failed to fetch DJ profile" }, 500);
    }
});

// ============================================================================
// WebSocket Handler
// ============================================================================

app.get(
    "/ws",
    upgradeWebSocket((c) => {
        // clientId will be set when client sends SUBSCRIBE with their persistent ID
        let clientId: string | null = null;
        // Track if this connection is a listener (dancer) vs DJ
        let isListener = false;
        // Track which session this listener is subscribed to
        let subscribedSessionId: string | null = null;

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

                    // Extract clientId from message if present (for SUBSCRIBE and SEND_LIKE)
                    // Only log the first time we identify this client on this connection
                    if (json.clientId && !clientId) {
                        clientId = json.clientId;
                        console.log(`📋 Client identified: ${clientId}`);
                    } else if (json.clientId) {
                        clientId = json.clientId;  // Update silently
                    }

                    // Validate message against Zod schema
                    const result = WebSocketMessageSchema.safeParse(json);

                    if (!result.success) {
                        console.error("❌ Invalid message schema:", result.error.format());
                        return;
                    }

                    const message: WebSocketMessage = result.data;
                    const rawWs = ws.raw as ServerWebSocket;

                    // Skip logging frequent messages (SUBSCRIBE is logged separately when new)
                    if (message.type !== "SUBSCRIBE") {
                        console.log(`📨 Received: ${message.type}`);
                    }

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

                                // Clear like tracking for new session
                                clearLikesForSession();

                                rawWs.publish("live-session", JSON.stringify({
                                    type: "SESSION_ENDED",
                                    sessionId: message.sessionId,
                                }));
                            }
                            break;
                        }

                        case "SEND_LIKE": {
                            const track = message.payload.track;

                            // Require clientId for rate limiting
                            if (!clientId) {
                                console.log("⚠️ Like rejected: no clientId provided");
                                ws.send(JSON.stringify({
                                    type: "ERROR",
                                    message: "Client ID required for likes",
                                }));
                                break;
                            }

                            // Check if this client has already liked this track
                            const trackKey = getTrackKey(track);
                            console.log(`🔍 Like check: client=${clientId}, track="${trackKey}", hasLiked=${hasLikedTrack(clientId, track)}`);

                            if (hasLikedTrack(clientId, track)) {
                                console.log(`⚠️ Duplicate like ignored for: ${track.title} (${clientId})`);
                                // Send feedback to client that they already liked
                                ws.send(JSON.stringify({
                                    type: "LIKE_ALREADY_SENT",
                                    payload: { track },
                                }));
                                break;
                            }

                            // Record the like
                            recordLike(clientId, track);
                            console.log(`❤️ Like received for: ${track.title} (${clientId})`);

                            // 💾 Persist to database (find active session for context)
                            const activeSessionIds = Array.from(activeSessions.keys());
                            persistLike(track, activeSessionIds[0], clientId);  // Pass clientId!

                            // Broadcast to all clients (including DJ)
                            rawWs.publish("live-session", JSON.stringify({
                                type: "LIKE_RECEIVED",
                                payload: { track },
                            }));
                            break;
                        }

                        case "SEND_TEMPO_REQUEST": {
                            const { sessionId: targetSessionId, preference } = message;

                            // Require clientId for rate limiting
                            if (!clientId) {
                                console.log("⚠️ Tempo request rejected: no clientId provided");
                                break;
                            }

                            // Get or create the votes map for this session
                            let sessionVotes = tempoVotes.get(targetSessionId);
                            if (!sessionVotes) {
                                sessionVotes = new Map();
                                tempoVotes.set(targetSessionId, sessionVotes);
                            }

                            // Handle "clear" preference - remove the vote
                            if (preference === "clear") {
                                sessionVotes.delete(clientId);
                                console.log(`🎚️ Tempo vote cleared by ${clientId}`);
                            } else {
                                // Record the vote (overwrites any previous vote from this client)
                                sessionVotes.set(clientId, {
                                    preference: preference as "faster" | "slower" | "perfect",
                                    timestamp: Date.now(),
                                });
                                console.log(`🎚️ Tempo vote: ${preference} from ${clientId}`);
                            }

                            // Get aggregated feedback
                            const feedback = getTempoFeedback(targetSessionId);

                            // Broadcast to DJ (and all clients)
                            rawWs.publish("live-session", JSON.stringify({
                                type: "TEMPO_FEEDBACK",
                                ...feedback,
                            }));
                            break;
                        }

                        case "SUBSCRIBE": {
                            // Get session ID from message if provided
                            const targetSession = (json as { sessionId?: string }).sessionId;

                            // Only log if this is a new subscription (not a repeat)
                            const isNewSubscription = !isListener && clientId && targetSession;
                            if (isNewSubscription) {
                                console.log(`👀 New listener for session: ${targetSession}`);
                            }

                            // Mark this connection as a listener
                            if (isNewSubscription) {
                                isListener = true;
                                subscribedSessionId = targetSession;
                                addListener(targetSession!, clientId!);

                                const count = getListenerCount(targetSession);
                                console.log(`👥 Listener count for ${targetSession}: ${count}`);

                                // Broadcast updated listener count for this session
                                rawWs.publish("live-session", JSON.stringify({
                                    type: "LISTENER_COUNT",
                                    sessionId: targetSession,
                                    count,
                                }));
                            }

                            // Send current sessions list
                            const sessions = Array.from(activeSessions.values());
                            ws.send(JSON.stringify({
                                type: "SESSIONS_LIST",
                                sessions,
                            }));

                            // Send current listener count for the target session
                            if (targetSession) {
                                ws.send(JSON.stringify({
                                    type: "LISTENER_COUNT",
                                    sessionId: targetSession,
                                    count: getListenerCount(targetSession),
                                }));
                            }
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

                // Remove listener from session if this was a listener
                if (isListener && clientId && subscribedSessionId) {
                    removeListener(subscribedSessionId, clientId);
                    const count = getListenerCount(subscribedSessionId);
                    console.log(`👥 Listener count for ${subscribedSessionId}: ${count}`);

                    // Broadcast updated count for this session
                    const rawWs = ws.raw as ServerWebSocket;
                    rawWs.publish("live-session", JSON.stringify({
                        type: "LISTENER_COUNT",
                        sessionId: subscribedSessionId,
                        count,
                    }));
                }
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
// Bind to 0.0.0.0 to allow LAN access for mobile testing
// Use HOST env var to override (e.g., HOST=127.0.0.1 for localhost-only)
const hostname = process.env["HOST"] ?? "0.0.0.0";

console.log(`🚀 Pika! Cloud server starting on http://${hostname}:${port}`);
console.log(`📡 WebSocket endpoint: ws://${hostname}:${port}/ws`);
console.log(`💾 Database: ${process.env["DATABASE_URL"] ? "configured" : "localhost (default)"}`);

export default {
    port,
    hostname,
    fetch: app.fetch,
    websocket,
};
