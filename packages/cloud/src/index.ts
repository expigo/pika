import { PIKA_VERSION, type WebSocketMessage, WebSocketMessageSchema } from "@pika/shared";
import type { ServerWebSocket } from "bun";
import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { createBunWebSocket } from "hono/bun";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { db } from "./db";
import { auth as authRoutes } from "./routes/auth";
import { sessions as sessionsRoutes } from "./routes/sessions";
import { stats as statsRoutes } from "./routes/stats";
import { dj as djRoutes } from "./routes/dj";
import { client as clientRoutes } from "./routes/client";

import { cleanupStaleListeners, getListenerCount } from "./lib/listeners";
import { cachedListenerCounts } from "./lib/cache";
import { activeSessions } from "./lib/sessions";
import * as handlers from "./handlers";

// Type alias for Bun WebSocket
type WS = ServerWebSocket<{
  state: handlers.WSConnectionState;
  messageId?: string;
}>;

// Capture a reference to any active WebSocket to use for global broadcasts
let activeBroadcaster: ServerWebSocket<unknown> | null = null;

// Periodically cleanup stale listeners (every 30 mins)
setInterval(cleanupStaleListeners, 30 * 60 * 1000);

// Create WebSocket upgrader for Hono + Bun
const { upgradeWebSocket, websocket } = createBunWebSocket<ServerWebSocket>();

const app = new Hono();

// Middleware
app.use("*", logger());
app.use(
  "*",
  cors({
    origin:
      process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test"
        ? "*"
        : [
            "https://pika.stream",
            "https://api.pika.stream",
            "https://staging.pika.stream",
            "https://staging-api.pika.stream",
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
      console.warn(`🚫 CSRF/Client check failed: ${clientHeader || "no header"}`);
      return c.json({ error: "Invalid client" }, 403);
    }
  }
  await next();
};

// ============================================================================
// WebSocket Handler - MUST be registered BEFORE wildcard routes
// ============================================================================

const wsConnectionAttempts = new Map<string, { count: number; resetAt: number }>();
const WS_RATE_LIMIT = Number(process.env["WS_RATE_LIMIT"] ?? 20);
const WS_RATE_WINDOW = 60 * 1000;

setInterval(
  () => {
    const now = Date.now();
    for (const [ip, data] of wsConnectionAttempts) {
      if (now > data.resetAt) wsConnectionAttempts.delete(ip);
    }
  },
  5 * 60 * 1000,
);

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

// --- WebSocket route: registered early to avoid conflict with wildcard routes ---
app.get(
  "/ws",
  upgradeWebSocket((c) => {
    const ip =
      c.req.header("CF-Connecting-IP") ||
      c.req.header("X-Forwarded-For")?.split(",")[0] ||
      "unknown";
    if (!checkWsRateLimit(ip)) {
      console.log(`🚫 WS connection rejected for rate-limited IP: ${ip.substring(0, 10)}...`);
    }

    const state: handlers.WSConnectionState = {
      clientId: null,
      isListener: false,
      subscribedSessionId: null,
      djSessionId: null,
    };

    return {
      onOpen(_event, ws) {
        activeBroadcaster = ws.raw as ServerWebSocket;
        handlers.handleOpen(ws.raw as ServerWebSocket);
      },

      onMessage(event, ws) {
        try {
          const data = event.data.toString();
          if (data.length > 10 * 1024) {
            ws.close(1009, "Message too large");
            return;
          }

          const json = JSON.parse(data);
          const result = WebSocketMessageSchema.safeParse(json);
          if (!result.success) return;

          const message = result.data as WebSocketMessage & {
            messageId?: string;
            clientId?: string;
          };
          const rawWs = ws.raw as ServerWebSocket;
          const messageId = message.messageId;

          if (message.clientId) state.clientId = message.clientId;
          if (state.djSessionId) activeBroadcaster = rawWs;

          const ctx: handlers.WSContext = { message, ws, rawWs, state, messageId };

          switch (message.type) {
            case "REGISTER_SESSION":
              handlers.handleRegisterSession(ctx);
              break;
            case "BROADCAST_TRACK":
              handlers.handleBroadcastTrack(ctx);
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
            default:
              break;
          }
        } catch (e) {
          console.error("❌ Failed to handle message:", e);
        }
      },

      onClose(_event, ws) {
        handlers.handleClose(ws as WS, state);
      },

      onError(_event, _ws) {
        console.error("⚠️ WebSocket error");
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
      activeSessions: activeSessions.size,
      database: "connected",
    });
  } catch (e) {
    console.error("❌ Health check failed:", e);
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

console.log(`🚀 Pika! Cloud server starting on http://${hostname}:${port}`);
console.log(`📡 WebSocket endpoint: ws://${hostname}:${port}/ws`);
console.log(`💾 Database: ${process.env["DATABASE_URL"] ? "configured" : "localhost (default)"}`);

/**
 * Debounced broadcast of listener counts (Heartbeat).
 * Runs every 2 seconds to batch updates and reduce overhead for high-traffic events.
 * Only broadcasts for a session if the count has actually changed.
 */
setInterval(() => {
  const broadcaster = activeBroadcaster;
  if (!broadcaster) return;

  for (const sessionId of activeSessions.keys()) {
    const currentCount = getListenerCount(sessionId);
    const lastBroadcasted = cachedListenerCounts.get(sessionId);

    if (currentCount !== lastBroadcasted) {
      cachedListenerCounts.set(sessionId, currentCount);
      try {
        broadcaster.publish(
          "live-session",
          JSON.stringify({ type: "LISTENER_COUNT", sessionId, count: currentCount }),
        );
      } catch (e) {
        console.warn("⚠️ Broadcast failed:", e);
      }
    }
  }
}, 2000);

// ============================================================================
// Graceful Shutdown Handling
// ============================================================================

import { endSessionInDb } from "./lib/persistence/sessions";

let isShuttingDown = false;

async function gracefulShutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`\n🛑 Received ${signal}, initiating graceful shutdown...`);

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
      console.log("📢 Broadcast shutdown notification to clients");
    } catch (e) {
      console.warn("⚠️ Failed to broadcast shutdown:", e);
    }
  }

  // End all active sessions in database
  const sessionIds = Array.from(activeSessions.keys());
  if (sessionIds.length > 0) {
    console.log(`💾 Ending ${sessionIds.length} active session(s)...`);
    await Promise.all(
      sessionIds.map(async (sessionId) => {
        try {
          await endSessionInDb(sessionId);
          console.log(`  ✅ Ended session: ${sessionId.substring(0, 8)}...`);
        } catch (e) {
          console.error(`  ❌ Failed to end session ${sessionId}:`, e);
        }
      }),
    );
  }

  // Small delay to allow messages to be sent
  await new Promise((resolve) => setTimeout(resolve, 500));

  console.log("👋 Shutdown complete");
  process.exit(0);
}

// Register shutdown handlers
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

export default { port, hostname, fetch: app.fetch, websocket };
