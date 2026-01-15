# E2E Testing Guide

**Last Updated:** January 15, 2026

Pika! uses [Playwright](https://playwright.dev/) for End-to-End testing.

---

## Architecture (v2)

The test suite uses **WebSocket Injection** to simulate DJ sessions:

```
┌─────────────────┐      ┌─────────────────┐
│  ws-dj-simulator │─────▶│  Cloud:3001     │◀────┐
│   (Node.js)      │      │   (Hono/Bun)    │     │
└─────────────────┘      └─────────────────┘     │
                                                  │
                         ┌─────────────────┐     │
                         │   Web:3002      │─────┘
                         │  (Next.js)      │
                         │  ↑ Playwright   │
                         └─────────────────┘
```

**Key Design Decisions:**
- ❌ No Desktop app in tests (Tauri requires Rust, complex to mock)
- ✅ DJ simulated via raw WebSocket messages
- ✅ Real Cloud ↔ Web integration tested
- ✅ Deterministic, fast, no race conditions

---

## Running Tests

### Prerequisites
```bash
# Install Playwright browsers
bun x playwright install chromium

# Ensure ws package installed
bun add -D ws @types/ws
```

### Commands
```bash
# Run all tests (headless)
bun x playwright test

# Run with UI (debug mode)
bun x playwright test --ui

# Run specific test
bun x playwright test happy-path

# View HTML report
bun x playwright show-report
```

---

## Test Files

| File | Purpose |
|------|---------|
| `happy-path.spec.ts` | Core flow: DJ→Track→Audience→Like |
| `like-batching.spec.ts` | Rapid likes from multiple users |
| `session-discovery.spec.ts` | Late-starting session polling |

---

## Fixtures

### `ws-dj-simulator.ts`
Simulates a DJ session at the WebSocket protocol level.

```typescript
import { createDjSession } from "../fixtures/ws-dj-simulator";

const djSession = await createDjSession({
  djName: "Test DJ",
  track: { title: "Song", artist: "Artist" }
});

// Wait for likes
await djSession.waitForLikes(1);

// Cleanup
djSession.disconnect();
```

### `mock-tauri.ts` (Legacy)
⚠️ **Deprecated** - used for Desktop-in-browser tests.
Kept for reference but not used in v2 tests.

---

## Writing New Tests

```typescript
import { test, expect } from "@playwright/test";
import { createDjSession } from "../fixtures/ws-dj-simulator";

test("My new test", async ({ page }) => {
  // 1. Create DJ session
  const dj = await createDjSession({
    djName: "My DJ",
    track: { title: "My Track", artist: "Artist" }
  });

  // 2. Navigate to web app
  await page.goto("http://localhost:3002");

  // 3. Interact with UI
  await page.getByText("My DJ").click();

  // 4. Assert
  await expect(page.getByText("My Track")).toBeVisible();

  // 5. Cleanup
  dj.disconnect();
});
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| **Port conflict** | Kill processes: `lsof -ti:3001,3002 \| xargs kill` |
| **Session not visible** | Check Cloud logs: `docker compose logs cloud` |
| **Timeouts** | Increase test timeout in config |
| **WS connection fails** | Ensure Cloud is running on port 3001 |

---

## Future: Desktop E2E (Phase 3)

To test the actual Desktop app, we need:
1. **macOS CI runner** (GitHub Actions `macos-latest`)
2. **Real Tauri build** (`bun run build`)
3. **Electron-like approach** (Playwright can control native windows)

This is documented in `prioritized-roadmap.md` under Phase 3: Desktop E2E.

---

*See also: [Load Testing Guide](./load-testing.md)*
