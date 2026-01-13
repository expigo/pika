# Pika! Project Master Index & Roadmap

This is the central index for the Pika! project, tracking active development, future plans, and architectural decisions.

**Current Focus:** [MVP Launch Prep](projects/mvp-launch.md)
**Status:** Launch Candidate (v0.1.5)

---

## 📂 Active Projects
*   **[MVP Launch Plan](projects/mvp-launch.md)** - *High Priority*
*   **[Prioritized Feature Matrix](projects/prioritized-roadmap.md)** - *Living Document*
    *   Detailed weighted scoring of features and tech debt.
    *   Tracks the remaining tasks for the initial real-world deployment.
    *   Status: **Launch Ready** (Security Hardened)
    *   **Current Priorities (Jan 2026 Audit):**
        *   ✅ Security: CORS Hardening (Restricted to pika.stream).
        *   ✅ Security: Rate Limiting on Auth Endpoints.
        *   Code Quality: Split monolithic cloud backend (2100+ lines).
        *   Testing: Add E2E tests for critical paths.

---

## 🏛️ Architecture Documentation
*   [**Authentication**](architecture/auth-system.md) - DJ accounts, token management, security.
*   [**Security**](architecture/security.md) - Threat model, vulnerabilities, remediation plans.
*   [**Deployment**](architecture/deployment.md) - VPS, Cloudflare Tunnel, CI/CD, Docker.
*   [**Audio Analysis**](architecture/audio-analysis.md) - Local Python sidecar, librosa integration.
*   [**Social Signals**](architecture/social-signals.md) - Likes, Votes, Listener Counts.
*   [**Logbook Data**](architecture/logbook-data.md) - Session history, Cloud analytics.

---

## 🔐 Security & Quality
*   **Latest Audit:** January 13, 2026
*   **Security Score:** 7.5/10 (2 High, 4 Medium, 3 Low findings)
*   **Engineering Score:** 8.4/10 (Composite assessment)

| Audit | Date | Findings | Status |
| :--- | :--- | :--- | :--- |
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

---

## 📅 High-Level Timeline (2026)

### Q1: The Launch 🚀
*   **Goal:** Successfully run pilot event with DJ Pikachu.
*   **Key Tech:** VPS, Cloudflare, Basic Auth.
*   **Status:** [MVP Launch Plan](projects/mvp-launch.md)

### Q2: Accounts & Community 👥
*   **Goal:** Allow Dancers to save history; Organize Events.
*   **Key Tech:** Auth.js, Postgres Roles, "Organizations".
*   **Ref:** [Account System Vision](blueprints/account-system-vision.md)

### Q3: Ecosystem & Scale 🌍
*   **Goal:** Global Charts, Public API, Mobile App.
*   **Key Tech:** Redis Cluster, React Native, Public API keys.
*   **Ref:** [Pika! Charts](blueprints/pika-charts.md)

---

## 🛠️ Operational Guides
*   [**Ops Manual**](ops-manual.md) - How to run, debug, and manage the system.
*   [**API Reference**](api-reference.md) - (Planned)

