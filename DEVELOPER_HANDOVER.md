# Pika! Developer Handover & Technical Guide

**Date:** January 17, 2026
**Version:** 0.3.0 (Deep Intelligence Phase)

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

2.  **Cloud (The Relay & Brain)** - `@pika/cloud`
    *   **Tech:** Hono Server running on Bun, Drizzle ORM, Postgres.
    *   **Role:** A unified backend handling WebSockets, REST API, and Database persistence.
    *   **Capabilities:** Real-time broadcasting, Session management, Auth (DJs), Voting/Polling system.

3.  **Web (The Face)** - `@pika/web`
    *   **Tech:** Next.js 15, React 19, TailwindCSS 4, Recharts.
    *   **Role:** The public-facing interface for Dancers and the Landing Page.
    *   **Features:** Live "Now Playing" view, History, Voting/Polls, and DJ Registration.

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
*   **Deep Intelligence (Jan 17, 2026):**
    *   **Transition Friction:** Euclidean distance on audio fingerprints (BPM, Energy, Groove, etc.).
    *   **Harmonic Flow:** Camelot-based compatibility scoring.
    *   **"The Drift":** Detects DJ/Crowd tempo divergence.
*   **Persistence:**
    *   Postgres DB stores Sessions, Played Tracks, Likes, and Tempo Votes.
*   **Feedback Loop:** "Like" mechanism and Tempo Feedback are fully functional and persist to DB.
*   **Security Hardening (v0.1.9):**
    *   **CSP Headers:** Content-Security-Policy via Next.js middleware.
    *   **CSRF Protection:** X-Pika-Client header validation on auth endpoints.
    *   **Rate Limiting:** Auth endpoints limited to 5 req/15 min.
    *   **WS Rate Limiting:** 20 connections/min per IP.
    *   **Session Telemetry:** DJ connect/disconnect events logged for operational insights.

### 🚧 WIP / Missing
*   **DJ Dashboard (Web):** While DJs can register, a full web-based dashboard for them to manage past sets or edit profile details is incomplete.
*   **Offline Mode Polish:** Desktop app handles offline analysis well, but the UI for "Queued Updates" when reconnecting to internet needs refinement.
*   **Session State Persistence:** Sessions are currently held in a Map in `cloud/index.ts`. Migration to Redis is required for zero-downtime deploys.

---

## 4. Key Data Flows

### A. The "Go Live" Sequence
1.  **User Action:** DJ logs in and clicks "Go Live" in Desktop UI.
2.  **Auth:** Desktop authenticates via JWT/Token with Cloud.
3.  **Connection:** Connects to `ws://api.pika.stream/ws`.
4.  **Registration:** Sends `{ type: "REGISTER_SESSION", token: "..." }`.
5.  **Confirmation:** Server validates token, creates Session in DB, and responds `SESSION_REGISTERED`.

### B. The "Now Playing" Loop
1.  **VirtualDJ:** Writes new line to history file.
2.  **Watcher:** `virtualDjWatcher.ts` reads file diff.
3.  **Event:** Fires `onTrackChange` callback.
4.  **Upload:** `useLiveSession` sends `{ type: "BROADCAST_TRACK", track: { ... } }`.
5.  **Persistence:** Cloud saves track and audio metrics to Postgres.
6.  **Broadcast:** Cloud server publishes to all subscribed Web Clients.

---

## 5. Directory Structure / Where to Look

```
pika/
├── packages/
│   ├── desktop/
│   │   ├── src/hooks/useLiveSession.ts   <-- Broadcasting Logic
│   │   ├── src/services/virtualDjInfo.ts <-- File watching logic
│   │   ├── src-tauri/                    <-- Rust backend config
│   │   └── python-src/                   <-- Audio Analysis (Sidecar)
│   │
│   ├── cloud/
│   │   ├── src/index.ts                  <-- Unified Backend (WS + API)
│   │   └── src/db/                       <-- Drizzle Schemas
│   │
│   ├── web/
│   │   ├── src/app/live/                 <-- Dancer View
│   │   └── src/app/dj/[slug]/recap/[id]/analytics/page.tsx <-- Deep Intelligence page
```

---

## 6. Development Tips

*   **Running the Stack:** Use the monorepo scripts.
    *   Run All: `bun run dev` (from root) - Starts Cloud, Web, and Desktop.
    *   Just Cloud: `bun run --filter @pika/cloud dev`
*   **Mobile Testing:**
    *   Cloud defaults to `:3001`, Web to `:3002`.
    *   To test on phone, ensure your phone and computer are on the same Wi-Fi and use your local IP (e.g., `192.168.1.x:3002`).
*   **Database:**
    *   Cloud depends on a Postgres connection. Ensure `DATABASE_URL` is set in `packages/cloud/.env`.

---

## 7. Security Status (Jan 2026 Audit)

**Overall Score: 7.5/10** - Production-viable with listed mitigations.

### What's Working ✅
*   bcrypt password hashing (cost 10)
*   SHA-256 hashed API tokens (never stored raw)
*   Zod validation on all WebSocket messages
*   SQL injection protection (Drizzle ORM)
*   No XSS vulnerabilities (React JSX escaping)
*   Well-scoped Tauri desktop permissions

---

## 8. Codebase Health (Jan 2026 Assessment)

**Overall Score: 8.4/10** - Strong foundations, some decomposition needed.

### Strengths
*   **Architecture:** Clean Split-Brain design (Desktop ↔ Cloud ↔ Web)
*   **Type Safety:** Strict TypeScript, Zod schemas, Drizzle ORM
*   **Documentation:** Exceptional (10/10) - comprehensive roadmaps and specs
*   **Analytics:** Integrated **Deep Intelligence** for set review.

### Areas for Improvement
| Observation | Impact | Recommendation |
| :--- | :---: | :--- |
| `cloud/src/index.ts` is 2100+ lines | Maintainability | Split into `routes/` and `services/` |
| `useLiveSession.ts` is 877 lines | Maintainability | Decompose into smaller hooks |
| Desktop E2E | Coverage | Add macOS CI runner for Tauri tests (Phase 3) |

### Large File Reference
| File | Lines | Status |
| :--- | :---: | :--- |
| `packages/cloud/src/index.ts` | 2,120 | 🟡 Needs split |
| `packages/desktop/src/hooks/useLiveSession.ts` | 877 | 🟡 Needs split |
| `packages/desktop/src/components/LivePerformanceMode.tsx` | 1,867 | 🟡 Needs split |
| `packages/web/src/app/dj/[slug]/recap/[id]/analytics/page.tsx` | 915 | ✅ Advanced Logic |

---

## 9. Critical Knowledge Base (Lessons Learned)

### A. Desktop SQLite Migrations
The desktop app uses a local \`pika.db\` SQLite file. Unlike the cloud Postgres (which uses \`drizzle-kit\`), the desktop app **cannot** rely on Drizzle for auto-migrations.
**Rule:** Any schema change to \`sqliteTable\` in \`schema.ts\` MUST have a corresponding \`ALTER TABLE\` statement in \`packages/desktop/src/db/index.ts\` inside \`initializeDb\`.

### B. Versioning & Releases
We use a unified versioning script: \`bun run bump <version>\`.
**Targets:**
*   All \`package.json\` files.
*   \`cargo.toml\` and \`tauri.conf.json\`.
*   **CRITICAL:** \`packages/shared/src/index.ts\` (export const PIKA_VERSION).

### C. File Restoration & Code Safety
**Incident (Jan 2026):** Several critical files were accidentally emptied (truncated to 0 bytes) during a refactor. 
- **Lesson:** Always verify file sizes before committing or pushing. 
- **Recovery:** Git restore is your friend. 
- **Prevention:** Use Biome/Lint tools to catch errors before they propagate.

---

*Last Updated: January 17, 2026 (v0.3.0)*
