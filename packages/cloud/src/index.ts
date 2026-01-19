import {
  getTrackKey,
  PIKA_VERSION,
  slugify,
  type TrackInfo,
  type WebSocketMessage,
  WebSocketMessageSchema,
} from "@pika/shared";
import type { ServerWebSocket } from "bun";
import { and, count, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { Hono } from "hono";
import { createBunWebSocket } from "hono/bun";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { rateLimiter } from "hono-rate-limiter";
import { z } from "zod";
import { db, schema } from "./db";
import { auth as authRoutes } from "./routes/auth";

// NOTE: lib/ modules are created but not yet wired in to reduce risk.
// Future refactoring can import from ./lib to use extracted utilities.
// Available modules: listeners, tempo, cache, protocol, auth
// Auth routes are now wired from ./routes/auth

// Create WebSocket upgrader for Hono + Bun
const { upgradeWebSocket, websocket } = createBunWebSocket<ServerWebSocket>();

const app = new Hono();

// Middleware
app.use("*", logger());
app.use(
  "*",
  cors({
    // In development, allow any origin for local network testing
    // In production, restrict to known domains
    origin:
      process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test"
        ? "*" // Allow all origins in dev/test (for local IP testing like 192.168.x.x)
        : [
            "https://pika.stream",
            "https://api.pika.stream",
            "https://staging.pika.stream",
            "https://staging-api.pika.stream",
          ],
    credentials: process.env.NODE_ENV !== "development", // credentials require specific origins
  }),
);

// Rate limiter for auth endpoints (5 requests per 15 minutes)
const authLimiter = rateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 5,
  standardHeaders: "draft-6",
  keyGenerator: (c) =>
    c.req.header("CF-Connecting-IP") || c.req.header("X-Forwarded-For")?.split(",")[0] || "unknown",
  handler: (c) => c.json({ error: "Too many attempts. Try again later." }, 429),
});

// CSRF protection: Require X-Pika-Client header on state-changing requests
// This helps prevent cross-site request forgery by requiring a custom header
// that browsers won't send automatically from third-party sites
import type { Context, Next } from "hono";

const VALID_CLIENTS = ["pika-web", "pika-desktop", "pika-e2e"] as const;

const csrfCheck = async (c: Context, next: Next) => {
  const method = c.req.method;

  // Only check state-changing methods
  if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
    const clientHeader = c.req.header("X-Pika-Client");

    // In development/test, allow requests without header for easier debugging
    if (process.env.NODE_ENV !== "development" && process.env.NODE_ENV !== "test") {
      if (
        !clientHeader ||
        !VALID_CLIENTS.includes(clientHeader as (typeof VALID_CLIENTS)[number])
      ) {
        return c.json({ error: "Invalid client" }, 403);
      }
    }
  }

  await next();
};

// Apply CSRF check to auth routes
app.use("/api/auth/*", csrfCheck);

// Wire auth routes from extracted module
app.route("/api/auth", authRoutes);

// Global Error Handler to prevent ERR_EMPTY_RESPONSE
app.onError((err, c) => {
  console.error("🔥 Server Error:", err);
  return c.json(
    {
      error: "Internal Server Error",
      message: err.message,
    },
    500,
  );
});

// Active sessions store (for WebSocket connections - in-memory)
interface LiveSession {
  sessionId: string;
  djName: string;
  startedAt: string;
  currentTrack?: TrackInfo;
  activeAnnouncement?: {
    message: string;
    timestamp: string;
    endsAt?: string;
  } | null;
}

const activeSessions = new Map<string, LiveSession>();

// ============================================================================
// Message Nonce Deduplication (Replay Protection)
// ============================================================================
// Tracks recently seen message nonces (either messageId or explicit nonce)
// to prevent duplicate processing from network retries or replay attacks.
// Uses a time-boxed window for memory efficiency.

interface NonceEntry {
  timestamp: number;
  sessionId: string;
}

// Map: nonce -> { timestamp, sessionId }
const seenNonces = new Map<string, NonceEntry>();
const NONCE_TTL_MS = 5 * 60 * 1000; // Nonces expire after 5 minutes
const MAX_NONCES = 10000; // Hard limit to prevent memory exhaustion

/**
 * Check if a message nonce has been seen before (deduplication)
 * @returns true if this nonce is NEW (should be processed), false if duplicate
 */
function checkAndRecordNonce(nonce: string | undefined, sessionId: string): boolean {
  if (!nonce) return true; // No nonce = no deduplication (legacy clients)

  // Check if already seen
  const existing = seenNonces.get(nonce);
  if (existing) {
    console.log(
      `🔄 Duplicate nonce detected: ${nonce.substring(0, 16)}... (session: ${sessionId})`,
    );
    return false;
  }

  // Enforce max nonces (FIFO eviction)
  if (seenNonces.size >= MAX_NONCES) {
    const oldestKey = seenNonces.keys().next().value;
    if (oldestKey) seenNonces.delete(oldestKey);
  }

  // Record this nonce
  seenNonces.set(nonce, { timestamp: Date.now(), sessionId });
  return true;
}

// Periodic cleanup of expired nonces
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;

  for (const [nonce, entry] of seenNonces.entries()) {
    if (now - entry.timestamp > NONCE_TTL_MS) {
      seenNonces.delete(nonce);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    console.log(`🧹 Cleaned ${cleaned} expired nonces (remaining: ${seenNonces.size})`);
  }
}, 60000); // Every minute

// ============================================================================
// Listener Count Tracking (Per-Session) with Connection Reference Counting
// ============================================================================
// Track connected listeners (dancers) per session for accurate crowd size.
// Uses reference counting: multiple tabs from same client count as ONE listener.
// Map: sessionId -> Map<clientId, { count: number, lastSeen: number }>
const sessionListeners = new Map<string, Map<string, { count: number; lastSeen: number }>>();

// Participants stay "active" in the count for 5 minutes after disconnect
const PARTICIPANT_TTL = 5 * 60 * 1000;

function getListenerCount(sessionId: string): number {
  const clients = sessionListeners.get(sessionId);
  if (!clients) return 0;

  const now = Date.now();
  let participantCount = 0;

  for (const client of clients.values()) {
    // A participant is counted if they are:
    // 1. Currently connected (count > 0)
    // 2. OR were seen in the last 5 minutes (sticky window)
    if (client.count > 0 || now - client.lastSeen < PARTICIPANT_TTL) {
      participantCount++;
    }
  }

  return participantCount;
}

// Add listener connection to a session (increments reference count)
// Returns true if this is a NEW discovery (not seen in sticky window)
function addListener(sessionId: string, clientId: string): boolean {
  if (!sessionListeners.has(sessionId)) {
    sessionListeners.set(sessionId, new Map());
  }
  const clients = sessionListeners.get(sessionId);
  if (!clients) return false;
  const client = clients.get(clientId) || { count: 0, lastSeen: 0 };

  const isNewDiscovery = client.count === 0 && Date.now() - client.lastSeen > PARTICIPANT_TTL;

  client.count++;
  client.lastSeen = Date.now();
  clients.set(clientId, client);

  console.log(
    `👥 Listener added: ${clientId.substring(0, 8)}... (Active: ${client.count}, isNew: ${isNewDiscovery})`,
  );
  return isNewDiscovery;
}

// Remove listener connection from a session (decrements reference count)
// Returns false (we don't broadcast drops immediately due to sticky logic)
function removeListener(sessionId: string, clientId: string): boolean {
  const clients = sessionListeners.get(sessionId);
  if (!clients) return false;

  const client = clients.get(clientId);
  if (!client) return false;

  client.count = Math.max(0, client.count - 1);
  client.lastSeen = Date.now();

  console.log(
    `👥 Listener connection closed: ${clientId.substring(0, 8)}... (Remaining: ${client.count})`,
  );
  return false;
}

// Periodic cleanup of truly stale participants (disconnected > 1 hour)
setInterval(
  () => {
    const now = Date.now();
    const CLEANUP_THRESHOLD = 60 * 60 * 1000;

    for (const [_sessionId, clients] of sessionListeners.entries()) {
      for (const [clientId, data] of clients.entries()) {
        if (data.count === 0 && now - data.lastSeen > CLEANUP_THRESHOLD) {
          clients.delete(clientId);
        }
      }
    }
  },
  30 * 60 * 1000,
); // Every 30 mins

// ============================================================================
// Performance Utilities: In-memory Cache & Debouncing
// ============================================================================

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const globalCache = new Map<string, CacheEntry<unknown>>();

/**
 * Simple TTL cache helper
 */
async function withCache<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
  const cached = globalCache.get(key);
  const now = Date.now();

  if (cached && cached.expiresAt > now) {
    return cached.data as T;
  }

  const freshData = await fetcher();
  globalCache.set(key, {
    data: freshData,
    expiresAt: now + ttlMs,
  });
  return freshData;
}

// Track cached counts to avoid redundant broadcasts
const cachedListenerCounts = new Map<string, number>();

// Capture a reference to any active WebSocket to use for global broadcasts
let activeBroadcaster: ServerWebSocket<unknown> | null = null;

// ============================================================================
// Rate Limiting: Track likes per client per track
// ============================================================================
// Uses persistent clientId sent from the web client (stored in localStorage)
// This survives page reloads, so users can't abuse by refreshing
// Map: `${sessionId}:${clientId}` -> Set<trackKey>
const likesSent = new Map<string, Set<string>>();

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
      case "faster":
        faster++;
        break;
      case "slower":
        slower++;
        break;
      case "perfect":
        perfect++;
        break;
    }
  }

  return { faster, slower, perfect, total: faster + slower + perfect };
}

function hasLikedTrack(sessionId: string, clientId: string, track: TrackInfo): boolean {
  const key = `${sessionId}:${clientId}`;
  const clientLikes = likesSent.get(key);
  if (!clientLikes) return false;
  return clientLikes.has(getTrackKey(track));
}

function recordLike(sessionId: string, clientId: string, track: TrackInfo): void {
  const key = `${sessionId}:${clientId}`;
  if (!likesSent.has(key)) {
    likesSent.set(key, new Set());
  }
  likesSent.get(key)?.add(getTrackKey(track));
}

// Clean up likes when session ends
function clearLikesForSession(sessionId: string): void {
  // Delete all entries starting with sessionId:
  for (const key of likesSent.keys()) {
    if (key.startsWith(`${sessionId}:`)) {
      likesSent.delete(key);
    }
  }
}

// ============================================================================
// Poll State Management
// ============================================================================
// Track active polls and votes in memory for real-time updates

interface ActivePoll {
  id: number;
  sessionId: string;
  question: string;
  options: string[];
  votes: number[]; // Vote count per option
  votedClients: Map<string, number>; // clientId -> optionIndex (for restoration)
  endsAt?: Date; // Optional auto-close time
}

// Map: pollId -> ActivePoll
const activePolls = new Map<number, ActivePoll>();

// Map: sessionId -> current active poll ID (one poll at a time per session)
const sessionActivePoll = new Map<string, number>();

function getActivePoll(pollId: number): ActivePoll | undefined {
  return activePolls.get(pollId);
}

function getSessionPoll(sessionId: string): ActivePoll | undefined {
  const pollId = sessionActivePoll.get(sessionId);
  return pollId ? activePolls.get(pollId) : undefined;
}

function endPoll(pollId: number): ActivePoll | undefined {
  const poll = activePolls.get(pollId);
  if (poll) {
    activePolls.delete(pollId);
    sessionActivePoll.delete(poll.sessionId);
  }
  return poll;
}

// Poll database helpers (fire-and-forget async operations)
async function createPollInDb(
  sessionId: string,
  question: string,
  options: string[],
  currentTrack?: TrackInfo | null,
): Promise<number | null> {
  // Wait for session to be persisted (with timeout)
  let attempts = 0;
  const maxAttempts = 30;
  while (!(await ensureSessionPersisted(sessionId)) && attempts < maxAttempts) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    attempts++;
  }

  if (!persistedSessions.has(sessionId)) {
    console.error("❌ Session not persisted in DB after wait, cannot create poll:", sessionId);
    return null;
  }

  try {
    const [newPoll] = await db
      .insert(schema.polls)
      .values({
        sessionId,
        question,
        options, // Drizzle handles JSON array automatically
        status: "active",
        currentTrackArtist: currentTrack?.artist ?? null,
        currentTrackTitle: currentTrack?.title ?? null,
      })
      .returning({ id: schema.polls.id });
    return newPoll?.id ?? null;
  } catch (e) {
    console.error("❌ Failed to create poll:", e);
    return null;
  }
}

async function closePollInDb(pollId: number): Promise<void> {
  try {
    await db
      .update(schema.polls)
      .set({ status: "closed", endedAt: new Date() })
      .where(eq(schema.polls.id, pollId));
  } catch (e) {
    console.error("❌ Failed to close poll:", e);
  }
}

async function recordPollVote(
  pollId: number,
  clientId: string,
  optionIndex: number,
): Promise<void> {
  try {
    await db
      .insert(schema.pollVotes)
      .values({
        pollId,
        clientId,
        optionIndex,
      })
      .onConflictDoNothing();
  } catch (e) {
    console.error("❌ Failed to persist vote:", e);
  }
}

// ============================================================================
// Session Telemetry (Privacy-Focused Event Logging)
// ============================================================================

type SessionEventType = "connect" | "disconnect" | "reconnect" | "end";

interface SessionEventMetadata {
  reason?: string;
  reconnectMs?: number;
  clientVersion?: string;
}

/**
 * Log session lifecycle events for operational telemetry.
 * Fire-and-forget - does not block main flow.
 */
async function logSessionEvent(
  sessionId: string,
  eventType: SessionEventType,
  metadata?: SessionEventMetadata,
): Promise<void> {
  try {
    await db.insert(schema.sessionEvents).values({
      sessionId,
      eventType,
      metadata: metadata || null,
    });
    console.log(`📊 Telemetry: ${eventType} for session ${sessionId.substring(0, 8)}...`);
  } catch (e) {
    // Don't let telemetry errors affect main flow
    console.error("⚠️ Telemetry log failed (non-blocking):", e);
  }
}

// ============================================================================
// Protocol Helpers (ACK/NACK)
// ============================================================================

/**
 * Send an acknowledgment for a received message.
 */
function sendAck(ws: { send: (data: string) => void }, messageId: string): void {
  if (!messageId) return; // Only ACK if messageId was provided

  ws.send(
    JSON.stringify({
      type: "ACK",
      messageId,
      status: "ok",
      timestamp: new Date().toISOString(),
    }),
  );
}

/**
 * Send a negative acknowledgment with an error message.
 */
function sendNack(ws: { send: (data: string) => void }, messageId: string, error: string): void {
  if (!messageId) return; // Only NACK if messageId was provided

  ws.send(
    JSON.stringify({
      type: "NACK",
      messageId,
      error,
      timestamp: new Date().toISOString(),
    }),
  );
}

// ============================================================================
// Poll Management
// ============================================================================

// Track which sessions have been persisted to avoid race conditions
const persistedSessions = new Set<string>();
const lastPersistedTrackKey = new Map<string, string>(); // sessionId -> "artist:title"

/**
 * Check if session exists in DB (handling server restarts)
 */
async function ensureSessionPersisted(sessionId: string): Promise<boolean> {
  if (process.env.NODE_ENV === "test") return true; // Mock persistence in tests

  if (persistedSessions.has(sessionId)) return true;

  try {
    const results = await db
      .select({ id: schema.sessions.id })
      .from(schema.sessions)
      .where(eq(schema.sessions.id, sessionId));

    if (results.length > 0) {
      persistedSessions.add(sessionId);
      return true;
    }
  } catch (e) {
    console.error("Failed to check session existence:", e);
  }
  return false;
}

/**
 * Persist session to database - MUST complete before tracks can be saved
 */
async function persistSession(
  sessionId: string,
  djName: string,
  djUserId?: number | null,
): Promise<boolean> {
  if (process.env.NODE_ENV === "test") {
    persistedSessions.add(sessionId);
    return true;
  }

  try {
    await db
      .insert(schema.sessions)
      .values({
        id: sessionId,
        djName,
        djUserId: djUserId ?? null,
      })
      .onConflictDoNothing();
    persistedSessions.add(sessionId);
    console.log(`💾 Session persisted: ${sessionId}${djUserId ? ` (DJ ID: ${djUserId})` : ""}`);
    return true;
  } catch (e) {
    console.error("❌ Failed to persist session:", e);
    return false;
  }
}

/**
 * Persist played track to database
 * Only persists if session already exists in DB
 * Stores BPM, key, and fingerprint for analytics visualizations
 */
async function persistTrack(sessionId: string, track: TrackInfo): Promise<void> {
  const trackKey = `${track.artist}:${track.title}`;

  // Wait for session to be persisted (with timeout)
  let attempts = 0;
  while (!(await ensureSessionPersisted(sessionId)) && attempts < 20) {
    await new Promise((resolve) => setTimeout(resolve, 200)); // 4 sec wait
    attempts++;
  }

  if (!persistedSessions.has(sessionId)) {
    console.warn(`⚠️ Session ${sessionId} not found in DB, skipping track persistence`);
    return;
  }

  // Deduplication: Don't persist if it's the same song as last time for this session
  if (lastPersistedTrackKey.get(sessionId) === trackKey) {
    return;
  }

  try {
    if (process.env.NODE_ENV === "test") {
      console.log(`🧪 TEST MODE: Mocking track persistence for ${track.title}`);
      return;
    }

    const [inserted] = await db
      .insert(schema.playedTracks)
      .values({
        sessionId,
        artist: track.artist,
        title: track.title,
        // Core metrics
        bpm: track.bpm ? Math.round(track.bpm) : null,
        key: track.key ?? null,
        // Fingerprint metrics
        energy: track.energy ? Math.round(track.energy) : null,
        danceability: track.danceability ? Math.round(track.danceability) : null,
        brightness: track.brightness ? Math.round(track.brightness) : null,
        acousticness: track.acousticness ? Math.round(track.acousticness) : null,
        groove: track.groove ? Math.round(track.groove) : null,
      })
      .returning({ id: schema.playedTracks.id });

    if (inserted) {
      lastPersistedTrackKey.set(sessionId, trackKey);
      const bpmInfo = track.bpm ? ` (${track.bpm} BPM)` : "";
      console.log(
        `💾 Track persisted: ${track.artist} - ${track.title} (ID: ${inserted.id})${bpmInfo}`,
      );
    }
  } catch (e) {
    console.error("❌ Failed to persist track:", e);
  }
}
/**
 * Persist like to database with retry logic
 * Handles race condition where like arrives before track is persisted
 * @param track - The track that was liked
 * @param sessionId - The session ID (for context)
 * @param clientId - The client who liked it (for "my likes" feature)
 */
async function persistLike(track: TrackInfo, sessionId?: string, clientId?: string): Promise<void> {
  if (!sessionId) return;

  const maxRetries = 3;
  const retryDelays = [100, 200, 400]; // Exponential backoff in ms

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // 1. Find the specific "play instance" of this track in this session.
      const [playedTrack] = await db
        .select({ id: schema.playedTracks.id })
        .from(schema.playedTracks)
        .where(
          and(
            eq(schema.playedTracks.sessionId, sessionId),
            eq(schema.playedTracks.artist, track.artist),
            eq(schema.playedTracks.title, track.title),
          ),
        )
        .orderBy(desc(schema.playedTracks.playedAt))
        .limit(1);

      if (playedTrack) {
        // 2. Insert the like with strict Foreign Key
        await db.insert(schema.likes).values({
          sessionId: sessionId,
          clientId: clientId ?? null,
          playedTrackId: playedTrack.id,
        });
        console.log(
          `💾 Like persisted: ${track.title} (client: ${clientId?.substring(0, 20)}...${attempt > 0 ? `, attempt ${attempt + 1}` : ""})`,
        );
        return;
      }

      // Track not found - wait and retry if not last attempt
      if (attempt < maxRetries - 1) {
        console.log(
          `⏳ Like waiting for track: "${track.title}" (retry ${attempt + 1}/${maxRetries})`,
        );
        await new Promise((r) => setTimeout(r, retryDelays[attempt]));
      }
    } catch (e) {
      console.error("❌ Failed to persist like:", e);
      return;
    }
  }

  // All retries exhausted - log for monitoring
  console.error(
    `❌ Like lost after ${maxRetries} retries: "${track.title}" - track never appeared in played_tracks`,
  );
}

/**
 * Persist tempo votes for a track (called when track changes)
 * @param sessionId - Session ID
 * @param track - The track that was playing
 * @param votes - Aggregated vote counts
 */
async function persistTempoVotes(
  sessionId: string,
  track: TrackInfo,
  votes: { slower: number; perfect: number; faster: number },
): Promise<void> {
  // Only persist if there were any votes
  if (votes.slower === 0 && votes.perfect === 0 && votes.faster === 0) {
    return;
  }

  try {
    await db.insert(schema.tempoVotes).values({
      sessionId,
      trackArtist: track.artist,
      trackTitle: track.title,
      slowerCount: votes.slower,
      perfectCount: votes.perfect,
      fasterCount: votes.faster,
    });
    console.log(
      `🎚️ Tempo votes persisted: ${track.title} (🐢${votes.slower} ✅${votes.perfect} 🐇${votes.faster})`,
    );
  } catch (e) {
    console.error("❌ Failed to persist tempo votes:", e);
  }
}

/**
 * Mark session as ended in database
 */
async function endSessionInDb(sessionId: string): Promise<void> {
  try {
    await db
      .update(schema.sessions)
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
app.get("/health", async (c) => {
  try {
    // Deep Health Check: Verify DB connection
    // This is a zero-cost query ("SELECT 1") to ensure the connection pool is alive
    // Use raw SQL access if available or a simple query
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

// ============================================================================
// DJ Authentication API
// ============================================================================

// Helper: Generate URL-safe slug from DJ name

// Helper: Generate secure random token
function generateToken(): string {
  // Use crypto.randomUUID for high-entropy secure token
  return `pk_dj_${crypto.randomUUID().replace(/-/g, "")}`;
}

// Helper: Hash password using Bun's built-in bcrypt
async function hashPassword(password: string): Promise<string> {
  return await Bun.password.hash(password, {
    algorithm: "bcrypt",
    cost: 10,
  });
}

// Helper: Hash token for storage (fast SHA-256 for API tokens)
// We use SHA-256 because API tokens are already high-entropy.
// Bcrypt is too slow (100ms) for high-frequency API auth if we ever need it.
async function hashToken(token: string): Promise<string> {
  const hash = new Bun.CryptoHasher("sha256");
  hash.update(token);
  return hash.digest("hex");
}

// Helper: Verify password
async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return await Bun.password.verify(password, hash);
}

// Helper: Validate token and return DJ user
async function validateToken(
  token: string,
): Promise<{ id: number; displayName: string; email: string; slug: string } | null> {
  try {
    // Hash the incoming token to look it up in DB
    const tokenHash = await hashToken(token);

    const result = await db
      .select({
        id: schema.djUsers.id,
        displayName: schema.djUsers.displayName,
        email: schema.djUsers.email,
        slug: schema.djUsers.slug,
      })
      .from(schema.djTokens)
      .innerJoin(schema.djUsers, eq(schema.djTokens.djUserId, schema.djUsers.id))
      .where(eq(schema.djTokens.token, tokenHash)) // Look up by HASH
      .limit(1);

    if (result.length === 0) return null;

    const user = result[0];
    if (!user) return null;

    // Update last used timestamp (fire-and-forget)
    db.update(schema.djTokens)
      .set({ lastUsed: new Date() })
      .where(eq(schema.djTokens.token, tokenHash))
      .catch(() => {});

    return user;
  } catch (e) {
    console.error("Token validation error:", e);
    return null;
  }
}

/**
 * POST /api/auth/register
 * Register a new DJ account
 */
app.post("/api/auth/register", authLimiter, async (c) => {
  try {
    const body = await c.req.json();
    const { email, password, displayName } = body as {
      email?: string;
      password?: string;
      displayName?: string;
    };

    // Validation
    if (!email || !password || !displayName) {
      return c.json({ error: "Email, password, and display name are required" }, 400);
    }

    if (password.length < 8) {
      return c.json({ error: "Password must be at least 8 characters" }, 400);
    }

    if (password.length > 128) {
      return c.json({ error: "Password must be at most 128 characters" }, 400);
    }

    // Proper email validation using Zod
    const emailSchema = z.string().email();
    const emailResult = emailSchema.safeParse(email);
    if (!emailResult.success) {
      return c.json({ error: "Invalid email format" }, 400);
    }

    const slug = slugify(displayName);
    if (slug.length < 2) {
      return c.json({ error: "Display name must be at least 2 characters" }, 400);
    }

    // Check if email already exists
    const existingEmail = await db
      .select({ id: schema.djUsers.id })
      .from(schema.djUsers)
      .where(eq(schema.djUsers.email, email.toLowerCase()))
      .limit(1);

    if (existingEmail.length > 0) {
      return c.json({ error: "Email already registered" }, 409);
    }

    // Check if slug already exists
    const existingSlug = await db
      .select({ id: schema.djUsers.id })
      .from(schema.djUsers)
      .where(eq(schema.djUsers.slug, slug))
      .limit(1);

    if (existingSlug.length > 0) {
      return c.json({ error: "Display name already taken" }, 409);
    }

    // Hash password and create user
    const passwordHash = await hashPassword(password);

    const [newUser] = await db
      .insert(schema.djUsers)
      .values({
        email: email.toLowerCase(),
        passwordHash,
        displayName,
        slug,
      })
      .returning({ id: schema.djUsers.id });

    if (!newUser) {
      return c.json({ error: "Failed to create account" }, 500);
    }

    // Generate token
    const token = generateToken();
    const tokenHash = await hashToken(token); // Store hash, return raw

    await db.insert(schema.djTokens).values({
      djUserId: newUser.id,
      token: tokenHash,
      name: "Default",
    });

    console.log(`✅ DJ registered: ${displayName} (${email})`);

    return c.json(
      {
        success: true,
        user: {
          id: newUser.id,
          email: email.toLowerCase(),
          displayName,
          slug,
        },
        token,
      },
      201,
    );
  } catch (e) {
    console.error("Registration error:", e);
    return c.json({ error: "Registration failed" }, 500);
  }
});

/**
 * POST /api/auth/login
 * Login with email and password, returns token
 */
app.post("/api/auth/login", authLimiter, async (c) => {
  // 🔐 CSRF Protection: Require custom header (browsers won't send this cross-origin)
  const requestedWith = c.req.header("X-Requested-With");
  if (requestedWith !== "Pika") {
    return c.json({ error: "Invalid request" }, 403);
  }

  try {
    const body = await c.req.json();
    const { email, password } = body as { email?: string; password?: string };

    if (!email || !password) {
      return c.json({ error: "Email and password are required" }, 400);
    }

    // Find user by email
    const users = await db
      .select({
        id: schema.djUsers.id,
        email: schema.djUsers.email,
        passwordHash: schema.djUsers.passwordHash,
        displayName: schema.djUsers.displayName,
        slug: schema.djUsers.slug,
      })
      .from(schema.djUsers)
      .where(eq(schema.djUsers.email, email.toLowerCase()))
      .limit(1);

    if (users.length === 0) {
      return c.json({ error: "Invalid email or password" }, 401);
    }

    const user = users[0];
    if (!user) {
      return c.json({ error: "Invalid email or password" }, 401);
    }

    // Verify password
    const validPassword = await verifyPassword(password, user.passwordHash);
    if (!validPassword) {
      return c.json({ error: "Invalid email or password" }, 401);
    }

    // Always generate a NEW token. We cannot look up existing raw tokens because they are hashed.
    // This allows multiple active sessions (e.g. desktop app + mobile dashboard).
    const token = generateToken();
    const tokenHash = await hashToken(token);

    await db.insert(schema.djTokens).values({
      djUserId: user.id,
      token: tokenHash, // Store hash
      name: "Default",
    });

    console.log(`✅ DJ logged in: ${user.displayName} (New token generated)`);

    return c.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        slug: user.slug,
      },
      token, // Return raw token to user ONE TIME
    });
  } catch (e) {
    console.error("Login error:", e);
    return c.json({ error: "Login failed" }, 500);
  }
});

/**
 * GET /api/auth/me
 * Validate token and return user info
 */
app.get("/api/auth/me", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Authorization token required" }, 401);
  }

  const token = authHeader.substring(7);
  const user = await validateToken(token);

  if (!user) {
    return c.json({ error: "Invalid token" }, 401);
  }

  return c.json({
    success: true,
    user,
  });
});

/**
 * POST /api/auth/regenerate-token
 * Generate a new token (invalidates old one)
 */
app.post("/api/auth/regenerate-token", authLimiter, async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Authorization token required" }, 401);
  }

  const oldToken = authHeader.substring(7);
  const user = await validateToken(oldToken);

  if (!user) {
    return c.json({ error: "Invalid token" }, 401);
  }

  try {
    // Delete old token
    const oldTokenHash = await hashToken(oldToken);
    await db.delete(schema.djTokens).where(eq(schema.djTokens.token, oldTokenHash));

    // Create new token
    const newToken = generateToken();
    const newTokenHash = await hashToken(newToken);

    await db.insert(schema.djTokens).values({
      djUserId: user.id,
      token: newTokenHash, // Store hash
      name: "Default",
    });

    console.log(`🔄 Token regenerated for: ${user.displayName}`);

    return c.json({
      success: true,
      token: newToken,
    });
  } catch (e) {
    console.error("Token regeneration error:", e);
    return c.json({ error: "Failed to regenerate token" }, 500);
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

// Get active sessions (REST endpoint)
app.get("/sessions", (c) => {
  const sessions = Array.from(activeSessions.values());
  return c.json(sessions);
});

// Get active sessions for landing page (lightweight check, no WebSocket needed)
app.get("/api/sessions/active", (c) => {
  const sessions = Array.from(activeSessions.values());

  if (sessions.length === 0) {
    return c.json({
      live: false,
      sessions: [],
    });
  }

  // Return active sessions with basic info
  const activeSummary = sessions.map((session) => ({
    sessionId: session.sessionId,
    djName: session.djName,
    startedAt: session.startedAt,
    currentTrack: session.currentTrack
      ? {
          title: session.currentTrack.title,
          artist: session.currentTrack.artist,
          bpm: session.currentTrack.bpm,
        }
      : null,
    listenerCount: getListenerCount(session.sessionId),
    // Calculate Vibe Momentum (0.0 to 1.0)
    // Formula: (Listeners * 0.4) + (RecentLikes * 0.6) - normalized
    momentum: Math.min(
      1,
      getListenerCount(session.sessionId) * 0.05 + (likesSent.get(session.sessionId) ? 0.2 : 0), // Simplistic start
    ),
  }));

  return c.json({
    live: true,
    count: sessions.length,
    sessions: activeSummary,
  });
});

// Get session track history (last 5 tracks)
app.get("/api/session/:sessionId/history", async (c) => {
  const sessionId = c.req.param("sessionId");

  try {
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
    // Get session metadata from database (activeSessions is cleared when session ends)
    const sessionData = await db
      .select({
        id: schema.sessions.id,
        djName: schema.sessions.djName,
        startedAt: schema.sessions.startedAt,
        endedAt: schema.sessions.endedAt,
      })
      .from(schema.sessions)
      .where(eq(schema.sessions.id, sessionId))
      .limit(1);

    const dbSession = sessionData[0];

    // Get all tracks for this session (including fingerprint for analytics)
    const tracks = await db
      .select({
        id: schema.playedTracks.id,
        artist: schema.playedTracks.artist,
        title: schema.playedTracks.title,
        bpm: schema.playedTracks.bpm,
        key: schema.playedTracks.key,
        energy: schema.playedTracks.energy,
        danceability: schema.playedTracks.danceability,
        brightness: schema.playedTracks.brightness,
        acousticness: schema.playedTracks.acousticness,
        groove: schema.playedTracks.groove,
        playedAt: schema.playedTracks.playedAt,
      })
      .from(schema.playedTracks)
      .where(eq(schema.playedTracks.sessionId, sessionId))
      .orderBy(schema.playedTracks.playedAt);

    if (!dbSession) {
      console.log(`📭 Recap not found for session: ${sessionId} (session not in DB)`);
      return c.json({ error: "Session not found" }, 404);
    }

    // Get total likes count for this session
    const likesResult = await db
      .select({ count: count() })
      .from(schema.likes)
      .where(eq(schema.likes.sessionId, sessionId));

    const totalLikes = likesResult[0]?.count || 0;

    // Get per-track like counts (Batched query to avoid N+1)
    const trackLikesData = await db
      .select({
        playedTrackId: schema.likes.playedTrackId,
        count: count(),
      })
      .from(schema.likes)
      .where(eq(schema.likes.sessionId, sessionId))
      .groupBy(schema.likes.playedTrackId);

    const trackLikeCounts = new Map<number, number>();
    for (const item of trackLikesData) {
      if (item.playedTrackId) {
        trackLikeCounts.set(item.playedTrackId, item.count);
      }
    }

    // Get per-track tempo votes
    const tempoVotesData = await db
      .select({
        trackArtist: schema.tempoVotes.trackArtist,
        trackTitle: schema.tempoVotes.trackTitle,
        slowerCount: schema.tempoVotes.slowerCount,
        perfectCount: schema.tempoVotes.perfectCount,
        fasterCount: schema.tempoVotes.fasterCount,
      })
      .from(schema.tempoVotes)
      .where(eq(schema.tempoVotes.sessionId, sessionId));

    const trackTempoVotes = new Map<string, { slower: number; perfect: number; faster: number }>();
    for (const tv of tempoVotesData) {
      trackTempoVotes.set(`${tv.trackArtist}:${tv.trackTitle}`, {
        slower: tv.slowerCount,
        perfect: tv.perfectCount,
        faster: tv.fasterCount,
      });
    }

    // Get polls for this session
    const pollsData = await db
      .select({
        id: schema.polls.id,
        question: schema.polls.question,
        options: schema.polls.options,
        status: schema.polls.status,
        startedAt: schema.polls.startedAt,
        endedAt: schema.polls.endedAt,
        currentTrackArtist: schema.polls.currentTrackArtist,
        currentTrackTitle: schema.polls.currentTrackTitle,
      })
      .from(schema.polls)
      .where(eq(schema.polls.sessionId, sessionId));

    // Get vote counts for each poll
    const pollsWithResults = await Promise.all(
      pollsData.map(async (poll) => {
        const votes = await db
          .select({
            optionIndex: schema.pollVotes.optionIndex,
            count: count(),
          })
          .from(schema.pollVotes)
          .where(eq(schema.pollVotes.pollId, poll.id))
          .groupBy(schema.pollVotes.optionIndex);

        const options = poll.options as string[];
        const voteCounts = new Array(options.length).fill(0) as number[];

        for (const v of votes) {
          if (v.optionIndex >= 0 && v.optionIndex < voteCounts.length) {
            voteCounts[v.optionIndex] = v.count;
          }
        }

        const totalVotes = voteCounts.reduce((a, b) => a + b, 0);
        const winnerIndex = totalVotes > 0 ? voteCounts.indexOf(Math.max(...voteCounts)) : -1;

        return {
          id: poll.id,
          question: poll.question,
          options,
          votes: voteCounts,
          totalVotes,
          winnerIndex,
          winner: winnerIndex >= 0 ? options[winnerIndex] : null,
          startedAt: poll.startedAt,
          endedAt: poll.endedAt,
          // Track context: what was playing when poll was created
          currentTrack:
            poll.currentTrackArtist && poll.currentTrackTitle
              ? { artist: poll.currentTrackArtist, title: poll.currentTrackTitle }
              : null,
        };
      }),
    );

    // Calculate session stats
    const lastTrack = tracks[tracks.length - 1];
    const startTime = dbSession.startedAt;

    // Calculate effective end time to prevent "zombie sessions" (forgotten open sessions)
    // If session is ended in DB, use that.
    // If not ended: use last track time + 5 minutes (padding).
    // Fallback to current time only if no tracks exist.
    let endTime: Date;
    if (dbSession.endedAt) {
      endTime = dbSession.endedAt;
    } else if (lastTrack) {
      // For active/forgotten sessions:
      // Cap duration at 5 mins after last track start to handle forgotten sessions.
      // But if current time is BEFORE that cap (i.e. truly active), use current time.
      const cap = new Date(new Date(lastTrack.playedAt).getTime() + 5 * 60 * 1000);
      const now = new Date();
      endTime = now < cap ? now : cap;
    } else {
      endTime = new Date();
    }

    return c.json({
      sessionId,
      djName: dbSession?.djName || "DJ",
      startedAt: startTime?.toISOString(),
      endedAt: endTime?.toISOString(),
      trackCount: tracks.length,
      totalLikes,
      tracks: tracks.map((t, index) => {
        const tempoData = trackTempoVotes.get(`${t.artist}:${t.title}`);
        return {
          position: index + 1,
          artist: t.artist,
          title: t.title,
          bpm: t.bpm,
          key: t.key,
          // Fingerprint data
          energy: t.energy,
          danceability: t.danceability,
          brightness: t.brightness,
          acousticness: t.acousticness,
          groove: t.groove,
          playedAt: t.playedAt,
          likes: trackLikeCounts.get(t.id) || 0,
          tempo: tempoData
            ? {
                slower: tempoData.slower,
                perfect: tempoData.perfect,
                faster: tempoData.faster,
              }
            : null,
        };
      }),
      polls: pollsWithResults,
      totalPolls: pollsWithResults.length,
      totalPollVotes: pollsWithResults.reduce((sum, p) => sum + p.totalVotes, 0),
    });
  } catch (e) {
    console.error("Failed to fetch recap:", e);
    return c.json({ error: "Failed to fetch recap" }, 500);
  }
});

// ============================================================================
// Fingerprint Sync API (for desktop to sync analysis data)
// ============================================================================

/**
 * Sync fingerprint/analysis data for tracks in a session.
 * Called by desktop at session end to update played_tracks with BPM, energy, etc.
 */
app.post("/api/session/:sessionId/sync-fingerprints", async (c) => {
  const sessionId = c.req.param("sessionId");

  const body = await c.req.json<{
    tracks: Array<{
      artist: string;
      title: string;
      bpm?: number | null;
      key?: string | null;
      energy?: number | null;
      danceability?: number | null;
      brightness?: number | null;
      acousticness?: number | null;
      groove?: number | null;
    }>;
  }>();

  if (!body.tracks || !Array.isArray(body.tracks)) {
    return c.json({ error: "Invalid request: tracks array required" }, 400);
  }

  console.log(`🔄 Syncing fingerprints for session ${sessionId}: ${body.tracks.length} tracks`);

  try {
    let updated = 0;

    for (const track of body.tracks) {
      // Skip tracks without data
      if (!track.bpm && !track.key && !track.energy) {
        continue;
      }

      // Build update object with only non-null values
      const updateData: Record<string, unknown> = {};
      if (track.bpm != null) updateData["bpm"] = Math.round(track.bpm);
      if (track.key != null) updateData["key"] = track.key;
      if (track.energy != null) updateData["energy"] = Math.round(track.energy);
      if (track.danceability != null) updateData["danceability"] = Math.round(track.danceability);
      if (track.brightness != null) updateData["brightness"] = Math.round(track.brightness);
      if (track.acousticness != null) updateData["acousticness"] = Math.round(track.acousticness);
      if (track.groove != null) updateData["groove"] = Math.round(track.groove);

      if (Object.keys(updateData).length === 0) {
        continue;
      }

      // Update by sessionId + artist + title match
      const result = await db
        .update(schema.playedTracks)
        .set(updateData)
        .where(
          and(
            eq(schema.playedTracks.sessionId, sessionId),
            eq(schema.playedTracks.artist, track.artist),
            eq(schema.playedTracks.title, track.title),
          ),
        )
        .returning({ id: schema.playedTracks.id });

      if (result.length > 0) {
        updated++;
      }
    }

    console.log(`✅ Synced ${updated}/${body.tracks.length} tracks for session ${sessionId}`);

    return c.json({
      synced: updated,
      total: body.tracks.length,
      sessionId,
    });
  } catch (e) {
    console.error("Failed to sync fingerprints:", e);
    return c.json({ error: "Failed to sync fingerprints" }, 500);
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
    console.log(`🔍 Fetching likes for client: ${clientId}`);
    // Get all likes for this client, ordered by most recent first
    const likes = await db
      .select({
        id: schema.likes.id,
        sessionId: schema.likes.sessionId,
        artist: schema.playedTracks.artist,
        title: schema.playedTracks.title,
        likedAt: schema.likes.createdAt,
      })
      .from(schema.likes)
      .innerJoin(schema.playedTracks, eq(schema.likes.playedTrackId, schema.playedTracks.id))
      .where(eq(schema.likes.clientId, clientId))
      .orderBy(desc(schema.likes.createdAt))
      .limit(100); // Reasonable limit

    // Get session info for each unique session in a single batch
    const sessionIds = [...new Set(likes.map((l) => l.sessionId).filter(Boolean))];
    const sessionsMap = new Map<string, { djName: string; startedAt: Date | null }>();

    console.log(`📊 Found ${likes.length} likes, unique sessions: ${sessionIds.length}`);

    if (sessionIds.length > 0) {
      console.log(`📦 Batch fetching sessions: ${sessionIds.join(", ")}`);
      const sessions = await db
        .select({
          id: schema.sessions.id,
          djName: schema.sessions.djName,
          startedAt: schema.sessions.startedAt,
        })
        .from(schema.sessions)
        .where(inArray(schema.sessions.id, sessionIds as string[]));

      for (const session of sessions) {
        sessionsMap.set(session.id, session);
      }
      console.log(`✅ Fetched ${sessions.length} session metadata records`);
    }

    // Enrich likes with session info
    const enrichedLikes = likes.map((like) => {
      if (like.sessionId) {
        const sessionInfo = sessionsMap.get(like.sessionId);
        if (sessionInfo) {
          return {
            ...like,
            djName: sessionInfo.djName,
            sessionDate: sessionInfo.startedAt,
          };
        }
      }
      return {
        ...like,
        djName: null,
        sessionDate: null,
      };
    });

    return c.json({
      clientId,
      totalLikes: enrichedLikes.length,
      likes: enrichedLikes,
    });
  } catch (error) {
    console.error("Failed to fetch client likes:", error);
    return c.json({ error: "Failed to fetch likes" }, 500);
  }
});

// ============================================================================
// DJ Profile API
// ============================================================================

// Note: slugify function is defined above in the Auth section

// Get DJ profile by slug
app.get("/api/dj/:slug", async (c) => {
  const slug = c.req.param("slug");

  try {
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
    const djSessions = allSessions.filter((session) => slugify(session.djName) === slug);

    if (djSessions.length === 0) {
      return c.json({ error: "DJ not found" }, 404);
    }

    const firstSession = djSessions[0];
    if (!firstSession) {
      return c.json({ error: "DJ not found" }, 404);
    }
    const djName = firstSession.djName;

    // Limit to 20 most recent sessions BEFORE fetching counts to avoid N+1
    const recentSessions = djSessions
      .sort((a, b) => (b.startedAt?.getTime() || 0) - (a.startedAt?.getTime() || 0))
      .slice(0, 20);

    const sessionIds = recentSessions.map((s) => s.id);
    const countsMap = new Map<string, number>();

    if (sessionIds.length > 0) {
      const trackCounts = await db
        .select({
          sessionId: schema.playedTracks.sessionId,
          count: count(),
        })
        .from(schema.playedTracks)
        .where(inArray(schema.playedTracks.sessionId, sessionIds))
        .groupBy(schema.playedTracks.sessionId);

      for (const row of trackCounts) {
        if (row.sessionId) countsMap.set(row.sessionId, row.count);
      }
    }

    const sessionsWithCounts = recentSessions.map((session) => ({
      id: session.id,
      djName: session.djName,
      startedAt: session.startedAt?.toISOString() || new Date().toISOString(),
      endedAt: session.endedAt?.toISOString() || null,
      trackCount: countsMap.get(session.id) || 0,
    }));

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
  } catch (error) {
    console.error("Failed to fetch DJ profile:", error);
    return c.json({ error: "Failed to fetch DJ profile" }, 500);
  }
});

// ============================================================================
// Global Stats & Discovery API
// ============================================================================

/**
 * Get the most liked tracks across all sessions.
 * This is used for the "Live" zero-state to show community favorites.
 */
app.get("/api/stats/top-tracks", async (c) => {
  try {
    const topTracks = await withCache("top-tracks", 5 * 60 * 1000, async () => {
      return await db
        .select({
          artist: schema.playedTracks.artist,
          title: schema.playedTracks.title,
          likeCount: count(),
        })
        .from(schema.playedTracks)
        .innerJoin(schema.likes, eq(schema.playedTracks.id, schema.likes.playedTrackId))
        .groupBy(schema.playedTracks.artist, schema.playedTracks.title)
        .orderBy(desc(count()))
        .limit(10);
    });

    return c.json(topTracks);
  } catch (e) {
    console.error("Failed to fetch top tracks:", e);
    return c.json([], 500);
  }
});

/**
 * Get recent completed sessions.
 */
app.get("/api/sessions/recent", async (c) => {
  try {
    const recentSessions = await withCache("recent-sessions", 5 * 60 * 1000, async () => {
      return await db
        .select({
          id: schema.sessions.id,
          djName: schema.sessions.djName,
          startedAt: schema.sessions.startedAt,
          endedAt: schema.sessions.endedAt,
        })
        .from(schema.sessions)
        .where(isNotNull(schema.sessions.endedAt))
        .orderBy(desc(schema.sessions.endedAt))
        .limit(5);
    });

    return c.json(recentSessions);
  } catch (e) {
    console.error("Failed to fetch recent sessions:", e);
    return c.json([], 500);
  }
});

/**
 * Get global aggregate statistics for the analytics dashboard.
 * Returns total sessions, tracks, and likes across all time.
 */
app.get("/api/stats/global", async (c) => {
  try {
    const stats = await withCache("global-stats", 5 * 60 * 1000, async () => {
      const [sessionsResult, tracksResult, likesResult] = await Promise.all([
        db.select({ count: count() }).from(schema.sessions),
        db.select({ count: count() }).from(schema.playedTracks),
        db.select({ count: count() }).from(schema.likes),
      ]);

      return {
        totalSessions: sessionsResult[0]?.count ?? 0,
        totalTracks: tracksResult[0]?.count ?? 0,
        totalLikes: likesResult[0]?.count ?? 0,
      };
    });

    return c.json(stats);
  } catch (e) {
    console.error("Failed to fetch global stats:", e);
    return c.json({ totalSessions: 0, totalTracks: 0, totalLikes: 0 }, 500);
  }
});

// ============================================================================
// WebSocket Handler
// ============================================================================

// WebSocket connection rate limiting (per IP)
// Prevents rapid connect/disconnect abuse
const wsConnectionAttempts = new Map<string, { count: number; resetAt: number }>();
const WS_RATE_LIMIT = Number(process.env["WS_RATE_LIMIT"] ?? 20); // Max connections per window
const WS_RATE_WINDOW = 60 * 1000; // 1 minute window

// Cleanup stale entries every 5 minutes
setInterval(
  () => {
    const now = Date.now();
    for (const [ip, data] of wsConnectionAttempts) {
      if (now > data.resetAt) {
        wsConnectionAttempts.delete(ip);
      }
    }
  },
  5 * 60 * 1000,
);

function checkWsRateLimit(ip: string): boolean {
  const now = Date.now();
  const attempts = wsConnectionAttempts.get(ip);

  if (!attempts || now > attempts.resetAt) {
    // First connection or window expired
    wsConnectionAttempts.set(ip, { count: 1, resetAt: now + WS_RATE_WINDOW });
    return true;
  }

  if (attempts.count >= WS_RATE_LIMIT) {
    console.warn(
      `⚠️ WS rate limit exceeded for IP: ${ip.substring(0, 10)}... (${attempts.count} attempts)`,
    );
    return false;
  }

  attempts.count++;
  return true;
}

app.get(
  "/ws",
  upgradeWebSocket((c) => {
    // Rate limit check (best effort - may not block all cases due to upgrade timing)
    const ip =
      c.req.header("CF-Connecting-IP") ||
      c.req.header("X-Forwarded-For")?.split(",")[0] ||
      "unknown";

    if (!checkWsRateLimit(ip)) {
      console.log(`🚫 WS connection rejected for rate-limited IP: ${ip.substring(0, 10)}...`);
      // Note: Hono's upgradeWebSocket doesn't easily support rejection,
      // but we log and the connection will be closed quickly
    }

    // clientId will be set when client sends SUBSCRIBE with their persistent ID
    let clientId: string | null = null;
    // Track if this connection is a listener (dancer) vs DJ
    let isListener = false;
    // Track which session this listener is subscribed to
    let subscribedSessionId: string | null = null;
    // Track if this connection is a DJ and which session they own
    let djSessionId: string | null = null;

    return {
      onOpen(_event, ws) {
        console.log("🔌 Client connected");

        // Subscribe all clients to the live-session channel
        const rawWs = ws.raw as ServerWebSocket;
        rawWs.subscribe("live-session");
      },

      onMessage(event, ws) {
        try {
          // Security Check: Enforce 10KB message limit
          const messageSize =
            event.data instanceof ArrayBuffer
              ? event.data.byteLength
              : typeof event.data === "string"
                ? event.data.length
                : String(event.data).length;

          if (messageSize > 10 * 1024) {
            console.error(`❌ Message too large: ${messageSize} bytes (limit 10KB)`);
            ws.close(1009, "Message too large");
            return;
          }

          const data = event.data.toString();
          const json = JSON.parse(data);

          // 🔐 11/10 Security: Strict Schema-First Validation
          // We validate the entire message structure BEFORE extracting any fields.
          const result = WebSocketMessageSchema.safeParse(json);

          if (!result.success) {
            console.error("❌ Invalid message schema:", result.error.format());
            return;
          }

          const message = result.data as WebSocketMessage & {
            messageId?: string;
            clientId?: string;
          };
          const rawWs = ws.raw as ServerWebSocket;
          const messageId = message.messageId;

          // Extracted clientId from VALIDATED data
          if (message.clientId) {
            clientId = message.clientId;
          }

          // Capture broadcaster reference for heartbeat
          if (djSessionId) {
            activeBroadcaster = rawWs;
          }

          // Skip logging frequent messages (SUBSCRIBE is logged separately when new)
          if (message.type !== "SUBSCRIBE") {
            console.log(`📨 Received: ${message.type}`);
          }

          switch (message.type) {
            case "REGISTER_SESSION": {
              // Wrap in async IIFE for token validation
              (async () => {
                const sessionId = message.sessionId || `session_${Date.now()}`;
                const requestedDjName = message.djName || "DJ";

                // 🔐 Token validation for DJ authentication
                const djToken = (message as { token?: string }).token;
                let djUserId: number | null = null;
                let djName = requestedDjName;

                if (process.env.NODE_ENV === "test") {
                  console.log("🧪 TEST MODE: Bypassing auth validation");
                  // In test mode, we accept any "token" as valid or just skip it
                  djUserId = 999;
                  djName = requestedDjName || "Test DJ";
                } else if (djToken) {
                  // Validate token and get DJ info
                  const djUser = await validateToken(djToken);
                  if (djUser) {
                    djUserId = djUser.id;
                    djName = djUser.displayName; // Use registered name
                    console.log(`🔐 Authenticated DJ: ${djName} (ID: ${djUserId})`);
                  } else {
                    console.log(`⚠️ Invalid token provided, using anonymous mode`);
                  }
                }

                const session: LiveSession = {
                  sessionId,
                  djName,
                  startedAt: new Date().toISOString(),
                };
                activeSessions.set(sessionId, session);
                console.log(
                  `🎧 DJ going live: ${djName} (${sessionId})${djUserId ? ` [Verified]` : ` [Anonymous]`}`,
                );

                // 💾 Persist to database
                await persistSession(sessionId, djName, djUserId);
                console.log(`✅ Session ready for polls: ${sessionId}`);

                // Track this connection as owning this session
                djSessionId = sessionId;

                // Confirm registration to the client
                ws.send(
                  JSON.stringify({
                    type: "SESSION_REGISTERED",
                    sessionId,
                    authenticated: !!djUserId,
                    djName,
                  }),
                );

                if (messageId) sendAck(ws, messageId);

                // Broadcast to all subscribers
                rawWs.publish(
                  "live-session",
                  JSON.stringify({
                    type: "SESSION_STARTED",
                    sessionId,
                    djName,
                  }),
                );

                // 📊 Telemetry: Log DJ connect event
                logSessionEvent(sessionId, "connect", { clientVersion: PIKA_VERSION });
              })().catch((e) => console.error("❌ REGISTER_SESSION error:", e));
              break;
            }

            case "BROADCAST_TRACK": {
              // 🔐 Security: Verify this connection owns the session
              if (djSessionId !== message.sessionId) {
                console.warn(
                  `⚠️ Unauthorized broadcast attempt: connection owns ${djSessionId || "none"}, tried to broadcast to ${message.sessionId}`,
                );
                return;
              }

              // 🔐 Security: Nonce deduplication (prevents replay and retry duplicates)
              if (!checkAndRecordNonce(messageId, message.sessionId)) {
                // Duplicate message - send ACK but don't process
                console.log(`🔄 Skipping duplicate BROADCAST_TRACK (messageId: ${messageId})`);
                if (messageId) sendAck(ws, messageId);
                return;
              }

              const session = activeSessions.get(message.sessionId);
              if (session) {
                // 🎚️ Persist tempo votes for the PREVIOUS track (if any)
                if (session.currentTrack) {
                  const prevTrack = session.currentTrack;

                  // Only reset if this is truly a DIFFERENT track
                  const isNewTrack =
                    prevTrack.artist !== message.track.artist ||
                    prevTrack.title !== message.track.title;

                  if (isNewTrack) {
                    const feedback = getTempoFeedback(message.sessionId);
                    if (feedback.total > 0) {
                      persistTempoVotes(message.sessionId, prevTrack, {
                        slower: feedback.slower,
                        perfect: feedback.perfect,
                        faster: feedback.faster,
                      });
                    }

                    // Clear tempo votes for this session (fresh start for new track)
                    tempoVotes.delete(message.sessionId);

                    // Broadcast to all clients to reset their tempo vote UI
                    rawWs.publish(
                      "live-session",
                      JSON.stringify({
                        type: "TEMPO_RESET",
                        sessionId: message.sessionId,
                      }),
                    );
                  }
                }

                session.currentTrack = message.track;
                console.log(`🎵 Now playing: ${message.track.artist} - ${message.track.title}`);

                // 💾 Persist to database
                persistTrack(message.sessionId, message.track);

                // Broadcast to all subscribers
                rawWs.publish(
                  "live-session",
                  JSON.stringify({
                    type: "NOW_PLAYING",
                    sessionId: message.sessionId,
                    djName: session.djName || "DJ",
                    track: message.track,
                  }),
                );
                if (messageId) sendAck(ws, messageId);
              } else {
                if (messageId) sendNack(ws, messageId, "Session not found");
              }
              break;
            }

            case "TRACK_STOPPED": {
              // 🔐 Security: Verify this connection owns the session
              if (djSessionId !== message.sessionId) {
                console.warn(
                  `⚠️ Unauthorized track stop attempt: connection owns ${djSessionId || "none"}, tried to stop track for ${message.sessionId}`,
                );
                if (messageId) sendNack(ws, messageId, "Unauthorized track stop");
                return;
              }

              const session = activeSessions.get(message.sessionId);
              if (session) {
                delete session.currentTrack;
                console.log(`⏸️ Track stopped for session: ${message.sessionId}`);

                rawWs.publish(
                  "live-session",
                  JSON.stringify({
                    type: "TRACK_STOPPED",
                    sessionId: message.sessionId,
                  }),
                );
                if (messageId) sendAck(ws, messageId);
              } else {
                if (messageId) sendNack(ws, messageId, "Session not found");
              }
              break;
            }

            case "END_SESSION": {
              // 🔐 Security: Verify this connection owns the session
              if (djSessionId !== message.sessionId) {
                console.warn(
                  `⚠️ Unauthorized end session attempt: connection owns ${djSessionId || "none"}, tried to end ${message.sessionId}`,
                );
                if (messageId) sendNack(ws, messageId, "Unauthorized end session");
                return;
              }

              const session = activeSessions.get(message.sessionId);
              if (session) {
                console.log(`👋 Session ended: ${session.djName}`);

                // 🎚️ Persist tempo votes for the LAST track (if any)
                // This was missing - tempo votes were only persisted on track change!
                if (session.currentTrack) {
                  const feedback = getTempoFeedback(message.sessionId);
                  if (feedback.total > 0) {
                    console.log(`🎚️ Persisting final tempo votes: ${JSON.stringify(feedback)}`);
                    persistTempoVotes(message.sessionId, session.currentTrack, {
                      slower: feedback.slower,
                      perfect: feedback.perfect,
                      faster: feedback.faster,
                    });
                  }
                  // Clear tempo votes for this session
                  tempoVotes.delete(message.sessionId);
                }

                activeSessions.delete(message.sessionId);

                // 💾 Update in database
                endSessionInDb(message.sessionId);

                // 🧹 Clean up all in-memory state for this session
                clearLikesForSession(message.sessionId);
                sessionListeners.delete(message.sessionId);
                persistedSessions.delete(message.sessionId);

                rawWs.publish(
                  "live-session",
                  JSON.stringify({
                    type: "SESSION_ENDED",
                    sessionId: message.sessionId,
                  }),
                );
                if (messageId) sendAck(ws, messageId);
              } else {
                if (messageId) sendNack(ws, messageId, "Session not found");
              }
              break;
            }

            case "SEND_LIKE": {
              const track = message.payload.track;
              // Get sessionId from message (new) or fall back to first active session (legacy)
              const likeSessionId =
                (message as { sessionId?: string }).sessionId ||
                Array.from(activeSessions.keys())[0];

              if (!likeSessionId) {
                console.log("⚠️ Like rejected: no active session found");
                if (messageId) sendNack(ws, messageId, "No active session found");
                break;
              }

              // Require clientId for rate limiting
              if (!clientId) {
                console.log("⚠️ Like rejected: no clientId provided");
                ws.send(
                  JSON.stringify({
                    type: "ERROR",
                    message: "Client ID required for likes",
                  }),
                );
                if (messageId) sendNack(ws, messageId, "Client ID required for likes");
                break;
              }

              // Check if this client has already liked this track
              const trackKey = getTrackKey(track);
              console.log(
                `🔍 Like check: client=${clientId}, session=${likeSessionId}, track="${trackKey}", hasLiked=${hasLikedTrack(likeSessionId, clientId, track)}`,
              );

              if (hasLikedTrack(likeSessionId, clientId, track)) {
                console.log(`⚠️ Duplicate like ignored for: ${track.title} (${clientId})`);
                // Send feedback to client that they already liked
                ws.send(
                  JSON.stringify({
                    type: "LIKE_ALREADY_SENT",
                    payload: { track },
                  }),
                );
                if (messageId) sendNack(ws, messageId, "Already liked this track");
                break;
              }

              // Record the like
              recordLike(likeSessionId, clientId, track);
              console.log(
                `❤️ Like received for: ${track.title} (client: ${clientId}, session: ${likeSessionId})`,
              );

              // 💾 Persist to database with correct sessionId
              persistLike(track, likeSessionId, clientId);

              // Broadcast to all clients (including DJ)
              rawWs.publish(
                "live-session",
                JSON.stringify({
                  type: "LIKE_RECEIVED",
                  payload: { track },
                }),
              );
              if (messageId) sendAck(ws, messageId);
              break;
            }

            case "SEND_REACTION": {
              if (message.reaction === "thank_you") {
                rawWs.publish(
                  "live-session",
                  JSON.stringify({
                    type: "REACTION_RECEIVED",
                    sessionId: message.sessionId,
                    reaction: "thank_you",
                  }),
                );
                console.log(
                  `🦄 Thank You received from ${clientId} in session ${message.sessionId}`,
                );
                if (messageId) sendAck(ws, messageId);
              } else {
                if (messageId) sendNack(ws, messageId, "Unsupported reaction type");
              }
              break;
            }

            case "SEND_ANNOUNCEMENT": {
              const {
                sessionId: announcementSessionId,
                message: announcementMessage,
                durationSeconds,
              } = message;

              // Verify this is a DJ sending to their own session
              const djSession = activeSessions.get(announcementSessionId);
              if (!djSession) {
                console.log(`⚠️ Announcement rejected: session ${announcementSessionId} not found`);
                if (messageId) sendNack(ws, messageId, "Session not found");
                break;
              }
              // 🔐 Security: Verify this connection owns the session
              if (djSessionId !== announcementSessionId) {
                console.warn(
                  `⚠️ Unauthorized announcement attempt: connection owns ${djSessionId || "none"}, tried to announce to ${announcementSessionId}`,
                );
                if (messageId) sendNack(ws, messageId, "Unauthorized announcement");
                return;
              }

              // Calculate endsAt if duration is provided
              const timestamp = new Date().toISOString();
              const endsAt = durationSeconds
                ? new Date(Date.now() + durationSeconds * 1000).toISOString()
                : undefined;

              // Store announcement in session for late joiners
              djSession.activeAnnouncement = {
                message: announcementMessage,
                timestamp,
                ...(endsAt && { endsAt }),
              };

              // Broadcast to all listeners
              rawWs.publish(
                "live-session",
                JSON.stringify({
                  type: "ANNOUNCEMENT_RECEIVED",
                  sessionId: announcementSessionId,
                  message: announcementMessage,
                  djName: djSession.djName,
                  timestamp,
                  endsAt,
                }),
              );

              console.log(
                `📢 Announcement from ${djSession.djName}: "${announcementMessage}"${durationSeconds ? ` (${durationSeconds}s timer)` : ""}`,
              );
              if (messageId) sendAck(ws, messageId);
              break;
            }

            case "CANCEL_ANNOUNCEMENT": {
              const { sessionId: cancelSessionId } = message;

              // Verify session exists
              const session = activeSessions.get(cancelSessionId);
              if (!session) {
                console.log(`⚠️ Cancel announcement rejected: session ${cancelSessionId} not found`);
                if (messageId) sendNack(ws, messageId, "Session not found");
                break;
              }
              // 🔐 Security: Verify this connection owns the session
              if (djSessionId !== cancelSessionId) {
                console.warn(
                  `⚠️ Unauthorized cancel announcement attempt: connection owns ${djSessionId || "none"}, tried to cancel for ${cancelSessionId}`,
                );
                if (messageId) sendNack(ws, messageId, "Unauthorized cancel announcement");
                return;
              }

              // Clear the active announcement
              session.activeAnnouncement = null;

              // Broadcast cancellation to all listeners
              rawWs.publish(
                "live-session",
                JSON.stringify({
                  type: "ANNOUNCEMENT_CANCELLED",
                  sessionId: cancelSessionId,
                }),
              );

              console.log(`📢❌ Announcement cancelled for session ${cancelSessionId}`);
              if (messageId) sendAck(ws, messageId);
              break;
            }

            case "SEND_TEMPO_REQUEST": {
              const { sessionId: targetSessionId, preference } = message;

              // Require clientId for rate limiting
              if (!clientId) {
                console.log("⚠️ Tempo request rejected: no clientId provided");
                if (messageId) sendNack(ws, messageId, "Client ID required for tempo requests");
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
              rawWs.publish(
                "live-session",
                JSON.stringify({
                  type: "TEMPO_FEEDBACK",
                  ...feedback,
                }),
              );
              if (messageId) sendAck(ws, messageId);
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
              if (isNewSubscription && targetSession && clientId) {
                isListener = true;
                subscribedSessionId = targetSession;
                const isNewUniqueClient = addListener(targetSession, clientId);

                const count = getListenerCount(targetSession);
                console.log(`👥 Listener count for ${targetSession}: ${count}`);

                // Only broadcast if unique client count changed
                if (isNewUniqueClient) {
                  rawWs.publish(
                    "live-session",
                    JSON.stringify({
                      type: "LISTENER_COUNT",
                      sessionId: targetSession,
                      count,
                    }),
                  );
                }
              }

              // 🚀 11/10 Performance: Lean session listing & backpressure awareness
              // We only send the fields needed for the Join screen, and skip if buffer is full.
              const leanSessions = Array.from(activeSessions.values()).map((s) => ({
                sessionId: s.sessionId,
                djName: s.djName,
                currentTrack: s.currentTrack,
              }));

              if (rawWs.getBufferedAmount() < 1024 * 64) {
                // Only send if buffered amount is < 64KB
                ws.send(
                  JSON.stringify({
                    type: "SESSIONS_LIST",
                    sessions: leanSessions,
                  }),
                );
              } else {
                console.warn(
                  `⏳ Backpressure: Skipping SESSIONS_LIST for ${clientId} (buffer full)`,
                );
              }

              // Send current listener count for the target session
              if (targetSession) {
                ws.send(
                  JSON.stringify({
                    type: "LISTENER_COUNT",
                    sessionId: targetSession,
                    count: getListenerCount(targetSession),
                  }),
                );

                // Send current track to new subscriber if there is one playing
                const session = activeSessions.get(targetSession);
                if (session?.currentTrack) {
                  ws.send(
                    JSON.stringify({
                      type: "NOW_PLAYING",
                      sessionId: targetSession,
                      djName: session.djName || "DJ",
                      track: session.currentTrack,
                    }),
                  );
                  console.log(
                    `🎵 Sent current track to new subscriber: ${session.currentTrack.artist} - ${session.currentTrack.title}`,
                  );
                }

                // If there's an active poll for this session, send it to the new subscriber
                const activePollId = sessionActivePoll.get(targetSession);
                if (activePollId) {
                  const poll = getActivePoll(activePollId);
                  if (poll) {
                    const totalVotes = poll.votes.reduce((a, b) => a + b, 0);
                    // Check if THIS client has already voted
                    const votedOptionIndex = clientId ? poll.votedClients.get(clientId) : undefined;
                    const hasVoted = votedOptionIndex !== undefined;

                    ws.send(
                      JSON.stringify({
                        type: "POLL_STARTED",
                        pollId: poll.id,
                        question: poll.question,
                        options: poll.options,
                        endsAt: poll.endsAt?.toISOString(),
                        // Include current votes for existing polls
                        votes: poll.votes,
                        totalVotes,
                        // Tell client if they've already voted
                        hasVoted,
                        votedOptionIndex,
                      }),
                    );
                    console.log(
                      `📊 Sent active poll to new subscriber: "${poll.question}" (${totalVotes} votes, hasVoted: ${hasVoted})`,
                    );
                  }
                }

                // Send active announcement to late joiners (if any)
                if (session?.activeAnnouncement) {
                  ws.send(
                    JSON.stringify({
                      type: "ANNOUNCEMENT_RECEIVED",
                      sessionId: targetSession,
                      message: session.activeAnnouncement.message,
                      djName: session.djName,
                      timestamp: session.activeAnnouncement.timestamp,
                      endsAt: session.activeAnnouncement.endsAt,
                    }),
                  );
                  console.log(
                    `📢 Sent active announcement to late joiner: "${session.activeAnnouncement.message}"`,
                  );
                }
              }
              if (messageId) sendAck(ws, messageId);
              break;
            }

            // ========================================
            // Poll Handlers
            // ========================================

            case "START_POLL": {
              console.log("📊 START_POLL received:", message);

              const {
                sessionId: pollSessionId,
                question,
                options,
                durationSeconds,
              } = message as {
                sessionId: string;
                question: string;
                options: string[];
                durationSeconds?: number;
              };

              console.log("📊 Poll details:", {
                pollSessionId,
                question,
                options,
                durationSeconds,
              });

              // 🔐 Security: Verify this connection owns the session
              if (djSessionId !== pollSessionId) {
                console.warn(
                  `⚠️ Unauthorized start poll attempt: connection owns ${djSessionId || "none"}, tried to start poll for ${pollSessionId}`,
                );
                if (messageId)
                  sendNack(ws, messageId, "Unauthorized to start poll for this session");
                return;
              }

              // Check if there's already an active poll for this session
              const existingPoll = getSessionPoll(pollSessionId);
              if (existingPoll) {
                console.log("⚠️ Poll already active for session:", pollSessionId);
                if (messageId) sendNack(ws, messageId, "Poll already active for this session");
                break;
              }

              // Use IIFE for async database call
              (async () => {
                console.log("📊 Creating poll in database...");
                // Get current track for context
                const session = activeSessions.get(pollSessionId);
                const pollId = await createPollInDb(
                  pollSessionId,
                  question,
                  options,
                  session?.currentTrack,
                );
                console.log("📊 Poll ID from database:", pollId);
                if (!pollId) {
                  console.log("❌ Failed to create poll in database - no ID returned");
                  if (messageId) sendNack(ws, messageId, "Failed to create poll in database");
                  return;
                }

                const endsAt = durationSeconds
                  ? new Date(Date.now() + durationSeconds * 1000)
                  : undefined;

                // Create in-memory poll state
                const activePoll: ActivePoll = {
                  id: pollId,
                  sessionId: pollSessionId,
                  question,
                  options,
                  votes: new Array(options.length).fill(0) as number[],
                  votedClients: new Map<string, number>(),
                };
                if (endsAt) activePoll.endsAt = endsAt;

                activePolls.set(pollId, activePoll);
                sessionActivePoll.set(pollSessionId, pollId);

                console.log(`📊 Poll started: "${question}" with ${options.length} options`);
                if (messageId) sendAck(ws, messageId);

                // Broadcast to all dancers
                rawWs.publish(
                  "live-session",
                  JSON.stringify({
                    type: "POLL_STARTED",
                    pollId,
                    question,
                    options,
                    endsAt: endsAt?.toISOString(),
                  }),
                );

                // Set auto-close timer if duration specified
                if (durationSeconds && endsAt) {
                  console.log(
                    `⏱️ Poll timer set: ${durationSeconds}s, will end at ${endsAt.toISOString()}`,
                  );
                  setTimeout(() => {
                    console.log(`⏱️ Poll timer fired for poll ${pollId}`);
                    const poll = endPoll(pollId);
                    if (poll) {
                      const winnerIndex = poll.votes.indexOf(Math.max(...poll.votes));
                      const totalVotes = poll.votes.reduce((a, b) => a + b, 0);

                      // Update database (fire-and-forget)
                      closePollInDb(pollId);

                      const endMessage = JSON.stringify({
                        type: "POLL_ENDED",
                        pollId,
                        results: poll.votes,
                        totalVotes,
                        winnerIndex,
                      });

                      // Broadcast end to all subscribers (dancers)
                      rawWs.publish("live-session", endMessage);

                      // Also send directly to DJ who created the poll
                      try {
                        ws.send(endMessage);
                      } catch (_e) {
                        console.log(
                          "⚠️ Could not send POLL_ENDED to DJ (connection may have closed)",
                        );
                      }

                      console.log(
                        `📊 Poll auto-closed: "${question}" - Winner: ${poll.options[winnerIndex]}`,
                      );
                    } else {
                      console.log(`⚠️ Poll ${pollId} already ended or not found`);
                    }
                  }, durationSeconds * 1000);
                }
              })().catch((error) => {
                console.error("❌ Error in poll creation IIFE:", error);
                if (messageId)
                  sendNack(ws, messageId, `Server error during poll creation: ${error.message}`);
              });
              break;
            }

            case "END_POLL": {
              const { pollId } = message as { pollId: number };
              const pollToClose = getActivePoll(pollId);

              // 🔐 Security: Verify this connection owns the session
              if (!pollToClose || djSessionId !== pollToClose.sessionId) {
                console.warn(
                  `⚠️ Unauthorized end poll attempt: connection owns ${djSessionId || "none"}, tried to end poll ${pollId} for session ${pollToClose?.sessionId || "unknown"}`,
                );
                if (messageId) sendNack(ws, messageId, "Unauthorized to end this poll");
                return;
              }

              const poll = endPoll(pollId);
              if (!poll) {
                console.log("⚠️ Poll not found:", pollId);
                if (messageId) sendNack(ws, messageId, "Poll not found or already ended");
                break;
              }

              const winnerIndex = poll.votes.indexOf(Math.max(...poll.votes));
              const totalVotes = poll.votes.reduce((a, b) => a + b, 0);

              // Update database (fire-and-forget)
              closePollInDb(pollId);

              // Broadcast end
              rawWs.publish(
                "live-session",
                JSON.stringify({
                  type: "POLL_ENDED",
                  pollId,
                  results: poll.votes,
                  totalVotes,
                  winnerIndex,
                }),
              );

              console.log(
                `📊 Poll ended: "${poll.question}" - Winner: ${poll.options[winnerIndex]}`,
              );
              if (messageId) sendAck(ws, messageId);
              break;
            }

            case "CANCEL_POLL": {
              // Cancel poll by session ID (used when poll ID isn't assigned yet)
              const { sessionId: cancelSessionId } = message as { sessionId: string };
              const pollId = sessionActivePoll.get(cancelSessionId);

              // 🔐 Security: Verify this connection owns the session
              if (djSessionId !== cancelSessionId) {
                console.warn(
                  `⚠️ Unauthorized cancel poll attempt: connection owns ${djSessionId || "none"}, tried to cancel poll for ${cancelSessionId}`,
                );
                if (messageId)
                  sendNack(ws, messageId, "Unauthorized to cancel poll for this session");
                return;
              }

              if (pollId !== undefined) {
                const poll = endPoll(pollId);
                if (poll) {
                  closePollInDb(pollId);
                  const broadcaster = activeBroadcaster;
                  if (broadcaster) {
                    broadcaster.publish(
                      "live-session",
                      JSON.stringify({
                        type: "POLL_ENDED",
                        pollId,
                        cancelled: true,
                      }),
                    );
                  }
                  console.log(`📊 Poll cancelled: "${poll.question}"`);
                  if (messageId) sendAck(ws, messageId);
                } else {
                  if (messageId) sendNack(ws, messageId, "Poll not found or already ended");
                }
              } else {
                if (messageId) sendNack(ws, messageId, "No active poll found for this session");
              }
              break;
            }

            case "VOTE_ON_POLL": {
              const {
                pollId,
                optionIndex,
                clientId: voterId,
              } = message as {
                pollId: number;
                optionIndex: number;
                clientId: string;
              };

              const poll = getActivePoll(pollId);
              if (!poll) {
                console.log("⚠️ Poll not found or closed:", pollId);
                const broadcaster = activeBroadcaster;
                if (broadcaster) {
                  broadcaster.send(
                    JSON.stringify({
                      type: "VOTE_REJECTED",
                      pollId,
                      reason: "Poll not found or closed",
                    }),
                  );
                }
                break;
              }

              // Check if client already voted
              if (poll.votedClients.has(voterId)) {
                console.log("⚠️ Client already voted:", voterId);
                // Send rejection with current correct vote state
                const totalVotes = poll.votes.reduce((a, b) => a + b, 0);
                ws.send(
                  JSON.stringify({
                    type: "VOTE_REJECTED",
                    pollId,
                    reason: "Already voted",
                    votes: poll.votes,
                    totalVotes,
                  }),
                );
                break;
              }

              // Validate option index
              if (optionIndex < 0 || optionIndex >= poll.options.length) {
                console.log("⚠️ Invalid option index:", optionIndex);
                ws.send(
                  JSON.stringify({
                    type: "VOTE_REJECTED",
                    pollId,
                    reason: "Invalid option",
                  }),
                );
                break;
              }

              // Record vote in memory
              if (poll) {
                const currentValue = poll.votes[optionIndex];
                if (currentValue !== undefined) {
                  poll.votes[optionIndex] = currentValue + 1;
                }
                poll.votedClients.set(voterId, optionIndex);

                // Persist vote to database (fire-and-forget)
                recordPollVote(pollId, voterId, optionIndex);

                const totalVotes = poll.votes.reduce((a, b) => a + b, 0);
                console.log(
                  `📊 Vote on "${poll.question}": ${poll.options[optionIndex]} (total: ${totalVotes})`,
                );

                // Confirm vote to sender
                ws.send(
                  JSON.stringify({
                    type: "VOTE_CONFIRMED",
                    pollId,
                    optionIndex,
                    votes: poll.votes,
                    totalVotes,
                  }),
                );

                // Send update to all others (DJ included)
                const rawWs = ws.raw as ServerWebSocket;
                rawWs.publish(
                  "live-session",
                  JSON.stringify({
                    type: "POLL_UPDATE",
                    pollId,
                    votes: poll.votes,
                    totalVotes,
                  }),
                );
              }

              break;
            }

            case "PING": {
              ws.send(JSON.stringify({ type: "PONG" }));
              break;
            }

            case "GET_SESSIONS": {
              const sessions = Array.from(activeSessions.values());
              ws.send(
                JSON.stringify({
                  type: "SESSIONS_LIST",
                  sessions,
                }),
              );
              break;
            }

            // Server messages (should not be received from clients)
            case "SESSION_REGISTERED":
            case "SESSION_STARTED":
            case "NOW_PLAYING":
            case "SESSION_ENDED":
            case "SESSIONS_LIST":
            case "POLL_STARTED":
            case "POLL_UPDATE":
            case "POLL_ENDED":
            case "LIKE_RECEIVED":
            case "PONG":
            case "ACK":
            case "NACK": {
              console.log(`⚠️ Unexpected server message from client: ${message.type}`);
              break;
            }
          }
        } catch (e) {
          console.error("❌ Failed to parse message:", e);
        }
      },

      onClose(_event, ws) {
        console.log("❌ Client disconnected");

        // End DJ session if this was a DJ connection
        if (djSessionId) {
          const session = activeSessions.get(djSessionId);
          if (session) {
            console.log(`⚠️ DJ disconnected unexpectedly: ${session.djName} (${djSessionId})`);

            // Persist final tempo votes if track was playing
            if (session.currentTrack) {
              const feedback = getTempoFeedback(djSessionId);
              if (feedback.total > 0) {
                console.log(`🎚️ Persisting final tempo votes: ${JSON.stringify(feedback)}`);
                persistTempoVotes(djSessionId, session.currentTrack, {
                  slower: feedback.slower,
                  perfect: feedback.perfect,
                  faster: feedback.faster,
                });
              }
              tempoVotes.delete(djSessionId);
            }

            activeSessions.delete(djSessionId);
            endSessionInDb(djSessionId);
            clearLikesForSession(djSessionId);
            sessionListeners.delete(djSessionId);
            persistedSessions.delete(djSessionId);

            // Broadcast session ended to all listeners
            const rawWs = ws.raw as ServerWebSocket;
            rawWs.publish(
              "live-session",
              JSON.stringify({
                type: "SESSION_ENDED",
                sessionId: djSessionId,
              }),
            );

            // 📊 Telemetry: Log DJ disconnect event
            logSessionEvent(djSessionId, "disconnect", { reason: "unexpected" });

            console.log(`👋 Session auto-ended: ${session.djName}`);
          }
        }

        // Remove listener from session if this was a listener
        if (isListener && clientId && subscribedSessionId) {
          const wasRemoved = removeListener(subscribedSessionId, clientId);

          // Only update the count; the 2-second heartbeat will handle the broadcast
          if (wasRemoved) {
            getListenerCount(subscribedSessionId);
          }
        }
      },

      onError(_event, _ws) {
        console.error("⚠️ WebSocket error");
      },
    };
  }),
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
        // Broadcast via the captured Bun server reference
        broadcaster.publish(
          "live-session",
          JSON.stringify({
            type: "LISTENER_COUNT",
            sessionId,
            count: currentCount,
          }),
        );
      } catch (e) {
        console.warn("⚠️ Broadcast failed (non-blocking):", e);
      }
    }
  }
}, 2000);

export default {
  port,
  hostname,
  fetch: app.fetch,
  websocket,
};
