# E2E Testing Guide

Pika! uses [Playwright](https://playwright.dev/) for End-to-End testing.

## architecture
The suite runs a **Hybrid Cluster**:
1.  **Cloud Server**: Real Hono/Bun server (`localhost:3001`).
2.  **Web Frontend**: Real Next.js app (`localhost:3002`).
3.  **Desktop Frontend**: Real React App (`localhost:1420`), but with **Mocked Tauri Backend**.

## Running Tests

### Prerequisites
*   Bun installed (`oven-sh/setup-bun`)
*   Playwright browsers installed (`bun x playwright install --with-deps chromium`)

### Command
```bash
# Run all tests (headless)
bun x playwright test

# Run with UI (debug mode)
bun x playwright test --ui
```

## Mocking
We do NOT spawn the Rust Tauri process. Instead, we inject `window.__TAURI__` mocks in `tests/e2e/fixtures/mock-tauri.ts`.
This allows us to simulate:
*   File System reads (VirtualDJ history)
*   Database calls (SQLite)
*   Network info

## Writing New Tests
Create files in `tests/e2e/specs/`.
Use the `mockTauriInitScript` fixture to ensure the Desktop app doesn't crash looking for Rust bindings.

## Mocking Implementation
We use a comprehensive mock layer in `tests/e2e/fixtures/mock-tauri.ts` to simulate the Rust backend:
- **SQL Plugin**: Mocks `plugin:sql|execute` and `plugin:sql|select` to simulate a local SQLite database for Sessions and Tracks.
- **FS/VirtualDJ**: Mocks `read_virtualdj_history` to inject controlled track data (e.g., "Michael Jackson - Billie Jean") for the watcher to detect.
- **Network**: Mocks `get_local_ip`.
- **Shell**: Polyfills `plugin:shell|spawn` to prevent crashes.

## Troubleshooting
- **CORS Errors**: The Cloud server (`packages/cloud/src/index.ts`) must allow `127.0.0.1` origins in `NODE_ENV=test`.
- **Race Conditions**: Track propagation from Desktop -> Cloud -> Web takes time. The test creates a 4-5s delay *before* the Audience client connects to ensure the data is ready in the Cloud.
- **Port Conflicts**: Ensure ports 3001 (Cloud) and 3002 (Web) are free. The test runner handles startup, but zombie processes can cause issues.
