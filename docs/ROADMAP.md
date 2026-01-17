# Pika! Project Master Index & Roadmap

This is the central index for the Pika! project, tracking active development, future plans, and architectural decisions.

**Current Focus:** Production Readiness & Live Performance Optimization
**Status:** Release v0.2.0 (Production Readiness Complete)

---

## 📂 Active Projects
*   **[MVP Launch Plan](projects/mvp-launch.md)** - *High Priority*
*   **[Prioritized Feature Matrix](projects/prioritized-roadmap.md)** - *Living Document*
    *   Detailed weighted scoring of features and tech debt.
    *   Tracks the remaining tasks for the initial real-world deployment.
    *   **Recent Completions (Jan 17, 2026 - Production Readiness):**
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
*   **Latest Audit:** January 17, 2026
*   **Security Score:** 8.5/10 (Critical items resolved)
*   **Engineering Score:** 8.9/10 (Composite assessment)

| Audit | Date | Findings | Status |
| :--- | :--- | :--- | :--- |
| Recap Analytics Audit | 2026-01-17 | Deep Intelligence Validation | ✅ Pass |
| Security Audit | 2026-01-13 | CORS, Rate Limiting gaps | **Resolved** |
| Engineering Assessment | 2026-01-13 | Code decomposition needed | Open |


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

