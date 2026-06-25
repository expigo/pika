import {
  LIMITS,
  logger,
  PIKA_VERSION,
  TIMEOUTS,
  URLS,
  type WebSocketMessage,
  WebSocketMessageSchema,
} from "@pika/shared";
import * as Sentry from "@sentry/bun";
import type { ServerWebSocket } from "bun";
import { sql } from "drizzle-orm";
import type { Context, Next } from "hono";
import { Hono } from "hono";
import { createBunWebSocket } from "hono/bun";
import { cors } from "hono/cors";
import { logger as honoLogger } from "hono/logger";
import { client, db } from "./db";
import { auth as authRoutes } from "./routes/auth";
import { client as clientRoutes } from "./routes/client";
import { dj as djRoutes } from "./routes/dj";
import { djLiveRoutes } from "./routes/dj-live";
import { push as pushRoutes } from "./routes/push";
import { sessions as sessionsRoutes } from "./routes/sessions";
import { spotifyRoutes } from "./routes/spotify";
import { stageRoutes } from "./routes/stages";
import { stats as statsRoutes } from "./routes/stats";

// Initialize Sentry for production error monitoring
if (process.env.NODE_ENV === "production" || process.env["SENTRY_DSN"]) {
  Sentry.init({
    dsn: process.env["SENTRY_DSN"],
    environment: process.env.NODE_ENV || "production",
    release: `pika-cloud@${PIKA_VERSION}`,
    tracesSampleRate: 0.1,

    // PII Scrubbing
    beforeSend(event) {
      if (event.request) {
        delete event.request.headers;
        delete event.request.cookies;
      }
      return event;
    },

    ignoreErrors: ["WebSocket connection failed", "Broken pipe", "Connection reset by peer"],
  });

  // Register Sentry as the reporter for the shared logger
  logger.setReporter((message, error, context) => {
    if (error instanceof Error) {
      Sentry.captureException(error, {
        extra: { logMessage: message, ...context },
      });
    } else {
      Sentry.captureMessage(message, {
        level: "error",
        extra: { error, ...context },
      });
    }
  });

  logger.info("🛡️ Sentry initialized for Cloud service");
}

import * as handlers from "./handlers";
import { type Broadcaster, setBroadcaster } from "./lib/broadcaster";
import { cachedListenerCounts } from "./lib/cache";
import { activeConnections } from "./lib/connection-registry";
import { cleanupStaleListeners, getListenerCount } from "./lib/listeners";
import { cleanupSessionQueue } from "./lib/persistence/queue";
import { clearLastPersistedTrackKey } from "./lib/persistence/tracks";
import { sendNack } from "./lib/protocol";
import { reconcilePollersOnBoot, shutdownAllPollers } from "./lib/services/spotifyPoller";
import {
  cleanupStaleSessions,
  getAllSessions,
  getSessionAudienceKey,
  getSessionBroadcastTopic,
  getSessionCount,
  getSessionIds,
} from "./lib/sessions";
import { DISCOVERY_TOPIC } from "./lib/topics";

// WS type alias removed (unused)

// Connection Registry for reliable global broadcasts. Lives in lib/connection-registry so the
// admin overview can read the count without importing index.ts (cycle).

// 🛡️ P0 Fix: Track last activity time per connection for idle timeout
// Connections without PING for 5 minutes will be closed
const connectionLastActivity = new Map<ServerWebSocket, number>();
const IDLE_CONNECTION_TIMEOUT = 5 * 60 * 1000; // 5 minutes

/**
 * The Bun `Server` instance, captured from the Hono request context on the
 * first request (see {@link captureBunServer}). Used for server-INITIATED
 * broadcasts: the listener-count heartbeat, stale-session cleanup, and
 * graceful shutdown.
 *
 * We deliberately use `server.publish()` here instead of a borrowed client
 * socket's `ws.publish()`: per Bun's pub/sub semantics, `ws.publish()` excludes
 * the publishing socket, which would silently drop the message for one connected
 * client. `server.publish()` reaches every subscriber of the topic.
 *
 * Minimal structural type — we only ever call `.publish()`. Avoids coupling to
 * Bun's generic `Server<WebSocketData>` type.
 */
let bunServer: Broadcaster | null = null;

/**
 * Capture the Bun `Server` from the Hono context. Hono passes the Bun Server as
 * the 2nd argument of `fetch`, surfaced on `c.env` (possibly nested under
 * `c.env.server` depending on adapter wiring). Idempotent and cheap.
 */
function captureBunServer(c: Context): void {
  if (bunServer) return;
  const env: unknown = c.env;
  const candidate =
    env && typeof env === "object" && "server" in env ? (env as { server: unknown }).server : env;
  if (candidate && typeof (candidate as { publish?: unknown }).publish === "function") {
    bunServer = candidate as Broadcaster;
    // Share it so deferred/server-initiated broadcasts (e.g. the DJ-reconnect
    // grace reap in lifecycle.ts) can publish after a connection is gone.
    setBroadcaster(bunServer);
  }
}

// 🧹 M3 & M5 Fix: Global Cleanup Intervals
// Run every 5 minutes to remove stale listeners and orphaned sessions
setInterval(() => {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  logger.debug("🧹 [CLEANUP] Running scheduled cleanup", { timestamp: nowIso });
  cleanupStaleListeners();
  handlers.cleanupRateLimits(); // 🛡️ Issue 21 Fix: Clear stale rate-limit entries

  // 🛡️ P0 Fix: Close idle connections (no activity for 5 minutes)
  let idleClosedCount = 0;
  for (const ws of activeConnections) {
    const lastActivity = connectionLastActivity.get(ws);
    if (lastActivity && now - lastActivity > IDLE_CONNECTION_TIMEOUT) {
      try {
        ws.close(1000, "Idle timeout - no heartbeat received");
        idleClosedCount++;
      } catch (e) {
        // Connection might already be closed
        activeConnections.delete(ws);
        connectionLastActivity.delete(ws);
      }
    }
  }
  if (idleClosedCount > 0) {
    logger.info(`🧹 Closed ${idleClosedCount} idle connection(s)`);
  }

  const removedIds = cleanupStaleSessions(); // Default thresholds: Idle 4h, Age 8h, Hard 24h
  if (removedIds.length > 0 && bunServer) {
    for (const sessionId of removedIds) {
      try {
        // Notify everyone on the discovery topic that the session is gone:
        // in-session dancers show "session over", lobby browsers drop it.
        bunServer.publish(
          DISCOVERY_TOPIC,
          JSON.stringify({
            type: "SESSION_ENDED",
            sessionId: sessionId,
          }),
        );

        bunServer.publish(
          DISCOVERY_TOPIC,
          JSON.stringify({
            type: "SESSION_EXPIRED",
            sessionId: sessionId,
            reason: "Session expired due to inactivity or age limit",
          }),
        );
      } catch (e: unknown) {
        logger.warn(`⚠️ Cleanup broadcast failed for ${sessionId}`, e as Error, undefined);
      }

      // 3. Deep Cleanup (Memory Leaks Fix M2)
      // Ensure resources are freed even if loop-based cleanup missed them
      cleanupSessionQueue(sessionId);
      clearLastPersistedTrackKey(sessionId);
    }
  }
  if (removedIds.length > 0) {
    logger.debug("🧹 Cleanup removed stale sessions", {
      count: removedIds.length,
      ids: removedIds,
    });
  }
}, TIMEOUTS.CLEANUP_INTERVAL).unref();

// Create WebSocket upgrader for Hono + Bun
const { upgradeWebSocket, websocket } = createBunWebSocket<ServerWebSocket>();

const app = new Hono();

// Middleware
app.use("*", honoLogger());
app.use(
  "*",
  cors({
    // Dev/test: reflect any localhost/127.0.0.1 origin so the web-DJ cookie flow works
    // cross-port with credentials (a literal "*" can't be used with credentials).
    origin:
      process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test"
        ? (origin) =>
            origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) ? origin : ""
        : [
            URLS.getWebUrl("production"),
            URLS.getApiUrl("production"),
            URLS.getWebUrl("staging"),
            URLS.getApiUrl("staging"),
          ],
    credentials: true,
  }),
);

// CSRF protection: Require X-Pika-Client header on state-changing requests
const VALID_CLIENTS = ["pika-web", "pika-desktop", "pika-e2e"] as const;

const csrfCheck = async (c: Context, next: Next) => {
  const method = c.req.method;
  if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
    const clientHeader = c.req.header("X-Pika-Client");
    if (!clientHeader || !VALID_CLIENTS.includes(clientHeader as any)) {
      logger.warn(`🚫 CSRF/Client check failed: ${clientHeader || "no header"}`);
      return c.json({ error: "Invalid client" }, 403);
    }
  }
  await next();
};

// ============================================================================
// WebSocket Handler - MUST be registered BEFORE wildcard routes
// ============================================================================

const wsConnectionAttempts = new Map<string, { count: number; resetAt: number }>();
const WS_RATE_LIMIT = Number(process.env["WS_RATE_LIMIT"] ?? LIMITS.WS_CONNECT_RATE_LIMIT_MAX);
const WS_RATE_WINDOW = LIMITS.WS_CONNECT_RATE_LIMIT_WINDOW;

setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of wsConnectionAttempts) {
    if (now > data.resetAt) wsConnectionAttempts.delete(ip);
  }
}, TIMEOUTS.CLEANUP_INTERVAL).unref();

// Legacy cleanup removed (consolidated above)

function checkWsRateLimit(ip: string): boolean {
  const now = Date.now();
  const attempts = wsConnectionAttempts.get(ip);
  if (!attempts || now > attempts.resetAt) {
    wsConnectionAttempts.set(ip, { count: 1, resetAt: now + WS_RATE_WINDOW });
    return true;
  }
  if (attempts.count >= WS_RATE_LIMIT) return false;
  attempts.count++;
  return true;
}

// Helper to get IP from context
function getClientIp(c: Context): string {
  return (
    c.req.header("CF-Connecting-IP") || c.req.header("X-Forwarded-For")?.split(",")[0] || "unknown"
  );
}

// --- WebSocket route: registered early to avoid conflict with wildcard routes ---
app.get(
  "/ws",
  // 🛡️ Security: Rate Limit Middleware
  (c, next) => {
    const ip = getClientIp(c);
    if (!checkWsRateLimit(ip)) {
      logger.warn(`🚫 WS connection rejected for rate-limited IP: ${ip.substring(0, 10)}...`);
      return c.text("Rate limit exceeded", 429);
    }
    return next();
  },
  upgradeWebSocket((c) => {
    // Capture the Bun Server for server-initiated broadcasts (heartbeat/cleanup/shutdown).
    captureBunServer(c);
    const ip = getClientIp(c);
    const state: handlers.WSConnectionState = {
      clientId: null,
      isListener: false,
      subscribedSessionId: null,
      subscribedStageId: null,
      djSessionId: null,
    };

    return {
      onOpen(_event, ws) {
        // L9: Clear connection attempts on success
        wsConnectionAttempts.delete(ip);
        const rawWs = ws.raw as ServerWebSocket;
        activeConnections.add(rawWs);
        // 🛡️ P0 Fix: Initialize last activity time for idle timeout tracking
        connectionLastActivity.set(rawWs, Date.now());
        handlers.handleOpen(rawWs);
      },

      async onMessage(event, ws) {
        try {
          const data = event.data.toString();
          if (data.length > 10 * 1024) {
            ws.close(1009, "Message too large");
            return;
          }

          const json = JSON.parse(data);
          const result = WebSocketMessageSchema.safeParse(json);
          if (!result.success) {
            const issue = result.error.issues[0];
            logger.warn("⚠️ Message validation failed", {
              type: json.type,
              issues: result.error.issues,
            });
            // 🛡️ Don't silently drop: NACK reliable messages so the client gets
            // an explicit failure instead of an opaque ACK timeout.
            if (typeof json?.messageId === "string") {
              const where = issue?.path?.join(".");
              sendNack(
                ws,
                json.messageId,
                `Invalid ${json?.type ?? "message"}: ${issue?.message ?? "validation failed"}${
                  where ? ` (${where})` : ""
                }`,
              );
            }
            return;
          }

          const message = result.data as WebSocketMessage & {
            messageId?: string;
            clientId?: string;
          };
          const rawWs = ws.raw as ServerWebSocket;
          const messageId = message.messageId;

          // 🛡️ Security: ClientID Locking
          // Once a connection declares a ClientID, it is locked to that ID.
          // Subsequent attempts to use a different ClientID are ignored.
          if (message.clientId) {
            if (state.clientId === null) {
              state.clientId = message.clientId;
            } else if (state.clientId !== message.clientId) {
              logger.warn(
                `⚠️ ClientID spoofing attempt ignored: ${message.clientId} (locked to ${state.clientId})`,
              );
              // Do NOT update state.clientId
            }
          }

          const ctx: handlers.WSContext = { message, ws, rawWs, state, messageId };

          switch (message.type) {
            case "REGISTER_SESSION":
              // Async handler - await to ensure state is set before any subsequent messages
              await handlers.handleRegisterSession(ctx);
              break;
            case "BROADCAST_TRACK":
              await handlers.handleBroadcastTrack(ctx);
              break;
            case "METADATA_UPDATED":
              // 🛡️ Issue 49 Fix: Bypasses rate limit for metadata-only updates
              await handlers.handleBroadcastMetadata(ctx);
              break;
            case "SYNC_SESSION_HISTORY":
              await handlers.handleSyncSessionHistory(ctx);
              break;
            case "TRACK_STOPPED":
              handlers.handleTrackStopped(ctx);
              break;
            case "END_SESSION":
              handlers.handleEndSession(ctx);
              break;
            case "SEND_LIKE":
              handlers.handleSendLike(ctx);
              break;
            case "SEND_BULK_LIKE":
              handlers.handleSendBulkLike(ctx);
              break;
            case "REMOVE_LIKE":
              handlers.handleRemoveLike(ctx);
              break;
            case "SEND_REACTION":
              handlers.handleSendReaction(ctx);
              break;
            case "SEND_ANNOUNCEMENT":
              handlers.handleSendAnnouncement(ctx);
              break;
            case "CANCEL_ANNOUNCEMENT":
              handlers.handleCancelAnnouncement(ctx);
              break;
            case "SEND_TEMPO_REQUEST":
              handlers.handleSendTempoRequest(ctx);
              break;
            case "SUBSCRIBE":
              handlers.handleSubscribe(ctx);
              break;
            case "SUBSCRIBE_STAGE":
              await handlers.handleSubscribeStage(ctx);
              break;
            case "START_POLL":
              handlers.handleStartPoll(ctx);
              break;
            case "END_POLL":
              handlers.handleEndPoll(ctx);
              break;
            case "CANCEL_POLL":
              handlers.handleCancelPoll(ctx);
              break;
            case "VOTE_ON_POLL":
              handlers.handleVoteOnPoll(ctx);
              break;
            case "PING":
              // 🛡️ P0 Fix: Update last activity time on heartbeat
              connectionLastActivity.set(rawWs, Date.now());
              handlers.handlePing(ctx);
              break;
            case "GET_SESSIONS":
              handlers.handleGetSessions(ctx);
              break;
            case "VALIDATE_SESSION":
              handlers.handleValidateSession(ctx);
              break;
            default:
              break;
          }
        } catch (e: unknown) {
          logger.error("❌ Failed to handle message", e as Error, undefined);
        }
      },

      onClose(_event, ws) {
        const rawWs = (ws as any).raw as ServerWebSocket;
        activeConnections.delete(rawWs);
        // 🛡️ P0 Fix: Clean up activity tracking
        connectionLastActivity.delete(rawWs);
        handlers.handleClose({ raw: rawWs }, state);
      },
      onError(_event, _ws) {
        const error = (_event as any).error || _event;
        logger.error("⚠️ WebSocket error", error);
      },
    };
  }),
);

// ============================================================================
// REST API Routes - registered AFTER specific routes like /ws
// ============================================================================

// Route mounting
app.use("/api/auth/*", csrfCheck);
app.route("/api/auth", authRoutes);
app.route("/api/sessions", sessionsRoutes);
app.route("/api/session", sessionsRoutes); // Alias for recap route
app.route("/api/stats", statsRoutes);
app.route("/api/dj", djRoutes);
app.route("/api/client", clientRoutes);
app.route("/api/push", pushRoutes);
app.route("/api/spotify", spotifyRoutes); // Track D — Spotify OAuth (BFF)
app.use("/api/live/*", csrfCheck); // Track D — control channel (state-changing → CSRF header)
app.route("/api/live", djLiveRoutes);
app.route("/api", stageRoutes); // /api/events, /api/stages (+ public reads)
app.route("/sessions", sessionsRoutes); // Legacy WebSocket-style endpoint

// Health check endpoint
app.get("/health", async (c) => {
  try {
    await db.execute(sql`SELECT 1`);
    return c.json({
      status: "ok",
      version: PIKA_VERSION,
      timestamp: new Date().toISOString(),
      activeSessions: getSessionCount(),
      database: "connected",
    });
  } catch (e: unknown) {
    logger.error("❌ Health check failed", e as Error, undefined);
    return c.json(
      {
        status: "error",
        version: PIKA_VERSION,
        timestamp: new Date().toISOString(),
        error: "Database unavailable",
      },
      503,
    );
  }
});

// 🔍 Debug endpoint - shows current in-memory state (development only)
app.get("/debug/sessions", (c) => {
  if (process.env.NODE_ENV === "production") {
    return c.json({ error: "Not available in production" }, 403);
  }

  const sessions = getAllSessions();
  const sessionIds = getSessionIds();

  return c.json({
    timestamp: new Date().toISOString(),
    sessionCount: sessions.length,
    sessionIds,
    sessions: sessions.map((s) => ({
      sessionId: s.sessionId,
      djName: s.djName,
      startedAt: s.startedAt,
      hasCurrentTrack: !!s.currentTrack,
      currentTrack: s.currentTrack ? `${s.currentTrack.artist} - ${s.currentTrack.title}` : null,
      hasAnnouncement: !!s.activeAnnouncement,
    })),
    cachedListenerCounts: Object.fromEntries(cachedListenerCounts),
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

// ============================================================================
// Start Server
// ============================================================================

const port = Number(process.env["PORT"] ?? 3001);
const hostname = process.env["HOST"] ?? "0.0.0.0";

logger.info(`🚀 Pika! Cloud server starting on http://${hostname}:${port}`);
logger.info(`📡 WebSocket endpoint: ws://${hostname}:${port}/ws`);
// Track D: clear any stale Spotify-poller rows left by a previous run.
void reconcilePollersOnBoot();
logger.info(`💾 Database: ${process.env["DATABASE_URL"] ? "configured" : "localhost (default)"}`);

/**
 * Debounced broadcast of listener counts (Heartbeat).
 * Runs every 2 seconds to batch updates and reduce overhead for high-traffic events.
 * Only broadcasts for a session if the count has actually changed.
 */
setInterval(() => {
  if (!bunServer) return;

  for (const sessionId of getSessionIds()) {
    // Count under the audience key (stage when staged, else session) and publish
    // to the matching audience topic — so a staged floor's count is stable across
    // DJ rotation and stage-less sessions behave exactly as before.
    const audienceKey = getSessionAudienceKey(sessionId);
    const currentCount = getListenerCount(audienceKey);
    const lastBroadcasted = cachedListenerCounts.get(audienceKey);

    if (currentCount !== lastBroadcasted) {
      cachedListenerCounts.set(audienceKey, currentCount);
      try {
        // Route each session's count to its own topic — no longer O(sessions × all clients).
        bunServer.publish(
          getSessionBroadcastTopic(sessionId),
          JSON.stringify({ type: "LISTENER_COUNT", sessionId, count: currentCount }),
        );
        // L10: Silence listener logs
        // logger.debug("📡 Broadcasted listener count", { sessionId, count: currentCount });
      } catch (e: unknown) {
        logger.warn("⚠️ Broadcast failed", e as Error, undefined);
      }
    }
  }
}, TIMEOUTS.BROADCAST_DEBOUNCE).unref();

// ============================================================================
// Graceful Shutdown Handling
// ============================================================================

import { endSessionInDb } from "./lib/persistence/sessions";

let isShuttingDown = false;

async function gracefulShutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info(`🛑 Received ${signal}, initiating graceful shutdown...`);

  // Force exit after 5 seconds if graceful shutdown hangs
  const forceExitTimeout = setTimeout(() => {
    logger.warn("⚠️ Graceful shutdown timed out, forcing exit...");
    process.exit(1);
  }, TIMEOUTS.SHUTDOWN_FORCE_EXIT);

  // Unref the timeout so it doesn't keep the process alive if everything else finishes
  if (forceExitTimeout.unref) forceExitTimeout.unref();

  try {
    // Broadcast shutdown message to all connected clients
    if (bunServer) {
      try {
        bunServer.publish(
          DISCOVERY_TOPIC,
          JSON.stringify({
            type: "SERVER_SHUTDOWN",
            message: "Server is shutting down for maintenance",
          }),
        );
        logger.info("📢 Broadcast shutdown notification to clients");
      } catch (e: unknown) {
        logger.warn("⚠️ Failed to broadcast shutdown", e as Error, undefined);
      }
    }

    // Track D: stop all Spotify poll loops before ending sessions.
    shutdownAllPollers();

    // End all active sessions in database
    const sessionIds = getSessionIds();
    if (sessionIds.length > 0) {
      logger.info(`💾 Ending ${sessionIds.length} active session(s)...`);
      await Promise.all(
        sessionIds.map(async (sessionId) => {
          try {
            await endSessionInDb(sessionId);
            logger.debug(`  ✅ Ended session: ${sessionId.substring(0, 8)}...`);
          } catch (e: unknown) {
            logger.error(`  ❌ Failed to end session ${sessionId}`, e as Error, undefined);
          }
        }),
      );
    }

    // Close database connection pool
    try {
      logger.info("🔌 Closing database connection pool...");
      await client.end({ timeout: 2 });
      logger.info("  ✅ Database connection pool closed");
    } catch (e) {
      logger.warn("⚠️ Error closing database connection", e);
    }

    // Small delay to allow messages to be sent
    await new Promise((resolve) => setTimeout(resolve, TIMEOUTS.SHUTDOWN_GRACE_PERIOD));

    logger.info("👋 Shutdown complete");
    clearTimeout(forceExitTimeout);
    process.exit(0);
  } catch (err: unknown) {
    logger.error("❌ Critical error during shutdown", err as Error, undefined);
    process.exit(1);
  }
}

// Register shutdown handlers
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

export default {
  port,
  hostname,
  fetch: app.fetch,
  websocket: {
    ...websocket,
    // Disabled: WebKit/WKWebView (the Tauri desktop WebView) drops `ws://localhost`
    // connections mid-stream when permessage-deflate is on. Compression saves
    // almost nothing on these small JSON frames over LAN/localhost.
    perMessageDeflate: false,
  },
};
