# Pika! Changelog (development log)

Completed work, newest first — moved out of [ROADMAP.md](ROADMAP.md) so the roadmap stays a
roadmap. Each block was appended at completion time; see git history for the precise diffs.

*   **Recent Completions (July 2026 — internal refactors: de-accretion wave, behavior-preserving):**
    *   ✅ **`routes/dj.ts` split** — the ~800-line DJ god-router split into a thin composer over
        five `routes/dj/` concern modules (profile · sessions · embeds · booth · identity).
        Behavior-preserving: every `/api/dj/*` path + method unchanged (the auth-guard unit test +
        the 101-test real-Postgres integration suite stayed green); `/me/*` composed before the
        `/:slug` param route (Hono registration-order priority).
    *   ✅ **`useLiveSession.ts` de-accretion** — `findOrCreateTrack` → `live/trackPersistence.ts`;
        `recordPlay` + its absolute-interval dedup state → `live/recordPlay.ts` + `live/playDedup.ts`
        (single owner of the reset lifecycle). The hook is an orchestrator again; new unit tests for
        both modules + the dedup guardrail stayed green. Follow-up: an older, diverged
        `findOrCreateTrack` still lives in `services/trackService.ts` (history-import path).
    *   ✅ **web `/my-likes` decomposition** — the 1,086-line page → a ~370-line composition root
        + colocated `useJournal` (fetch/pagination/removal/unlink; `setPlaylist` single writer),
        `useJournalExport` (writes back via `onExported`), AccountCard/JournalEntries/EmptyState/
        ExportCard, `types.ts`, `journal-utils.ts` (+10-test bun suite). The `reloadTick` refetch
        bus, landing-intent effect and dep arrays preserved verbatim; two-tap arm state (unlink/
        remove) relocated WITH its rendering components; `page.rtl.tsx` (22 tests) passed unedited.
        Deliberate leftover: the delete-account confirm JSX is duplicated in AccountCard/EmptyState
        (state is page-owned) — a tiny `DeleteAccountConfirm` follow-up candidate.
    *   ✅ **desktop `BuildPlaylistModal` extraction** — the 822-line modal → 224 rendering-only
        lines; all async flows (load/seed/art-backfill/serial-search, paste-link, re-match, create
        with `dj_confirmed` write-backs, share-to-profile, the cross-cutting 401/403 auth gate) →
        `hooks/useBuildPlaylist.ts` (mirrors the `useSpotifyMatcher` shape); row UI →
        `PlaylistRow.tsx`. New 19-case hook suite uses a real-`status` `PlaylistApiError` — the
        auth-gate path the RTL stub never exercised; `BuildPlaylistModal.rtl.tsx` (11) unedited.
    *   ✅ **Follow-up trio (2026-07-12)** — `DeleteAccountConfirm` now owns the two-tap delete
        pair (page keeps the `confirming` bit; both render sites dedupe to it);
        `spotifyMatchScore.ts` holds the pure ranking layer (sole import `getFuzzyKey`, no
        HTTP/DB → immune to the repo's `mock.module` leak; test file renamed with it);
        `routes/me.ts` → a thin composer over `me/journal.ts` + `me/relationship.ts`
        (`requireAuth` stays in the composer, registered before the mounts; one relationship
        file so follows/prefs/compat keep sharing the single `relationshipLimiter` budget).
        All moved bodies diff-audited byte-identical; `me.test.ts`, `db.integration.test.ts`
        and `page.rtl.tsx` untouched and green. Discovery: the integration suite can flake on
        rapid re-runs (real Spotify oEmbed calls + dev-DB state) — documented in the
        test-suite memory note; wait a few minutes before suspecting code.

*   **Recent Completions (July 2026 — Booth polish & DJ workspace, Slice D.1):**
    *   ✅ **DJ workspace split** — management (ProfileManager, BoothManager, PlaylistManager,
        Crowd-Pleasers) moved to a new **/dj/booth**; /dj/live is broadcast-only; persistent
        Booth ⁄ Broadcast pill-nav on both (all widths) + "View public →"; login CTA + /menu
        repointed; SW gains a `/dj/(booth|live)` NetworkOnly matcher (the /admin no-fallback
        failure mode).
    *   ✅ **Import → promote loop closed** — success banner gains a one-tap **"Show on Booth
        now"** (import ≠ publish had no affordance — five uploads could produce silent public
        nothing); below-floors DJs get a **"Signature progress."** panel ("12 of 20 tracks ·
        1 of 2 contexts" + next action) from owner-only `signatureProgress` on `/me/booth`.
    *   ✅ **Honest denominator v2** — per-context featured-track counts ("2 live sets
        (12 tracks) · 1 imported playlist (20 tracks)"), live-first attribution on overlap so
        the parts sum exactly to featuredTracks; the "3 live sets but 10 tracks" confusion is
        now stated on the card.
    *   ✅ **Signature radar** — dependency-free SVG plotting the p25–p75 band as a RING (never
        a single-value/median polygon — range-not-average doctrine); new optional
        `acousticness` band (omitted when the corpus has no values); 4 axes
        Energy/Dance/Mood/Acoustic.
    *   ✅ **Named embeds + one music section** — `dj_playlists.title` via the fixed-host Spotify
        **oEmbed** (migration `0016`; hardened fetch: parsed-id URL, `redirect:"error"`, 4s
        timeout, null on any failure; new per-DJ limiter on the paste route); external embeds
        merged INTO "Crates & Sets." as named collapsed rows ("Show Spotify player" is no longer
        a nameless button); `POST /api/admin/playlists/backfill-titles` (idempotent, audited)
        fills pre-D.1 rows.
    *   ✅ **Desktop layouts** — public Booth goes two-column at `lg:` (gigs as a sticky aside;
        per-item grid placement keeps mobile/screen-reader order exactly); /dj/booth two-column;
        /dj/live controls beside the dancer mirror. Admin DJ list now links each name to the
        public Booth.
*   **Recent Completions (July 2026 — Musical Identity, Slice D):**
    *   ✅ **DJ playlist import** — DJ-facing dual-CSV upload (Exportify/Chosic, client-parsed,
        header auto-detect) → `POST /api/dj/me/playlists/import`; provenance stays binary
        (`curated_playlists.source`) and imports NEVER touch `played_tracks`; per-user rate limit +
        track/playlist caps (existing names exempt so at-cap re-uploads still accrete); the global
        `track_links` spine is written in **fill mode** (`linkMode:"fill"` — never clobbers
        `manual`/`playlist`/high-confidence links other surfaces trust); manage/promote via
        `GET/PATCH/DELETE /me/curated-playlists` (`showOnBooth`, label, kind, Spotify URL —
        re-import preserves them). Exportify parser now carries "Album Image URL" → art on previews.
    *   ✅ **Signature** — the Booth's computed "what to expect" card
        (`lib/services/signature.ts`): percentile **ranges** (tempo/energy/danceability/valence) +
        era chips over distinct ids of ALL published live sessions ∪ promoted imports (strict
        trust gate on the live side); hard floors (20 featured tracks / 2 contexts → no card) and
        the load-bearing denominator line; `user.show_signature` hide toggle (default ON) with a
        private preview in the Booth manager; **one dial per surface** — `published`/`showOnBooth`
        gate Booth display and Signature input together. Migration `0015`.
    *   ✅ **Booth native playlists** — promoted playlists render natively (5-track previews with
        provenance badges "⚡ Played live on Pika" / "DJ's pick", "+N more", optional Spotify
        link); legacy iframe embeds collapse behind a "Show player" tap (was 24×352px of eager
        mobile weight).
    *   ✅ **Crowd-pleasers** — DJ-private floor-love leaderboard + totals on /dj/live
        (`GET /api/dj/me/crowd-pleasers`: likes-per-play across ALL own sessions,
        publish-agnostic).
    *   ✅ **Compatibility** — signed-in dancer↔DJ overlap card on the Booth
        (`GET /api/me/compat/:slug`: journal likes, snapshot-first resolution, vs the Signature's
        repertoire set; ≥3-overlap floor; per-viewer — never in the slug-cached payload).
    *   ✅ **Telemetry** — `playlist_imported`, `playlist_promoted`, `dj_stats_viewed`,
        `compat_viewed`.
*   **Recent Completions (July 2026 — The Relationship Loop, Slice C):**
    *   ✅ **Follow the DJ** — account-keyed `dj_follows` edge (composite PK absorbs repeats; GDPR
        cascade both directions); `PUT/DELETE/GET /api/me/follows` (+ next-gig join); FollowButton on
        lobby/live/recap/Booth; anonymous taps route through `/my-likes/save` with the intent riding
        the **callbackURL query string** (survives cross-device magic links; the signed-in early
        redirect forwards it too); "Your DJs" section on the account card.
    *   ✅ **The Booth** — the DJ page grows a bio + structured gig list (`dj_gigs`; public payload is
        upcoming-only — deliberately NOT an organizer model) + a toggle-gated public follower count
        (owner always sees their own); `BoothManager` editor on /dj/live; `djSlug` cached on
        `LiveSession` so live payloads (active-sessions, SESSION_STARTED, NOW_PLAYING, recap) carry
        the Booth path.
    *   ✅ **Night Recap** — morning-after sweep (15-min tick; 09:00–13:00 server-local send window;
        zombie-close every tick; **claim-then-send** exactly-once via `sessions.recap_processed_at`;
        72h floor = no first-deploy backfill); dancer recap email (personal likes + floor top 3) and
        DJ set digest (likes/dancers/thanks/new-followers) — BOTH strictly opt-in
        (`email_preferences` timestamps are the consent proof); **marketing throttle isolated** from
        the transactional sign-in fuse (`MARKETING_MAIL_DAILY_CAP`); RFC 8058 **one-click
        unsubscribe** (HMAC tokens, form+JSON-tolerant POST, GET 302s to the web confirm page);
        session-end interstitial (rendered from a pre-reset snapshot) + `session_thanks` one-tap
        applause; recap push bonus for installed PWAs; deterministic smoke via
        `POST /api/admin/recap/sweep`. Resend `Idempotency-Key` rides the HTTP request header.
    *   ✅ **Night Card** — client-canvas 1080×1920 story share image (album art via the pinhole
        `/api/img` proxy — i.scdn.co CORS is unreliable and would taint the canvas; QR → Booth);
        Web Share with files + download fallback.
    *   ✅ **Telemetry** — 10 new `product_events` (follow funnel, booth views, gig clicks, thanks,
        interstitial, cards, email prefs).
*   **Recent Completions (July 2026 — Dancer Journal + Accounts, Slices A/B):**
    *   ✅ **B.5 staging-feedback fixes** — email uniquifier (Gmail trimmed identical resends);
        **email OTP sign-in** for the installed PWA (separate cookie jar — links can't reach it;
        standalone defaults to the code flow, shared per-address send budget with the link);
        **device labels + per-device unlink** (`client_identities.label` UA-derived at claim,
        account card lists devices, owner-scoped non-destructive unlink).
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
