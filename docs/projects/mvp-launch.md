# Project: MVP Launch Plan

This document tracks the tasks and status for the upcoming MVP Launch Event.

**Target Date:** ~1 month from now
**Status:** Pre-Launch Polish

## 1. Executive Summary

Goal: Deploy a working product for DJ Pikachu to use during a 1-hour session, collecting feedback from 50-100 dancers.

**Success Criteria:**
*   System handles 100 concurrent connections.
*   DJ can authenticate and go live without errors.
*   Dancers can join via QR code and see "Now Playing".

## 2. Infrastructure Checklist

### Production Environment (VPS + Cloudflare)
*   [x] **VPS Setup:** Ubuntu 22.04 LTS on mikr.us (IPv6).
*   [x] **Docker:** Installed and running.
*   [x] **Cloudflare Tunnel:** `pika-tunnel` configured and active.
*   [x] **DNS:**
    *   `pika.stream` -> Web App
    *   `api.pika.stream` -> Cloud API
    *   `status.pika.stream` -> Uptime Kuma

### Application Deployment
*   [x] **Database:** Turso (Production) connected.
*   [x] **SSL:** Managed by Cloudflare Edge.
*   [x] **CI/CD:** `deploy.yml` pipeline active.
*   [ ] **Reliability:** Automate DB Migrations in `deploy` or `start` script (Fix Race Condition).

## 3. Implementation Checklist (Remaining)

### A. Pre-Launch Polish (Security & UX)
*   [ ] **Security Hardening (Audit Jan 2026)**:
    *   [x] Secure Token Generation (`crypto.randomUUID`).
    *   [x] Hash Tokens in DB (`SHA-256`).
    *   [x] Middleware protection for sensitive routes.
    *   [x] Clear Auth on Switch: Prevent cross-env pollution.
    *   [ ] 🚨 **CORS Hardening**: Restrict origins to `pika.stream` and `api.pika.stream` (currently permissive).
    *   [ ] 🚨 **Rate Limiting**: Add `hono-rate-limiter` on `/api/auth/*` endpoints (5 req/15min).
    *   [ ] **Secrets Management**: Move hardcoded DB passwords in `docker-compose.prod.yml` to env vars.
    *   [ ] **Email Validation**: Upgrade to Zod `.email()` validator (currently only checks for `@`).
    *   [ ] **WebSocket Session Ownership**: Track connection ownership to prevent session hijacking.
*   [x] **Performance & Stability (Completed)**:
    *   [x] Recap Duration Fix ("0 min" bug).
    *   [x] Recap Privacy Links (Public vs DJ Analytics).
    *   [x] WebSocket Crash Fix (Missing `djName`).
    *   [x] Hydration Error Fix.
    *   [x] Live Player Recap Button.
    *   [x] VDJ History Watcher Fix.
    *   [x] **Track Import Crash Fix**: Added DB migration for `raw_artist`/`raw_title` columns.
*   [x] **Connectivity & Resilience**:
    *   [x] **Socket Recovery**: Heartbeat monitor & robust reconnection logic.
    *   [x] **Data Sync**: `fetchSessionState` ensures state recovery on reconnect.
    *   [x] **Offline Queue (Web)**: Likes are queued and flushed faithfully.
    *   [x] **Offline Queue (Desktop)**: **DONE.** Offline SQLite queue implemented (`OfflineQueueRepository`). Persists across restarts.
    *   [x] **Data Integrity**: Likes are session-scoped (no phantom likes).
*   [ ] **Data Hygiene**:
    *   [x] **Ghost Track Fix**: `normalizeTrack` utility implemented in `@pika/shared`.
    *   [x] **Poll State Fix**: Retry logic (`ensureSessionPersisted`) prevents race conditions during creation.
*   [ ] **Session UX**:
    *   [x] **Session Resume**: Sticky `currentSessionId` in localStorage.
    *   [x] **Safe QR Codes**: Smart generation (public URL in prod, local IP in dev).
    *   [x] **Landing Page**: Add "How It Works" visual section and clear value props.
    *   [x] **Download Page**: Smart GitHub Release integration for Desktop downloads.
    *   [x] **"Thank You" Rain**: Interactive confetti (Canon Mode) + Performance Mode UI Polish.
    *   [x] **UI Polish**: Fixed selection highlighting and database migration stability.
    *   [ ] **Poll Notifications**: Browser Notification API integration.
    *   [ ] **DJ Announcements**: Push announcement UI and overlay.
*   [ ] **Account Features (MVP Scope)**:
    *   [ ] **Password Protection**: DJ PIN for sessions (optional).

### B. Testing Phase
*   [ ] **Load Test**: Simulate 100 connections (using K6 or similar).
*   [ ] **Mobile Test**: Verify UI on iOS Safari and Android Chrome.
*   [ ] **Dry Run**: 30-minute practice session with 5 users.

### C. Desktop Build & Distribution
*   [x] **Build**: `release-desktop.yml` implements Build Matrix (Mac/Win/Linux).
    *   *Note:* CI/CD is ready to generate artifacts on tag push.
    *   [x] **Pipeline Verfication**: Build confirmed working; release page fetching artifacts correctly.
*   [ ] **Distribute**: Upload `.dmg` to private Google Drive for DJ Pikachu.
*   [ ] **Docs**: Write a simple 1-page PDF manual for the DJ.

### D. Technical Debt (Post-Event Cleanup)
*   [ ] **Redundant Metadata**: Link `likes` to `played_tracks.id` (fix orphan data).
*   [ ] **JSON Schema**: Use `json` type for Polls options.
*   [ ] **DB Indexes**: Add missing indexes for performance.
*   [ ] **Old Token Cleanup**: Cron job to delete unused tokens > 30 days.
*   [ ] **Split Cloud Backend**: Decompose `index.ts` (2100+ lines) into modular routes (`routes/auth.ts`, `routes/session.ts`, etc.).
*   [ ] **Add E2E Tests**: Cover critical path (Go Live → Broadcast → Dancer View).

## 4. Known Risks

### Operational Risks
*   **Venue WiFi:** If venue WiFi blocks WebSockets, DJ must use Hotspot.
*   **Database Limits:** Turso free tier is generous (500M reads), but we monitor closely.
*   **State Loss:** Server restart clears active session Map (until Redis implemented).

### Security Risks (Identified in Jan 2026 Audit)
*   🟠 **Open CORS:** Currently `cors()` with no origin restrictions allows any website to call API.
*   🟠 **No Auth Rate Limiting:** Brute force attacks on `/api/auth/login` are not throttled.
*   🟡 **Hardcoded Secrets:** `docker-compose.prod.yml` contains `POSTGRES_PASSWORD: pika_password`.
*   🟡 **Session Hijacking Vector:** Any client knowing a session ID could theoretically inject fake tracks.

### Code Quality Observations (Engineering Assessment Jan 2026)
*   **Monolithic Files:** `packages/cloud/src/index.ts` at 2100+ lines needs decomposition.
*   **Large Hooks:** `useLiveSession.ts` at 877 lines could be split into smaller hooks.
*   **Test Coverage Gap:** Only `utils.test.ts` in shared package; critical paths lack automated tests.

## 5. Post-MVP Roadmap (Quick Look)
*   [ ] **Redis:** For persistent session state (zero-downtime deploys).
*   [ ] **Organizer Role:** For event branding.
*   [ ] **Native App:** For push notifications.
*   [ ] **CSP Headers:** Add Content Security Policy via Next.js middleware.
*   [ ] **WebSocket Connection Rate Limiting:** Prevent rapid connect/disconnect abuse.

## 6. Audit Trail

| Date | Audit | Findings | Ref |
| :--- | :--- | :--- | :--- |
| **2026-01-13** | Security Audit | 0 Critical, 2 High, 4 Medium, 3 Low | `security-audit.md` |
| **2026-01-13** | Engineering Assessment | Composite Score: 8.4/10 | `engineering-assessment.md` |
