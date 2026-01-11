import {
  PIKA_VERSION,
  type TrackInfo,
  type WebSocketMessage,
  WebSocketMessageSchema,
} from "@pika/shared";
import type { ServerWebSocket } from "bun";
import { and, desc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { createBunWebSocket } from "hono/bun";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
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
// Listener Count Tracking (Per-Session) with Connection Reference Counting
// ============================================================================
// Track connected listeners (dancers) per session for accurate crowd size.
// Uses reference counting: multiple tabs from same client count as ONE listener.
// Map: sessionId -> Map<clientId, connectionCount>
const sessionListeners = new Map<string, Map<string, number>>();
const djConnections = new Set<string>(); // Track DJ connections to exclude from count

// Get listener count for a specific session (unique clients, not connections)
function getListenerCount(sessionId: string): number {
  return sessionListeners.get(sessionId)?.size ?? 0;
}

// Add listener connection to a session (increments reference count)
// Returns true if this is a NEW client (unique count increased)
function addListener(sessionId: string, clientId: string): boolean {
  if (!sessionListeners.has(sessionId)) {
    sessionListeners.set(sessionId, new Map());
  }
  const clients = sessionListeners.get(sessionId)!;
  const currentCount = clients.get(clientId) ?? 0;
  const isNewClient = currentCount === 0;
  clients.set(clientId, currentCount + 1);
  console.log(
    `👥 Listener connection added: ${clientId.substring(0, 8)}... (${currentCount + 1} connections, isNew: ${isNewClient})`,
  );
  return isNewClient;
}

// Remove listener connection from a session (decrements reference count)
// Returns true if client was completely removed (unique count decreased)
function removeListener(sessionId: string, clientId: string): boolean {
  const clients = sessionListeners.get(sessionId);
  if (!clients) return false;

  const currentCount = clients.get(clientId) ?? 0;
  if (currentCount <= 1) {
    // Last connection from this client, remove entirely
    clients.delete(clientId);
    console.log(`👥 Listener removed: ${clientId.substring(0, 8)}... (no more connections)`);
    return true; // Unique count changed
  } else {
    // Still has other connections open
    clients.set(clientId, currentCount - 1);
    console.log(
      `👥 Listener connection closed: ${clientId.substring(0, 8)}... (${currentCount - 1} connections remaining)`,
    );
    return false; // Unique count unchanged
  }
}

// ============================================================================
// Rate Limiting: Track likes per client per track
// ============================================================================
// Uses persistent clientId sent from the web client (stored in localStorage)
// This survives page reloads, so users can't abuse by refreshing
// Map: `${sessionId}:${clientId}` -> Set<trackKey>
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
  likesSent.get(key)!.add(getTrackKey(track));
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
  votedClients: Set<string>; // Clients who have voted
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

function hasClientVoted(pollId: number, clientId: string): boolean {
  const poll = activePolls.get(pollId);
  return poll ? poll.votedClients.has(clientId) : true;
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
// Database Persistence Helpers
// ============================================================================

// Track which sessions have been persisted to avoid race conditions
const persistedSessions = new Set<string>();

/**
 * Check if session exists in DB (handling server restarts)
 */
async function ensureSessionPersisted(sessionId: string): Promise<boolean> {
  if (persistedSessions.has(sessionId)) return true;

  try {
    const { eq } = await import("drizzle-orm");
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

  try {
    const [inserted] = await db
      .insert(schema.playedTracks)
      .values({
        sessionId,
        artist: track.artist,
        title: track.title,
        // Core metrics
        bpm: track.bpm ?? null,
        key: track.key ?? null,
        // Fingerprint metrics
        energy: track.energy ? Math.round(track.energy) : null,
        danceability: track.danceability ? Math.round(track.danceability) : null,
        brightness: track.brightness ? Math.round(track.brightness) : null,
        acousticness: track.acousticness ? Math.round(track.acousticness) : null,
        groove: track.groove ? Math.round(track.groove) : null,
      })
      .returning({ id: schema.playedTracks.id });

    const bpmInfo = track.bpm ? ` (${track.bpm} BPM)` : "";
    const fingerprint = track.danceability ? ` [D:${Math.round(track.danceability)}]` : "";
    console.log(
      `💾 Track persisted: ${track.artist} - ${track.title} (ID: ${inserted?.id})${bpmInfo}${fingerprint}`,
    );
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
  if (!sessionId) return;

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

    if (!playedTrack) {
      console.warn(
        `⚠️ Orphan like prevented: "${track.title}" not found in played_tracks for session ${sessionId}`,
      );
      return;
    }

    // 2. Insert the like with strict Foreign Key
    await db.insert(schema.likes).values({
      sessionId: sessionId,
      clientId: clientId ?? null,
      playedTrackId: playedTrack.id,
    });
    console.log(`💾 Like persisted: ${track.title} (client: ${clientId?.substring(0, 20)}...)`);
  } catch (e) {
    console.error("❌ Failed to persist like:", e);
  }
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
    const { eq } = await import("drizzle-orm");
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
app.post("/api/auth/register", async (c) => {
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

    if (!email.includes("@")) {
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
app.post("/api/auth/login", async (c) => {
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

    const user = users[0]!; // We checked length > 0

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
app.post("/api/auth/regenerate-token", async (c) => {
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
        }
      : null,
    listenerCount: sessionListeners.get(session.sessionId)?.size || 0,
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

    // Get per-track like counts
    const trackLikeCounts = new Map<number, number>(); // Map<playedTrackId, count>

    for (const track of tracks) {
      const likeCount = await db
        .select({ count: count() })
        .from(schema.likes)
        .where(eq(schema.likes.playedTrackId, track.id));
      trackLikeCounts.set(track.id, likeCount[0]?.count || 0);
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
        trackArtist: schema.playedTracks.artist,
        trackTitle: schema.playedTracks.title,
        createdAt: schema.likes.createdAt,
      })
      .from(schema.likes)
      .innerJoin(schema.playedTracks, eq(schema.likes.playedTrackId, schema.playedTracks.id))
      .where(eq(schema.likes.clientId, clientId))
      .orderBy(desc(schema.likes.createdAt))
      .limit(100); // Reasonable limit

    // Get session info for each unique session
    const sessionIds = [...new Set(likes.map((l) => l.sessionId).filter(Boolean))];
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
    const enrichedLikes = likes.map((like) => ({
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

// Note: slugify function is defined above in the Auth section

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
    const djSessions = allSessions.filter((session) => slugify(session.djName) === slug);

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
      }),
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
    // Track if this connection is a DJ and which session they own
    let djSessionId: string | null = null;

    return {
      onOpen(event, ws) {
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

          // Extract clientId from message if present (for SUBSCRIBE and SEND_LIKE)
          // Only log the first time we identify this client on this connection
          if (json.clientId && !clientId) {
            clientId = json.clientId;
            console.log(`📋 Client identified: ${clientId}`);
          } else if (json.clientId) {
            clientId = json.clientId; // Update silently
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
              // Wrap in async IIFE for token validation
              (async () => {
                const sessionId = message.sessionId || `session_${Date.now()}`;
                const requestedDjName = message.djName || "DJ";

                // 🔐 Token validation for DJ authentication
                const djToken = (message as { token?: string }).token;
                let djUserId: number | null = null;
                let djName = requestedDjName;

                if (djToken) {
                  // Validate token and get DJ info
                  const djUser = await validateToken(djToken);
                  if (djUser) {
                    djUserId = djUser.id;
                    djName = djUser.displayName; // Use registered name
                    console.log(`🔐 Authenticated DJ: ${djName} (ID: ${djUserId})`);
                  } else {
                    console.log(`⚠️ Invalid token provided, using anonymous mode`);
                  }
                } else {
                  console.log(`⚠️ No token provided, session will be anonymous`);
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

                // Broadcast to all subscribers
                rawWs.publish(
                  "live-session",
                  JSON.stringify({
                    type: "SESSION_STARTED",
                    sessionId,
                    djName,
                  }),
                );
              })().catch((e) => console.error("❌ REGISTER_SESSION error:", e));
              break;
            }

            case "BROADCAST_TRACK": {
              const session = activeSessions.get(message.sessionId);
              if (session) {
                // 🎚️ Persist tempo votes for the PREVIOUS track (if any)
                if (session.currentTrack) {
                  const prevTrack = session.currentTrack;
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
              }
              break;
            }

            case "TRACK_STOPPED": {
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
              }
              break;
            }

            case "END_SESSION": {
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
              rawWs.publish(
                "live-session",
                JSON.stringify({
                  type: "TEMPO_FEEDBACK",
                  ...feedback,
                }),
              );
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
                const isNewUniqueClient = addListener(targetSession!, clientId!);

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

              // Send current sessions list
              const sessions = Array.from(activeSessions.values());
              ws.send(
                JSON.stringify({
                  type: "SESSIONS_LIST",
                  sessions,
                }),
              );

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
                    const hasVoted = clientId ? poll.votedClients.has(clientId) : false;

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
                      }),
                    );
                    console.log(
                      `📊 Sent active poll to new subscriber: "${poll.question}" (${totalVotes} votes, hasVoted: ${hasVoted})`,
                    );
                  }
                }
              }
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

              // Check if there's already an active poll for this session
              const existingPoll = getSessionPoll(pollSessionId);
              if (existingPoll) {
                console.log("⚠️ Poll already active for session:", pollSessionId);
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
                  votedClients: new Set(),
                };
                if (endsAt) activePoll.endsAt = endsAt;

                activePolls.set(pollId, activePoll);
                sessionActivePoll.set(pollSessionId, pollId);

                console.log(`📊 Poll started: "${question}" with ${options.length} options`);

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
                      } catch (e) {
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
              })().catch((e) => {
                console.error("❌ Error in poll creation IIFE:", e);
              });
              break;
            }

            case "END_POLL": {
              const { pollId } = message as { pollId: number };

              const poll = endPoll(pollId);
              if (!poll) {
                console.log("⚠️ Poll not found:", pollId);
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
              break;
            }

            case "CANCEL_POLL": {
              // Cancel poll by session ID (used when poll ID isn't assigned yet)
              const { sessionId: cancelSessionId } = message as { sessionId: string };
              const pollId = sessionActivePoll.get(cancelSessionId);

              if (!pollId) {
                console.log("⚠️ No active poll for session to cancel:", cancelSessionId);
                break;
              }

              const poll = endPoll(pollId);
              if (poll) {
                closePollInDb(pollId);
                rawWs.publish(
                  "live-session",
                  JSON.stringify({
                    type: "POLL_ENDED",
                    pollId,
                    cancelled: true,
                  }),
                );
                console.log(`📊 Poll cancelled: "${poll.question}"`);
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
                ws.send(
                  JSON.stringify({
                    type: "VOTE_REJECTED",
                    pollId,
                    reason: "Poll not found or closed",
                  }),
                );
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

              // Record vote in memory (poll is guaranteed to exist after guard)
              const currentValue = poll!.votes[optionIndex];
              if (currentValue !== undefined) {
                poll!.votes[optionIndex] = currentValue + 1;
              }
              poll!.votedClients.add(voterId);

              // Persist vote to database (fire-and-forget)
              recordPollVote(pollId, voterId, optionIndex);

              const totalVotes = poll!.votes.reduce((a, b) => a + b, 0);
              console.log(
                `📊 Vote on "${poll!.question}": ${poll!.options[optionIndex]} (total: ${totalVotes})`,
              );

              // Confirm vote to sender
              ws.send(
                JSON.stringify({
                  type: "VOTE_CONFIRMED",
                  pollId,
                  optionIndex,
                  votes: poll!.votes,
                  totalVotes,
                }),
              );

              // Send update to all others (DJ included)
              rawWs.publish(
                "live-session",
                JSON.stringify({
                  type: "POLL_UPDATE",
                  pollId,
                  votes: poll!.votes,
                  totalVotes,
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
            console.log(`👋 Session auto-ended: ${session.djName}`);
          }
        }

        // Remove listener from session if this was a listener
        if (isListener && clientId && subscribedSessionId) {
          const wasRemoved = removeListener(subscribedSessionId, clientId);

          // Only broadcast if unique client count actually changed
          if (wasRemoved) {
            const count = getListenerCount(subscribedSessionId);
            console.log(`👥 Listener count for ${subscribedSessionId}: ${count}`);

            // Broadcast updated count for this session
            const rawWs = ws.raw as ServerWebSocket;
            rawWs.publish(
              "live-session",
              JSON.stringify({
                type: "LISTENER_COUNT",
                sessionId: subscribedSessionId,
                count,
              }),
            );
          }
        }
      },

      onError(event, ws) {
        console.error("⚠️ WebSocket error:", event);
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

export default {
  port,
  hostname,
  fetch: app.fetch,
  websocket,
};
