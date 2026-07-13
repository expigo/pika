# Architecture: Cloud Module Structure

This document describes the modular architecture of the `@pika/cloud` backend service, introduced in v0.5.0.

**Last Updated:** June 25, 2026 (v0.5.0)

---

## Overview

The Cloud service has been refactored from a monolithic `index.ts` (~3000 lines) into a modular architecture:

| Category | Files | Purpose |
|----------|-------|---------|
| **Handlers** | 8 files | WebSocket message processing (21 handlers) |
| **Routes** | ~11 files | REST API endpoints (see §2 note) |
| **Lib** | 14 files | State management & utilities |
| **Entry** | 1 file | ~570 lines, wiring + global cleanup |

---

## 1. WebSocket Handlers (`src/handlers/`)

Each handler module exports functions that process specific WebSocket message types.

### File Structure

```
packages/cloud/src/handlers/
├── index.ts          # safeHandler wrapper + barrel exports
├── ws-context.ts     # WSContext type definition
├── dj.ts             # DJ actions (6 handlers)
├── dancer.ts         # Dancer interactions (3 handlers)
├── poll.ts           # Poll lifecycle (4 handlers)
├── subscriber.ts     # Session + Stage subscription (2 handlers)
├── utility.ts        # Utility messages (2 handlers)
└── lifecycle.ts      # Connection lifecycle + DJ-reconnect grace / reapSession (v0.5.0)
```

### Handler Breakdown

| File | Message Types | Count |
|------|---------------|-------|
| `dj.ts` | REGISTER_SESSION, BROADCAST_TRACK, TRACK_STOPPED, END_SESSION, SEND_ANNOUNCEMENT, CANCEL_ANNOUNCEMENT, BROADCAST_METADATA | 7 |
| `dancer.ts` | SEND_LIKE, SEND_BULK_LIKE, REMOVE_LIKE, SEND_REACTION, SEND_TEMPO_REQUEST | 5 |
| `poll.ts` | START_POLL, END_POLL, CANCEL_POLL, VOTE_ON_POLL | 4 |
| `subscriber.ts` | SUBSCRIBE, SUBSCRIBE_STAGE | 2 |
| `utility.ts` | PING, GET_SESSIONS, VALIDATE_SESSION | 3 |
| **Total** | | **21** |

`SUBSCRIBE_STAGE` joins a persistent **Stage** (vs a single session): the dancer is routed to
whichever session is live on that stage and follows DJ rotation seamlessly. See
[stage-event-model.md](./stage-event-model.md).

### WSContext Pattern

All handlers receive a `WSContext` object containing:

```typescript
interface WSContext {
  message: WebSocketMessage;    // Parsed JSON message
  ws: { send: (data: string) => void };  // Sender abstraction
  rawWs: ServerWebSocket;       // Raw Bun WebSocket (for publish)
  state: WSConnectionState;     // Connection-scoped state
  messageId?: string;           // For ACK/NACK responses
}
```

### Type-Safe Validation

Messages are validated using `parseMessage<T>()`:

```typescript
export async function handleSendLike(ctx: WSContext): Promise<void> {
  const { ws, message, state, messageId } = ctx;
  
  // Validate with Zod schema - returns null on failure
  const msg = parseMessage(SendLikeSchema, message, ws, messageId);
  if (!msg) return; // NACK already sent
  
  // msg is now fully typed
  const { sessionId, payload } = msg;
  // ...
}
```

### Error Isolation

All exported handlers are wrapped with `safeHandler()`:

```typescript
// Raw handler (private)
async function _handleSendLike(ctx: WSContext): Promise<void> { ... }

// Exported handler (wrapped)
export const handleSendLike = safeHandler(_handleSendLike);
```

**safeHandler behavior:**
1. Catches any thrown exception
2. Logs error with handler name
3. Sends NACK if messageId exists
4. Returns normally (doesn't re-throw)

---

## 2. REST Routes (`src/routes/`)

REST endpoints are organized by resource type.

> **Note:** there is no `auth.ts` — **Better Auth** owns `/api/auth/*` (mounted in `index.ts` as
> `betterAuth.handler`; see [auth-system.md](auth-system.md)).

### File Structure

```
packages/cloud/src/routes/
├── sessions.ts   # Session queries (list/active/history/recap/fingerprints)
├── stats.ts      # Global statistics
├── dj.ts         # DJ routes — thin COMPOSER of the ./dj/ concern modules (2026-07 behavior-preserving split)
├── dj/           # profile.ts (public /:slug) · sessions.ts · embeds.ts · booth.ts · identity.ts (Slice D)
│                 #   composed /me/* BEFORE /:slug (Hono registration-order priority); constants.ts holds shared caps
├── dj-live.ts    # Web-DJ broadcast control (Track D)
├── client.ts     # Anonymous dancer journal (device read, unlike, playlist export)
├── me.ts         # /api/me — thin COMPOSER of ./me/ (2026-07 split); requireAuth lives HERE,
│                 #   registered before the mounts, so auth never depends on submodule order
├── me/           # journal.ts (Slice B: claim, union read, unlike, export, device unlink) ·
│                 #   relationship.ts (Slice C follows + preferences, Slice D compat/:slug —
│                 #   one file so they share the single relationshipLimiter budget)
├── telemetry.ts  # Product-event beacon ingest (enum-whitelisted)
├── push.ts       # Web Push subscriptions
├── email.ts      # RFC 8058 one-click unsubscribe (Slice C — deliberately CSRF-exempt)
├── img.ts        # Pinhole album-art proxy for the Night Card canvas (Slice C, GET-only)
├── playlist.ts   # Spotify playlist tools (B3, incl. POST /api/playlist/features)
├── spotify.ts    # Spotify OAuth (DJ + shared service account, BFF)
├── admin.ts      # Admin panel — thin COMPOSER of ./admin/ (2026-07 split); adminLimiter +
│                 #   requireAdmin live HERE, before the mounts (mount order free — all static prefixes)
├── admin/        # panel.ts (me/overview/audit) · djs.ts (approval + create) ·
│                 #   catalog.ts (Songs Catalog reads) · ops.ts (recap sweep, title backfill)
├── seed.ts       # Admin catalog seed tool
└── stages.ts     # Event/Stage provisioning (owner-scoped) + stage lookup
```

### Route Breakdown

| File | Endpoints | Purpose |
|------|-----------|---------|
| *(Better Auth)* | `/api/auth/*` | Sign-up/in/out, sessions, admin ops, magic link, email OTP |
| `sessions.ts` | `/sessions`, `/api/sessions/*`, `/api/session/*` | List, active, history, recap, fingerprint (ownership-checked) |
| `stats.ts` | `/api/stats/*` | Top tracks, global stats |
| `dj.ts` → `dj/*` | `/api/dj/*` | **Composed from `./dj/` concern modules** (2026-07 split; paths unchanged): `profile.ts` (public `/:slug` + Signature + booth playlists), `sessions.ts` (publish + set-playlist sync), `embeds.ts` (external playlists), `booth.ts` (bio/gigs), `identity.ts` (Slice D: `me/playlists/import` `linkMode:"fill"`, `me/curated-playlists`, `me/crowd-pleasers`; D.1 oEmbed title). Composer registers `/me/*` before `/:slug` |
| `dj-live.ts` | `/api/live/*` | Web-DJ broadcast control channel |
| `client.ts` | `/api/client/*` | Anonymous journal: likes read, unlike, Spotify export (rate-limited) |
| `me.ts` → `me/*` | `/api/me/*` | **Composed from `./me/` submodules** (2026-07 split; paths unchanged, `requireAuth` in the composer): `journal.ts` — claim device id, union read, unlike, export, device unlink (Slice B); `relationship.ts` — `follows/:slug` (PUT/DELETE), `follows` (GET, + next gig), `preferences` (GET/PUT consent) (Slice C) + `compat/:slug` (overlap card, snapshot-first resolution) (Slice D) |
| `telemetry.ts` | `/api/telemetry/*` | Product beacons (enum-whitelisted POST) |
| `push.ts` | `/api/push/*` | Web Push subscription management |
| `email.ts` | `/api/email/unsubscribe` | One-click unsubscribe (HMAC token; POST clears consent, GET 302s to the web confirm page) |
| `img.ts` | `/api/img?src=` | Pinhole i.scdn.co art proxy (allowlist, no redirects, 2 MB cap, immutable cache) |
| `playlist.ts` | `/api/playlist/*` | DJ Spotify playlist tools |
| `spotify.ts` | `/api/spotify/*` | Spotify OAuth flows |
| `admin.ts` → `admin/*` | `/api/admin/*` | **Composed from `./admin/` concern modules** (2026-07 split; paths unchanged, guards in the composer): `panel.ts` (`/me` identity gate, `/overview`, `/audit`), `djs.ts` (approval queue + create), `catalog.ts` (`/api/admin/catalog{,/songs,/songs/:id}`), `ops.ts` (`POST recap/sweep`, `POST playlists/backfill-titles` — D.1, idempotent + audited) |
| `seed.ts` | `/api/admin/seed/*` | Catalog seed (admin-gated) |
| `stages.ts` | `/api/events`, `/api/stages/*` | Create events/stages (owner-scoped), stage lookup w/ `eventName` |

### Mounting in index.ts

```typescript
app.on(["POST", "GET"], "/api/auth/*", (c) => betterAuth.handler(c.req.raw));
app.route("/api/sessions", sessionsRoutes);
app.route("/api/dj", djRoutes);
app.route("/api/client", clientRoutes);
app.route("/api/me", meRoutes); // Slice B — behind csrfCheck for state-changing verbs
app.route("/api/telemetry", telemetryRoutes);
app.route("/api/push", pushRoutes);
app.route("/api/live", djLiveRoutes);
app.route("/api/playlist", playlistRoutes);
app.route("/api/admin", adminRoutes);
app.route("/api", stageRoutes); // /api/events, /api/stages/*
// (see index.ts for the full list — stats, spotify, seed, legacy /sessions)
```

---

## 3. Library Modules (`src/lib/`)

State management and utility functions.

### File Structure

```
packages/cloud/src/lib/
├── index.ts              # Barrel export
├── sessions.ts           # Active session Map + DJ-reconnect grace timers; stage-topic resolvers
│                         #   (getSessionBroadcastTopic / getSessionAudienceKey)
├── stages.ts             # stageActiveSession map (which session is live on a stage) + rotation guard
├── listeners.ts          # Listener count tracking
├── likes.ts              # Like deduplication
├── polls.ts              # Poll state + timer cleanup
├── tempo.ts              # Tempo vote aggregation
├── nonces.ts             # Message deduplication
├── protocol.ts           # ACK/NACK + parseMessage
├── cache.ts              # In-memory cache utility
├── auth.ts               # Token validation
├── topics.ts             # Pub/sub topic helpers (discovery + session:{id} + stage:{id})
├── broadcaster.ts        # Shared server.publish() for deferred broadcasts (v0.5.0)
└── persistence/
    ├── sessions.ts       # Session DB ops + waitForSession
    ├── tracks.ts         # Track DB ops
    ├── polls.ts          # Poll DB ops
    └── queue.ts          # Serialized persistence queue (v0.5.0)
└── services/
    ├── mail.ts / email-throttle.ts / email-prefs.ts   # Resend transport core + throttles + consent (B/C)
    ├── mailTemplates.ts  # Message layer: branded shells + template senders + throttled auth/marketing
    │                     #   orchestration (split 2026-07 from mail.ts — moved whole to avoid a cycle)
    ├── identity.ts       # client_identities claim map (Slice B)
    ├── journal.ts        # Account journal reads + the strict trust gate (trustedSpotifyLinkOn)
    ├── recap.ts          # Night Recap sweep — claim-then-send (Slice C)
    ├── spotify.ts / spotifyCatalog.ts / spotifyMatch.ts  # OAuth/BFF, catalog reads, seed/match
    │                     #   (seedFromPlaylist linkMode "authoritative"|"fill")
    ├── spotifyMatchScore.ts  # Pure ranking math (scoreCandidate/confidenceTier) — no HTTP/DB
    ├── spotifyPlaylist.ts    # Service-account OAuth + playlist create/replace (B3; split 2026-07
    │                     #   from spotify.ts — spotify.ts re-exports it as a compat facade)
    ├── signature.ts      # Slice D: DJ Signature engine (published-live ∪ promoted-import ids →
    │                     #   percentile ranges + eras; floors; booth playlist previews;
    │                     #   D.1: per-source featured counts + owner-only floors progress)
    ├── spotifyOembed.ts  # D.1: hardened fixed-host oEmbed title fetch (4s timeout, null on failure)
    ├── spotifyPoller.ts  # Track-D web broadcaster (per-DJ now-playing poll loop)
    └── finalizeWebSet.ts # Session-end hook: auto-build the set's Spotify playlist (shared
                          # account) + feed its plays into the catalog as identity-only rows
```

> Web Push (VAPID) lives at `src/services/push.ts` (top-level, not `lib/services/`).

**Web-set finalize (`finalizeWebSet.ts`).** When a Track-D web broadcast ends (`stopPoller` →
before `reapSession`), a best-effort, fire-and-forget pass reconstructs the set's Spotify tracks from
`played_tracks.spotify_url` (web broadcasts are Spotify-native — no matching) and: (1) creates a
playlist on the shared Pika service account, writing it to `sessions.spotify_playlist_id` (auto-shows
on the recap + profile; DJ can unshare from `/dj/live`); (2) feeds those plays into the Songs Catalog
via `seedFromPlaylist(dj, "", tracks)` as **identity-only** rows (no Spotify features — surfaced by
the catalog's `?missing=1` enrichment filter). Failures never block the session end.

### Key Modules

#### `protocol.ts` - Message Protocol

```typescript
// Send ACK response
export function sendAck(ws, messageId: string): void;

// Send NACK response
export function sendNack(ws, messageId: string, error: string): void;

// Type-safe message parsing with Zod
export function parseMessage<T>(
  schema: ZodSchema<T>,
  message: unknown,
  ws: { send: (data: string) => void },
  messageId?: string
): T | null;
```

#### `polls.ts` - Poll State with Timer Cleanup

```typescript
// Create poll and get ID
export function createPoll(sessionId, question, options, duration?): ActivePoll;

// Track auto-end timer
export function setPollTimer(pollId, timer: Timer): void;

// Cancel timer (called by endPoll automatically)
export function cancelPollTimer(pollId): void;

// End poll (cancels timer, returns results)
export function endPoll(pollId): ActivePoll | undefined;
```

#### `persistence/sessions.ts` - Event-Based Coordination

```typescript
// Wait for session to be persisted (event-based, not polling)
export async function waitForSession(
  sessionId: string,
  timeoutMs = 4000
): Promise<boolean>;

// Persist session to DB (signals waiters)
export async function persistSession(
  sessionId: string,
  djName: string,
  djUserId?: number
): Promise<boolean>;
```

#### `persistence/queue.ts` - Serialized Persistence (v0.5.0)

Ensures operations like "Persist Track" and "Persist Like" happen in strict order, regardless of async database timings.

```typescript
// Enqueue a task for a session
export function enqueuePersistence(
  sessionId: string, 
  task: () => Promise<void>
): Promise<void>;

// Clean up queue when session ends (Prevents leaks)
export function cleanupSessionQueue(sessionId: string): void;
```

---

## 4. Entry Point (`src/index.ts`)

After modularization, `index.ts` is ~570 lines:

### Responsibilities

1. **Sentry Initialization** - Error monitoring and PII scrubbing
2. **Middleware Setup** - CORS, logging, CSRF Check
3. **Route Mounting** - All 6 route modules
4. **WebSocket Configuration** - Rate limiting, connection handlers
5. **Message Dispatch** - Switch on message type to 20 handlers
6. **Global Cleanup Intervals** - 5-minute cleanup for stale listeners/sessions/rate-limits
7. **Heartbeat Interval** - Listener count broadcasting (every 2s)
8. **Graceful Shutdown** - SIGTERM/SIGINT handlers (ends sessions, closes DB)

### Message Dispatch Pattern

```typescript
switch (message.type) {
  case "REGISTER_SESSION":
    await handleRegisterSession(ctx);
    break;
  case "BROADCAST_TRACK":
    await handleBroadcastTrack(ctx);
    break;
  // ... 18 more cases
}
```

---

## 5. Benefits of Modularization

| Aspect | Before | After |
|--------|--------|-------|
| **File Size** | ~3000 lines | ~360 lines entry |
| **Type Safety** | 15+ `as any` casts | 0 `as any` casts |
| **Error Isolation** | One error crashes connection | Errors contained per handler |
| **Testability** | Hard to test inline code | Each module independently testable |
| **Maintainability** | Scroll through 3000 lines | Jump to specific handler file |

---

## 6. Testing

### Test Files

| File | Tests | Coverage |
|------|-------|----------|
| `robustness.test.ts` | 24 | parseMessage, safeHandler, timers, waitForSession |
| `websocket-handlers.test.ts` | 43 | Core WS behavior |
| `subscriber-handlers.test.ts` | 17 | Subscription logic |
| `poll-handlers.test.ts` | 28 | Poll VCs |
| Others | 171 | REST, cache, auth, queues, analytics |
| **Total** | **283** | |

### Running Tests

```bash
cd packages/cloud && bun test
```

---

## 7. Future Work

- [ ] Redis adapter for multi-instance support
- [ ] Metrics collection per handler
- [ ] Rate limiting per message type
- [ ] Handler-level feature flags

---

*This modular architecture provides a solid foundation for scaling the Cloud service.*
