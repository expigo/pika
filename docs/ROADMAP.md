# Pika! Project Master Index & Roadmap

This is the central index for the Pika! project, tracking active development, future plans, and architectural decisions.

**Current Focus:** v0.6 — Slice C "The Relationship Loop" (Follow · Booth · Night Recap · Night Card) built on local staging; next: staging smoke (real set → interstitial → admin sweep → recap email → unsubscribe → Night Card on a real iPhone), then prod release + pilot. Ops prereqs before pilot: Resend paid tier, `MARKETING_MAIL_DAILY_CAP`, `WEB_BASE_URL` on staging.
**Status:** living index — completed work lives in [CHANGELOG.md](CHANGELOG.md)

> **📊 Audit Recap:** See [AUDIT_RECAP.md](archive/AUDIT_RECAP.md) for detailed Batch 1 & 2 verification.
> **📊 Complete Roadmap:** See [ROADMAP_11_10.md](ROADMAP_11_10.md) for detailed sprint verification with code references.

---

## 📂 Active Projects
*   **[MVP Launch Plan](projects/mvp-launch.md)** - *High Priority*
*   **[Persistence Hardening Backlog](persistence-hardening-backlog.md)** - *Deferred storage-layer work; C-tier resilience (W1/W2/C3) done, remainder is signal-driven. Consult when an event/usage/bug gives the signal.*
*   **[Prioritized Feature Matrix](projects/prioritized-roadmap.md)** - *Living Document*
    *   Detailed weighted scoring of features and tech debt.
    *   Tracks the remaining tasks for the initial real-world deployment.
    *   **Completion log:** moved to [CHANGELOG.md](CHANGELOG.md) (newest first).

---

## 🏛️ Architecture Documentation
*   [**Technical Specification**](SPEC.md) - **The Pika! Spec: Onboarding guide for Devs & Agents** (NEW).
*   [**Go Live Flow**](architecture/go-live-flow.md) - **Real-time & History Sync synchronization maps** (NEW).
*   [**Cloud Modules**](architecture/cloud-modules.md) - Handler, route, and lib module structure.
*   [**Authentication**](architecture/auth-system.md) - DJ accounts, token management, security.
*   [**Security**](architecture/security.md) - Threat model, vulnerabilities, remediation plans.
*   [**Deployment**](architecture/deployment.md) - VPS, Cloudflare Tunnel, CI/CD, Docker.
*   [**Audio Analysis**](architecture/audio-analysis.md) - Local Python sidecar, librosa integration, Deep Intelligence heuristics.
*   [**Realtime Infrastructure**](architecture/realtime-infrastructure.md) - WebSocket, offline queues, ACK/NACK.
*   [**Stage / Event Model**](architecture/stage-event-model.md) - Multi-DJ venue model: persistent stages, seamless DJ rotation, scoped push. **(NEW)**
*   [**Schema Versioning**](architecture/schema-versioning.md) - Track analysis versioning for re-analysis.
*   [**Performance Guide**](architecture/performance-guide.md) - Optimization strategies and bottlenecks.
*   [**Social Signals**](architecture/social-signals.md) - Likes, Votes, Listener Counts.
*   [**Logbook Data**](architecture/logbook-data.md) - Session history, Cloud analytics.

---

## 🔐 Security & Quality
*   **Security posture:** [architecture/security.md](architecture/security.md) (threat model + mitigations); hardening sprints S0–S5 verified 2026-01-23 with code references in [ROADMAP_11_10.md](ROADMAP_11_10.md)
*   **Test coverage:** run `bun run test` for current numbers; last full audit: [TEST_AUDIT_2026_06_30.md](TEST_AUDIT_2026_06_30.md)

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

*   [**PWA Architecture**](architecture/pwa-system.md) - ✅ **Implemented**. Full architecture for offline & push.
*   [**Pika! Next Architecture**](blueprints/pika-next-architecture.md) - **Redis, Stages, & Accounts**. The definitive guide to V2 architecture.
*   [**Data Strategy**](blueprints/data-strategy.md) - **Smart Crate & WCS Dashboard**. The vision for data-driven features.
*   [**UX Strategy**](blueprints/ux-strategy.md) - **Dashboards & Personas**. The guide to role-based experiences.

---

## 📅 High-Level Timeline (2026)

### Q1: The Launch 🚀
*   **Goal:** Successfully run pilot event with DJ Pikachu.
*   **Key Tech:** VPS, Cloudflare, Deep Intelligence Recap.
*   **Status:** [MVP Launch Plan](projects/mvp-launch.md)

### Q2: Accounts & Community 👥
*   **Goal:** Allow Dancers to save history; Organize Events.
*   **Key Tech:** Better Auth (✅ shipped June 2026 for DJs/admin) → ✅ dancer magic-link accounts + `client_identities` claims (Journal Slice B, July 2026); next: "Organizations".

### Q3: Ecosystem & Scale 🌍
*   **Goal:** Global Charts, Public API, Mobile App.
*   **Key Tech:** Redis Cluster, React Native, Public API keys.

---

## 🛠️ Operational Guides
*   [**Ops Manual**](ops-manual.md) - How to run, debug, and manage the system.
*   [**Session Initialization**](user-guides/session-initialization.md) - **DJ Guide for "Start Session" & history import** (NEW).
*   [**API Reference**](api-reference.md) - (Planned)

