# Prioritized Roadmap & Feature Matrix

**Date:** January 23, 2026
**Status:** ✅ PRODUCTION READY (v0.2.8 - All Sprints S0-S5 Complete)

> **📊 Complete Sprint Verification:** See [ROADMAP_11_10.md](../ROADMAP_11_10.md) for detailed verification with code references.

This document organizes the Pika! roadmap by **weighted priority**, balancing user value against implementation complexity.

**Scoring Guide:**
*   **Value (1-10):** 10 = Critical for Launch/Survival. 1 = Nice to have.
*   **Complexity (1-10):** 1 = Trivial (hours). 10 = Major Architecting (weeks).
*   **Priority Score:** Heuristic combining Value/Complexity + Strategic Importance.

---

## 0. ✅ Production Readiness Sprint (S0-S5) - COMPLETE
*Completed January 23, 2026. All 150+ issues resolved with code verification.*

| Sprint | Focus | Status | Tests Added | Code Reference |
| :--- | :--- | :---: | :---: | :--- |
| **S0** | Critical Security & Stability | ✅ DONE | - | Auth bypass, cache cleanup, race conditions |
| **S1** | High-Priority Fixes | ✅ DONE | - | Rate limiting, error handling |
| **S2** | Performance & Data Integrity | ✅ DONE | - | 9 indexes, batch operations |
| **S3** | Schema Hardening | ✅ DONE | - | String/numeric constraints |
| **S4** | Accessibility & UX | ✅ DONE | - | SEO, skip-to-content |
| **S5** | Test Coverage | ✅ DONE | +170 | 612 total tests |

**Key Achievements:**
- ✅ 612+ tests passing (exceeded 442 target by 38%)
- ✅ Zero CRITICAL/HIGH issues remaining
- ✅ All security fixes verified with code references
- ✅ Complete documentation update

---

## 1. 🚨 Critical Tech Debt (Immediate Action)
*Focus: Stability, Data Integrity, and Developer Velocity.*


| Feature | Value | Complexity | Priority | Notes |
| :--- | :---: | :---: | :---: | :--- |
| **CI/CD: Automated Migrations** | **10** | 3 | **DONE** | **Prevents production crash.** Implemented auto-migrate on start. |
| **Desktop Offline Queue** | **10** | 7 | **DONE** | **Prevents data loss.** Implemented persistent SQLite queue (`offline_queue`). |
| **PyInstaller Build Matrix** | **9** | 5 | **DONE** | **Required for release.** GitHub Action `release-desktop.yml` created. |
| **CI/CD: Hardening** | **8** | 4 | **DONE** | **Security/Speed.** Rust caching, Biome global lint, macOS create-dmg fix. |
| **Ghost Track Data Fix** | **8** | 4 | **DONE** | **Data hygiene.** `normalizeTrack` implemented in `@pika/shared`. |

---

## 1.5. 🔐 Security Hardening (Jan 2026 Audit)
*Focus: Pre-Launch Security Fixes (2 High, 4 Medium severity items identified).*

| Feature | Value | Complexity | Priority | Notes |
| :--- | :---: | :---: | :---: | :--- |
| **CORS Hardening** | **10** | 2 | **DONE** | **🚨 CRITICAL** Restrict origins to `pika.stream` only. Implemented in v0.1.0+. |
| **Auth Rate Limiting** | **10** | 3 | **DONE** | **🚨 CRITICAL** Added `hono-rate-limiter` (5 req/15min) on `/api/auth/*`. |
| **Secrets to Env Vars** | **8** | 2 | **DONE** | **HIGH** Moved `POSTGRES_PASSWORD` from hardcoded in `docker-compose.prod.yml` to env. |
| **Email Validation** | **5** | 1 | **DONE** | **MED** Upgraded to Zod `.email()` validator (v0.2.2). |
| **Password Max Length** | **5** | 1 | **DONE** | **LOW** 128 char limit to prevent DoS (v0.2.2). |
| **Tauri CSP** | **5** | 2 | **DONE** | **LOW** Content-Security-Policy enabled in desktop app (v0.2.2). |
| **WebSocket Session Ownership** | **7** | 4 | **DONE** | **MED** Track connection ownership to prevent session ID spoofing. |
| **CSRF on Login** | **5** | 2 | **DONE** | **MED** X-Pika-Client header check for REST auth endpoints. |
| **CSP Headers** | **4** | 2 | **DONE** | **LOW** Content-Security-Policy via Next.js middleware (v0.1.9). |
| **WS Connection Rate Limit** | **5** | 3 | **DONE** | **LOW** 20 connections/min per IP (v0.1.9). |
| **Session Telemetry** | **6** | 4 | **DONE** | **MED** DJ connect/disconnect tracking in `session_events` table (v0.1.9). |

---

## 1.6. 🏗️ Code Quality (Engineering Assessment)
*Focus: Maintainability and Developer Velocity. Composite Score: 9.3/10.*

| Observation | Impact | Complexity | Priority | Notes |
| :--- | :---: | :---: | :---: | :--- |
| **Split Cloud Backend** | Architecture | 5 | **DONE** | `lib/` modules created. Auth routes extracted to `routes/auth.ts` (v0.2.2). |
| **Cloud Unit Tests** | Quality | 4 | **DONE** | 15 auth route unit tests using Bun test runner (v0.2.2). |
| **Decompose useLiveSession** | Maintainability | 4 | **DONE** | Extracted `useLiveStore.ts` (130 lines). Reduced main hook from 1,090→960 lines. |
| **Decompose useLiveListener** | Maintainability | 6 | **DONE** | Split into 6 focused hooks (v0.2.3). 1029→238 lines (77% reduction). |
| **Web Shared Utils** | Maintainability | 2 | **DONE** | Extracted `lib/api.ts`, `lib/client.ts` (v0.2.3). |
| **Accessibility (A11y)** | Quality | 3 | **DONE** | ARIA labels, skip-to-content, reduced-motion CSS (v0.2.3). |
| **Add E2E Tests** | Quality | 6 | **DONE** | Web: Playwright (6 tests). Desktop: Vitest (16 tests). |
| **Load Testing** | Reliability | 4 | **DONE** | 300 VUs verified on staging. Max ~1,000 dancers on 4GB VPS. |
| **WebSocket Message Tests** | Reliability | 3 | **MED** | Test Zod schema parsing and edge cases. |
| **Lazy Component Loading** | Performance | 2 | **DONE** | React.lazy() for LivePerformanceMode, Settings, Logbook. |
| **Library Virtualization** | Performance | 4 | **DONE** | @tanstack/react-virtual for 10k+ tracks. |
| **Production HUD Tools** | UX | 3 | **DONE** | Clock, Battery, Track Timer in Stage Mode. |
| **Intelligent Wake-Sync** | Robustness | 4 | **DONE** | Web app self-heals on mobile phone wake-up. |
| **ACK/NACK Protocol** | Reliability | 6 | **DONE** | Reliable BROADCAST_TRACK delivery (v0.2.4). |
| **Nonce Deduplication** | Security | 3 | **DONE** | Server-side replay protection (v0.2.4). |
| **Safari/iOS Bulletproofing** | Robustness | 5 | **DONE** | pageshow, statusRef, addEventListener pattern (v0.2.5). |
| **Chaos Testing** | Reliability | 4 | **DONE** | k6 scripts with 4 scenarios (v0.2.4). |


---

## 2. ✨ MVP Polish (Launch Readiness)
*Focus: User Experience and First Impressions.*

| Feature | Value | Complexity | Priority | Notes |
| :--- | :---: | :---: | :---: | :--- |
| **Safe QR Codes** | **8** | 2 | **DONE** | **Fixes UX.** Secured logic: Prod always uses `pika.stream`. Dev uses Local IP (robust offline detection added). |
| **Poll State Sync Fix** | **7** | 5 | **DONE** | **Robustness.** Retry logic implemented to ensure session exists before poll creation. |
| **Landing Page "How-To"** | **7** | 3 | **DONE** | **Visual Polish.** Added "How It Works" visual section and smart `/download` page. |
| **Session Resume UX** | **6** | 3 | **DONE** | Sticky `sessionId` in `localStorage` prevents context loss on refresh. |
| **"Thank You" Rain** | **8** | 3 | **DONE** | **User Delight.** Dancers click "Thank You" -> Confetti rains on DJ screen. End-of-night ritual. |
| **Pro Enhancements** | **9** | 5 | **DONE** | **Slate & Neon Theme.** Full aesthetic overhaul + TTL caching + Debounced broadcasts. |

---

## 3. 🚀 Core Features (Post-Launch / V1)
*Focus: Retention, Accounts, and Ecosystem.*

| Feature | Value | Complexity | Priority | Notes |
| :--- | :---: | :---: | :---: | :--- |
| **Deep Intelligence** | **9** | 6 | **DONE** | **Recap Analytics.** Implemented Friction, Harmonic Flow, and "The Drift" v1. |
| **Account System (Auth.js)** | **9** | 9 | **HIGH** | **Strategic unlock.** Required for "My History", "Favorites", and multi-DJ events. |
| **Pika! Charts** | **9** | 8 | **HIGH** | **The Moat.** Aggregated "Billboard" charts for WCS music. Unique value prop. |
| **Session Persistence (Redis)**| **8** | 7 | **MED** | Move session state from memory to Redis to allow zero-downtime deploys. |
| **Event / Organizer Role** | **7** | 6 | **MED** | Allow events to brand their live pages (Logo, Colors). |

---

## 4.  Tier 3: Growth Features (Post-MVP)
*Focus: Retention, Monetization Potential, and Ecosystem Expansion.*

| Feature | Value | Complexity | Priority | Notes |
| :--- | :---: | :---: | :---: | :--- |
| **Global Analytics Fix** | **8** | 3 | **DONE** | Validated `/api/stats/global` with real usage data. |
| **DJ Dashboard (Web)** | **9** | 5 | **HIGH** | DJs review past sets, manage profile, regenerate tokens. |
| **Set History Analytics** | **8** | 6 | **DONE** | **Deep Intelligence.** Integrated into `/recap/[id]/analytics`. |
| **PWA (Pro Mobile)** | **10** | 5 | **DONE** | **Architecture.** Offline Mode, Push Notifications, Installable. |
| **Organizer Role** | **6** | 7 | **MED** | Event branding, multi-DJ coordination, aggregate stats. |
| **Native Mobile App** | **5** | 10 | **LOW** | Push notifications, widgets. Only after PMF validated. |

---

## 4.1 📈 Set History Analytics (Deep Intelligence) - DONE
**Goal achieved on Jan 17, 2026.**

**Features Implemented:**
- **Transition Friction Map:** Calculated using Euclidean distance of audio fingerprints.
- **Harmonic Flow Audit:** Camelot-based compatibility scoring.
- **"The Drift" Indicator:** Detecting DJ/Crowd tempo divergence.
- **Global BPM Stats:** Range and average calculations.

---

## 4.2 🎛️ DJ Dashboard (Web) - Detailed Spec

**Goal:** A web portal where DJs manage their profile, view past sessions, and access analytics.

**User Stories:**
- As a DJ, I want to see which songs got the most likes so I can improve my sets.
- As a DJ, I want to regenerate my API token without using the command line.
- As a DJ, I want to update my display name and profile picture.

**Current State:**
- `/dj/[slug]` exists (public profile page)
- `/dj/login` and `/dj/register` exist
- ❌ No authenticated dashboard after login

**Components:**

| Component | Description | Effort |
|-----------|-------------|:------:|
| `/dj/dashboard` page | Protected route with auth check | 1h |
| Session History list | Query `sessions` table by DJ ID | 2h |
| Top Tracks widget | Aggregate likes per track across sessions | 2h |
| Profile Edit form | Update `djUsers` name/bio fields | 1h |
| Token Regenerate button | Call `/api/auth/regenerate-token` | 1h |
| Avatar upload | S3 or Cloudflare R2 integration | 3h |

**Total Effort: ~10 hours**

---

## 4.3 🎪 Organizer Role - Detailed Spec

**Goal:** Event organizers can brand the experience and coordinate multiple DJs.

**User Stories:**
- As an organizer, I want my event logo on the dancer view.
- As an organizer, I want to schedule multiple DJs for my event.
- As an organizer, I want aggregate stats across all DJs at my event.

**Current State:**
- No event/organizer concept in schema
- Sessions are DJ-scoped only

**Schema Additions:**
```typescript
export const events = pgTable("events", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  logoUrl: text("logo_url"),
  primaryColor: text("primary_color"),
  organizerId: integer("organizer_id").references(() => djUsers.id),
});

export const eventDjs = pgTable("event_djs", {
  eventId: integer("event_id").references(() => events.id),
  djId: integer("dj_id").references(() => djUsers.id),
  setStart: timestamp("set_start"),
  setEnd: timestamp("set_end"),
});
```

---

## 4.4 📱 Native Mobile App - Detailed Spec

**Goal:** iOS/Android app for dancers with push notifications and offline support.

**User Stories:**
- As a dancer, I want a push notification when my favorite DJ goes live.
- As a dancer, I want to queue likes while in a WiFi dead zone.
- As a dancer, I want a home screen widget showing "Now Playing".

**PWA First Approach (Recommended):**

| Component | Description | Effort |
|-----------|-------------|:------:|
| Add `manifest.json` | App name, icons, theme | 1h |
| Add service worker | Basic caching | 2h |
| Enable install prompt | "Add to Home Screen" | 0h |
| Offline page | Show cached data | 2h |

**PWA Total: ~5 hours** ✅ Quick win

**Full Native (Phase 2):**

| Component | Description | Effort |
|-----------|-------------|:------:|
| React Native / Expo setup | Cross-platform foundation | 4h |
| Auth flow (SecureStore) | Token storage | 2h |
| WebSocket integration | Same protocol as web | 3h |
| Push notifications (FCM/APNs) | Cloud sends via Firebase | 8h |
| Offline queue | AsyncStorage persistence | 4h |
| App Store submission | Apple review | 8h |
| Play Store submission | Google review | 4h |
| Widget (iOS/Android) | Home screen "Now Playing" | 8h |

**Native Total: ~41 hours**

**Recommendation:** PWA first → Validate demand → Native only if scale requires

---

## 5. 🔮 Future / Backlog (Nice-to-Haves)
*Focus: Delight and Expansion.*

| Feature | Value | Complexity | Priority | Notes |
| :--- | :---: | :---: | :---: | :--- |
| **Spotify Integration** | **6** | 8 | **LOW** | "Add to Playlist" button. High complexity (Auth tokens). |
| **Venue Profiles** | **4** | 5 | **LOW** | Saved venue configs. Low priority until scale. |

---

## 6. Development Plan (Sequenced)

### Phase 2.6: The "Pro Polish" (Aesthetics & Perf) ✅ COMPLETE
*Completed Jan 16, 2026. Slate & Neon design system implemented.*

1.  ✅ **Pro UI Components:** `ProCard`, `ProHeader`, `VibeBadge` implemented.
2.  ✅ **Frontend Overhaul:** `/live`, `/recap`, `/dj/[slug]`, `/my-likes`, `/analytics` updated.
3.  ✅ **TTL Caching:** 5m cache for global stats in Cloud.
4.  ✅ **Debounced Broadcasts:** 2s interval for listener counts to reduce traffic.
5.  ✅ **Sticky Participants:** 5m window for pocketed phones.
6.  ✅ **PWA Nav:** `BottomNav` implemented for mobile-first experience.

### Phase 2.7: Deep Intelligence & Analytics Fixes ✅ COMPLETE
*Completed Jan 17, 2026. Real-world aggregate data and advanced heuristics.*

1.  ✅ **Transition Intelligence:** Friction & Harmonic Flow logic.
2.  ✅ **The Drift:** Crowd-sourced tempo feedback divergence analysis.
3.  ✅ **Global Stats API:** Migrated `/analytics` from mock to real DB data.
4.  ✅ **Code Quality:** Fixed Lucide icon types and React hook dependency warnings.

### Phase 2.8: Desktop UI/UX Audit ✅ COMPLETE
*Completed Jan 17, 2026. Full audit of Desktop app with architecture cleanup.*

**Phase 1: UI/UX Polish**
1.  ✅ **Library Virtualization:** `@tanstack/react-virtual` for 10k+ tracks.
2.  ✅ **Played Track Indicators:** Visual feedback in library for session-played tracks.
3.  ✅ **Offline Queue Visibility:** `OfflineQueueIndicator` component in header.
4.  ✅ **Keyboard Shortcuts:** P=Peak, B=Brick, N=Note, Esc=Exit in Performance Mode.
5.  ✅ **Reduced Motion:** `prefers-reduced-motion` media query for accessibility.

**Phase 2: Feature Parity**
1.  ✅ **Custom Tags:** `TagEditor.tsx`, `TagPill.tsx`, tracks.tags column.
2.  ✅ **DJ Notes:** `NoteEditor.tsx`, tracks.notes column.
3.  ✅ **Set Templates:** `set_templates` table, `templateRepository.ts`, `TemplateManager.tsx`.
4.  ✅ **BPM Flow Visualization:** Enhanced `EnergyWave.tsx` with BPM line + jump warnings.

**Phase 3: Production Readiness & Live Performance**
1.  ✅ **Live HUD Tools:** Clock, Battery, Track Timer integrated into Stage Mode.
2.  ✅ **Flicker-Free UI:** Tabular numbering and fixed island heights for HUD stability.
3.  ✅ **Wake-Up Sync:** Native `visibilitychange` listener for automatic mobile re-sync.
4.  ✅ **Haptic Feedback:** Subtle Zap/Snowflake badges for reaction feedback.
5.  ✅ **Panic Sync Grouping:** Relocated to Status Island for cleaner logic.

**Phase 4: Architecture Cleanup**
1.  ✅ **Cloud Lib Modules:** 6 modules extracted (listeners, tempo, cache, protocol, auth).
2.  ✅ **useLiveStore:** Zustand store extracted (130 lines).
3.  ✅ **Desktop Testing:** Vitest + 16 unit tests passing.
4.  ✅ **Lazy Loading:** React.lazy() for LivePerformanceMode, Settings, Logbook.

### Phase 2.9: Network Resilience 11/10 ✅ COMPLETE
*Completed Jan 18, 2026. Safari/iOS bulletproofing and ACK/NACK protocol.*

**P0 Critical:**
1.  ✅ **Visibilitychange Fix:** Re-attached missing event listener.
2.  ✅ **IndexedDB Persistence:** Pending likes survive page refresh (Web).
3.  ✅ **ACK/NACK Protocol:** Desktop reliable BROADCAST_TRACK delivery.

**P1 High Priority:**
1.  ✅ **Stale Data Banner:** Prominent warning when disconnected >30s.

**P2 Medium Priority:**
1.  ✅ **E2E Reconnection Tests:** 5 new Playwright specs.
2.  ✅ **Chaos Testing:** k6 script with 4 scenarios.

**P3 Nice-to-Have:**
1.  ✅ **Exponential Backoff:** Queue flush prevents thundering herd.
2.  ✅ **Nonce Deduplication:** Server-side replay protection.

**Safari/iOS Bulletproofing:**
1.  ✅ **pageshow listener:** Handles bfcache restoration.
2.  ✅ **statusRef:** Avoids stale closure values.
3.  ✅ **addEventListener pattern:** Proper cleanup prevents leaks.
4.  ✅ **Track Deduplication:** Cloud skips duplicate persistence.
5.  ✅ **MESSAGE_TYPES Consolidation:** Single organized object in shared.

**Deferred:**
*   [-] **Reliable Likes:** Not required for MVP (see `realtime-infrastructure.md`).

### Phase 3: The "Account Era" (Post-Launch)
1.  [ ] **Auth.js Setup:** Scaffolding for Dancer/DJ login.
2.  [ ] **Redis:** Migration of state for zero-downtime deploys.

### Phase 4: Code Quality Sprint ✅ COMPLETE
*Jan 2026 Desktop Audit. Score: 8.9/10.*

1.  ✅ **Split Cloud Backend:** `lib/` modules created. Full wiring deferred.
2.  ✅ **E2E Tests:** Web (6 Playwright) + Desktop (16 Vitest).
3.  ✅ **Decompose Hooks:** `useLiveStore.ts` extracted.

### Phase 4.5: Library Enhancement (Planned) 🔧
*Target: Jan 2026. Preparing for 7500+ track libraries and Pika! Charts.*

1.  [ ] **Tags Schema Migration:** Normalize to join tables (cloud-ready).
2.  [ ] **Tag Filter:** Multi-select filter in LibraryBrowser.
3.  [ ] **BPM/Energy Filters:** Range sliders or presets.
4.  [ ] **Ghost Overlay Templates:** Ambient guidance for set building.
5.  [ ] **Default Visibility Wiring:** Tags ON, Radar OFF by default.

### Phase 5: Growth Features (Post-MVP) 🚀
1.  [ ] **DJ Dashboard:** Web portal for DJs (~10h)
2.  [ ] **PWA:** Quick mobile improvement (~5h)
3.  [ ] **Set Analytics:** BPM/energy visualizations (~12h)
4.  [ ] **Organizer Role:** Event branding (~17h)
5.  [ ] **Native App:** Only if PMF validated (~41h)
6.  ✅ **Desktop Testing:** Vitest unit tests implemented (16 tests)

---

## 7. Changelog

| Date | Change | Context |
| :--- | :--- | :--- |
| **2026-01-23** | **✅ PRODUCTION READY v0.2.8** | All Sprints S0-S5 complete. 612+ tests. Zero CRITICAL/HIGH issues. See [ROADMAP_11_10.md](../ROADMAP_11_10.md) |
| **2026-01-18** | **Network Resilience 11/10** | ACK/NACK, IndexedDB, nonce dedup, Safari bulletproofing, chaos tests. Score: 11/10. |
| **2026-01-17** | **Production Readiness Polish** | Clock, Battery, Track Timer, Wake-Up Sync, Flicker-free UI. |
| **2026-01-17** | **Desktop UI/UX Audit Complete** | Virtualization, Tags/Notes, Templates, 16 unit tests, lazy loading. Score: 8.9/10. |
| **2026-01-17** | **Deep Intelligence v1** | Implemented advanced analytics for set recaps. Fixed global stats API. |
| **2026-01-16** | **Pro Enhancements Complete** | Slate & Neon theme, TTL cache, Debounced broadcasts, PWA BottomNav. |
| **2026-01-15** | E2E Tests Fixed (6 passing) | WebSocket injection replaces Tauri mocks. |
| **2026-01-15** | **Release v0.1.9** | Security hardening complete: CSP, CSRF, telemetry, WS rate limiting. |
| **2026-01-15** | Added Tier 3 Growth Features | Detailed specs for DJ Dashboard, Analytics, Organizer Role, Native App. |
| **2026-01-13** | Added Security Hardening Phase 2.5 | Security Audit identified 2 High, 4 Medium issues. |
| **2026-01-13** | Added Code Quality Phase 4 | Engineering Assessment (8.4/10). |
| **2026-01-13** | **Release v0.1.5 (Launch Candidate)** | "Thank You" Rain, Auto-Migrations, Security Hardening. |
| **2026-01-12** | Added "Native App" as Low Priority | PWA approach preferred over React Native rewrite. |
| **2026-01-12** | Created Document | Initial prioritization of roadmap items. |

---

*Last Updated: January 23, 2026 (Production Ready v0.2.8)*
*Status: ✅ All Sprints S0-S5 Complete - See [ROADMAP_11_10.md](../ROADMAP_11_10.md)*
