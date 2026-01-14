# Prioritized Roadmap & Feature Matrix

**Date:** January 12, 2026
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
| **CI/CD: Hardening** | **8** | 4 | **IN PROGRESS** | **Security/Speed.** Adding Rust caching and deduplication. |
| **Ghost Track Data Fix** | **8** | 4 | **DONE** | **Data hygiene.** `normalizeTrack` implemented in `@pika/shared`. |

---

## 1.5. 🔐 Security Hardening (Jan 2026 Audit)
*Focus: Pre-Launch Security Fixes (2 High, 4 Medium severity items identified).*

| Feature | Value | Complexity | Priority | Notes |
| :--- | :---: | :---: | :---: | :--- |
| **CORS Hardening** | **10** | 2 | **DONE** | **🚨 CRITICAL** Restrict origins to `pika.stream` only. Implemented in v0.1.0+. |
| **Auth Rate Limiting** | **10** | 3 | **DONE** | **🚨 CRITICAL** Added `hono-rate-limiter` (5 req/15min) on `/api/auth/*`. |
| **Secrets to Env Vars** | **8** | 2 | **DONE** | **HIGH** Moved `POSTGRES_PASSWORD` from hardcoded in `docker-compose.prod.yml` to env. |
| **Email Validation** | **5** | 1 | **DONE** | **MED** Upgraded to Zod `.email()` validator. |
| **WebSocket Session Ownership** | **7** | 4 | **DONE** | **MED** Track connection ownership to prevent session ID spoofing. |
| **CSRF on Login** | **5** | 2 | **DONE** | **MED** Add custom header check for REST auth endpoints. |
| **CSP Headers** | **4** | 2 | **LOW** | Add Content-Security-Policy via Next.js middleware. |

---

## 1.6. 🏗️ Code Quality (Engineering Assessment)
*Focus: Maintainability and Developer Velocity. Composite Score: 8.4/10.*

| Observation | Impact | Complexity | Priority | Notes |
| :--- | :---: | :---: | :---: | :--- |
| **Split Cloud Backend** | Architecture | 5 | **HIGH** | `index.ts` is 2100+ lines. Split into `routes/auth.ts`, `routes/session.ts`, `services/broadcast.ts`. |
| **Decompose useLiveSession** | Maintainability | 4 | **MED** | 877-line hook should be split into smaller custom hooks. |
| **Add E2E Tests** | Quality | 6 | **HIGH** | Only `utils.test.ts` exists. Need critical path coverage (Go Live → Broadcast → View). |
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

## 4. 🔮 Future / Backlog (Nice-to-Haves)
*Focus: Delight and Expansion.*

| Feature | Value | Complexity | Priority | Notes |
| :--- | :---: | :---: | :---: | :--- |
| **Spotify Integration** | **6** | 8 | **LOW** | "Add to Playlist" button. High complexity (Auth tokens) for moderate value. |
| **Venue Profiles** | **4** | 5 | **LOW** |Saved venue configs. Low priority until we scale to many venues. |
| **Native Mobile App** | **3** | 10 | **LOW** | *Abandoned for now.* Native rewrite is high effort. **PWA** strategy (Complexity: 2) is sufficient and much faster. |

---

## 5. Development Plan (Sequenced)

### Phase 1: The "Stability Fix" ✅ COMPLETE
1.  ✅ **CI/CD Migrations:** Modify `package.json` `start` script.
2.  ✅ **PyInstaller Matrix:** Create `.github/workflows/build-desktop.yml`.
3.  ✅ **Desktop Offline Queue:** Implement `PendingUpdateQueue` in `useLiveSession.ts`.

### Phase 2: The "Launch Polish" ✅ COMPLETE
1.  ✅ **Ghost Data Fix:** Add normalization logic in `packages/shared`.
2.  ✅ **QR Codes:** Switch to dynamic generation based on environment.
3.  ✅ **Landing Page:** Design & implement "How it works".
4.  ✅ **"Thank You" Rain:** Confetti feedback system implemented.

### Phase 2.5: The "Security Hardening" 🔐 **CURRENT**
*Added after Jan 2026 Security Audit. Must complete before launch.*

1.  [ ] **CORS Restriction:** Update `packages/cloud/src/index.ts` line 24:
    ```typescript
    app.use("*", cors({
      origin: ["https://pika.stream", "https://api.pika.stream"],
      credentials: true,
    }));
    ```
2.  [ ] **Rate Limiting:** Install `hono-rate-limiter` and protect auth routes.
3.  [ ] **Secrets Migration:** Move `POSTGRES_PASSWORD` to `.env` file.
4.  [ ] **Email Validation:** Update registration to use Zod `.email()`.

### Phase 3: The "Account Era" (Post-Launch)
1.  **Auth.js Setup:** Scaffolding for Dancer/DJ login.
2.  **Redis:** Migration of state.

### Phase 4: Code Quality Sprint (Post-Launch)
*Recommendations from Jan 2026 Engineering Assessment. Score: 8.4/10.*

1.  [ ] **Split Cloud Backend:** Decompose `index.ts` into `routes/` and `services/`.
2.  [ ] **Add E2E Tests:** Cover critical user paths.
3.  [ ] **Decompose Hooks:** Split `useLiveSession.ts` into smaller hooks.

---

## 6. Changelog

| Date | Change | Context |
| :--- | :--- | :--- |
| **2026-01-13** | Added Security Hardening Phase 2.5 | Security Audit identified 2 High, 4 Medium issues. CORS and Rate Limiting are blockers. |
| **2026-01-13** | Added Code Quality Phase 4 | Engineering Assessment (8.4/10). Decomposition and testing recommendations. |
| **2026-01-13** | **Release v0.1.5 (Launch Candidate)** | Implemented "Thank You" Rain, Auto-Migrations, and Critical Security Hardening. |
| **2026-01-13** | Added Security Hardening Phase 2.5 | Security Audit identified 2 High, 4 Medium issues. CORS and Rate Limiting are blockers. |
| **2026-01-12** | Added "Native App" as Low Priority | User prefers PWA approach over full React Native rewrite. |
| **2026-01-12** | Added "Account System" as Phased | See `blueprints/account-system-vision.md` for iterative plan. |
| **2026-01-12** | Created Document | Initial prioritization of roadmap items. |
