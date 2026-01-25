import {
  PIKA_VERSION,
  type WebSocketMessage,
  WebSocketMessageSchema,
  TIMEOUTS,
  LIMITS,
  URLS,
  logger,
} from "@pika/shared";
import type { ServerWebSocket } from "bun";
import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { createBunWebSocket } from "hono/bun";
import { cors } from "hono/cors";
import { logger as honoLogger } from "hono/logger";
import { db, client } from "./db";
import { auth as authRoutes } from "./routes/auth";
import { sessions as sessionsRoutes } from "./routes/sessions";
import { stats as statsRoutes } from "./routes/stats";
import { dj as djRoutes } from "./routes/dj";
import { client as clientRoutes } from "./routes/client";

import * as Sentry from "@sentry/bun";

// Initialize Sentry for production error monitoring
if (process.env["NODE_ENV"] === "production" || process.env["SENTRY_DSN"]) {
  Sentry.init({
    dsn: process.env["SENTRY_DSN"],
    environment: process.env["NODE_ENV"] || "production",
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

import { cleanupStaleListeners, getListenerCount } from "./lib/listeners";
import { cachedListenerCounts } from "./lib/cache";
import {
  getSessionCount,
  getSessionIds,
  getAllSessions,
  cleanupStaleSessions,
} from "./lib/sessions";
import { cleanupSessionQueue } from "./lib/persistence/queue";
import { clearLastPersistedTrackKey } from "./lib/persistence/tracks";
import * as handlers from "./handlers";

// WS type alias removed (unused)

// Capture a reference to any active WebSocket to use for global broadcasts
let activeBroadcaster: ServerWebSocket<unknown> | null = null;

// 🧹 M3 & M5 Fix: Global Cleanup Intervals
// Run every 5 minutes to remove stale listeners and orphaned sessions
setInterval(() => {
  const now = new Date().toISOString();
  logger.debug("🧹 [CLEANUP] Running scheduled cleanup", { timestamp: now });
  cleanupStaleListeners();

  const removedIds = cleanupStaleSessions(); // Default thresholds: Idle 4h, Age 8h, Hard 24h
  if (removedIds.length > 0 && activeBroadcaster) {
    for (const sessionId of removedIds) {
      try {
        // 1. Notify Dancers
        activeBroadcaster.publish(
          "live-session",
          JSON.stringify({
            type: "SESSION_ENDED",
            sessionId: sessionId,
          }),
        );

        // 2. Notify DJ (Broadcast to the specific session topic)
        // DJs also subscribe to live-session, but they might need a specific message
        activeBroadcaster.publish(
          "live-session",
          JSON.stringify({
            type: "SESSION_EXPIRED",
            sessionId: sessionId,
            reason: "Session expired due to inactivity or age limit",
          }),
        );
      } catch (e: any) {
        logger.warn(`⚠️ Cleanup broadcast failed for ${sessionId}`, e, undefined);
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
    origin:
      process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test"
        ? "*"
        : [
            URLS.getWebUrl("production"),
            URLS.getApiUrl("production"),
            URLS.getWebUrl("staging"),
            URLS.getApiUrl("staging"),
          ],
    credentials: process.env.NODE_ENV !== "development",
  }),
);

// CSRF protection: Require X-Pika-Client header on state-changing requests
import type { Context, Next } from "hono";

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
    const ip = getClientIp(c);
    const state: handlers.WSConnectionState = {
      clientId: null,
      isListener: false,
      subscribedSessionId: null,
      djSessionId: null,
    };

    return {
      onOpen(_event, ws) {
        // L9: Clear connection attempts on success
        wsConnectionAttempts.delete(ip);
        activeBroadcaster = ws.raw as ServerWebSocket;
        handlers.handleOpen(ws.raw as ServerWebSocket);
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
            logger.warn("⚠️ Message validation failed", {
              type: json.type,
              issues: result.error.issues,
            });
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

          if (state.djSessionId) activeBroadcaster = rawWs;

          const ctx: handlers.WSContext = { message, ws, rawWs, state, messageId };

          switch (message.type) {
            case "REGISTER_SESSION":
              // Async handler - await to ensure state is set before any subsequent messages
              await handlers.handleRegisterSession(ctx);
              break;
            case "BROADCAST_TRACK":
              await handlers.handleBroadcastTrack(ctx);
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
        } catch (e: any) {
          logger.error("❌ Failed to handle message", e, undefined);
        }
      },

      onClose(_event, ws) {
        handlers.handleClose({ raw: (ws as any).raw as ServerWebSocket }, state);
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
  } catch (e: any) {
    logger.error("❌ Health check failed", e, undefined);
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
logger.info(`💾 Database: ${process.env["DATABASE_URL"] ? "configured" : "localhost (default)"}`);

/**
 * Debounced broadcast of listener counts (Heartbeat).
 * Runs every 2 seconds to batch updates and reduce overhead for high-traffic events.
 * Only broadcasts for a session if the count has actually changed.
 */
setInterval(() => {
  const broadcaster = activeBroadcaster;
  if (!broadcaster) return;

  for (const sessionId of getSessionIds()) {
    const currentCount = getListenerCount(sessionId);
    const lastBroadcasted = cachedListenerCounts.get(sessionId);

    if (currentCount !== lastBroadcasted) {
      cachedListenerCounts.set(sessionId, currentCount);
      try {
        broadcaster.publish(
          "live-session",
          JSON.stringify({ type: "LISTENER_COUNT", sessionId, count: currentCount }),
        );
        // L10: Silence listener logs
        // logger.debug("📡 Broadcasted listener count", { sessionId, count: currentCount });
      } catch (e: any) {
        logger.warn("⚠️ Broadcast failed", e, undefined);
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
    if (activeBroadcaster) {
      try {
        activeBroadcaster.publish(
          "live-session",
          JSON.stringify({
            type: "SERVER_SHUTDOWN",
            message: "Server is shutting down for maintenance",
          }),
        );
        logger.info("📢 Broadcast shutdown notification to clients");
      } catch (e: any) {
        logger.warn("⚠️ Failed to broadcast shutdown", e, undefined);
      }
    }

    // End all active sessions in database
    const sessionIds = getSessionIds();
    if (sessionIds.length > 0) {
      logger.info(`💾 Ending ${sessionIds.length} active session(s)...`);
      await Promise.all(
        sessionIds.map(async (sessionId) => {
          try {
            await endSessionInDb(sessionId);
            logger.debug(`  ✅ Ended session: ${sessionId.substring(0, 8)}...`);
          } catch (e: any) {
            logger.error(`  ❌ Failed to end session ${sessionId}`, e, undefined);
          }
        }),
      );
    }

    // Close database connection pool
    try {
      logger.info("🔌 Closing database connection pool...");
      // @ts-ignore - client is postgres.js instance
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
  } catch (err: any) {
    logger.error("❌ Critical error during shutdown", err, undefined);
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
    perMessageDeflate: true, // L6: WS Compression check
  },
};
