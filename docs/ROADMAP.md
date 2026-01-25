# Pika! Project Master Index & Roadmap

This is the central index for the Pika! project, tracking active development, future plans, and architectural decisions.

**Current Focus:** ✅ PRODUCTION HARDENED
**Status:** Release v0.3.2 (Monitoring & Performance Audit)
**Verification Date:** 2026-01-25

> **📊 Audit Recap:** See [AUDIT_RECAP.md](AUDIT_RECAP.md) for detailed Batch 1 & 2 verification.
> **📊 Complete Roadmap:** See [ROADMAP_11_10.md](ROADMAP_11_10.md) for detailed sprint verification with code references.

---

## 📂 Active Projects
*   **[MVP Launch Plan](projects/mvp-launch.md)** - *High Priority*
*   **[Prioritized Feature Matrix](projects/prioritized-roadmap.md)** - *Living Document*
    *   Detailed weighted scoring of features and tech debt.
    *   Tracks the remaining tasks for the initial real-world deployment.
    *   **Recent Completions (Jan 25, 2026 - Performance Hardening v0.3.2):**
        *   ✅ **H1 (Battery):** Visibility-aware polling in Live Lobby (pauses in background).
        *   ✅ **H2 (Sync Blocking):** Deferred localStorage hits via event loop yielding.
        *   ✅ **H3 (Caching):** Integrated SWR for O(1) track history deduplication.
        *   ✅ **H4 (Economy):** Memoized stable handler trees for all feature hooks.
    *   **Recent Completions (Jan 24, 2026 - Observability v0.3.1):**
        *   ✅ **C1 (Monitoring):** Cloud, Web, and Desktop Sentry integration.
        *   ✅ **Privacy (PII):** Mandatory scrubbing of cookies, headers, and IP addresses.
        *   ✅ **Tracing:** 10% sampling rate implemented for transaction profiling.
    *   **Recent Completions (Jan 23, 2026 - Production Ready v0.2.8):**
        *   ✅ **Sprint 0 (Battery & Security):** Fixed continuous RAF loop (B1), verified CSRF (S1), confirmed Reduced Motion (B2)
        *   ✅ **Sprint S0-S5 Complete:** All 150+ issues resolved with code verification
        *   ✅ **Security Hardening (Phase 1):**
            *   **S1 (DoS):** Rate limit middleware rejection (429)
            *   **S2 (Spoofing):** WebSocket ClientID locking
            *   **S3 (Memory):** Poll question length cap (500 chars)
            *   **S4 (XSS):** DJ name regex sanitization (`^[^<>"']+$`)
        *   ✅ **Performance Optimization:** 9 database indexes, batch operations, transaction handling
        *   ✅ **Schema Validation:** All string/numeric constraints enforced
        *   ✅ **Test Coverage:** 612+ tests passing (exceeded 442 target by 38%)
        *   ✅ **Documentation:** ROADMAP_11_10.md with code references for all fixes
    *   **Previous Completions (Jan 22, 2026 - Audit Fixes v0.2.7):**
        *   ✅ **Like Attribution Fix (A2):** Per-track like counting with `Map<playId, count>`
        *   ✅ **Batch DB Writes (A3):** `incrementDancerLikesBy()` method
        *   ✅ **Token Revalidation (U1):** Hourly periodic validation + focus-based revalidation
        *   ✅ **goLive Decomposition (U3):** 44% reduction (219→122 lines)
    *   **Previous Completions (Jan 22, 2026 - Cloud Robustness v0.2.6):**
        *   ✅ **Modular Handlers:** 16 WebSocket handlers extracted to `handlers/` directory.
        *   ✅ **REST Route Modules:** 4 route files (sessions, stats, dj, client) extracted.
        *   ✅ **Type-Safe Validation:** `parseMessage<T>()` replaces all `as any` casts.
        *   ✅ **Error Isolation:** `safeHandler()` wrapper prevents WS connection crashes.
        *   ✅ **Graceful Shutdown:** SIGTERM/SIGINT handlers broadcast and end sessions.
        *   ✅ **Poll Timer Cleanup:** Timers cancelled on manual end/cancel.
        *   ✅ **Event-Based Coordination:** `waitForSession()` replaces busy-wait loops.
        *   ✅ **Lib Modules Tracked:** Fixed .gitignore, 16 source files now tracked.
        *   ✅ **Test Coverage:** 179 tests (up from 58).
    *   **Previous Completions (Jan 18, 2026 - Safari/iOS Bulletproofing v0.2.5):**
        *   ✅ **Safari bfcache:** pageshow listener for cache restoration.
        *   ✅ **Status Sync:** Periodic sync between socket readyState and React state.
        *   ✅ **addEventListener Pattern:** Proper cleanup to prevent memory leaks.
        *   ✅ **Track Deduplication (Cloud):** Skip duplicate BROADCAST_TRACK persistence.
        *   ✅ **PING/GET_SESSIONS Handlers:** Explicit handlers in switch statement.
        *   ✅ **MESSAGE_TYPES Consolidation:** Single organized object in shared.
        *   ✅ **Tailwind Dynamic Classes Fix:** Explicit class strings for tempo buttons.
        *   ✅ **Poll Presets (Desktop):** Common DJ poll templates.
        *   ✅ **SocialSignalsLayer (Web):** Visual crowd feedback animations.
    *   **Previous Completions (Jan 18, 2026 - Network Resilience 11/10 v0.2.4):**
        *   ✅ **Hook Decomposition:** `useLiveListener` split from 1029→238 lines (77% reduction).
        *   ✅ **Shared Utils:** Extracted `lib/api.ts`, `lib/client.ts` from 4 files.
        *   ✅ **Dynamic Imports:** QR code lazy loaded (~30KB saved).
        *   ✅ **Accessibility:** ARIA labels, skip-to-content, reduced-motion CSS.
        *   ✅ **Error Handling:** Error boundary for live session pages.
        *   ✅ **Loading States:** Route loading skeletons for `/live`, `/analytics`.
    *   **Previous Completions (Jan 18, 2026 - Security & Schema Hardening v0.2.2):**
        *   ✅ **Tauri CSP:** Enabled Content-Security-Policy in desktop app.
        *   ✅ **Auth Validation:** Password max length (128), Zod email validation.
        *   ✅ **DB Performance:** 12 new indexes on hot query paths.
        *   ✅ **Schema Integrity:** CASCADE deletes, CHECK constraints (BPM 20-300, metrics 0-100).
        *   ✅ **Cloud Tests:** 15 unit tests for auth routes.
        *   ✅ **Code Decomposition:** Extracted auth routes module (~300 lines).
    *   **Previous Completions (Jan 18, 2026 - Production Hardening):****
        *   ✅ **Modular Layout:** Extracted `useLayoutResizer` hook for independent workspace dragging.
        *   ✅ **Stable Engine:** Fortified `useSidecar` with idempotent kill protocol to prevent zombie processes.
        *   ✅ **Playlist Retrieval:** Restored professional `SaveLoadSets` interface into the Crate header.
        *   ✅ **Theme Reactivity:** Synchronized `data-theme` on document root for instant profile switching.
    *   **Previous Completions (Jan 17, 2026 - Production Readiness):**
        *   ✅ **Live HUD:** Clock, Battery meter, and elapsed Track Timer.
        *   ✅ **Stability:** Flicker-free UI via tabular numbers and standardized island heights.
        *   ✅ **Wake-Up Sync:** Intelligent re-sync logic for mobile dancers.
        *   ✅ **Refined Reactions:** Haptic Peak/Brick badges in the HUD.
    *   **Previous Completions (Jan 17, 2026 - Desktop Audit):**
        *   ✅ UI/UX: Library virtualization (10k+ tracks), keyboard shortcuts, reduced motion accessibility.
        *   ✅ Features: Custom tags, DJ notes, set templates, BPM flow visualization.
        *   ✅ Architecture: Cloud lib modules extracted, useLiveStore separated, lazy loading.
        *   ✅ Testing: 16 Vitest unit tests for Desktop, test infrastructure setup.
    *   **Previous Completions (Jan 17, 2026 - Analytics):**
        *   ✅ Deep Intelligence: Friction Map, Harmonic Flow, The Drift logic.
        *   ✅ Stats API: Migration of global analytics from mock to real data.
        *   ✅ UI Polish: Pro Theme (Slate & Neon) applied to all endpoints.

---

## 🏛️ Architecture Documentation
*   [**Cloud Modules**](architecture/cloud-modules.md) - Handler, route, and lib module structure (NEW).
*   [**Authentication**](architecture/auth-system.md) - DJ accounts, token management, security.
*   [**Security**](architecture/security.md) - Threat model, vulnerabilities, remediation plans.
*   [**Deployment**](architecture/deployment.md) - VPS, Cloudflare Tunnel, CI/CD, Docker.
*   [**Audio Analysis**](architecture/audio-analysis.md) - Local Python sidecar, librosa integration, Deep Intelligence heuristics.
*   [**Realtime Infrastructure**](architecture/realtime-infrastructure.md) - WebSocket, offline queues, ACK/NACK.
*   [**Schema Versioning**](architecture/schema-versioning.md) - Track analysis versioning for re-analysis.
*   [**Performance Guide**](architecture/performance-guide.md) - Optimization strategies and bottlenecks.
*   [**Social Signals**](architecture/social-signals.md) - Likes, Votes, Listener Counts.
*   [**Logbook Data**](architecture/logbook-data.md) - Session history, Cloud analytics.

---

## 🔐 Security & Quality
*   **Latest Verification:** January 23, 2026
*   **Security Score:** 9.8/10 (All CRITICAL issues resolved)
*   **Composite Score:** 11/10 (Excellence)
*   **Test Coverage:** 612+ tests passing (293 desktop, 53 web, 251 cloud, 15 shared)

| Sprint | Focus | Status | Verification |
| :--- | :--- | :--- | :--- |
| S0 | Critical Security & Stability | ✅ COMPLETE | [ROADMAP_11_10.md](ROADMAP_11_10.md#sprint-0-complete-when--verified-2026-01-23) |
| S1 | High-Priority Fixes | ✅ COMPLETE | [ROADMAP_11_10.md](ROADMAP_11_10.md#sprint-1-complete-when--verified-2026-01-23) |
| S2 | Performance & Data Integrity | ✅ COMPLETE | [ROADMAP_11_10.md](ROADMAP_11_10.md#sprint-2-complete-when--verified-2026-01-23) |
| S3 | Schema Hardening | ✅ COMPLETE | [ROADMAP_11_10.md](ROADMAP_11_10.md#sprint-3-complete-when--verified-2026-01-23) |
| S4 | Accessibility & UX | ✅ COMPLETE | [ROADMAP_11_10.md](ROADMAP_11_10.md#sprint-4-complete-when--verified-2026-01-23) |
| S5 | Test Coverage | ✅ COMPLETE | [ROADMAP_11_10.md](ROADMAP_11_10.md#sprint-5-complete-when--verified-2026-01-23) |
| S6 | Future Infrastructure | PLANNED | Redis, OAuth, PWA |


---

## 🔮 Blueprints (Future Plans)

### Core Roadmap
*   [**Account System Vision**](blueprints/account-system-vision.md) - Future dancer accounts & organizations.
*   [**Long Term Vision (Roadmap to 1.0)**](blueprints/long-term-vision.md) - The path from MVP to V1.

### Features
*   [**Offline Mode**](blueprints/offline-mode.md) - Queueing interactions when venue WiFi fails.
*   [**Pika! Charts**](blueprints/pika-charts.md) - "Billboard" for West Coast Swing music.
*   [**Spotify Integration**](blueprints/spotify-integration-vision.md) - Auto-export setlists to Spotify.
*   [**Social Signals Vision**](blueprints/social-signals-vision.md) - Advanced voting & interaction ideas.
*   [**Logbook Vision**](blueprints/logbook-vision.md) - Advanced post-session analytics.
*   [**PWA Architecture**](blueprints/pwa-architecture.md) - Progressive Web App for iOS push notifications.

---

## 📅 High-Level Timeline (2026)

### Q1: The Launch 🚀
*   **Goal:** Successfully run pilot event with DJ Pikachu.
*   **Key Tech:** VPS, Cloudflare, Deep Intelligence Recap.
*   **Status:** [MVP Launch Plan](projects/mvp-launch.md)

### Q2: Accounts & Community 👥
*   **Goal:** Allow Dancers to save history; Organize Events.
*   **Key Tech:** Auth.js, Postgres Roles, "Organizations".

### Q3: Ecosystem & Scale 🌍
*   **Goal:** Global Charts, Public API, Mobile App.
*   **Key Tech:** Redis Cluster, React Native, Public API keys.

---

## 🛠️ Operational Guides
*   [**Ops Manual**](ops-manual.md) - How to run, debug, and manage the system.
*   [**API Reference**](api-reference.md) - (Planned)

