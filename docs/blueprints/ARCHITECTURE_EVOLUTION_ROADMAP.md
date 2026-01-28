# Pika! Architecture Evolution Roadmap

**Date:** 2026-01-27
**Author:** Principal Lead Architect
**Status:** STRATEGIC PLAN (Pending Team Review)
**Target:** Implementing Stage/Event Architecture, Data Strategy, and UX Strategy

---

## Executive Summary

This roadmap provides a comprehensive plan to evolve Pika! from its current **DJ-centric MVP** to a **full event platform** supporting Organizers, DJs, Dancers, and Platform Owners. The plan is based on a thorough audit of the existing codebase and alignment with the three strategic blueprints:

1. **pika-next-architecture.md** - Stage/Redis/Roles architecture
2. **data-strategy.md** - Smart Crate and WCS Dashboard
3. **ux-strategy.md** - Role-based experiences

### Current State Assessment

| Dimension | Score | Notes |
|-----------|-------|-------|
| Code Quality | 9.5/10 | TypeScript strict, Zod validation, comprehensive tests (612+) |
| Architecture | 8/10 | Well-structured monorepo, but single-topic pub/sub limits scale |
| Security | 9.2/10 | 1 critical, 2 high, 3 medium issues identified |
| Push Notifications | 4/10 | "Global Megaphone" bug - broadcasts to ALL subscribers |
| Stage/Event Readiness | 3/10 | No schema, no API, no UI components |
| Data Strategy Readiness | 5/10 | Good track fingerprinting, no identification service |

### Critical Issues (Must Fix First)

| Priority | Issue | Risk | Location |
|----------|-------|------|----------|
| P0 | Push broadcasts to ALL subscribers | User complaints, spam | `handlers/dj.ts:526-531` |
| P0 | Token validation bug in push endpoint | Broken auth or unhashed storage | `routes/push.ts:101` |
| P1 | No WebSocket DJ authentication | Session hijacking | `index.ts` WS handler |
| P1 | CSP allows unsafe-inline/unsafe-eval | XSS vulnerability | `middleware.ts:15` |

---

## Phased Implementation Strategy

The roadmap is organized into **6 Phases**, each containing **self-contained sprints** that can be shipped and tested independently.

```
Phase 0: Critical Fixes (1 week)
    └── Fix push notification scoping
    └── Fix security vulnerabilities

Phase 1: Infrastructure Foundation (2 weeks)
    └── Redis integration
    └── Multi-topic pub/sub
    └── Session state migration

Phase 2: Stage & Event Architecture (3 weeks)
    └── Schema evolution
    └── Stage CRUD API
    └── Event hierarchy

Phase 3: Role-Based Identity (2 weeks)
    └── User table unification
    └── Organizer role
    └── Dancer accounts (Spotify OAuth)

Phase 4: Data Strategy - Smart Crate (3 weeks)
    └── Track identification service
    └── Human-in-the-loop verification UI
    └── Global track repository

Phase 5: UX Strategy - Dashboards (4 weeks)
    └── Organizer Command Center
    └── DJ Career Hub
    └── Dancer Event Companion
    └── Platform Owner Admin
```

---

## Phase 0: Critical Fixes (Sprint 0)

**Duration:** 1 week
**Goal:** Production stability before new features
**Shippable:** Yes - bug fixes only

### Sprint 0.1: Fix Global Megaphone (P0)

**Problem:** Push notifications broadcast to ALL subscribers regardless of which session they're listening to.

**Root Cause Analysis:**
```typescript
// Current code in handlers/dj.ts:526-531
const targets = await db
  .select()
  .from(pushSubscriptions)
  .where(isNull(pushSubscriptions.unsubscribedAt))
  .limit(1000);  // <-- NO SESSION FILTER
```

**Solution Architecture:**

1. **Add session context to push subscriptions table:**
```sql
ALTER TABLE push_subscriptions
  ADD COLUMN subscribed_session_id TEXT REFERENCES sessions(id);
```

2. **Update subscription endpoint to accept session context:**
```typescript
// POST /api/push/subscribe
{
  endpoint: string,
  keys: { p256dh, auth },
  clientId: string,
  sessionId?: string  // <-- NEW: Optional session binding
}
```

3. **Filter push targets by session:**
```typescript
// Fixed query
const targets = await db
  .select()
  .from(pushSubscriptions)
  .where(and(
    isNull(pushSubscriptions.unsubscribedAt),
    eq(pushSubscriptions.subscribedSessionId, session.sessionId)
  ))
  .limit(1000);
```

4. **Client-side: Send sessionId when subscribing:**
```typescript
// usePushNotifications.ts
await fetch('/api/push/subscribe', {
  body: JSON.stringify({
    ...subscription.toJSON(),
    clientId,
    sessionId: currentSessionId  // <-- NEW
  })
});
```

**Acceptance Criteria:**
- [ ] Push subscriptions table has `subscribed_session_id` column
- [ ] Subscribe endpoint accepts and stores session context
- [ ] Announcements only reach subscribers of that specific session
- [ ] Test: DJ A's announcement doesn't reach DJ B's listeners

### Sprint 0.2: Fix Security Issues (P0-P1)

**Task 0.2.1: Verify Token Storage Method**
- Investigate if tokens in `djTokens.token` are stored hashed or plaintext
- If hashed: Apply `hashToken()` before DB lookup in `routes/push.ts:101`
- If plaintext: Document decision, consider migration to hashed

**Task 0.2.2: Require DJ Auth on WebSocket**
```typescript
// Add to REGISTER_SESSION handler
export async function handleRegisterSession(ctx: WSContext) {
  const msg = parseMessage(RegisterSessionSchema, message, ws, messageId);

  // NEW: Require token for session registration
  if (!msg.token) {
    sendNack(ws, messageId, "Authentication required");
    return;
  }

  const djUser = await validateToken(msg.token);
  if (!djUser) {
    sendNack(ws, messageId, "Invalid token");
    return;
  }

  // Continue with authenticated user...
}
```

**Task 0.2.3: Strengthen CSP**
- Generate per-request nonce in middleware
- Update Sentry config to use nonce-based script loading
- Remove `'unsafe-inline'` and `'unsafe-eval'` where possible

**Task 0.2.4: Add Rate Limit to Push Subscribe**
```typescript
// routes/push.ts
push.use("/subscribe", rateLimiter({
  windowMs: 60 * 1000,  // 1 minute
  limit: 5,             // 5 requests per minute
  keyGenerator: (c) => getClientIp(c),
}));
```

**Acceptance Criteria:**
- [ ] Push endpoint auth verified working in integration test
- [ ] WebSocket REGISTER_SESSION requires valid token
- [ ] CSP nonce implemented, unsafe-* directives removed
- [ ] Push subscribe endpoint rate limited

---

## Phase 1: Infrastructure Foundation (Sprints 1.1-1.3)

**Duration:** 2 weeks
**Goal:** Redis integration and scalable pub/sub
**Shippable:** Yes - internal improvement, no user-facing changes

### Sprint 1.1: Redis Client Integration

**Why Redis?**
- Distributed session state (survives server restart)
- Topic-based pub/sub (efficient routing)
- Rate limiting state (shared across instances)
- Cache layer (reduce DB queries)

**Implementation:**

1. **Add Redis to docker-compose.yml** (already have Valkey):
```yaml
# docker-compose.yml already has valkey
# Verify connection in cloud package
```

2. **Create Redis client singleton:**
```typescript
// packages/cloud/src/lib/redis.ts
import { createClient } from 'redis';

export const redis = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redis.on('error', (err) => logger.error('[Redis] Error', err));
redis.on('connect', () => logger.info('[Redis] Connected'));

export async function initRedis() {
  await redis.connect();
}
```

3. **Add dependency:**
```bash
cd packages/cloud && bun add redis
```

**Acceptance Criteria:**
- [ ] Redis client connects on cloud startup
- [ ] Health check endpoint includes Redis status
- [ ] Basic GET/SET operations working

### Sprint 1.2: Multi-Topic Pub/Sub Architecture

**Current Problem:** Single `"live-session"` topic broadcasts to ALL clients.

**Solution:** Topic-per-context routing:
```
topic:session:{sessionId}  -> Track updates, likes, polls
topic:stage:{stageId}      -> All sessions on a stage (future)
topic:event:{eventId}      -> Organizer announcements (future)
topic:system               -> Global broadcasts (rare)
```

**Implementation:**

1. **Create topic manager:**
```typescript
// packages/cloud/src/lib/topics.ts
export const TOPIC_PREFIX = {
  SESSION: 'topic:session:',
  STAGE: 'topic:stage:',
  EVENT: 'topic:event:',
  SYSTEM: 'topic:system'
} as const;

export function getSessionTopic(sessionId: string): string {
  return `${TOPIC_PREFIX.SESSION}${sessionId}`;
}

export function getStageTopic(stageId: string): string {
  return `${TOPIC_PREFIX.STAGE}${stageId}`;
}
```

2. **Update subscription handler:**
```typescript
// handlers/subscriber.ts
export function handleSubscribe(ctx: WSContext) {
  const { rawWs, state } = ctx;
  const { sessionId } = msg;

  // Unsubscribe from previous session topic
  if (state.subscribedSessionId) {
    rawWs.unsubscribe(getSessionTopic(state.subscribedSessionId));
  }

  // Subscribe to new session topic
  rawWs.subscribe(getSessionTopic(sessionId));
  state.subscribedSessionId = sessionId;
}
```

3. **Update broadcast logic:**
```typescript
// handlers/dj.ts
export async function handleBroadcastTrack(ctx: WSContext) {
  // ... validation ...

  // Broadcast to session-specific topic
  rawWs.publish(
    getSessionTopic(msg.sessionId),
    JSON.stringify({
      type: "NOW_PLAYING",
      sessionId: msg.sessionId,
      track: msg.track,
    })
  );
}
```

**Acceptance Criteria:**
- [ ] Clients only receive messages for subscribed sessions
- [ ] Subscribing to session A doesn't receive session B updates
- [ ] Load test: 100 sessions, 1000 clients, correct routing

### Sprint 1.3: Session State Migration to Redis

**Current:** In-memory `Map<string, LiveSession>`
**Target:** Redis hash with automatic TTL

**Implementation:**

1. **Session interface remains the same:**
```typescript
// lib/sessions.ts - interface unchanged
export interface LiveSession {
  sessionId: string;
  djName: string;
  startedAt: string;
  lastActivityAt: string;
  currentTrack?: TrackInfo;
  activeAnnouncement?: Announcement | null;
}
```

2. **Replace Map operations with Redis:**
```typescript
// lib/sessions.ts - Redis implementation
import { redis } from './redis';

const SESSION_KEY_PREFIX = 'session:';
const SESSION_TTL = 24 * 60 * 60; // 24 hours

export async function getSession(sessionId: string): Promise<LiveSession | null> {
  const data = await redis.hGetAll(`${SESSION_KEY_PREFIX}${sessionId}`);
  if (!data || !data.sessionId) return null;
  return deserializeSession(data);
}

export async function setSession(sessionId: string, session: LiveSession): Promise<void> {
  const key = `${SESSION_KEY_PREFIX}${sessionId}`;
  await redis.hSet(key, serializeSession(session));
  await redis.expire(key, SESSION_TTL);
}

export async function deleteSession(sessionId: string): Promise<boolean> {
  const result = await redis.del(`${SESSION_KEY_PREFIX}${sessionId}`);
  return result > 0;
}

// Helper functions
function serializeSession(session: LiveSession): Record<string, string> {
  return {
    sessionId: session.sessionId,
    djName: session.djName,
    startedAt: session.startedAt,
    lastActivityAt: session.lastActivityAt,
    currentTrack: session.currentTrack ? JSON.stringify(session.currentTrack) : '',
    activeAnnouncement: session.activeAnnouncement ? JSON.stringify(session.activeAnnouncement) : '',
  };
}
```

3. **Fallback strategy during migration:**
```typescript
// Dual-write during transition
export async function setSessionDualWrite(sessionId: string, session: LiveSession): Promise<void> {
  // Write to both
  activeSessions.set(sessionId, session); // In-memory (deprecated)
  await setSession(sessionId, session);    // Redis (new)
}
```

**Acceptance Criteria:**
- [ ] Sessions persist across server restart
- [ ] Session TTL automatically expires inactive sessions
- [ ] Performance: <5ms for session operations
- [ ] Rollback: Can disable Redis and use in-memory

---

## Phase 2: Stage & Event Architecture (Sprints 2.1-2.4)

**Duration:** 3 weeks
**Goal:** Introduce Stage and Event abstractions
**Shippable:** Each sprint is independently deployable

### Sprint 2.1: Schema Evolution - Stages & Events

**New Tables:**

```sql
-- Events (e.g., "WCS Budapest 2026")
CREATE TABLE events (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  start_date TIMESTAMP,
  end_date TIMESTAMP,
  organizer_id INTEGER REFERENCES dj_users(id),  -- Reuse dj_users for now
  timezone TEXT DEFAULT 'UTC',
  status TEXT DEFAULT 'draft',  -- draft, published, active, ended
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Stages (e.g., "Main Floor", "Workshops Room")
CREATE TABLE stages (
  id TEXT PRIMARY KEY,
  event_id TEXT REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  capacity INTEGER,
  status TEXT DEFAULT 'active',  -- active, paused, closed
  qr_code_url TEXT,  -- Pre-generated QR
  created_at TIMESTAMP DEFAULT NOW()
);

-- Modify sessions to link to stages
ALTER TABLE sessions
  ADD COLUMN stage_id TEXT REFERENCES stages(id);

-- Stage subscriptions (persistent across DJ changes)
CREATE TABLE stage_subscriptions (
  id SERIAL PRIMARY KEY,
  stage_id TEXT NOT NULL REFERENCES stages(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL,
  push_endpoint TEXT REFERENCES push_subscriptions(endpoint),
  subscribed_at TIMESTAMP DEFAULT NOW(),
  unsubscribed_at TIMESTAMP,
  UNIQUE(stage_id, client_id)
);
```

**Drizzle Schema:**
```typescript
// packages/cloud/src/db/schema.ts

export const events = pgTable("events", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  organizerId: integer("organizer_id").references(() => djUsers.id),
  timezone: text("timezone").default("UTC"),
  status: text("status").default("draft"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const stages = pgTable("stages", {
  id: text("id").primaryKey(),
  eventId: text("event_id").references(() => events.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  capacity: integer("capacity"),
  status: text("status").default("active"),
  qrCodeUrl: text("qr_code_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const stageSubscriptions = pgTable("stage_subscriptions", {
  id: serial("id").primaryKey(),
  stageId: text("stage_id").notNull().references(() => stages.id, { onDelete: "cascade" }),
  clientId: text("client_id").notNull(),
  pushEndpoint: text("push_endpoint").references(() => pushSubscriptions.endpoint),
  subscribedAt: timestamp("subscribed_at").defaultNow().notNull(),
  unsubscribedAt: timestamp("unsubscribed_at"),
}, (table) => ({
  uniqueSubscription: unique().on(table.stageId, table.clientId),
}));
```

**Migration:**
```bash
cd packages/cloud && bun run db:generate && bun run db:migrate
```

**Acceptance Criteria:**
- [ ] Migration runs successfully on staging
- [ ] Existing sessions continue working (backward compatible)
- [ ] New tables queryable via Drizzle

### Sprint 2.2: Stage CRUD API

**REST Endpoints:**

```typescript
// packages/cloud/src/routes/stages.ts
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';

const stages = new Hono();

// Create Stage
stages.post(
  '/',
  authMiddleware,  // Require organizer auth
  zValidator('json', z.object({
    eventId: z.string(),
    name: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
    capacity: z.number().int().positive().optional(),
  })),
  async (c) => {
    const { eventId, name, description, capacity } = c.req.valid('json');
    const stageId = `stage_${generateId()}`;

    await db.insert(stages).values({
      id: stageId,
      eventId,
      name,
      description,
      capacity,
    });

    return c.json({ id: stageId, success: true });
  }
);

// List Stages for Event
stages.get('/event/:eventId', async (c) => {
  const { eventId } = c.req.param();
  const result = await db
    .select()
    .from(stages)
    .where(eq(stages.eventId, eventId));
  return c.json(result);
});

// Get Stage with Current Session
stages.get('/:stageId', async (c) => {
  const { stageId } = c.req.param();
  const stage = await db.query.stages.findFirst({
    where: eq(stages.id, stageId),
    with: {
      sessions: {
        where: isNull(sessions.endedAt),  // Active session only
        limit: 1,
      }
    }
  });
  return c.json(stage);
});

// Subscribe to Stage (Dancer joins via QR)
stages.post('/:stageId/subscribe', async (c) => {
  const { stageId } = c.req.param();
  const { clientId, pushEndpoint } = await c.req.json();

  await db.insert(stageSubscriptions).values({
    stageId,
    clientId,
    pushEndpoint,
  }).onConflictDoUpdate({
    target: [stageSubscriptions.stageId, stageSubscriptions.clientId],
    set: { unsubscribedAt: null, pushEndpoint },
  });

  // Also subscribe to event topic (implicit)
  const stage = await db.query.stages.findFirst({
    where: eq(stages.id, stageId),
  });
  if (stage?.eventId) {
    // Subscribe client to event-level updates
    await subscribeToEventTopic(stage.eventId, clientId);
  }

  return c.json({ success: true });
});

export default stages;
```

**Acceptance Criteria:**
- [ ] Organizer can create stages for an event
- [ ] Dancer can subscribe to a stage
- [ ] Stage subscription persists across DJ changes
- [ ] QR code generation for stages

### Sprint 2.3: Session-Stage Binding

**Problem Solved:** DJs "Broadcasting to: Main Floor"

**Implementation:**

1. **Extend REGISTER_SESSION schema:**
```typescript
// packages/shared/src/schemas.ts
export const RegisterSessionSchema = z.object({
  type: z.literal(MESSAGE_TYPES.REGISTER_SESSION),
  sessionId: z.string().optional(),
  djName: z.string().min(1).max(100),
  token: z.string().optional(),
  stageId: z.string().optional(),  // NEW: Optional stage binding
  version: z.string().optional(),
});
```

2. **Update registration handler:**
```typescript
// handlers/dj.ts
export async function handleRegisterSession(ctx: WSContext) {
  // ... existing validation ...

  // If stageId provided, verify and bind
  if (msg.stageId) {
    const stage = await db.query.stages.findFirst({
      where: eq(stages.id, msg.stageId),
    });

    if (!stage) {
      sendNack(ws, messageId, "Stage not found");
      return;
    }

    // Check if stage already has active session
    const existingSession = await db.query.sessions.findFirst({
      where: and(
        eq(sessions.stageId, msg.stageId),
        isNull(sessions.endedAt)
      ),
    });

    if (existingSession) {
      sendNack(ws, messageId, "Stage already has active DJ");
      return;
    }
  }

  // Persist with stage binding
  await persistSession(sessionId, djName, djUserId, msg.stageId);

  // Subscribe to stage topic in addition to session topic
  if (msg.stageId) {
    rawWs.subscribe(getStageTopic(msg.stageId));
  }
}
```

3. **Broadcast to stage subscribers:**
```typescript
// When broadcasting, also publish to stage topic
if (session.stageId) {
  rawWs.publish(
    getStageTopic(session.stageId),
    JSON.stringify({
      type: "NOW_PLAYING",
      sessionId: msg.sessionId,
      stageId: session.stageId,
      track: msg.track,
    })
  );
}
```

**Acceptance Criteria:**
- [ ] DJ can select a stage when going live
- [ ] Stage subscribers receive updates without re-scanning QR
- [ ] DJ transition: When DJ A ends and DJ B starts on same stage, dancers stay connected
- [ ] Only one active session per stage

### Sprint 2.4: Event-Level Announcements

**Problem Solved:** Organizers can broadcast to all attendees

**New Message Type:**
```typescript
// packages/shared/src/schemas.ts
export const SendEventAnnouncementSchema = z.object({
  type: z.literal(MESSAGE_TYPES.SEND_EVENT_ANNOUNCEMENT),
  eventId: z.string(),
  message: z.string().min(1).max(500),
  priority: z.enum(['info', 'warning', 'urgent']).default('info'),
  push: z.boolean().optional(),
});
```

**Handler:**
```typescript
// handlers/organizer.ts
export async function handleSendEventAnnouncement(ctx: WSContext) {
  const { message, ws, rawWs, state, messageId } = ctx;
  const msg = parseMessage(SendEventAnnouncementSchema, message, ws, messageId);
  if (!msg) return;

  // Verify organizer owns this event
  const event = await db.query.events.findFirst({
    where: eq(events.id, msg.eventId),
  });

  if (!event || event.organizerId !== state.userId) {
    sendNack(ws, messageId, "Unauthorized");
    return;
  }

  // Broadcast to event topic
  rawWs.publish(
    getEventTopic(msg.eventId),
    JSON.stringify({
      type: "EVENT_ANNOUNCEMENT",
      eventId: msg.eventId,
      message: msg.message,
      priority: msg.priority,
      timestamp: new Date().toISOString(),
    })
  );

  // Push to all stage subscribers of this event
  if (msg.push) {
    const subscribers = await db
      .select()
      .from(stageSubscriptions)
      .innerJoin(stages, eq(stages.id, stageSubscriptions.stageId))
      .where(and(
        eq(stages.eventId, msg.eventId),
        isNull(stageSubscriptions.unsubscribedAt),
        isNotNull(stageSubscriptions.pushEndpoint)
      ));

    // Send push notifications
    await broadcastPush(subscribers, {
      title: event.name,
      body: msg.message,
      priority: msg.priority,
    });
  }

  sendAck(ws, messageId);
}
```

**Acceptance Criteria:**
- [ ] Organizer can send event-wide announcements
- [ ] All stage subscribers receive the announcement
- [ ] Push notifications respect subscription state
- [ ] Priority levels affect notification appearance

---

## Phase 3: Role-Based Identity (Sprints 3.1-3.3)

**Duration:** 2 weeks
**Goal:** Unified user model with roles
**Shippable:** Sprint 3.1 is internal, 3.2-3.3 are user-facing

### Sprint 3.1: User Table Unification

**Current State:** Only `dj_users` exists
**Target State:** Unified `users` table with role system

**Schema Evolution:**
```sql
-- Rename and extend dj_users to users
ALTER TABLE dj_users RENAME TO users;

-- Add role field
ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'dj';

-- Add Spotify OAuth fields for dancers
ALTER TABLE users
  ADD COLUMN spotify_id TEXT,
  ADD COLUMN spotify_refresh_token TEXT,
  ADD COLUMN avatar_url TEXT;

-- Create index for role queries
CREATE INDEX idx_users_role ON users(role);

-- Update foreign key references
ALTER TABLE dj_tokens RENAME COLUMN dj_user_id TO user_id;
ALTER TABLE sessions RENAME COLUMN dj_user_id TO user_id;
```

**Role Enum:**
```typescript
export const UserRole = {
  GUEST: 'guest',       // Anonymous (no DB record)
  DANCER: 'dancer',     // Spotify-linked listener
  DJ: 'dj',             // Can broadcast sessions
  ORGANIZER: 'organizer', // Can create events/stages
  ADMIN: 'admin',       // Platform owner
} as const;
```

**Acceptance Criteria:**
- [ ] Migration preserves existing DJ accounts
- [ ] Role field defaults to 'dj' for existing users
- [ ] All foreign keys updated correctly

### Sprint 3.2: Organizer Role & Event Creation

**Implementation:**

1. **Organizer registration flow:**
```typescript
// routes/auth.ts - Add organizer registration
auth.post('/register/organizer',
  rateLimiter({ windowMs: 15 * 60 * 1000, limit: 3 }),
  zValidator('json', OrganizerRegistrationSchema),
  async (c) => {
    // For now, require manual approval (flag in DB)
    const user = await createUser({
      ...c.req.valid('json'),
      role: 'organizer',
      status: 'pending_approval',  // Admin must approve
    });

    return c.json({
      message: 'Registration submitted for review',
      userId: user.id
    });
  }
);
```

2. **Event creation (Organizer only):**
```typescript
// routes/events.ts
events.post('/',
  authMiddleware,
  requireRole('organizer'),
  zValidator('json', CreateEventSchema),
  async (c) => {
    const { name, description, startDate, endDate, timezone } = c.req.valid('json');
    const eventId = `event_${generateId()}`;

    await db.insert(events).values({
      id: eventId,
      name,
      description,
      startDate,
      endDate,
      timezone,
      organizerId: c.get('user').id,
    });

    return c.json({ id: eventId, success: true });
  }
);
```

**Acceptance Criteria:**
- [ ] Organizers can register (pending approval)
- [ ] Approved organizers can create events
- [ ] Events have proper ownership validation
- [ ] Role middleware prevents unauthorized access

### Sprint 3.3: Dancer Accounts (Spotify OAuth)

**Problem Solved:** "Heart a track -> Auto-saves to Spotify"

**Implementation:**

1. **Add Auth.js (NextAuth) integration:**
```typescript
// packages/web/src/app/api/auth/[...nextauth]/route.ts
import NextAuth from 'next-auth';
import SpotifyProvider from 'next-auth/providers/spotify';

export const authOptions = {
  providers: [
    SpotifyProvider({
      clientId: process.env.SPOTIFY_CLIENT_ID!,
      clientSecret: process.env.SPOTIFY_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: 'user-read-email playlist-modify-private playlist-modify-public',
        },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.expiresAt = account.expires_at;
      }
      return token;
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken;
      return session;
    },
  },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
```

2. **Link account to Pika user:**
```typescript
// When dancer logs in with Spotify, create/link Pika account
async function linkSpotifyAccount(spotifyProfile: SpotifyProfile, tokens: TokenSet) {
  const existingUser = await db.query.users.findFirst({
    where: eq(users.spotifyId, spotifyProfile.id),
  });

  if (existingUser) {
    // Update tokens
    await db.update(users)
      .set({ spotifyRefreshToken: tokens.refresh_token })
      .where(eq(users.id, existingUser.id));
    return existingUser;
  }

  // Create new dancer account
  const newUser = await db.insert(users).values({
    email: spotifyProfile.email,
    displayName: spotifyProfile.display_name,
    role: 'dancer',
    spotifyId: spotifyProfile.id,
    spotifyRefreshToken: tokens.refresh_token,
    avatarUrl: spotifyProfile.images?.[0]?.url,
  }).returning();

  return newUser[0];
}
```

3. **Save liked track to Spotify:**
```typescript
// services/spotify.ts
export async function addToSpotifyPlaylist(
  userId: number,
  trackName: string,
  artistName: string
) {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!user?.spotifyRefreshToken) return null;

  const accessToken = await refreshSpotifyToken(user.spotifyRefreshToken);

  // Search for track on Spotify
  const searchResult = await searchSpotifyTrack(accessToken, trackName, artistName);
  if (!searchResult) return null;

  // Add to "Pika! Likes" playlist
  await addToPlaylist(accessToken, PIKA_LIKES_PLAYLIST_ID, searchResult.uri);

  return searchResult;
}
```

**Acceptance Criteria:**
- [ ] Dancers can log in with Spotify
- [ ] Liked tracks appear in Spotify playlist
- [ ] Session persists across devices
- [ ] Like history synced to dancer account

---

## Phase 4: Data Strategy - Smart Crate (Sprints 4.1-4.4)

**Duration:** 3 weeks
**Goal:** Track identification and enrichment
**Shippable:** Each sprint adds visible value

### Sprint 4.1: Global Track Repository Schema

**New Tables:**
```sql
-- Canonical track records (the "Golden Record")
CREATE TABLE global_tracks (
  id SERIAL PRIMARY KEY,
  -- Identifiers
  spotify_uri TEXT UNIQUE,
  apple_music_id TEXT,
  isrc TEXT,

  -- Metadata
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  album TEXT,
  duration_ms INTEGER,
  release_year INTEGER,

  -- Fingerprints
  audio_hash TEXT,  -- SHA256 of raw audio
  chromaprint TEXT, -- Acoustid fingerprint

  -- Analysis vectors (for similarity search)
  bpm_avg REAL,
  key_signature TEXT,
  energy_vector REAL[],  -- For pgvector similarity

  -- Metadata
  verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Link played tracks to canonical tracks
ALTER TABLE played_tracks
  ADD COLUMN global_track_id INTEGER REFERENCES global_tracks(id);

-- Match confidence tracking
CREATE TABLE track_matches (
  id SERIAL PRIMARY KEY,
  played_track_id INTEGER REFERENCES played_tracks(id),
  global_track_id INTEGER REFERENCES global_tracks(id),
  confidence REAL,  -- 0.0 - 1.0
  match_method TEXT,  -- 'exact', 'fuzzy', 'fingerprint', 'manual'
  verified_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);
```

**Acceptance Criteria:**
- [ ] Global tracks table created
- [ ] Played tracks can link to canonical tracks
- [ ] Match confidence tracked

### Sprint 4.2: Fuzzy Matching Service

**Background Worker for Track Identification:**

```typescript
// packages/cloud/src/workers/track-matcher.ts
import { levenshtein } from 'fastest-levenshtein';

export class TrackMatcherWorker {
  private spotifyClient: SpotifyWebApi;

  async processUnmatchedTracks() {
    // Get tracks without global_track_id
    const unmatched = await db
      .select()
      .from(playedTracks)
      .where(isNull(playedTracks.globalTrackId))
      .limit(100);

    for (const track of unmatched) {
      try {
        const match = await this.findBestMatch(track);
        if (match) {
          await this.linkTrack(track.id, match.globalTrackId, match.confidence);
        }
      } catch (e) {
        logger.error('[TrackMatcher] Failed to process track', { trackId: track.id, error: e });
      }

      // Rate limit: 1 request per 100ms to avoid API limits
      await sleep(100);
    }
  }

  private async findBestMatch(track: PlayedTrack): Promise<TrackMatch | null> {
    // 1. Check internal database first (instant, free)
    const internalMatch = await this.findInternalMatch(track);
    if (internalMatch && internalMatch.confidence > 0.95) {
      return internalMatch;
    }

    // 2. Query Spotify API
    const spotifyMatch = await this.findSpotifyMatch(track);
    if (spotifyMatch && spotifyMatch.confidence > 0.8) {
      // Create or get global track record
      const globalTrack = await this.getOrCreateGlobalTrack(spotifyMatch);
      return {
        globalTrackId: globalTrack.id,
        confidence: spotifyMatch.confidence,
        matchMethod: 'spotify_fuzzy',
      };
    }

    // 3. Mark for manual review if low confidence
    if (spotifyMatch && spotifyMatch.confidence > 0.5) {
      return {
        globalTrackId: null,
        confidence: spotifyMatch.confidence,
        matchMethod: 'needs_review',
        candidateData: spotifyMatch,
      };
    }

    return null;
  }

  private async findSpotifyMatch(track: PlayedTrack): Promise<SpotifyMatch | null> {
    const query = `${track.artist} ${track.title}`;
    const results = await this.spotifyClient.searchTracks(query, { limit: 5 });

    if (!results.tracks?.items.length) return null;

    // Score each result
    const scored = results.tracks.items.map(item => ({
      ...item,
      confidence: this.calculateConfidence(track, item),
    }));

    // Return best match
    scored.sort((a, b) => b.confidence - a.confidence);
    return scored[0];
  }

  private calculateConfidence(track: PlayedTrack, spotifyTrack: SpotifyTrack): number {
    // Levenshtein distance for title/artist matching
    const titleDistance = levenshtein(
      track.title.toLowerCase(),
      spotifyTrack.name.toLowerCase()
    );
    const artistDistance = levenshtein(
      track.artist.toLowerCase(),
      spotifyTrack.artists[0].name.toLowerCase()
    );

    const titleScore = 1 - (titleDistance / Math.max(track.title.length, spotifyTrack.name.length));
    const artistScore = 1 - (artistDistance / Math.max(track.artist.length, spotifyTrack.artists[0].name.length));

    // BPM matching if available
    let bpmScore = 0.5; // Neutral if no BPM
    if (track.bpm && spotifyTrack.tempo) {
      const bpmDiff = Math.abs(track.bpm - spotifyTrack.tempo);
      bpmScore = bpmDiff < 5 ? 1.0 : bpmDiff < 10 ? 0.8 : bpmDiff < 20 ? 0.5 : 0.2;
    }

    // Weighted average
    return (titleScore * 0.4) + (artistScore * 0.4) + (bpmScore * 0.2);
  }
}
```

**Cron Schedule:**
```typescript
// Run every 5 minutes
import { Cron } from 'croner';

const matcherJob = new Cron('*/5 * * * *', async () => {
  const worker = new TrackMatcherWorker();
  await worker.processUnmatchedTracks();
});
```

**Acceptance Criteria:**
- [ ] Worker processes unmatched tracks automatically
- [ ] Spotify API integration working
- [ ] Confidence scores calculated correctly
- [ ] Rate limiting prevents API abuse

### Sprint 4.3: DJ Verification UI (Human-in-the-Loop)

**Desktop App "Set Recap" Enhancement:**

```typescript
// packages/desktop/src/components/SessionRecap/TrackVerification.tsx
export function TrackVerification({ sessionId }: Props) {
  const { data: tracks } = useSWR(`/api/sessions/${sessionId}/tracks-with-matches`);

  const lowConfidenceTracks = tracks?.filter(t =>
    t.match?.confidence < 0.9 && t.match?.confidence > 0.5
  );

  return (
    <div className="track-verification">
      <h3>Verify {lowConfidenceTracks?.length || 0} Tracks</h3>
      <p className="text-muted">Help improve track identification for everyone</p>

      {lowConfidenceTracks?.map(track => (
        <TrackMatchCard
          key={track.id}
          track={track}
          suggestedMatch={track.match}
          onConfirm={() => confirmMatch(track.id, track.match.globalTrackId)}
          onReject={() => rejectMatch(track.id)}
          onManualSearch={() => openSearchModal(track)}
        />
      ))}

      {lowConfidenceTracks?.length === 0 && (
        <div className="all-verified">
          All tracks verified. Export to Spotify?
          <Button onClick={exportToSpotify}>Export Setlist</Button>
        </div>
      )}
    </div>
  );
}
```

**Incentive System:**
```typescript
// Gamification: Track verification rewards
export async function recordVerification(userId: number, trackId: number, wasCorrect: boolean) {
  // Award points for verification
  await db.insert(userActivity).values({
    userId,
    activityType: 'track_verification',
    points: wasCorrect ? 10 : 5,  // More for confirming correct matches
    metadata: { trackId },
  });

  // Check for badges
  const verificationCount = await db
    .select({ count: count() })
    .from(userActivity)
    .where(and(
      eq(userActivity.userId, userId),
      eq(userActivity.activityType, 'track_verification')
    ));

  if (verificationCount[0].count >= 100) {
    await awardBadge(userId, 'track_detective');
  }
}
```

**Acceptance Criteria:**
- [ ] DJs see low-confidence matches after sets
- [ ] Confirm/reject/search workflow functional
- [ ] Verified matches update global repository
- [ ] Incentive points tracked

### Sprint 4.4: Spotify Setlist Export

**One-Click Export:**

```typescript
// services/spotify.ts
export async function exportSetlistToSpotify(
  userId: number,
  sessionId: string,
  playlistName?: string
) {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!user?.spotifyRefreshToken) {
    throw new Error('Spotify not connected');
  }

  const accessToken = await refreshSpotifyToken(user.spotifyRefreshToken);

  // Get verified tracks from session
  const tracks = await db
    .select({
      spotifyUri: globalTracks.spotifyUri,
    })
    .from(playedTracks)
    .innerJoin(globalTracks, eq(playedTracks.globalTrackId, globalTracks.id))
    .where(and(
      eq(playedTracks.sessionId, sessionId),
      isNotNull(globalTracks.spotifyUri)
    ))
    .orderBy(asc(playedTracks.playedAt));

  if (tracks.length === 0) {
    throw new Error('No verified tracks to export');
  }

  // Create playlist
  const session = await db.query.sessions.findFirst({
    where: eq(sessions.id, sessionId),
  });

  const name = playlistName || `${session?.djName}'s Set - ${formatDate(session?.startedAt)}`;

  const playlist = await createSpotifyPlaylist(accessToken, name);

  // Add tracks in batches of 100 (Spotify limit)
  const uris = tracks.map(t => t.spotifyUri).filter(Boolean);
  for (let i = 0; i < uris.length; i += 100) {
    await addTracksToPlaylist(accessToken, playlist.id, uris.slice(i, i + 100));
  }

  return {
    playlistId: playlist.id,
    playlistUrl: playlist.external_urls.spotify,
    trackCount: uris.length,
  };
}
```

**Acceptance Criteria:**
- [ ] Export creates Spotify playlist with correct tracks
- [ ] Missing/unverified tracks noted in export report
- [ ] Playlist naming conventions respected
- [ ] Error handling for rate limits and auth failures

---

## Phase 5: UX Strategy - Dashboards (Sprints 5.1-5.4)

**Duration:** 4 weeks
**Goal:** Role-specific experiences
**Shippable:** Each dashboard is independently useful

### Sprint 5.1: Organizer Command Center

**Route:** `/app/organizer`

**Key Components:**

1. **Event Overview Dashboard**
```typescript
// packages/web/src/app/organizer/page.tsx
export default function OrganizerDashboard() {
  const { data: events } = useSWR('/api/organizer/events');

  return (
    <div className="organizer-dashboard">
      <header>
        <h1>Event Command Center</h1>
        <Button href="/organizer/events/new">Create Event</Button>
      </header>

      <section className="active-events">
        <h2>Active Events</h2>
        {events?.filter(e => e.status === 'active').map(event => (
          <EventCard
            key={event.id}
            event={event}
            stats={{
              activeStages: event.stages.filter(s => s.hasActiveSession).length,
              totalListeners: event.stages.reduce((sum, s) => sum + s.listenerCount, 0),
            }}
          />
        ))}
      </section>

      <section className="quick-actions">
        <AnnouncementComposer events={events} />
      </section>
    </div>
  );
}
```

2. **Live Schedule Maker**
```typescript
// packages/web/src/app/organizer/events/[eventId]/schedule/page.tsx
export default function ScheduleMaker({ params }: Props) {
  const { eventId } = params;
  const { data: schedule } = useSWR(`/api/events/${eventId}/schedule`);

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="schedule-grid">
        <TimeAxis />
        {schedule?.stages.map(stage => (
          <Droppable key={stage.id} droppableId={stage.id}>
            {(provided) => (
              <StageColumn
                ref={provided.innerRef}
                {...provided.droppableProps}
                stage={stage}
              >
                {stage.slots.map((slot, index) => (
                  <Draggable key={slot.id} draggableId={slot.id} index={index}>
                    {(provided) => (
                      <ScheduleSlot
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        {...provided.dragHandleProps}
                        slot={slot}
                        onEdit={() => openSlotEditor(slot)}
                      />
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </StageColumn>
            )}
          </Droppable>
        ))}
      </div>
    </DragDropContext>
  );
}
```

3. **Announcement Center**
```typescript
// components/organizer/AnnouncementCenter.tsx
export function AnnouncementCenter({ eventId }: Props) {
  const [message, setMessage] = useState('');
  const [priority, setPriority] = useState<'info' | 'warning' | 'urgent'>('info');
  const [sendPush, setSendPush] = useState(true);

  const handleSend = async () => {
    await fetch(`/api/events/${eventId}/announcements`, {
      method: 'POST',
      body: JSON.stringify({ message, priority, push: sendPush }),
    });

    toast.success('Announcement sent to all attendees');
    setMessage('');
  };

  return (
    <div className="announcement-center">
      <h3>Broadcast to Attendees</h3>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Competition starting in 15 minutes..."
        maxLength={500}
      />
      <div className="options">
        <select value={priority} onChange={(e) => setPriority(e.target.value)}>
          <option value="info">Info</option>
          <option value="warning">Important</option>
          <option value="urgent">Urgent</option>
        </select>
        <label>
          <input type="checkbox" checked={sendPush} onChange={(e) => setSendPush(e.target.checked)} />
          Send push notification
        </label>
      </div>
      <Button onClick={handleSend} disabled={!message.trim()}>
        Send Announcement
      </Button>
    </div>
  );
}
```

**Acceptance Criteria:**
- [ ] Organizer can view all their events
- [ ] Schedule drag-and-drop updates in real-time
- [ ] Announcements reach all event subscribers
- [ ] Live listener counts visible per stage

### Sprint 5.2: DJ Career Hub

**Route:** `/app/dj`

**Key Components:**

1. **Gig Calendar**
```typescript
// packages/web/src/app/dj/calendar/page.tsx
export default function DJCalendar() {
  const { data: bookings } = useSWR('/api/dj/bookings');

  return (
    <div className="dj-calendar">
      <CalendarView
        events={bookings?.map(b => ({
          id: b.id,
          title: `${b.eventName} - ${b.stageName}`,
          start: b.startTime,
          end: b.endTime,
          status: b.status, // pending, confirmed, completed
        }))}
        onEventClick={(booking) => openBookingDetails(booking)}
      />

      <PendingRequests bookings={bookings?.filter(b => b.status === 'pending')} />
    </div>
  );
}
```

2. **Smart Profile**
```typescript
// packages/web/src/app/dj/[slug]/page.tsx
export default function DJProfile({ params }: Props) {
  const { slug } = params;
  const { data: dj } = useSWR(`/api/dj/profile/${slug}`);
  const { data: stats } = useSWR(`/api/dj/${slug}/stats`);

  return (
    <div className="dj-profile">
      <header>
        <Avatar src={dj?.avatarUrl} />
        <h1>{dj?.displayName}</h1>
        <p className="bio">{dj?.bio}</p>
        <VerifiedBadge verified={dj?.verified} />
      </header>

      <section className="stats">
        <Stat label="Events Played" value={stats?.totalEvents} />
        <Stat label="Total Hours Live" value={stats?.totalHours} />
        <Stat label="Unique Tracks" value={stats?.uniqueTracks} />
      </section>

      <section className="vibe-graph">
        <h3>Music Vibe</h3>
        <VibeRadar
          data={stats?.vibeProfile}
          labels={['Modern', 'Classic', 'Blues', 'Uptempo', 'Lyrical']}
        />
        <p className="vibe-summary">Mostly plays: {stats?.topVibe}</p>
      </section>

      <section className="upcoming">
        <h3>Upcoming Gigs</h3>
        {dj?.upcomingBookings?.map(booking => (
          <BookingCard key={booking.id} booking={booking} />
        ))}
      </section>
    </div>
  );
}
```

**Acceptance Criteria:**
- [ ] DJs can view and manage bookings
- [ ] Public profile shows verified stats
- [ ] Vibe graph generated from real play data
- [ ] Upcoming gigs auto-populated from bookings

### Sprint 5.3: Dancer Event Companion

**Route:** `/app/dancer` (or `/event/[eventId]`)

**Key Components:**

1. **Dynamic Schedule**
```typescript
// packages/web/src/app/event/[eventId]/page.tsx
export default function DancerEventView({ params }: Props) {
  const { eventId } = params;
  const { data: event } = useSWR(`/api/events/${eventId}`);
  const { data: schedule } = useSWR(`/api/events/${eventId}/schedule`);
  const [mySchedule, setMySchedule] = useLocalStorage<string[]>(`starred-${eventId}`, []);

  const happeningNow = schedule?.slots.filter(s =>
    isNow(s.startTime, s.endTime)
  );

  return (
    <div className="dancer-companion">
      {happeningNow?.length > 0 && (
        <section className="happening-now">
          <h2>Happening Now</h2>
          {happeningNow.map(slot => (
            <LiveSlotCard key={slot.id} slot={slot} />
          ))}
        </section>
      )}

      <section className="my-schedule">
        <h2>My Schedule ({mySchedule.length} starred)</h2>
        <ScheduleTimeline
          slots={schedule?.slots}
          starred={mySchedule}
          onToggleStar={(slotId) => toggleStar(slotId, mySchedule, setMySchedule)}
          showOnlyStarred={showFiltered}
        />
      </section>

      <NotificationPreferences
        onEnable={(slotId) => scheduleReminder(slotId)}
      />
    </div>
  );
}
```

2. **Music Journal**
```typescript
// packages/web/src/app/dancer/likes/page.tsx
export default function MusicJournal() {
  const { data: likes } = useSWR('/api/dancer/likes');

  // Group by event
  const byEvent = groupBy(likes, 'eventName');

  return (
    <div className="music-journal">
      <header>
        <h1>My Music Journal</h1>
        <p>Songs you loved at events</p>
      </header>

      {Object.entries(byEvent).map(([eventName, tracks]) => (
        <section key={eventName}>
          <h3>{eventName}</h3>
          <TrackList tracks={tracks} />
          <ExportButton
            tracks={tracks}
            playlistName={`${eventName} Favorites`}
          />
        </section>
      ))}
    </div>
  );
}
```

**Acceptance Criteria:**
- [ ] Dancers see event schedule with "Happening Now"
- [ ] Starred items persist and can trigger notifications
- [ ] Liked songs grouped by event
- [ ] Export to Spotify functional

### Sprint 5.4: Platform Owner Admin

**Route:** `/admin`

**Key Components:**

1. **Gatekeeper Inbox**
```typescript
// packages/web/src/app/admin/applications/page.tsx
export default function ApplicationsInbox() {
  const { data: applications } = useSWR('/api/admin/applications?status=pending');

  return (
    <div className="gatekeeper-inbox">
      <h1>Pending Applications</h1>

      <Tabs>
        <Tab label="DJs">{/* ... */}</Tab>
        <Tab label="Organizers">
          {applications?.organizers.map(app => (
            <ApplicationCard
              key={app.id}
              application={app}
              onApprove={() => approveApplication(app.id)}
              onReject={() => rejectApplication(app.id)}
            />
          ))}
        </Tab>
      </Tabs>
    </div>
  );
}
```

2. **System Health Dashboard**
```typescript
// packages/web/src/app/admin/health/page.tsx
export default function SystemHealth() {
  const { data: metrics } = useSWR('/api/admin/metrics', { refreshInterval: 5000 });

  return (
    <div className="system-health">
      <MetricCard
        label="Active WebSockets"
        value={metrics?.activeConnections}
        trend={metrics?.connectionsTrend}
      />
      <MetricCard
        label="Push Notifications (24h)"
        value={metrics?.pushSent24h}
        alert={metrics?.pushFailRate > 0.1}
      />
      <MetricCard
        label="Redis Memory"
        value={`${metrics?.redisMemoryMb}MB`}
        max={100}
      />
      <MetricCard
        label="Active Sessions"
        value={metrics?.activeSessions}
        max={1000}
      />
    </div>
  );
}
```

**Acceptance Criteria:**
- [ ] Admin can review and approve/reject applications
- [ ] System health metrics visible in real-time
- [ ] Shadow ban capability for bad actors
- [ ] Audit trail for admin actions

---

## Implementation Timeline

```
                    Q1 2026                              Q2 2026
Week   1   2   3   4   5   6   7   8   9   10  11  12  13  14  15  16
       │   │   │   │   │   │   │   │   │   │   │   │   │   │   │   │
Phase 0 ███                                                          Critical Fixes
Phase 1     ████████                                                 Infrastructure
Phase 2             ████████████                                     Stage/Event
Phase 3                         ████████                             Identity
Phase 4                                 ████████████                 Smart Crate
Phase 5                                             ████████████████ Dashboards
```

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Redis integration breaks existing features | Medium | High | Feature flags, dual-write during migration |
| Spotify API rate limits | High | Medium | Queue-based processing, caching, backoff |
| Schema migrations on production | Medium | High | Staged rollout: staging -> prod with rollback |
| User adoption of new roles | Medium | Medium | Gradual feature rollout, onboarding UX |
| Performance degradation at scale | Low | High | Load testing each phase, Redis clustering |

---

## Success Metrics

| Phase | KPI | Target |
|-------|-----|--------|
| 0 | Push notification complaints | 0 (from current ~5/week) |
| 1 | Session state survives restart | 100% |
| 2 | Stage subscription retention | >90% across DJ changes |
| 3 | Dancer account signups | 100 in first month |
| 4 | Track verification rate | >80% of played tracks |
| 5 | Organizer NPS | >50 |

---

## Dependencies & Prerequisites

### External Services
- [ ] Spotify Developer Account (for OAuth + API)
- [ ] Apple Music API access (optional, Phase 4)
- [ ] Redis Cloud or self-hosted Redis instance

### Team Skills Required
- Backend: Drizzle ORM, Redis, Bun
- Frontend: React 19, Next.js 16, TanStack Query
- Infrastructure: Docker, CI/CD, monitoring

### Budget Considerations
- Redis Cloud: ~$50/month for starter
- Spotify API: Free tier sufficient initially
- Additional VPS capacity: ~$30/month

---

## Appendix: File Changes by Phase

### Phase 0 (Critical Fixes)
```
packages/cloud/src/
├── db/schema.ts              # Add subscribed_session_id to push_subscriptions
├── routes/push.ts            # Fix token validation, add rate limit
├── handlers/dj.ts            # Scope push to session subscribers
└── lib/auth.ts               # Verify hashToken usage

packages/web/src/
├── hooks/live/usePushNotifications.ts  # Send sessionId on subscribe
└── middleware.ts             # CSP nonce implementation
```

### Phase 1 (Infrastructure)
```
packages/cloud/src/
├── lib/redis.ts              # NEW: Redis client
├── lib/topics.ts             # NEW: Topic management
├── lib/sessions.ts           # Migrate to Redis
├── handlers/subscriber.ts    # Multi-topic subscription
└── handlers/dj.ts            # Topic-based broadcast
```

### Phase 2 (Stage/Event)
```
packages/cloud/src/
├── db/schema.ts              # events, stages, stage_subscriptions tables
├── routes/events.ts          # NEW: Event CRUD
├── routes/stages.ts          # NEW: Stage CRUD
├── handlers/dj.ts            # Stage binding on REGISTER_SESSION
└── handlers/organizer.ts     # NEW: Event announcement handler

packages/shared/src/
└── schemas.ts                # New message types
```

### Phase 3 (Identity)
```
packages/cloud/src/
├── db/schema.ts              # User table evolution, roles
├── routes/auth.ts            # Organizer registration
└── middleware/auth.ts        # Role-based middleware

packages/web/src/
├── app/api/auth/[...nextauth]/route.ts  # NEW: NextAuth
└── lib/auth.ts               # Client-side auth hooks
```

### Phase 4 (Smart Crate)
```
packages/cloud/src/
├── db/schema.ts              # global_tracks, track_matches tables
├── workers/track-matcher.ts  # NEW: Background worker
└── services/spotify.ts       # NEW: Spotify integration

packages/desktop/src/
└── components/SessionRecap/TrackVerification.tsx  # NEW: Verification UI
```

### Phase 5 (Dashboards)
```
packages/web/src/app/
├── organizer/                # NEW: Organizer dashboard
├── dj/                       # NEW: DJ hub
├── dancer/                   # NEW: Dancer companion
└── admin/                    # NEW: Platform admin
```

---

**Document Status:** Ready for team review
**Next Steps:**
1. Review and validate estimates
2. Prioritize based on business needs
3. Assign sprint ownership
4. Begin Phase 0 implementation
