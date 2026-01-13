# Pika! Developer Handover & Technical Guide

**Date:** January 12, 2026
**Version:** 0.1.0 (MVP Phase)

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
    *   **Tech:** Next.js 16, React 19, TailwindCSS 4.
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
*   **Persistence:**
    *   Postgres DB stores Sessions, Played Tracks, Likes, and Tempo Votes.
*   **Feedback Loop:** "Like" mechanism and Tempo Feedback are fully functional and persist to DB.

### 🚧 WIP / Missing
*   **DJ Dashboard (Web):** While DJs can register, a full web-based dashboard for them to manage past sets or edit profile details is incomplete.
*   **Offline Mode Polish:** Desktop app handles offline analysis well, but the UI for "Queued Updates" when reconnecting to internet needs refinement.
*   **Advanced Analytics:** We collect the data (Energy, BPM, Votes), but we don't yet have a visualization suite for DJs to review their performance post-gig.

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
│   │   └── src/app/page.tsx              <-- Landing Page
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

### Needs Immediate Attention 🚨
| Issue | Severity | Fix |
| :--- | :---: | :--- |
| Permissive CORS | HIGH | Restrict to `pika.stream` origins only |
| No Auth Rate Limiting | HIGH | Add `hono-rate-limiter` (5 req/15min) |
| Hardcoded DB Password | MEDIUM | Move to environment variables |

**Full Details:** See [docs/architecture/security.md](docs/architecture/security.md)

---

## 8. Codebase Health (Jan 2026 Assessment)

**Overall Score: 8.4/10** - Strong foundations, some decomposition needed.

### Strengths
*   **Architecture:** Clean Split-Brain design (Desktop ↔ Cloud ↔ Web)
*   **Type Safety:** Strict TypeScript, Zod schemas, Drizzle ORM
*   **Documentation:** Exceptional (10/10) - comprehensive roadmaps and specs
*   **CI/CD:** Automated deployment, cross-platform builds, staging environment

### Areas for Improvement
| Observation | Impact | Recommendation |
| :--- | :---: | :--- |
| `cloud/src/index.ts` is 2100+ lines | Maintainability | Split into `routes/` and `services/` |
| `useLiveSession.ts` is 877 lines | Maintainability | Decompose into smaller hooks |
| Only `utils.test.ts` exists | Quality | Add E2E tests for critical paths |

### File Size Reference
| File | Lines | Status |
| :--- | :---: | :--- |
| `packages/cloud/src/index.ts` | 2,106 | 🟡 Needs split |
| `packages/desktop/src/hooks/useLiveSession.ts` | 877 | 🟡 Needs split |
| `packages/web/src/hooks/useLiveListener.ts` | 963 | 🟡 Needs split |
| `packages/shared/src/schemas.ts` | 384 | ✅ OK |

---

*Last Updated: January 13, 2026*
