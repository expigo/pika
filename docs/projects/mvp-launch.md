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
*   [x] **Security Hardening**:
    *   [x] Secure Token Generation (`crypto.randomUUID`).
    *   [x] Hash Tokens in DB (`SHA-256`).
    *   [x] Middleware protection for sensitive routes.
    *   [x] Clear Auth on Switch: Prevent cross-env pollution.
*   [x] **Performance & Stability (Completed)**:
    *   [x] Recap Duration Fix ("0 min" bug).
    *   [x] Recap Privacy Links (Public vs DJ Analytics).
    *   [x] WebSocket Crash Fix (Missing `djName`).
    *   [x] Hydration Error Fix.
    *   [x] Live Player Recap Button.
    *   [x] VDJ History Watcher Fix.
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

## 4. Known Risks

*   **Venue WiFi:** If venue WiFi blocks WebSockets, DJ must use Hotspot.
*   **Database Limits:** Turso free tier is generous (500M reads), but we monitor closely.
*   **State Loss:** Server restart clears active session Map (until Redis implemented).

## 5. Post-MVP Roadmap (Quick Look)
*   [ ] **Redis:** For persistent session state.
*   [ ] **Organizer Role:** For event branding.
*   [ ] **Native App:** For push notifications.
