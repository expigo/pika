# Pika! Developer Handover & Technical Guide

**Date:** January 25, 2026
**Version:** 0.3.4 (11/10 Experience Release)

This document is designed to get a new developer up to speed with the **Pika!** codebase. It covers the architectural decisions, current implementation status, and key flows required to understand how the system operates.

---

## 1. Project Overview & Architecture

**Pika!** is a hybrid Local/Cloud system for West Coast Swing DJs. It monitors local DJ software (VirtualDJ) and broadcasts the "Now Playing" track to a real-time cloud server for dancers to see.

### The "Split Brain" Architecture
The system is divided into three distinct environments (monorepo via **Bun Workspaces**):

1.  **Desktop (The Broadcaster)** - `@pika/desktop`
    *   **Tech:** Tauri 2.0 (Rust), React 19, TypeScript, Vite.
    *   **Role:** Runs locally on the DJ's laptop. Watches filesystem for track changes, performs audio analysis (Python), and pushes data to the cloud.
    *   **Key Service:** `VirtualDjWatcher` (polls `history.m3u` / `database.xml`).
    *   **Reliability:** Implements **Adaptive Polling** (1s visible / 3s background) and **Hybrid Deduplication** to ensure 100% uptime and data accuracy.

2.  **Cloud (The Relay & Brain)** - `@pika/cloud`
    *   **Tech:** Hono Server running on Bun, Drizzle ORM, Postgres.
    *   **Role:** A unified backend handling WebSockets, REST API, and Database persistence.
    *   **Capabilities:** Real-time broadcasting, Session management, Auth (DJs), Voting/Polling system.

3.  **Web (The Face)** - `@pika/web`
    *   **Tech:** Next.js 15, React 19, TailwindCSS 4, Recharts.
    *   **Role:** The public-facing interface for Dancers and the Landing Page.
    *   **Features:** Live "Now Playing" view, History, Voting/Polls, and DJ Registration.
    *   **Optimization:** Battery-aware animations (RAF loops stop when idle).

---

## 2. Key Technical Decisions

### Why Tauri?
We chose Tauri over Electron for lighter resource usage (critical for DJs running audio software simultaneously). Calls to native OS functions (like filesystem reading) connect via Tauri's IPC bridge.

### Why Hono + Bun?
*   **Performance:** Bun provides extremely fast startup and WebSocket performance.
*   **Unified Server:** Hono allows us to run HTTP (REST) and WebSockets on the same port in a single instance.
*   **Native WebSockets:** We use `Bun.serve({ websocket: ... })` which is more performant than the Node.js `ws` library.
*   **Caching:** Implemented `withCache` for read-heavy operations like global stats.

### Why Next.js for Web?
*   **SEO:** Critical for the landing page and viral sharing of "Live" links.
*   **Server Actions:** Simplifies data fetching for the "History" and "Auth" flows.

---

## 3. Current Implementation Status

### ✅ Implemented & Working
*   **Desktop <-> Cloud Connection:** `useLiveSession` hook manages WebSocket connections, reconnects on failure (`reconnecting-websocket`), and handles the "Go Live" lifecycle.
*   **Full Authentication:**
    *   DJs can Register/Login (`/api/auth`).
    *   Secure password hashing (Bcrypt) and API Tokens (SHA-256).
*   **Web Interface (Dancers):**
    *   Responsive "Live" view for dancers (`/live/[sessionId]`).
    *   Real-time "Now Playing" updates.
    *   Tempo Voting (Faster/Slower).
    *   Polls/Questions pushed by DJ.
    *   DJ Announcements with auto-dismiss timer.
*   **Deep Intelligence:**
    *   **Transition Friction:** Euclidean distance on audio fingerprints (BPM, Energy, Groove, etc.).
    *   **Harmonic Flow:** Camelot-based compatibility scoring.
*   **Persistence:**
    *   Postgres DB stores Sessions, Played Tracks, Likes, and Tempo Votes.
*   **UI/UX Refinements (v0.2.1):**
    *   **Modular Layout:** `useLayoutResizer.ts` hook for smooth multi-axis workspace resizing.
    *   **Fortified Sidecar:** Aggressive kill protocol in `useSidecar.ts` ensuring zero zombie Python processes or port collisions.
    *   **Restored Playlists:** Professionalized `SaveLoadSets.tsx` integrated into "The Crate" header with full Tailwind/sonner feedback.
    *   **Dynamic Theming:** Instant synchronization of `display.profile` (High Contrast, Midnight, Stealth) via `data-theme` on `documentElement`.
*   **Security Hardening (v0.2.8):**
    *   **Rate Limits (S1):** Middleware rejection (429) for WS floods.
    *   **Anti-Spoofing (S2):** ClientID locking on first message.
    *   **Schema Guards (S3, S4):** String length caps (500 chars) and strict regex sanitization for user input.
    *   **CSP Headers:** Content-Security-Policy via Next.js middleware.
    *   **Desktop CSP:** Tauri app CSP enabled for defense-in-depth.
    *   **CSRF Protection:** X-Pika-Client header validation.
    *   **Email Validation:** Zod `.email()` validator.
    *   **Password Max Length:** 128 character limit.
    *   **DB Integrity:** CASCADE deletes, CHECK constraints.
*   **Cloud Testing (v0.2.2):**
    *   **Auth Routes:** Extracted to `routes/auth.ts` (~300 lines).
    *   **Unit Tests:** 15 tests for auth validation using Bun test runner.
*   **Web App Excellence (v0.2.3):**
    *   **Hook Decomposition:** `useLiveListener` split into 6 focused hooks (77% reduction).
    *   **Shared Utils:** `lib/api.ts`, `lib/client.ts` consolidate 4 duplicated functions.
    *   **Dynamic Imports:** QR code lazy loaded (~30KB saved on initial load).
    *   **Accessibility:** ARIA labels, skip-to-content link, reduced-motion CSS.
    *   **Error Handling:** Error boundary with retry for live session pages.
    *   **Loading States:** Route-level loading skeletons for `/live`, `/analytics`.
    *   **PWA System:** Full Offline support, Service Worker pipeline, and VAPID Push Notifications.
*   **Cloud Robustness (v0.2.4):**
    *   **Modular Handlers:** 16 WebSocket handlers extracted to `handlers/` (dj, dancer, poll, subscriber, utility, lifecycle).
    *   **REST Route Extraction:** 4 route modules in `routes/` (sessions, stats, dj, client).
    *   **Type-Safe Validation:** `parseMessage<T>()` helper with Zod schemas replaces all `as any` casts.
    *   **Error Isolation:** `safeHandler()` wrapper prevents single message from crashing WS connection.
    *   **Graceful Shutdown:** SIGTERM/SIGINT handlers broadcast to clients and end sessions in DB.
    *   **Poll Timer Cleanup:** Tracked timers cancelled on manual end/cancel.
    *   **Event-Based Coordination:** `waitForSession()` replaces busy-wait loops.
    *   **Test Coverage:** 179 tests (up from 58).
*   **Observability (v0.3.1):**
    *   **Sentry Integration:** Comprehensive error and performance tracking across `@pika/cloud`, `@pika/web`, and `@pika/desktop`.
    *   **Shared Logger Hook:** The `@pika/shared` logger automatically reports errors/warnings to Sentry in production.
    *   **PII Privacy:** All telemetry is scrubbed of headers, cookies, and IP addresses before transmission.
    *   **Root Layout Recovery:** Next.js `global-error.tsx` catches and reports crashes in the root application shell.
    *   **Selective Sampling:** 10% traces sample rate to balance cloud costs with visibility.
*   **Performance Hardening (v0.3.2):**
    *   **Zero-Wakeup Battery:** Visibility-aware polling pauses network activity on hidden tabs.
    *   **Yielding I/O:** Deferred `localStorage` access via yielding to the event loop.
    *   **Intelligent Caching:** `SWR` integration for O(1) track history retrieval.
    *   **Memoized Routing:** Stable WebSocket handler trees to prevent unnecessary React churn.
*   **Reliability & Data Integrity (v0.3.3):**
    *   **Mandatory API Limits:** `getTracks(limit)` replaces `getAllTracks()` to prevent OOM on large libraries.
    *   **Robust Buffering:** Reliability module expanded to 1,000 pending messages with Drop-Oldest logic.
    *   **Adaptive Polling:** VDJ watcher drops to 3s when hidden (Adaptive Background Polling) to ensure zero data loss while saving power.
    *   **Concurrency IDs:** Offline queue sync uses Operation IDs to prevent race conditions during watchdog resets.
    *   **Hybrid Deduplication:** 2-Stage check (Window + Absolute Interval) guarantees zero duplicate track recordings even if the DJ minimizes the app for hours.
    *   **Singleton Watcher:** Module-level singleton pattern for `VirtualDJWatcher` eliminates "ghost" listeners and phantom notifications.
*   **11/10 Experience (v0.3.4):**
    *   **Seamless History Import:** Automatic detection of previous VDJ sessions on app start.
    *   **Duplicate Protection:** Blocking modal prevents accidental re-import of the same set date/time.
    *   **Portal Architecture:** All modals (`Dialog`, `SessionImport`, `DuplicateWarning`) now render via `createPortal` to `document.body`, eliminating z-index/transform clipping issues.
    *   **Context-Aware UI:** "Currently Playing" indicators in import lists and smart gap detection (>10m) in track previews.
    *   **One-Step Go Live:** Merged Session Name input into the Import/Skip flow for a frictionless start.

---

## 4. Architectural Enhancements (v0.2.1)

### A. The Layout Hook (`useLayoutResizer`)
To keep `App.tsx` manageable, we extracted the quadrant resizing logic into a dedicated hook.
- **Features:** Supports independent horizontal and vertical dragging with active split tracking.
- **Implementation:** Uses global mouse listeners mapped to stateful offsets (`hOffset`, `vLeftOffset`, `vRightOffset`).

### B. Stable Python Sidecar Lifecycle
The `useSidecar` hook now implements an **idempotent kill protocol**:
1.  **Before Spawn:** Always attempts to kill any existing process handle in `globalThis`.
2.  **Environment Stability:** Prevents port binding errors during development HMR.
3.  **Clean Exit:** Ensures the backend engine shuts down gracefully with the desktop app.

### C. Playlist Persistence (Archive System)
The "Save/Load" functionality was moved from a standalone modal into an integrated header component in `SetCanvas`.
- **Sync Mode:** Existing sets can be "Synced" (updated) with a single click.
- **Archive Display:** New high-fidelity retrieval list with track counts and relative timestamps.
- **Feedback:** All DB operations are wired to `sonner` toast notifications for user confirmation.

### D. Zero-Wakeup Battery Architecture (v0.2.8)
To protect user battery life (both DJ laptops and dancer phones), we implemented aggressive resource suspension:
1.  **WebSocket:** Heartbeats (PINGs) are **suspended** when the tab/window is hidden. This allows the mobile radio to sleep.
2.  **Polling (Cloud):** All API polling (active sessions, current track) is **paused** when the document is hidden.
3.  **VDJ Watcher (Desktop):** Polling frequency **drops to 3 seconds** when backgrounded. It does NOT stop, ensuring every song transition is recorded even if the app is hidden.
4.  **Animations:** The particle rendering loop (`requestAnimationFrame`) is **hard-stopped** (not just throttled) when backgrounded.
5.  **Listener Hygiene:** `VirtualDjWatcher` uses a `visibilityListenerAdded` flag to prevent memory leaks from recursive listener registration during focus shifts.
6.  **Instant Resume:** Event listeners on `visibilitychange` trigger an immediate data refresh and connection check upon return.

### E. System Hardening (v0.3.0)
To ensure production-grade stability under high load, we implemented:
1.  **Persistence Queues (Cloud):** Serialized queue per session to prevent race conditions between Track and Like persistence.
2.  **Backpressure Protection (Cloud):** Fast-fail mechanism for slow clients (64KB buffer limit) to prevent server OOM.
3.  **Atomic Transactions (Desktop):** SQLite `BEGIN TRANSACTION` used for all Set operations (`saveSet`, `deleteSet`).
4.  **O(1) Memory Cleanup:** Refactored Cloud state maps for instant cleanup on session end.

### F. Portal-First UI (v0.3.4)
To solve the "Clipping Modal" problem inherent in complex flex/grid layouts with `transform` properties:
1.  **Global Layering:** All critical overlays (Import, Warning, Name Input) are rendered via `createPortal` to `document.body`.
2.  **Z-Index Hygiene:** Portals ensure these elements strictly sit at `z-[1000]`, independent of the parent component's stacking context.

---

## 5. Design Language & Workspace Taxonomy

To maintain a consistent "Pro DJ" feel, we use a specific taxonomy for the application workspaces:

| UI Workspace | View Mode | Purpose |
| :--- | :--- | :--- |
| **The Crate** | `crate` | **Preparation Hub.** Digging, filtering, and curating your "Performance Mix". |
| **The Stage** | `stage` | **Execution Hub.** Real-time controls, reaction monitoring, and Hero Mode. |
| **The Lab** | `archive` | **Refinement Hub.** Analyzing "Set Lineage" (Comparing your Plan vs. Actual Performance). |
| **Intelligence** | `insights` | **Data Hub.** Historical global stats and cross-session listener trends. |

### The "Set Lineage" Strategy
A core differentiator of Pika! is the ability to link **Planned Sets** to **Actual Play Data**:
*   **Planned (The Crate):** The DJ chooses tracks and sees an "X-Ray" (Energy Wave) of the expected vibe.
*   **Actual (The Stage):** As the DJ plays, Pika! captures the real-time history and listener feedback.
*   **Lineage (The Lab):** After the session, the DJ can overlay the "Plan" vs "Actual" energy waves to see where the vibe shifted and why.

---

## 6. Directory Structure / Where to Look

```
pika/
├── packages/
│   ├── desktop/
│   │   ├── src/hooks/useLayoutResizer.ts <-- Layout Orchestration
│   │   ├── src/hooks/useSidecar.ts       <-- Python Engine Lifecycle
│   │   ├── src/lib/                      <-- Reliability, reactions, batching
│   │   ├── src/components/SetCanvas.tsx  <-- "The Crate" Core Workspace
│   │   ├── src/db/repositories/          <-- Local Cache & Playlist Logic
│   │   └── src-tauri/                    <-- Rust backend config
│   │
│   ├── cloud/
│   │   ├── src/index.ts                  <-- Unified Backend Entry (~360 lines)
│   │   ├── src/handlers/                 <-- 16 WebSocket handlers (NEW)
│   │   │   ├── dj.ts                     <-- REGISTER, TRACK, ANNOUNCE
│   │   │   ├── dancer.ts                 <-- LIKE, REACTION, TEMPO
│   │   │   ├── poll.ts                   <-- START/END/VOTE_ON_POLL
│   │   │   ├── subscriber.ts             <-- SUBSCRIBE handler
│   │   │   ├── utility.ts                <-- PING, GET_SESSIONS
│   │   │   ├── lifecycle.ts              <-- onOpen, onClose
│   │   │   └── index.ts                  <-- safeHandler wrapper + exports
│   │   ├── src/routes/                   <-- REST route modules (NEW)
│   │   │   ├── auth.ts                   <-- DJ auth (~300 lines)
│   │   │   ├── sessions.ts               <-- Session list, history, recap
│   │   │   ├── stats.ts                  <-- Global statistics
│   │   │   ├── dj.ts                     <-- DJ profile routes
│   │   │   └── client.ts                 <-- Client likes routes
│   │   ├── src/lib/                      <-- State & utility modules (NEW)
│   │   │   ├── sessions.ts               <-- Active session state
│   │   │   ├── listeners.ts              <-- Listener count tracking
│   │   │   ├── polls.ts                  <-- Poll state + timer cleanup
│   │   │   ├── protocol.ts               <-- ACK/NACK + parseMessage
│   │   │   ├── persistence/              <-- DB operations
│   │   │   │   ├── sessions.ts           <-- Session ops
│   │   │   │   ├── tracks.ts             <-- Track ops
│   │   │   │   └── queue.ts              <-- Persistence Queue (NEW)
│   │   └── src/db/                       <-- Drizzle Schemas (Postgres)
│   │
│   ├── web/
│   │   ├── src/app/live/                 <-- Dancer View (Next.js)
│   │   └── src/app/dj/                   <-- DJ Analytics & History
```

---

## 7. Development Tips

*   **Running the Stack:** Use the monorepo scripts.
    *   Run All: `bun run dev` (from root) - Starts Cloud, Web, and Desktop.
*   **Mobile Testing:**
    *   To test on phone, ensure your phone and computer are on the same Wi-Fi and use your local IP.
*   **Database:**
    *   **Desktop:** SQLite (`pika.db`) managed via Drizzle in `src/db/index.ts`.
    *   **Cloud:** Postgres managed via Drizzle in `packages/cloud/src/db`.

---

## 8. Critical Knowledge Base (Lessons Learned)

### A. Desktop SQLite Migrations
The desktop app uses a local `pika.db` SQLite file. Schema changes MUST have a corresponding `ALTER TABLE` statement in `packages/desktop/src/db/index.ts` because SQLite doesn't support full Drizzle migration automations on the fly in the Tauri bundle.

### B. Versioning & Releases
We use a unified versioning script: `bun run bump <version>`.
- **Targets:** All `package.json` files, Tauri config, and PIKA_VERSION in `@pika/shared`.

### C. The "HMR Zombie" Problem
Early in development, Tauri's HMR would spawn multiple Python sidecars, leading to port collisions.
**Solution:** The current `useSidecar` kill-before-spawn logic is non-negotiable for system stability.

### D. Duplicate Prevention
Users often restart the app during a gig. Auto-importing history without validation causes "double data" in the stats.
**Solution:** The `DuplicateSessionWarning` uses a time-overlap heuristic (Overlap > 10m) to block accidental re-imports, forcing the user to consciously choose "Start New" or "Import Anyway" (with warnings).

---

*Last Updated: January 26, 2026 (v0.3.4 - 11/10 Experience Release)*
