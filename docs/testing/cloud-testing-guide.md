# Cloud Package Testing Guide

**Package:** `@pika/cloud`  
**Version:** 0.2.1  
**Last Updated:** 2026-01-21  

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
cd packages/cloud && bun test src/__tests__/websocket-handlers.test.ts
```

## Test Files

| File | Tests | Coverage Area |
|:---|:---:|:---|
| `src/routes/auth.test.ts` | 15 | Auth validation (login, register, email) |
| `src/__tests__/websocket-handlers.test.ts` | 43 | WS handlers: PING/PONG, nonce, listeners, tempo, ACK/NACK, session ownership, likes |

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
 * PRODUCTION LOCATION: packages/cloud/src/index.ts (line ~530)
 * FAILURE IMPACT: Dancers enter reconnection loops
 */
test("responds to PING with PONG", () => {
  // ...
});
```

## Coverage Targets

| Milestone | Total Tests | Status |
|:---|:---:|:---|
| Baseline | 15 | ✅ |
| Step 1 Complete | 30 | ✅ |
| Step 2 Complete | 58 | ✅ |
| Step 3 Target | 70+ | ⏳ |

## Adding New Tests

1. Create test file in `src/__tests__/` or alongside the module
2. Document each test with RATIONALE comment
3. Run `bun test` to verify
4. Update this guide with new coverage

---

*Test coverage is our safety net. Never skip it.*
