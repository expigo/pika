# Pika! Changelog (development log)

Completed work, newest first — moved out of [ROADMAP.md](ROADMAP.md) so the roadmap stays a
roadmap. Each block was appended at completion time; see git history for the precise diffs.

*   **Recent Completions (July 2026 — Dancer Journal + Accounts, Slices A/B):**
    *   ✅ **Journal Slice A** — dancer Journal read (paginated, real totals, retro-enriched with
        DJ/session), 1-tap Spotify export (link-only playlists, adopt/cooldown/daily-budget guards),
        post-hoc like removal (A.1), product telemetry (`journal_*` events).
    *   ✅ **Journal Slice B — durable dancer identity.** Optional **magic-link accounts** (Resend;
        keyless dev logs links), `dancer` role auto-approved via credential-absence hook; **`hasDjAccess`
        guard tightening** (approved-but-wrong-role → 403, incl. WS `REGISTER_SESSION`); lazy
        **`client_identities`** claim map (migration 0012; first-claim-wins, 409 → rotate — kiosk rule;
        sign-out rotates; push/stage subs carried across rotation); **account journal** (union read
        de-duped by play, account-wide unlike, adopt-first playlist export); web `/my-likes/save`,
        account card + upsells, ITP nudge repointed; **GDPR deletion** (email-confirmed, cascade unlink,
        privacy page section). See `architecture/auth-system.md`.
    *   ✅ **Slice B post-review hardening** — transactional-email throttle (per-address silent-skip,
        `MAIL_DAILY_CAP` fuse, Better Auth per-IP `customRules` keyed on `cf-connecting-ip`); clientId
        masked in logs; zero-like empty state keeps account controls reachable.
    *   ✅ **v0.6 wedge groundwork** (pre-Slice-A): web-broadcast wedge (unshare toggle, auto-playlist,
        plays→catalog), set-playlist sync to public profile + recap, DJ profile management
        (publish-toggle + embedded playlists), desktop library filters, mobile-wedge E2E.
*   **Recent Completions (June 2026 — Spotify Catalog + Better Auth):**
    *   ✅ **Better Auth** adopted as the cloud auth authority (credential + session + bearer + admin
        plugin + approval gate), replacing the custom bcrypt/token auth. See `blueprints/auth-foundation.md`.
    *   ✅ **B3 DJ-assist** (VDJ→Spotify playlist) + **Exportify CSV importer** → `spotify_track_features`.
    *   ✅ **Songs Catalog** (web `/admin/catalog`: distributions, cross-DJ overlap, per-song browser) +
        first-class `curated_playlists`.
    *   ✅ **Desktop feature display** — canonical Spotify features beside the Pika sidecar radar (all surfaces).
    *   ✅ **Pika consensus** — `played_tracks.match_key` → `track_links` join populates the catalog's Pika side.
        See `architecture/music-data-model.md`.
    *   ✅ **Test + docs chore** — `+~120` tests (catalog/auth integration, desktop feature tests, Python
        sidecar pytest), coverage tooling, docs sweep. See `TEST_AUDIT_2026_06_30.md`.
*   **Recent Completions (Feb 4, 2026 - v0.5.0 Release):**
    *   ✅ **CORS Mitigation:** Implemented native `apiClient` to bypass browser restrictions.
    *   ✅ **History Sync:** Fixed race conditions with deferred sync and reliable batching.
    *   ✅ **Security:** Hardened fingerprint sync with auth & ownership checks.
    *   ✅ **Docs:** Updated architecture guides for Go Live flow and Security.
*   **Recent Completions (Feb 1, 2026 - v0.5.0 Technical Audit):**
    *   ✅ **Realtime Audit:** Verified ACK/NACK reliability protocol and 64KB backpressure protection.
    *   ✅ **Performance Audit:** Verified "Zero-Wakeup" architecture and 22,050Hz analysis downsampling.
    *   ✅ **Security Audit:** 100% verification of Zod validation, CSRF headers, and Sentry PII scrubbing.
    *   ✅ **Onboarding Spec:** Created `SPEC.md` as the authoritative technical reference for devs/agents.
*   **Previous Completions (Jan 29, 2026 - Go Live Refactor v0.5.0):**
    *   ✅ **UX Consolidation:** Unified "Start Session" flow replaces multiple fragmented modals.
    *   ✅ **VDJ Bridge:** Automated history detection with "Seamless Transition" validation.
    *   ✅ **Integrity:** Sequential initialization logic eliminates race conditions on session start.
    *   ✅ **Testing:** 100% coverage for connection lifecycle and history import logic.
*   **Previous Completions (Jan 28, 2026 - Excellence Hardening v0.5.0):**
    *   ✅ **Security:** CSP Externalization (defeat production build blocks).
    *   ✅ **Social:** Intelligent "Missed Love" buffer for backgrounded app engagement.
    *   ✅ **Design:** Symmetrical animation framing (curated left/right columns).
    *   ✅ **Integrity:** Idempotent "IF NOT EXISTS" migrations + cascading DB deletes.
*   **Previous Completions (Jan 25, 2026 - Performance Hardening v0.5.0):**
    *   ✅ **H1 (Battery):** Visibility-aware polling in Live Lobby (pauses in background).
    *   ✅ **H2 (Sync Blocking):** Deferred localStorage hits via event loop yielding.
    *   ✅ **H3 (Caching):** Integrated SWR for O(1) track history deduplication.
    *   ✅ **H4 (Economy):** Memoized stable handler trees for all feature hooks.
*   **Recent Completions (Jan 24, 2026 - Observability v0.5.0):**
    *   ✅ **C1 (Monitoring):** Cloud, Web, and Desktop Sentry integration.
    *   ✅ **Privacy (PII):** Mandatory scrubbing of cookies, headers, and IP addresses.
    *   ✅ **Tracing:** 10% sampling rate implemented for transaction profiling.
*   **Recent Completions (Jan 23, 2026 - Production Ready v0.5.0):**
    *   ✅ **Sprint 0 (Battery & Security):** Fixed continuous RAF loop (B1), verified CSRF (S1), confirmed Reduced Motion (B2)
    *   ✅ **Sprint S0-S5 Complete:** All 150+ issues resolved with code verification
    *   ✅ **Security Hardening (Phase 1):**
        *   **S1 (DoS):** Rate limit middleware rejection (429)
        *   **S2 (Spoofing):** WebSocket ClientID locking
        *   **S3 (Memory):** Poll question length cap (500 chars)
        *   **S4 (XSS):** DJ name regex sanitization (`^[^<>"']+$`)
    *   ✅ **Performance Optimization:** 9 database indexes, batch operations, transaction handling
    *   ✅ **Schema Validation:** All string/numeric constraints enforced
    *   ✅ **Test Coverage:** 612+ tests passing (exceeded 442 target by 38%)
    *   ✅ **Documentation:** ROADMAP_11_10.md with code references for all fixes
*   **Previous Completions (Jan 22, 2026 - Audit Fixes v0.5.0):**
    *   ✅ **Like Attribution Fix (A2):** Per-track like counting with `Map<playId, count>`
    *   ✅ **Batch DB Writes (A3):** `incrementDancerLikesBy()` method
    *   ✅ **Token Revalidation (U1):** Hourly periodic validation + focus-based revalidation
    *   ✅ **goLive Decomposition (U3):** 44% reduction (219→122 lines)
*   **Previous Completions (Jan 22, 2026 - Cloud Robustness v0.5.0):**
    *   ✅ **Modular Handlers:** 16 WebSocket handlers extracted to `handlers/` directory.
    *   ✅ **REST Route Modules:** 4 route files (sessions, stats, dj, client) extracted.
    *   ✅ **Type-Safe Validation:** `parseMessage<T>()` replaces all `as any` casts.
    *   ✅ **Error Isolation:** `safeHandler()` wrapper prevents WS connection crashes.
    *   ✅ **Graceful Shutdown:** SIGTERM/SIGINT handlers broadcast and end sessions.
    *   ✅ **Poll Timer Cleanup:** Timers cancelled on manual end/cancel.
    *   ✅ **Event-Based Coordination:** `waitForSession()` replaces busy-wait loops.
    *   ✅ **Lib Modules Tracked:** Fixed .gitignore, 16 source files now tracked.
    *   ✅ **Test Coverage:** 179 tests (up from 58).
*   **Previous Completions (Jan 18, 2026 - Safari/iOS Bulletproofing v0.5.0):**
    *   ✅ **Safari bfcache:** pageshow listener for cache restoration.
    *   ✅ **Status Sync:** Periodic sync between socket readyState and React state.
    *   ✅ **addEventListener Pattern:** Proper cleanup to prevent memory leaks.
    *   ✅ **Track Deduplication (Cloud):** Skip duplicate BROADCAST_TRACK persistence.
    *   ✅ **PING/GET_SESSIONS Handlers:** Explicit handlers in switch statement.
    *   ✅ **MESSAGE_TYPES Consolidation:** Single organized object in shared.
    *   ✅ **Tailwind Dynamic Classes Fix:** Explicit class strings for tempo buttons.
    *   ✅ **Poll Presets (Desktop):** Common DJ poll templates.
    *   ✅ **SocialSignalsLayer (Web):** Visual crowd feedback animations.
*   **Previous Completions (Jan 18, 2026 - Network Resilience 11/10 v0.5.0):**
    *   ✅ **Hook Decomposition:** `useLiveListener` split from 1029→238 lines (77% reduction).
    *   ✅ **Shared Utils:** Extracted `lib/api.ts`, `lib/client.ts` from 4 files.
    *   ✅ **Dynamic Imports:** QR code lazy loaded (~30KB saved).
    *   ✅ **Accessibility:** ARIA labels, skip-to-content, reduced-motion CSS.
    *   ✅ **Error Handling:** Error boundary for live session pages.
    *   ✅ **Loading States:** Route loading skeletons for `/live`, `/analytics`.
*   **Previous Completions (Jan 18, 2026 - Security & Schema Hardening v0.5.0):**
    *   ✅ **Tauri CSP:** Enabled Content-Security-Policy in desktop app.
    *   ✅ **Auth Validation:** Password max length (128), Zod email validation.
    *   ✅ **DB Performance:** 12 new indexes on hot query paths.
    *   ✅ **Schema Integrity:** CASCADE deletes, CHECK constraints (BPM 20-300, metrics 0-100).
    *   ✅ **Cloud Tests:** 15 unit tests for auth routes.
    *   ✅ **Code Decomposition:** Extracted auth routes module (~300 lines).
*   **Previous Completions (Jan 18, 2026 - Production Hardening):****
    *   ✅ **Modular Layout:** Extracted `useLayoutResizer` hook for independent workspace dragging.
    *   ✅ **Stable Engine:** Fortified `useSidecar` with idempotent kill protocol to prevent zombie processes.
    *   ✅ **Playlist Retrieval:** Restored professional `SaveLoadSets` interface into the Crate header.
    *   ✅ **Theme Reactivity:** Synchronized `data-theme` on document root for instant profile switching.
*   **Previous Completions (Jan 17, 2026 - Production Readiness):**
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
