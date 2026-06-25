# Cloud Package Testing Guide

**Package:** `@pika/cloud`
**Version:** 0.5.0
**Last Updated:** 2026-06-25
**Status:** ✅ 355 unit tests passing (+ gated real-Postgres integration)

---

## Overview

This guide documents the testing strategy and patterns for the Cloud backend package.

> **Frontend/component tests** (web + desktop) live elsewhere: they use React Testing
> Library in `*.rtl.tsx` files (happy-dom). See the **RTL component tests** section in the
> root `CLAUDE.md` — note the web **dual-runner** (`bun test && vitest run`) and the
> `vitest.config.mts` requirement.

> **📊 Real-DB coverage:** DB-touching code is covered by `*.integration.test.ts`, gated by
> `RUN_DB_TESTS` and run **isolated** via `bun run test:integration` (never `RUN_DB_TESTS=1 bun test`
> — mock-module leakage breaks the real-DB queries).

## Running Tests

```bash
# Run all cloud tests
cd packages/cloud && bun test

# Run with verbose output
cd packages/cloud && bun test --verbose

# Run specific test file
cd packages/cloud && bun test src/__tests__/robustness.test.ts

# Run security tests
cd packages/cloud && bun test test/security.test.ts
```

## Test Files

| File | Tests | Coverage Area |
|:---|:---:|:---|
| `src/routes/auth.test.ts` | 15 | Auth validation (login, register, email) |
| `src/__tests__/websocket-handlers.test.ts` | 43 | WS handlers: PING/PONG, nonce, listeners, tempo, ACK/NACK |
| `src/__tests__/subscriber-handlers.test.ts` | 17 | SUBSCRIBE, announcements, late-joiner sync, backpressure |
| `src/__tests__/rest-api.test.ts` | 17 | Health, sessions, history, recap, global stats |
| `src/__tests__/cache-telemetry.test.ts` | 20 | withCache, invalidateCache, clearCache, session telemetry |
| `src/__tests__/robustness.test.ts` | 24 | parseMessage, safeHandler, poll timers, waitForSession |
| `src/__tests__/poll-handlers.test.ts` | 28 | Poll voting, results, timer behavior |
| `src/__tests__/db-persistence.test.ts` | 15 | Mock DB operations |
| `test/security.test.ts` | 42 | Schema validation, rate limits, boundaries |
| `test/auth_security.test.ts` | 30 | Auth edge cases, token validation |
| **Total** | **251** | |

## Testing Strategy

### 1. Mock-First Approach

Tests use mock implementations rather than real database/WebSocket connections:

```typescript
// Example: Mock WebSocket client
interface MockWebSocketClient {
  sentMessages: string[];
  send: (data: string) => void;
}

function createMockClient(): MockWebSocketClient {
  const client = { sentMessages: [], send: (d) => client.sentMessages.push(d) };
  return client;
}
```

### 2. Safety Constraints

> [!CAUTION]
> **From Project Lead:**
> - Every line of code must be tested before deletion
> - No removal of production code until tests pass with new changes
> - Document every test thoroughly

### 3. Test Documentation Pattern

Each test should include:
- **RATIONALE:** Why does this behavior matter?
- **PRODUCTION LOCATION:** Where is this logic in the codebase?
- **FAILURE IMPACT:** What breaks if this fails?

```typescript
/**
 * TEST: PING message receives PONG response
 *
 * RATIONALE: Critical for connection health monitoring
 * PRODUCTION LOCATION: packages/cloud/src/handlers/utility.ts
 * FAILURE IMPACT: Dancers enter reconnection loops
 */
test("responds to PING with PONG", () => {
  // ...
});
```

## Robustness Testing (v0.2.4)

### parseMessage Validation Tests

Tests covering the type-safe message validation helper:

```typescript
// Test: parseMessage returns null for invalid schemas
const result = parseMessage(TestSchema, invalidMsg, mockWs, "msg-123");
expect(result).toBeNull();
expect(mockWs.sent[0]).toContain("NACK");
```

### safeHandler Error Isolation Tests

Tests verifying that handler errors don't crash the WebSocket connection:

```typescript
// Test: safeHandler catches errors and sends NACK
const handler = () => { throw new Error("Test error"); };
const wrapped = safeHandler(handler);
await wrapped(ctx);
// Should not throw, should send NACK
```

### Poll Timer Cleanup Tests

Tests ensuring timers are properly cancelled:

```typescript
// Test: endPoll cancels pending auto-end timer
setPollTimer(pollId, setTimeout(() => { /* ... */ }, 1000));
endPoll(pollId);
// Timer should be cancelled, callback never fires
```

## Coverage Milestones

| Milestone | Total Tests | Status |
|:---|:---:|:---:|
| Baseline | 15 | ✅ |
| Step 1 Complete | 30 | ✅ |
| Step 2 Complete | 58 | ✅ |
| Step 3 Complete | 100 | ✅ |
| Robustness (v0.2.4) | 179 | ✅ |
| **Sprint S5 (v0.2.8)** | **251** | ✅ |

## All Package Test Counts (v0.2.8)

| Package | Tests | Test Files | Runner |
|:---|:---:|:---:|:---|
| Desktop | 293 | 8 | Vitest |
| Cloud | 251 | 9 | bun:test |
| Web | 53 | 1 | bun:test |
| Shared | 15 | 1 | bun:test |
| **Total** | **612** | **21** | |

## Adding New Tests

1. Create test file in `src/__tests__/` or alongside the module
2. Document each test with RATIONALE comment
3. Run `bun test` to verify
4. Update this guide with new coverage

---

*Test coverage is our safety net. Never skip it.*
*Last Updated: January 23, 2026 - Sprint S5 Complete*
