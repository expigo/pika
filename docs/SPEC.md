# Pika! Technical Specification (v0.5.0)

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

**Multi-DJ venue model (Stage / Event):** sessions can run under a persistent **Stage** (a venue
floor that outlives a DJ set) grouped into an **Event**. Dancers subscribe to a stage and follow
DJ rotation seamlessly; push is scoped per stage/event. Cloud tables: `events`, `stages`,
`stage_subscriptions`, plus a nullable `sessions.stage_id` (additive — a stage-less session is
unchanged). See [architecture/stage-event-model.md](architecture/stage-event-model.md).

**Music data model (Spotify catalog + Pika analytics):** a cross-DJ catalog built from CSV-imported
Spotify features (`spotify_track_features`) + curated playlists (`curated_tracks`/`curated_playlists`),
linked by an identity spine (`track_links`, keyed on `getTrackKey`). Plays (`played_tracks.match_key`)
join in to yield a per-track **Pika consensus**. Two feature sources (Spotify canonical vs Pika sidecar)
are shown side-by-side, **never merged**. **Slice D (Musical Identity)** builds on it: DJ-facing CSV
playlist import with binary provenance (`curated_playlists.source`; imports never touch
`played_tracks`), a computed Booth **Signature** (range-framed, load-bearing denominator, one
`published`/`showOnBooth` dial per surface), dancer↔DJ **compatibility**, and DJ-private
**crowd-pleasers**. See [architecture/music-data-model.md](architecture/music-data-model.md).

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
- **Micro-Animations:** A hand-rolled 2D-canvas particle layer (`SocialSignalsLayer`) for engagement bursts and `requestAnimationFrame` for smooth transitions (no animation deps).
- **Battery-Awareness:** Animations and network activity are proactively suspended when tabs are backgrounded to preserve device battery during long festival sets.

---

## 6. Security Mandates
- **Authentication:** **Better Auth** is the cloud auth authority — credential (email+password, DJs) +
  **magic-link / email-OTP** (optional dancer accounts, Slice B) + sessions + **bearer** (desktop) /
  **cookie** (web), Drizzle/Postgres, with an `admin` plugin (roles `dj`/`admin`/`dancer`), a
  `pending→approved` approval gate for DJs, and `hasDjAccess` role-gating on every DJ surface.
  (Replaced the former bcrypt/SHA-256-token custom auth.) See
  [architecture/auth-system.md](architecture/auth-system.md) + [blueprints/auth-foundation.md](blueprints/auth-foundation.md).
- **Rate Limiting:** Better Auth built-in (prod, tight customRules on the email-sending paths) +
  `hono-rate-limiter` on admin/playlist/client/me/email/img routers; transactional email additionally
  throttled per-address + by a process-wide daily fuse (`email-throttle.ts`); **marketing** email
  (Night Recap / DJ digest — Slice C) runs on its OWN throttle instance + `MARKETING_MAIL_DAILY_CAP`
  so it can never starve sign-in sends; Engagement actions throttled.
- **CSRF:** Better Auth origin checks on `/api/auth/*`; `X-Pika-Client` header required on non-GET for `/api/{live,playlist,admin,me,client,telemetry,dj}` (`index.ts`), plus CORS allow-list. Deliberately exempt: `/api/email` (RFC 8058 one-click unsubscribe — the POST caller is the recipient's mail provider; the HMAC token is the authorization) and the GET-only `/api/img` pinhole art proxy.
- **Audit Logs:** Metadata sanitization in Sentry (PII scrubbing) and structured logging via `@pika/shared/logger`.
- **Environment:** Critical secrets (`DATABASE_URL`, `SENTRY_AUTH_TOKEN`, `VAPID_KEYS`) must be configured in `.env` per package.

---

## 7. Development Workflow

### 7.1. Package Management
Pika! uses **Bun Workspaces**. Run commands from the root:
```bash
bun install                          # Install all dependencies
bun run dev                          # Run Desktop, Cloud, and Web in dev mode
bun --filter @pika/cloud test        # Run tests only for the Cloud package
bun --filter @pika/desktop tauri dev # Run only the Desktop dev server
```

### 7.2. Standards
- **Linting:** Biome (`bun run lint` — all four packages; zero diagnostics is the bar).
- **Testing:** Bun Test (Cloud/Web/Shared), Vitest (Desktop + Web/Desktop `*.rtl.tsx` RTL), pytest (sidecar). Run `bun run test` for current counts; last full audit: `docs/TEST_AUDIT_2026_06_30.md`.
- **Logging:** Always use the shared `logger`. Avoid `console.log` in production-ready code.

### 7.3. Versioning
We follow Semantic Versioning. The current stable version is **v0.5.0 (Stage/Event + Hardening)**.

---

## 8. Operational Readiness
For deployment, monitoring, and scaling instructions, refer to the `docs/ops-manual.md`. For the future roadmap, see `docs/ROADMAP.md`.

---
**Document Status:** v0.5.0
