# Architecture: Cloud Module Structure

This document describes the modular architecture of the `@pika/cloud` backend service, introduced in v0.4.5.

**Last Updated:** February 1, 2026 (v0.4.5)

---

## Overview

The Cloud service has been refactored from a monolithic `index.ts` (~3000 lines) into a modular architecture:

| Category | Files | Purpose |
|----------|-------|---------|
| **Handlers** | 8 files | WebSocket message processing (20 handlers) |
| **Routes** | 6 files | REST API endpoints |
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
├── subscriber.ts     # Session subscription (1 handler)
├── utility.ts        # Utility messages (2 handlers)
└── lifecycle.ts      # Connection lifecycle
```

### Handler Breakdown

| File | Message Types | Count |
|------|---------------|-------|
| `dj.ts` | REGISTER_SESSION, BROADCAST_TRACK, TRACK_STOPPED, END_SESSION, SEND_ANNOUNCEMENT, CANCEL_ANNOUNCEMENT, BROADCAST_METADATA | 7 |
| `dancer.ts` | SEND_LIKE, SEND_BULK_LIKE, REMOVE_LIKE, SEND_REACTION, SEND_TEMPO_REQUEST | 5 |
| `poll.ts` | START_POLL, END_POLL, CANCEL_POLL, VOTE_ON_POLL | 4 |
| `subscriber.ts` | SUBSCRIBE | 1 |
| `utility.ts` | PING, GET_SESSIONS, VALIDATE_SESSION | 3 |
| **Total** | | **20** |

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

### File Structure

```
packages/cloud/src/routes/
├── auth.ts       # DJ authentication (~300 lines)
├── sessions.ts   # Session queries
├── stats.ts      # Global statistics
├── dj.ts         # DJ profile routes
├── client.ts     # Client/dancer routes
└── push.ts       # Web Push subscriptions
```

### Route Breakdown

| File | Endpoints | Purpose |
|------|-----------|---------|
| `auth.ts` | `/api/auth/*` | Register, login, validate, profile |
| `sessions.ts` | `/sessions`, `/api/sessions/*`, `/api/session/*` | List, active, history, recap, fingerprint |
| `stats.ts` | `/api/stats/*` | Top tracks, global stats |
| `dj.ts` | `/api/dj/*` | DJ profile by slug |
| `client.ts` | `/api/client/*` | Liked tracks for dancers |
| `push.ts` | `/api/push/*` | Web Push subscription management |

### Mounting in index.ts

```typescript
import { auth as authRoutes } from "./routes/auth";
import { sessions as sessionsRoutes } from "./routes/sessions";
// ...

app.route("/api/auth", authRoutes);
app.route("/api/sessions", sessionsRoutes);
app.route("/api/stats", statsRoutes);
app.route("/api/dj", djRoutes);
app.route("/api/client", clientRoutes);
app.route("/api/push", pushRoutes);
```

---

## 3. Library Modules (`src/lib/`)

State management and utility functions.

### File Structure

```
packages/cloud/src/lib/
├── index.ts              # Barrel export
├── sessions.ts           # Active session Map
├── listeners.ts          # Listener count tracking
├── likes.ts              # Like deduplication
├── polls.ts              # Poll state + timer cleanup
├── tempo.ts              # Tempo vote aggregation
├── nonces.ts             # Message deduplication
├── protocol.ts           # ACK/NACK + parseMessage
├── cache.ts              # In-memory cache utility
├── auth.ts               # Token validation
└── persistence/
    ├── sessions.ts       # Session DB ops + waitForSession
    ├── tracks.ts         # Track DB ops
    ├── polls.ts          # Poll DB ops
    └── queue.ts          # Serialized persistence queue (v0.4.5)
└── services/
    └── push.ts           # Web Push service (VAPID)
```

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

#### `persistence/queue.ts` - Serialized Persistence (v0.4.5)

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
