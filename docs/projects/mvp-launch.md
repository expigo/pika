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
*   [x] **Database:** Postgres (Production) connected.
*   [x] **SSL:** Managed by Cloudflare Edge.
*   [x] **CI/CD:** `deploy.yml` pipeline active.
*   [ ] **Reliability:** Automate DB Migrations in `deploy` or `start` script (Fix Race Condition).

## 3. Implementation Checklist (Remaining)

### A. Pre-Launch Polish (Security & UX)
*   [x] **Security Hardening (Audit Jan 2026)**:
    *   [x] Secure Token Generation (`crypto.randomUUID`).
    *   [x] Hash Tokens in DB (`SHA-256`).
    *   [x] Middleware protection for sensitive routes.
    *   [x] Clear Auth on Switch: Prevent cross-env pollution.
    *   [x] **CORS Hardening**: Restrict origins to `pika.stream` and `api.pika.stream` (v0.1.0).
    *   [x] **Rate Limiting**: Add `hono-rate-limiter` on `/api/auth/*` endpoints (5 req/15min) (v0.1.9).
    *   [x] **Secrets Management**: Move hardcoded DB passwords in `docker-compose.prod.yml` to env vars.
    *   [ ] **Email Validation**: Upgrade to Zod `.email()` validator (currently only checks for `@`). *Deferred.*
    *   [x] **WebSocket Session Ownership**: Track connection ownership to prevent session hijacking.
    *   [x] **CSRF Protection**: X-Pika-Client header validation (v0.1.9).
    *   [x] **CSP Headers**: Content-Security-Policy via Next.js middleware (v0.1.9).
    *   [x] **WS Connection Rate Limit**: 20 connections/min per IP (v0.1.9).
    *   [x] **Session Telemetry**: DJ connect/disconnect events for operational insights (v0.1.9).
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
    *   [x] **Data Sync**: Late-joiner sync via WebSocket SUBSCRIBE handler (removed redundant `fetchSessionState` REST call).
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
    *   [x] **Poll Alerts**: Toast notification + drawer results with winner highlight and dismiss button.
    *   [x] **DJ Announcements**: Overlay banner with auto-dismiss timer. Session-scoped (only visible to DJ's dancers).
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
*   [x] **E2E Tests (6 passing)**: WebSocket injection for Cloud↔Web. Desktop E2E deferred.

## 4. Known Risks

### Operational Risks
*   **Venue WiFi:** If venue WiFi blocks WebSockets, DJ must use Hotspot.
*   **Database Limits:** Postgres on VPS has no free-tier limits, but monitor disk usage.
*   **State Loss:** Server restart clears active session Map (until Redis implemented).

### Security Risks (Identified in Jan 2026 Audit)
*   ✅ **CORS:** Fixed - Origins restricted to pika.stream domains (v0.1.0).
*   ✅ **Auth Rate Limiting:** Fixed - 5 req/15min on auth endpoints (v0.1.9).
*   ✅ **Secrets:** Fixed - Docker compose uses env vars with fallbacks.
*   ✅ **Session Ownership:** Fixed - WS connections validated against session owner.
*   🟡 **Email Validation:** Deferred - Low risk for MVP demo.

### Code Quality Observations (Engineering Assessment Jan 2026)
*   **Monolithic Files:** `packages/cloud/src/index.ts` at 2100+ lines needs decomposition.
*   **Large Hooks:** `useLiveSession.ts` at 877 lines could be split into smaller hooks.
*   ✅ **Load Tested:** 300 concurrent users verified on 4GB VPS (Jan 2026).

## 5. Post-MVP Roadmap (Quick Look)
*   [ ] **Redis:** For persistent session state (zero-downtime deploys).
*   [ ] **Organizer Role:** For event branding.
*   [ ] **Native App:** For push notifications.
*   [ ] **Email Validation:** Upgrade to Zod `.email()` (deferred from MVP).
*   [ ] **ACK/NACK Integration:** Client-side message acknowledgment for reliability.
*   [ ] **Password Max Length:** Add 128 char limit.

## 6. Audit Trail

| Date | Audit | Findings | Ref |
| :--- | :--- | :--- | :--- |
| **2026-01-15** | Load Test (300 VUs) | ✅ Pass - Max ~1,000 dancers | `load-testing.md` |
| **2026-01-13** | Security Audit | 0 Critical, 2 High, 4 Medium, 3 Low | `security-audit.md` |
| **2026-01-13** | Engineering Assessment | Composite Score: 8.4/10 | `engineering-assessment.md` |
