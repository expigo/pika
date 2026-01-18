# Pika! Project Master Index & Roadmap

This is the central index for the Pika! project, tracking active development, future plans, and architectural decisions.

**Current Focus:** Production Hardening & Architectural Modularity
**Status:** Release v0.2.3 (Web App Excellence)

---

## 📂 Active Projects
*   **[MVP Launch Plan](projects/mvp-launch.md)** - *High Priority*
*   **[Prioritized Feature Matrix](projects/prioritized-roadmap.md)** - *Living Document*
    *   Detailed weighted scoring of features and tech debt.
    *   Tracks the remaining tasks for the initial real-world deployment.
    *   **Recent Completions (Jan 18, 2026 - Web App Excellence v0.2.3):**
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
*   [**Authentication**](architecture/auth-system.md) - DJ accounts, token management, security.
*   [**Security**](architecture/security.md) - Threat model, vulnerabilities, remediation plans.
*   [**Deployment**](architecture/deployment.md) - VPS, Cloudflare Tunnel, CI/CD, Docker.
*   [**Audio Analysis**](architecture/audio-analysis.md) - Local Python sidecar, librosa integration, Deep Intelligence heuristics.
*   [**Schema Versioning**](architecture/schema-versioning.md) - Track analysis versioning for re-analysis.
*   [**Performance Guide**](architecture/performance-guide.md) - Optimization strategies and bottlenecks.
*   [**Social Signals**](architecture/social-signals.md) - Likes, Votes, Listener Counts.
*   [**Logbook Data**](architecture/logbook-data.md) - Session history, Cloud analytics.

---

## 🔐 Security & Quality
*   **Latest Audit:** January 18, 2026
*   **Security Score:** 9.2/10 (All critical items resolved)
*   **Engineering Score:** 9.3/10 (Hook decomposition, shared utils)

| Audit | Date | Findings | Status |
| :--- | :--- | :--- | :--- |
| Security & Schema Audit | 2026-01-18 | Password, Email, CSP, DB | ✅ Resolved |
| Recap Analytics Audit | 2026-01-17 | Deep Intelligence Validation | ✅ Pass |
| Security Audit | 2026-01-13 | CORS, Rate Limiting gaps | ✅ Resolved |
| Engineering Assessment | 2026-01-13 | Code decomposition needed | ✅ In Progress |


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

