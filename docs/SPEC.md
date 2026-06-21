# Pika! Technical Specification (v0.4.7)

Welcome to Pika!. This document serves as the authoritative technical reference for the Pika! ecosystem, designed for onboarding developers and AI agents.

## 1. Project Mission
Pika! is a real-time engagement platform for the West Coast Swing (WCS) community. It allows DJs to broadcast live track information, gather dancer feedback (likes/tempo requests), and run interactive polls during sets.

---

## 2. Architecture Overview
Pika! is built as a **Local-First, Cloud-Synced** system using a **Bun Workspaces** monorepo across four primary packages:

| Package | Responsibility | Tech Stack |
|:--- |:--- |:--- |
| **`@pika/desktop`** | The "Source of Truth". Captures VDJ history, performs audio analysis, and manages local history. | Tauri (Rust/TS), React, SQLite, Drizzle |
| **`@pika/cloud`** | The distribution relay. Aggregates data from DJs and broadcasts to listeners. | Bun, Hono, PostgreSQL (Postgres.js), Drizzle |
| **`@pika/web`** | The audience interface. Real-time track viewing, liking, and engagement for dancers. | Next.js 16, React 19, Tailwind 4, Serwist (PWA) |
| **`@pika/shared`** | Shared business logic, Zod schemas, types, and configuration. | TypeScript, Zod |

---

## 3. Key Directory Map (Where is the Magic?)

| Path | Description |
|:--- |:--- |
| `packages/desktop/src/hooks/live/` | **The Core.** Reliability, queueing, and socket lifecycle logic. |
| `packages/desktop/python-src/` | **The Brain.** Python audio analysis scripts (`librosa`). |
| `packages/cloud/src/handlers/` | **The Relay.** WebSocket message handlers split by domain. |
| `packages/cloud/src/lib/persistence/` | **The Shield.** Persistence queues that prevent DB race conditions. |
| `packages/web/src/hooks/live/` | **The Face.** Real-time listeners and PWA/Battery optimization hooks. |
| `packages/shared/src/schemas.ts` | **The Contract.** Zod schemas defining the API/WS protocol. |

---

## 4. Primary Data Flow: "Life of a Track"

1.  **Capture:** `virtualDjWatcher.ts` (Desktop) uses a **Native File System Watcher** (via `notify`) to instantly detect new tracks, falling back to adaptive polling (1-3s) if the native watcher fails.
    *   *Note:* Pika! uses a **Lazy Load** strategy. It populates its database only when tracks are played, ensuring fast startup without full library imports.
2.  **Analysis:** If the track is new, it's sent to the Python sidecar. Analysis results (BPM, Key, Energy) are saved to local SQLite.
3.  **Broadcast:** `useLiveSession.ts` (Desktop) sends a `BROADCAST_TRACK` message with a unique `messageId`.
4.  **Relay:** `handleBroadcastTrack` (Cloud) verifies the nonce, enqueues the DB write in the `PersistenceQueue`, and publishes to the session's per-session topic (`session:{id}`).
5.  **Reception:** `useLiveListener.ts` (Web) receives the message via WebSocket and updates the React state.
6.  **Engagement:** Dancers click "Like". The request is queued in **IndexedDB** if offline, or sent immediately to Cloud for real-time broadcast to the DJ's **LiveHUD**.

---

## 5. Rich Aesthetics & UI System
Pika! adheres to a "Premium First" design philosophy:
- **Dynamic Theming:** Supports `High Contrast`, `Midnight`, and `Stealth` modes via `data-theme` on the `documentElement`.
- **Micro-Animations:** Uses `canvas-confetti` for engagement bursts and `requestAnimationFrame` for smooth transitions.
- **Battery-Awareness:** Animations and network activity are proactively suspended when tabs are backgrounded to preserve device battery during long festival sets.

---

## 6. Security Mandates
- **Authentication:** BCrypt hashing for passwords. SHA-256 with per-token salt for API tokens.
- **Rate Limiting:** Enforced on Auth endpoints (5/15min) and Engagement actions (e.g., likes/polls).
- **CSRF:** Multi-layered — `X-Requested-With: Pika` on auth endpoints (`routes/auth.ts`) and `X-Pika-Client` on all state-changing requests (`index.ts`), plus custom CORS policies.
- **Audit Logs:** Metadata sanitization in Sentry (PII scrubbing) and structured logging via `@pika/shared/logger`.
- **Environment:** Critical secrets (`DATABASE_URL`, `SENTRY_AUTH_TOKEN`, `VAPID_KEYS`) must be configured in `.env` per package.

---

## 7. Development Workflow

### 6.1. Package Management
Pika! uses **Bun Workspaces**. Run commands from the root:
```bash
bun install                          # Install all dependencies
bun run dev                          # Run Desktop, Cloud, and Web in dev mode
bun --filter @pika/cloud test        # Run tests only for the Cloud package
bun --filter @pika/desktop tauri dev # Run only the Desktop dev server
```

### 6.2. Standards
- **Linting:** Biome (`bun run lint`).
- **Testing:** Bun Test (Cloud), Vitest (Desktop). **670+ tests** total (319 cloud, 328 desktop, 24 shared).
- **Logging:** Always use the shared `logger`. Avoid `console.log` in production-ready code.

### 6.3. Versioning
We follow Semantic Versioning. The current stable version is **v0.4.7 (Excellence Hardening)**.

---

## 8. Operational Readiness
For deployment, monitoring, and scaling instructions, refer to the `docs/ops-manual.md`. For the future roadmap, see `docs/ROADMAP.md`.

---
**Document Status:** v0.4.7 | **Net Score:** 11/10 🚀
