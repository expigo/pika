# Prioritized Roadmap & Feature Matrix

**Date:** January 15, 2026
**Status:** Living Document

This document organizes the Pika! roadmap by **weighted priority**, balancing user value against implementation complexity.

**Scoring Guide:**
*   **Value (1-10):** 10 = Critical for Launch/Survival. 1 = Nice to have.
*   **Complexity (1-10):** 1 = Trivial (hours). 10 = Major Architecting (weeks).
*   **Priority Score:** Heuristic combining Value/Complexity + Strategic Importance.

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
| **Email Validation** | **5** | 1 | **DEFERRED** | **MED** Low risk for MVP demo. Will upgrade to Zod `.email()` post-launch. |
| **WebSocket Session Ownership** | **7** | 4 | **DONE** | **MED** Track connection ownership to prevent session ID spoofing. |
| **CSRF on Login** | **5** | 2 | **DONE** | **MED** X-Pika-Client header check for REST auth endpoints. |
| **CSP Headers** | **4** | 2 | **DONE** | **LOW** Content-Security-Policy via Next.js middleware (v0.1.9). |
| **WS Connection Rate Limit** | **5** | 3 | **DONE** | **LOW** 20 connections/min per IP (v0.1.9). |
| **Session Telemetry** | **6** | 4 | **DONE** | **MED** DJ connect/disconnect tracking in `session_events` table (v0.1.9). |

---

## 1.6. 🏗️ Code Quality (Engineering Assessment)
*Focus: Maintainability and Developer Velocity. Composite Score: 8.4/10.*

| Observation | Impact | Complexity | Priority | Notes |
| :--- | :---: | :---: | :---: | :--- |
| **Split Cloud Backend** | Architecture | 5 | **HIGH** | `index.ts` is 2100+ lines. Split into `routes/auth.ts`, `routes/session.ts`, `services/broadcast.ts`. |
| **Decompose useLiveSession** | Maintainability | 4 | **MED** | 877-line hook should be split into smaller custom hooks. |
| **Add E2E Tests** | Quality | 6 | **DONE** | Validated "Happy Path" with Playwright hybrid suite. |
| **WebSocket Message Tests** | Reliability | 3 | **MED** | Test Zod schema parsing and edge cases. |


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

---

## 3. 🚀 Core Features (Post-Launch / V1)
*Focus: Retention, Accounts, and Ecosystem.*

| Feature | Value | Complexity | Priority | Notes |
| :--- | :---: | :---: | :---: | :--- |
| **Account System (Auth.js)** | **9** | 9 | **HIGH** | **Strategic unlock.** Required for "My History", "Favorites", and multi-DJ events. |
| **Pika! Charts** | **9** | 8 | **HIGH** | **The Moat.** Aggregated "Billboard" charts for WCS music. Unique value prop. |
| **Session Persistence (Redis)**| **8** | 7 | **MED** | Move session state from memory to Redis to allow zero-downtime deploys. |
| **Event / Organizer Role** | **7** | 6 | **MED** | Allow events to brand their live pages (Logo, Colors). |

---

## 4. � Tier 3: Growth Features (Post-MVP)
*Focus: Retention, Monetization Potential, and Ecosystem Expansion.*

| Feature | Value | Complexity | Priority | Notes |
| :--- | :---: | :---: | :---: | :--- |
| **DJ Dashboard (Web)** | **9** | 5 | **HIGH** | DJs review past sets, manage profile, regenerate tokens. |
| **Set History Analytics** | **8** | 6 | **MED** | BPM/energy timelines, tempo feedback graphs, engagement heatmaps. |
| **PWA (Lite Mobile)** | **7** | 2 | **HIGH** | Quick win before native. Add to home screen, basic offline. |
| **Organizer Role** | **6** | 7 | **MED** | Event branding, multi-DJ coordination, aggregate stats. |
| **Native Mobile App** | **5** | 10 | **LOW** | Push notifications, widgets. Only after PMF validated. |

---

## 4.1 🎛️ DJ Dashboard (Web) - Detailed Spec

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

**UI Mockup:**
```
┌─────────────────────────────────────────────┐
│  🎧 DJ Pikachu                    [Logout]  │
├─────────────────────────────────────────────┤
│ ┌──────────────┐  Recent Sessions           │
│ │   Avatar     │  ├── Jan 14 (48 tracks) ❤️127│
│ │              │  ├── Jan 10 (32 tracks) ❤️84 │
│ └──────────────┘  └── Jan 7 (65 tracks) ❤️203│
│ [Edit Profile]                               │
│                   🔥 Top Liked Tracks        │
│ API Token         1. "Lover" - Taylor (42❤️) │
│ pk_dj_...[Copy]   2. "Smooth" - Rob T (38❤️) │
│ [Regenerate]      3. "Uptown" - Bruno (31❤️) │
└─────────────────────────────────────────────┘
```

---

## 4.2 📈 Set History Analytics - Detailed Spec

**Goal:** Visual dashboard showing BPM trends, energy curves, and crowd feedback over time.

**User Stories:**
- As a DJ, I want to see when the floor peaked so I can replicate that energy.
- As a DJ, I want to know if my tempo was too fast based on crowd feedback.
- As a DJ, I want to identify songs that got cold reactions.

**Data Available:**
- `played_tracks` → BPM, energy, danceability, timestamps
- `tempo_votes` → Faster/Slower/Perfect per track
- `likes` → Count per track
- `session_events` → Connect/disconnect patterns

**Components:**

| Component | Description | Effort |
|-----------|-------------|:------:|
| BPM Timeline chart | Line chart: X=time, Y=BPM | 3h |
| Energy Curve | Area chart with energy values | 2h |
| Tempo Feedback bars | Stacked bar (F/S/P per song) | 2h |
| Like Heatmap | Highlight high-engagement moments | 2h |
| Export to PDF | Generate downloadable report | 3h |

**Total Effort: ~12 hours**

**Tech Stack:** Chart.js or Recharts, server-side data aggregation

**UI Mockup:**
```
Session: Jan 14, 2026 (8:30 PM - 11:45 PM)
────────────────────────────────────────────
BPM    130 ─┐    ┌─┐      ┌───┐
       120  └────┘ └──────┘   └─────
       110 ─────────────────────────────────
            8:30  9:00  9:30  10:00  10:30

Energy  High ████████░░░░████████████░░░
        Med  ░░░░░░░░████░░░░░░░░░░░░████
        Low  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░

Crowd Tempo Feedback:
  🐢 Slower: 12% | ✓ Perfect: 73% | 🐇 Faster: 15%

[Download PDF Report]
```

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

**Components:**

| Component | Description | Effort |
|-----------|-------------|:------:|
| DB schema migration | `events` + `event_djs` tables | 2h |
| Organizer registration flow | `/organizer/register` | 3h |
| Event creation wizard | Name, dates, add DJs | 3h |
| Branded dancer view | Dynamic theme from event config | 3h |
| `/events/[slug]` page | Event-specific landing page | 2h |
| Event analytics dashboard | All DJs, all sessions aggregated | 4h |

**Total Effort: ~17 hours**

---

## 4.4 📱 Native Mobile App - Detailed Spec

**Goal:** iOS/Android app for dancers with push notifications and offline support.

**User Stories:**
- As a dancer, I want a push notification when my favorite DJ goes live.
- As a dancer, I want to queue likes while in a WiFi dead zone.
- As a dancer, I want a home screen widget showing "Now Playing".

**Current State:**
- Web is mobile-responsive ✅
- PWA could be intermediate step (recommended first)

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
| **Pika! Charts** | **9** | 8 | **FUTURE** | Aggregated "Billboard" charts for WCS music. Strategic moat. |

---

## 6. Development Plan (Sequenced)

### Phase 1: The "Stability Fix" ✅ COMPLETE
1.  ✅ **CI/CD Migrations:** Modify `package.json` `start` script.
2.  ✅ **PyInstaller Matrix:** Create `.github/workflows/build-desktop.yml`.
3.  ✅ **Desktop Offline Queue:** Implement `PendingUpdateQueue` in `useLiveSession.ts`.

### Phase 2: The "Launch Polish" ✅ COMPLETE
1.  ✅ **Ghost Data Fix:** Add normalization logic in `packages/shared`.
2.  ✅ **QR Codes:** Switch to dynamic generation based on environment.
3.  ✅ **Landing Page:** Design & implement "How it works".
4.  ✅ **"Thank You" Rain:** Confetti feedback system implemented.

### Phase 2.5: The "Security Hardening" 🔐 ✅ COMPLETE (v0.1.9)
*Completed Jan 15, 2026. All critical items addressed.*

1.  ✅ **CORS Restriction:** Origins restricted to `pika.stream` domains.
2.  ✅ **Rate Limiting:** `hono-rate-limiter` on auth routes (5 req/15min).
3.  ✅ **Secrets Migration:** `POSTGRES_PASSWORD` moved to env vars.
4.  ✅ **CSRF Protection:** X-Pika-Client header validation.
5.  ✅ **CSP Headers:** Content-Security-Policy via Next.js middleware.
6.  ✅ **WS Rate Limiting:** 20 connections/min per IP.
7.  ✅ **Session Telemetry:** DJ connect/disconnect event tracking.
8.  ✅ **E2E Test Suite:** Playwright hybrid tests for critical paths.
9.  🟡 **Email Validation:** Deferred (low risk for MVP demo).

### Phase 3: The "Account Era" (Post-Launch)
1.  [ ] **Auth.js Setup:** Scaffolding for Dancer/DJ login.
2.  [ ] **Redis:** Migration of state for zero-downtime deploys.

### Phase 4: Code Quality Sprint (Post-Launch)
*Recommendations from Jan 2026 Engineering Assessment. Score: 8.4/10.*

1.  [ ] **Split Cloud Backend:** Decompose `index.ts` into `routes/` and `services/`.
2.  ✅ **Add E2E Tests:** Cover critical user paths.
3.  [ ] **Decompose Hooks:** Split `useLiveSession.ts` into smaller hooks.

### Phase 5: Growth Features (Post-MVP) 🚀
*See Section 4 for detailed specs.*

1.  [ ] **DJ Dashboard:** Web portal for DJs (~10h)
2.  [ ] **PWA:** Quick mobile improvement (~5h)
3.  [ ] **Set Analytics:** BPM/energy visualizations (~12h)
4.  [ ] **Organizer Role:** Event branding (~17h)
5.  [ ] **Native App:** Only if PMF validated (~41h)

---

## 7. Changelog

| Date | Change | Context |
| :--- | :--- | :--- |
| **2026-01-15** | **Release v0.1.9** | Security hardening complete: CSP, CSRF, telemetry, WS rate limiting. |
| **2026-01-15** | Added Tier 3 Growth Features | Detailed specs for DJ Dashboard, Analytics, Organizer Role, Native App. |
| **2026-01-13** | Added Security Hardening Phase 2.5 | Security Audit identified 2 High, 4 Medium issues. |
| **2026-01-13** | Added Code Quality Phase 4 | Engineering Assessment (8.4/10). |
| **2026-01-13** | **Release v0.1.5 (Launch Candidate)** | "Thank You" Rain, Auto-Migrations, Security Hardening. |
| **2026-01-12** | Added "Native App" as Low Priority | PWA approach preferred over React Native rewrite. |
| **2026-01-12** | Created Document | Initial prioritization of roadmap items. |

---

*Last Updated: January 15, 2026 (v0.1.9)*
