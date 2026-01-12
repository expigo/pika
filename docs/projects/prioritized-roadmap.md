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
| **Ghost Track Data Fix** | **8** | 4 | **DONE** | **Data hygiene.** `normalizeTrack` implemented in `@pika/shared`. |

---

## 2. ✨ MVP Polish (Launch Readiness)
*Focus: User Experience and First Impressions.*

| Feature | Value | Complexity | Priority | Notes |
| :--- | :---: | :---: | :---: | :--- |
| **Safe QR Codes** | **8** | 2 | **HIGH** | **Fixes UX.** Generate QRs pointing to public `pika.stream` URL, not local IP (unless in Bunker Mode). |
| **Poll State Sync Fix** | **7** | 5 | **MED** | Ensure late-joiners see the *active* poll state immediately (WIP issues). |
| **Landing Page "How-To"** | **7** | 3 | **MED** | Add visual section explaining to Dancers *why* they should scan the QR. |
| **Session Resume UX** | **6** | 3 | **MED** | Sticky `sessionId` in `localStorage` so refresh doesn't lose context. |
| **"Thank You" Rain** | **8** | 3 | **HIGH** | **User Delight.** Dancers click "Thank You" -> Confetti rains on DJ screen. End-of-night ritual. |

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

### Phase 1: The "Stability Fix" (This Week)
1.  **CI/CD Migrations:** Modify `package.json` `start` script.
2.  **PyInstaller Matrix:** Create `.github/workflows/build-desktop.yml`.
3.  **Desktop Offline Queue:** Implement `PendingUpdateQueue` in `useLiveSession.ts`.

### Phase 2: The "Launch Polish" (Next 2 Weeks)
1.  **Ghost Data Fix:** Add normalization logic in `packages/shared`.
2.  **QR Codes:** Switch to dynamic generation based on environment.
3.  **Landing Page:** Design & implement "How it works".

### Phase 3: The "Account Era" (Post-Launch)
1.  **Auth.js Setup:** Scaffolding for Dancer/DJ login.
2.  **Redis:** Migration of state.

---

## 6. Changelog

| Date | Change | Context |
| :--- | :--- | :--- |
| **2026-01-12** | Added "Native App" as Low Priority | User prefers PWA approach over full React Native rewrite. |
| **2026-01-12** | Added "Account System" as Phased | See `blueprints/account-system-vision.md` for iterative plan. |
| **2026-01-12** | Created Document | Initial prioritization of roadmap items. |
