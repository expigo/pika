# Cloud Package Testing Guide

**Package:** `@pika/cloud`  
**Version:** 0.2.4  
**Last Updated:** 2026-01-22  

---

## Overview

This guide documents the testing strategy and patterns for the Cloud backend package.

## Running Tests

```bash
# Run all cloud tests
cd packages/cloud && bun test

# Run with verbose output
cd packages/cloud && bun test --verbose

# Run specific test file
cd packages/cloud && bun test src/__tests__/robustness.test.ts
```

## Test Files

| File | Tests | Coverage Area |
|:---|:---:|:---|
| `src/routes/auth.test.ts` | 15 | Auth validation (login, register, email) |
| `src/__tests__/websocket-handlers.test.ts` | 43 | WS handlers: PING/PONG, nonce, listeners, tempo, ACK/NACK, session ownership, likes |
| `src/__tests__/subscriber-handlers.test.ts` | 17 | SUBSCRIBE, announcements, late-joiner sync, backpressure |
| `src/__tests__/rest-api.test.ts` | 17 | Health, sessions, history, recap, global stats |
| `src/__tests__/cache-telemetry.test.ts` | 20 | withCache, invalidateCache, clearCache, session telemetry |
| `src/__tests__/robustness.test.ts` | 24 | parseMessage, safeHandler, poll timers, waitForSession |
| `src/__tests__/poll-handlers.test.ts` | 28 | Poll voting, results, timer behavior |
| `src/__tests__/db-persistence.test.ts` | 15 | Mock DB operations |
| **Total** | **179** | |

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
| **Robustness (v0.2.4)** | **179** | ✅ |

## Adding New Tests

1. Create test file in `src/__tests__/` or alongside the module
2. Document each test with RATIONALE comment
3. Run `bun test` to verify
4. Update this guide with new coverage

---

*Test coverage is our safety net. Never skip it.*
