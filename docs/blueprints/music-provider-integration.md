# Blueprint: Music Provider Integration (Spotify / Apple Music)

**Status:** Research complete, design draft — NOT scheduled for implementation.
**Author:** Lead eng research pass, June 2026. Track A design decisions resolved (§7); spike
scoped (§8). Track D (web DJ broadcaster) added; "can't we do both?" answered (§3a); Track D
design resolved (§3b). Tracks B/C still need a full discussion pass.
**Supersedes:** `spotify-integration-vision.md`, `archive/005-OLD-spotify-playlist.md` (both
assume a DJ-OAuth playlist-export model that Spotify's Feb 2026 changes have made unshippable —
see §2).

> This doc preserves the research so it isn't lost. The three tracks below are **options to be
> debated at implementation time**, not a committed plan. Read §1–§3 before touching code.

---

## 1. TL;DR — the strategic inversion

The historically-planned feature ("DJ connects Spotify, Pika auto-exports the setlist as a
playlist on the DJ's account") is **no longer viable as a product** because of Spotify's Feb 2026
Developer Mode changes (§2). Research reordered the options by *viability × value for Pika's
actual reality*:

| # | Track | Auth model | Solves matching? | Viability | Audience |
|---|-------|-----------|------------------|-----------|----------|
| **A** | **Spotify "Now Playing" source** | 1 user OAuth (the DJ, reading playback) | **Yes — provider tells us the exact track** | **High** | DJ + dancers |
| **B** | **Dancer-facing "Listen on" links** | App-level (Client Credentials / Apple Developer Token) | Partial (search + fuzzy ladder) | Medium–High | Dancers |
| **C** | **DJ playlist export** | 1 shared Pika-owned service account | Partial | Low–Medium (ToS-fragile) | DJ |
| **D** | **Web DJ (Spotify-source broadcaster via BFF)** | 1 user OAuth (server-side, httpOnly) | **Yes — same as A** | **High** | DJ (phone/laptop, no install) + dancers |

**A and D are two front-ends of one "Spotify Source" capability** over the same cloud relay —
desktop (A, local keychain token) and web (D, server-side BFF token). See §3a for "can't we just
do both?".

**Recommended first spike:** Track A. It's small, it kills the matching problem entirely, and it
directly serves the "I DJ from Spotify during training" use case. For the *Spotify-source* use
case specifically, **Track D (web) is the higher-UX target** (phone + no install) and likely the
better *first ship* — A's real sibling is VirtualDJ; D's job is exactly this.

---

## 2. Hard constraints (validated June 2026 — do not re-derive)

### Spotify (Feb 2026 Dev Mode changes — already in effect)
- **Development Mode caps an app at 5 authenticated (OAuth) users**, allowlist required; the app
  owner must hold **Spotify Premium** for the app to function. New client IDs get these rules.
- **Extended Quota** (the only way past 5 users) requires a **legally registered business +
  launched service + ≥250k MAU**. Pika! cannot qualify. Treat the 5-user OAuth cap as permanent.
- **The cap is on OAuth (user) flows only.** Server-side **Client Credentials** (app token) hits
  non-user endpoints like `/search` and is **not** user-capped (rate-limited only).
- Endpoint rot vs. the old docs: `POST /users/{id}/playlists` **removed** → `POST /me/playlists`;
  `/playlists/{id}/tracks` → `/playlists/{id}/items`; search `limit` max dropped 50 → 10.
- **Premium ≠ unlimited search.** Premium satisfies the owner-functional rule only; it does not
  raise rate limits. Caching (see §5) makes volume a non-issue regardless.
- **Reading playback** (`GET /me/player/currently-playing`, scope `user-read-playback-state`)
  does **not** require Premium; only *controlling* playback does.

### Apple Music (MusicKit)
- Catalog search + ISRC lookup (`GET /v1/catalog/{storefront}/songs?filter[isrc]=…`) need only an
  app-level **Developer Token** (ES256 JWT, ≤6 mo, signed with a MusicKit key) — **no per-user
  cap**. Returns `attributes.url` + `attributes.playParams`. Only cost: **$99/yr Apple Developer
  Program**.
- Per-user library/playlist writes need a **Music User Token** (MusicKit JS in a webview) —
  harder in Tauri, but uncapped.
- **No public "currently playing" web API.** A Track-A equivalent would require macOS-native
  scripting (AppleScript/ScriptingBridge or the private MediaRemote framework). Out of scope for v1.

### ISRC reality (measured against the real library)
- Scanned `/Users/kryspin/Music`: **0 of 42 non-WAV music files carry an ISRC** — including
  commercial releases. **Reading ISRC from local file tags is a dead end for this library.**
- Even when present, an ISRC identifies one *recording*; re-masters/territories get different
  ISRCs, and indie/live WCS tracks often were never assigned one.
- **Conclusion:** ISRC is a fast-path *tier*, never the foundation. Matching must always fall
  through `ISRC (if available) → exact artist+title → fuzzy (strip parentheticals) → miss`.

---

## 3. The three tracks in detail

### Track A — Spotify "Now Playing" source  ⭐ recommended spike

**Idea:** A new ingestion source alongside `virtualDjWatcher`. When the DJ plays from Spotify,
Pika polls the Player API and broadcasts exactly what Spotify reports.

- **Why it's strong:** Spotify returns the **exact track + Spotify ID + ISRC + album art +
  progress**. The matching problem (Q1/Q2/Q4) *disappears* — no guessing. "Listen on Spotify"
  links become trivial. For a Spotify-DJ this is more reliable than the M3U/file-tag path.
- **Auth:** Authorization Code + PKCE, scope **`user-read-currently-playing`** (least privilege —
  grants only the currently-playing item; `user-read-playback-state` is the broader full-player
  scope we do NOT need). This is the DJ's own account = **1 of the 5 OAuth seats**. Fine for
  personal/small use; does NOT scale to many DJs on one Spotify app (each is a seat). For a single
  owner (you) it's free of friction. Reading playback needs **no Premium**.
- **Where it runs:** Desktop. Polls `GET /me/player/currently-playing` (~ every 3–5 s, visibility-
  aware like the existing watcher), dedups via the existing 60 s window / 2 min interval logic,
  emits into the same `BROADCAST_TRACK` pipeline.
- **Rate limits:** rolling 30 s window, lower in Dev Mode, `Retry-After` on 429. Our load is
  ~6–10 calls / 30 s — trivially safe. Stop polling when `is_playing` is false or app backgrounded;
  honour `Retry-After`.
- **What this unlocks for dancers (new vs. the VDJ path):** album **artwork**, a live **progress
  bar** (`progress_ms / duration_ms`), and a **"Listen on Spotify"** button (`external_urls.spotify`,
  ID already in hand). ⚠️ `preview_url` is **dead** (Spotify nulled it for API apps Nov 2024) —
  no in-app 30 s preview clips.
- **Token storage:** refresh token must persist. ⚠️ Settings today live in **localStorage**
  (`settingsService.ts`), and there is **no OS-keychain plugin** in `Cargo.toml`. A long-lived
  OAuth refresh token in localStorage is a real risk → end state is `tauri-plugin-keyring`
  (macOS Keychain / Windows Credential Manager / Linux Secret Service — multi-OS; Linux needs a
  secret-service daemon, **Stronghold** is the dependency-free encrypted-file fallback). **Open
  decision:** harden now, or store in the existing settings path for the spike and harden before
  it ships.
- **Networking:** Spotify hosts are absent from both the Tauri **CSP `connect-src`** and the
  **`http` capability allowlist** (`capabilities/default.json`). Calls must go through
  `tauri-plugin-http` (Rust-side, bypasses webview CSP, mirrors `apiClient`), and the allowlist
  must add `https://api.spotify.com/*` + `https://accounts.spotify.com/*`.
- **Redirect URI (resolved):** loopback `http://127.0.0.1:<port>/callback` — HTTP is permitted on
  loopback. Must be the **literal `127.0.0.1`**; **`localhost` is banned** by Spotify. For a
  dynamic port, register the loopback **without a port** and supply it at auth time. A throwaway
  Rust-side local server catches the `?code=`. No deep-link plugin needed.
- **Usage fit (resolved):** the "only sees one Spotify stream, bad for mixing" risk **evaporates**
  for social-dance communities — they play **one song at a time, full duration, no crossfade**
  (owner-confirmed). Track changes are clean and discrete; the progress bar is accurate; dedup is
  trivial. For these communities Spotify-source could even be the **primary** input, not just a
  sibling to the VDJ watcher (same `BROADCAST_TRACK` seam either way). **Open decision:** primary
  vs. sibling mode.

### Track B — Dancer-facing "Listen on" links

**Idea:** Each played track shows "Listen on Spotify / Apple Music" on the **live** and **recap**
pages. No dancer or DJ OAuth.

- **Auth:** Spotify via **Client Credentials** (app token, server-side, uncapped); Apple via the
  **Developer Token** (app-level). Both are app-level → no 5-user wall.
- **Where it runs:** **Cloud** (not Desktop, unlike the old 005 doc) — keeps secrets server-side,
  serves dancers, centralizes the cache (§5). New `routes/links.ts` or a resolution service in
  `lib/services/`.
- **Matching:** the ladder from §2; for this library ISRC is usually absent so it's exact+fuzzy.
  Misses are expected for the indie long tail — surface gracefully ("no link found").
- **Schema seam:** see §4.
- **Cost gate:** Apple side needs the $99/yr program. **Decision required:** Spotify-links-only,
  or both.

### Track C — DJ playlist export (single shared service account)

**Idea:** Ship the original "export setlist as a playlist" by having **Pika own one Spotify
account**. Pika authorizes it once (1 OAuth seat) and creates *every* DJ's playlist under that
account, named `"{DJ} @ {Event}"`, then shares the link.

- **Why this and not per-DJ OAuth:** per-DJ OAuth hits the 5-user wall; collaborative playlists
  need each collaborator to OAuth (same wall); a playlist has exactly **one owner** — multi-author
  is impossible. One service account sidesteps all of it at 1 seat.
- **Endpoints (current):** `POST /me/playlists`, then `POST /playlists/{id}/items` (batch ≤100).
- **Risks / tradeoffs:** (a) playlists live in Pika's library, **DJs don't own them**; (b)
  automated playlist creation at volume from one account risks Spotify **anti-abuse/ToS** action;
  (c) needs the resolution service from Track B. Lowest priority; revisit only if A/B land.

### Track D — Web DJ (Spotify-source broadcaster via BFF)

**Idea:** Extend the DJ experience beyond the desktop app. The DJ logs into **pika.stream**
(phone or laptop, no install), connects Spotify, taps **Share** — Pika broadcasts their Spotify
now-playing to dancers. V1 = log in + connect + share/stop. This is the **higher-UX expression of
Track A** for the Spotify-source case (it's the *only* one that works from a phone).

**Two technical facts force the architecture (validated June 2026):**
1. **Spotify's token endpoint (`accounts.spotify.com/api/token`) does not allow CORS** → the PKCE
   code→token exchange **must** be server-side. (Data endpoints `api.spotify.com/v1/*` generally
   do allow browser CORS, but the token step alone forces a backend.)
2. **Browsers throttle background tabs** (timers ~1/min; Pika's own polling is visibility-aware and
   *pauses* when hidden). But the whole premise is the DJ is doing something else (playing music)
   while Pika sits in the background → **a backgrounded tab cannot reliably poll.**

⇒ A *pure client-side* web mode is both partly impossible (token) and unreliable (throttling). The
viable shape is a **Backend-For-Frontend (BFF)**:

- **Cloud completes the OAuth** (Authorization Code + PKCE, HTTPS redirect `https://pika.stream/…`),
  stores the refresh token **server-side** (httpOnly session cookie to the browser; token encrypted
  at rest / secret-manager), and runs a small **per-live-session server-side poll loop** against
  `currently-playing`, broadcasting through the **existing relay**. DJ can close the tab / lock the
  phone — "set and forget".
- **Reuses:** WebSocket relay, `dj_users`/`dj_tokens`, sessions, recap, the §4 schema seam, §5 cache.
- **Net-new surface:** a **web DJ login**, a **web broadcaster role** (today web only *listens*),
  Spotify OAuth via BFF, and the server-side poll loop. This is a small feature *area*, not a spike.

**Security reconciliation (vs. Track A's keychain-first):** *not* a contradiction. The principle
is "store the token in the most secure location **available to that client**." Desktop has an OS
keychain and the cloud doesn't need the token → keep it local (Track A, §7). Web has no keychain;
the realistic choice is XSS-exposed browser storage vs. server-side httpOnly+encrypted — there
**BFF is the *more* secure option**, and the cloud genuinely needs the token to poll a closed tab.
Same principle, per-platform policy, defensible.

**Caveats:** the **5-user OAuth cap still applies** — web doesn't escape it (each connected Spotify
account = 1 of the app's 5 seats, desktop or web). Personal / small-local-community feature until
Spotify access changes. Plus a tiny always-on cloud cost (one request / 3–5 s per live web-DJ).

### §3a — "Can't we just do both?" (A + D)

**Yes — and that's the natural end state, not a fork.** A and D are two doors into the same room:
identical downstream (`BROADCAST_TRACK` → relay → dancers), identical Spotify scope
(`user-read-currently-playing`), differing only in **where the token lives** (desktop keychain vs.
cloud BFF) — which we've already decided is a deliberate **per-platform policy**, not a conflict.

- **Same DJ on both surfaces ≠ two seats.** The 5-user cap counts distinct Spotify *accounts* on
  the allowlist, so a DJ who connects on desktop *and* web is still **1 seat**.
- **No double-broadcast:** a DJ has one live session at a time and the source is chosen per
  session, so exactly one surface drives a given broadcast. (Guard: refuse a second "go live" while
  one is active — the relay already keys sessions per DJ.)
- **Sequencing, not exclusivity:** you don't need both for V1. Pick by dominant use. The motivation
  here (phone, no install, set-and-forget) points at **D first**; **A** follows for DJs already in
  the desktop app (VDJ context) who want a Spotify toggle. Shipping D first does **not** waste A —
  they share the schema seam (§4), the cache (§5), and the now-playing→`TrackInfo` normalization +
  poll cadence. (The **OAuth flows differ** and are *not* shared: web = confidential client / secret
  / HTTPS redirect; desktop = public client / PKCE / 127.0.0.1 loopback.)

**Recommendation:** treat "Spotify Source" as one capability; build **D (web BFF) first**, add **A
(desktop)** as the second front-end. Both, eventually — D leads.

### §3b — Track D resolved design (June 2026 discussion)

Grounded in the current code (`handlers/dj.ts`, web `app/dj/login`, `middleware.ts`):

- **Reuse the broadcast path via an extracted core, not `publish`-direct.** `handleBroadcastTrack`
  is socket-coupled (`WSContext` → `rawWs`, `messageId` nonce, `state` ownership, backpressure) so
  the poller can't call it as-is. Extract a context-free **`applyNowPlaying(sessionId, track)`**
  core (tempo-persist-on-change → `updateSessionTrack` → publish `NOW_PLAYING` → `persistTrack`).
  The WS handler keeps its wrapper and calls the core; the poller calls the core and publishes via
  **`getBroadcaster().publish()`** (already used in `lifecycle.ts` when no DJ socket exists). One
  source of truth, no drift.
- **Artwork is a schema addition, orthogonal to publish-vs-handler.** Add optional **`albumArtUrl`**
  to `TrackInfoSchema` / `NOW_PLAYING` (see §4). Spotify-source always populates it; VDJ/local
  source leaves it empty. `publish`-direct would *not* have unlocked artwork — the schema does.
- **Web session = httpOnly + Secure + SameSite cookie** (NOT bearer-in-localStorage). The DJ token
  grants "broadcast as me" and sits next to the high-value Spotify link → XSS *exfiltration* must
  be impossible. Cloud gains a session layer accepting **either** `Authorization: Bearer` (desktop,
  unchanged) **or** the session cookie (web); the token-copy flow stays for desktop pairing. CSRF
  via the existing `X-Pika-Client` header + SameSite. Web already ships a CSP (`middleware.ts`) —
  defense-in-depth is in place, and in the BFF model the **web CSP needs no Spotify hosts** (the
  browser only talks to pika.stream; the cloud calls Spotify).
- **Sensitive-data inventory (small):** DJ email + bcrypt hash, DJ bearer token, **Spotify refresh
  token** (crown jewel, server-side only, encrypted at rest, never to the browser). Dancer side is
  anonymous (`clientId`, likes, tempo) — low sensitivity. No payments/addresses.
- **Manual account approval — in.** Add `status: pending | approved` to `dj_users`; login refuses
  `pending`; approve manually. Fits reality (can't onboard >5 Spotify DJs anyway), gates who can
  broadcast on the relay, suits a curated pilot, cheap + reversible. Build it as part of D's auth.
- **The three playback states (this is the UX):** **live+playing** → emit `NOW_PLAYING`;
  **live+paused** (`is_playing:false` *or* manual "pause sharing") → stop emitting, dancers see a
  **"between songs"** state (NOT the last track frozen), session + poller **stay alive**, auto-resume
  on playback; **stopped** → session ends, poller torn down. "Pause" = temporary quiet, session
  alive; "stop" = end.
- **V1 privacy feature set (requirements, not nice-to-haves):** (1) opt-in, never auto-start;
  (2) explicit consent at Connect; (3) persistent unmissable **LIVE** indicator + one-tap Stop;
  (4) **auto-pause** broadcast on `is_playing:false`; (5) **idle auto-end** after ~30 min idle;
  (6) **mirror view** of exactly what dancers see. Out of V1: per-track hide, scheduled sharing,
  allow/deny lists.
- **DJ control channel is the real net-new surface.** The web DJ needs an authenticated channel
  (REST or a DJ WS) to start/stop the session and toggle Share — needed regardless. **Likes +
  tempo come free** (dancer→session, source-agnostic). **Polls are deferred** — they're DJ-*authoring*
  UI that web lacks entirely + the poll handlers are WS-context-coupled like `handleBroadcastTrack`.
  Polls later ride the control channel once it exists.
- **Poller multi-instance readiness:** even single-instance now (Redis deferred), give the
  active-session table a **lease/heartbeat** column so only one instance owns a poller — design it
  in now to avoid a repaint when scale-out happens.

---

## 4. Schema changes (shared seam for A + B + C + D)

Today **nothing** carries external IDs. Add (all additive / optional, flows through the existing
broadcast pipe untouched):

- `packages/shared/src/schemas.ts` → `TrackInfoSchema`: optional `isrc`, `spotifyUrl`,
  `spotifyId`, `appleMusicUrl`, **`albumArtUrl`** (Spotify-source populates art; VDJ/local leaves
  it empty). The `NOW_PLAYING` payload carries these through unchanged.
- `packages/cloud` `played_tracks` + `packages/desktop` `tracks`: same optional columns
  (`db:generate` migrations, commit the SQL — see root CLAUDE.md "Adding a Column").
- `dj_users`: add **`status: pending | approved`** (manual approval gate, §3b).
- New cloud tables: **`spotify_connections`** (`dj_user_id`, `refresh_token_encrypted`, `scope`,
  `status`, …) and an **active-poller/session table** with a `lease`/`heartbeat` column (§3b).
- These are nullable/additive everywhere; a link-less / art-less track behaves exactly as before.

---

## 5. Resolution Memory — the persisted match cache (answers "remember what was played")

**The key reuse idea:** every resolution attempt is remembered once and shared across **all
sessions and all DJs**, so a given track is searched at most once, ever — and human corrections
compound in value over time.

New cloud table, e.g. `track_links`:

| column | purpose |
|--------|---------|
| `match_key` | normalized `artist::title` (reuse `shared/utils.ts` fuzzy key) — primary lookup |
| `isrc` | when known (from Track A playback, or a provider result) |
| `provider` | `spotify` \| `apple` |
| `provider_url`, `provider_id` | the resolved link/id |
| `status` | `matched` \| `unmatched` \| `manual` |
| `confidence` | 0–1 from the match tier |
| `resolved_at`, `source` | provenance (`auto` / `manual-correction` / `now-playing`) |

Why it matters:
- **Cache hits:** a track played by DJ A is instantly linked for DJ B — no re-search, no rate-limit
  pressure. The shared WCS canon is small and highly repeated, so hit rates will be high.
- **Remember the misses (your idea):** persisting `unmatched` rows means we don't re-search known
  misses, *and* we accumulate a **"needs-a-link" worklist**. That worklist powers a future
  **manual-correction UI** (DJ pastes the right Spotify/Apple URL once → status `manual` →
  benefits everyone forever). This is the "learn from corrections" loop the old 005 doc wanted,
  done globally instead of per-DJ.
- **Tracks A & D feed it for free:** now-playing gives the canonical Spotify **ID + URL** with no
  search at all. NOTE (Phase 0 spike, validated Jun 2026): the `currently-playing` item does **not**
  include `external_ids.isrc` (came back empty for real tracks) — so ISRC for *cross-provider*
  (Apple) matching needs a cheap follow-up `GET /v1/tracks/{id}` (the full track object has it),
  cached. Irrelevant to Spotify-only links, which use the direct URL/ID.
- Privacy note: this is track-identity metadata only (artist/title/links), not user data — safe
  to share across DJs.

---

## 6. Phasing (proposal, debate at impl time)

0. **Spike (1–2 d):** Track A — read now-playing on the owner account; confirm the payload is
   accurate/timely. Full scope in **§8**. De-risks both A *and* D (same Spotify read).
1. **Phase 1:** schema seam (§4) + `track_links` cache (§5) + Track B links on the **recap** page.
2. **Phase 2 — Spotify Source (D first):** web DJ login + broadcaster role + BFF OAuth + cloud-side
   poll loop ("Connect Spotify → Share" on pika.stream). Higher reach than A (phone + no install).
3. **Phase 3:** Track A — desktop Spotify source as the second front-end (keychain token, CSP/
   allowlist), reusing the shared OAuth/poll logic from Phase 2.
4. **Phase 4:** Track B links on the **live** page; manual-correction UI over the unmatched worklist.
5. **Phase 5 (optional):** Track C export via the shared service account — only if the above land.

## 7. Decisions

**Resolved (Track A discussion, June 2026):**
- ✅ **OAuth scope:** `user-read-currently-playing` (least privilege; not playback-state).
- ✅ **Redirect URI:** loopback `http://127.0.0.1:<port>` (literal IP; `localhost` banned),
  portless registration + port at auth time, throwaway Rust local server. No deep-link plugin.
- ✅ **Polling:** 3–5 s, visibility-aware, honour `Retry-After`; load is trivially within limits.
- ✅ **Dancer payload:** album art + progress bar + "Listen on Spotify"; no `preview_url` clips.
- ✅ **Usage fit:** one-song-at-a-time social dancing makes Track A high-reliability.

**Still open (owner's call):**
1. **Apple Music $99/yr** — in or out? (If out: Spotify-links-only for Track B.)
2. **Token storage** for Track A — harden with keyring/Stronghold now, or settings-path for the
   spike and harden before ship?
3. **Track A role** — *primary* input for dance communities, or a *sibling* mode beside the VDJ watcher?
4. **Priority** — for Spotify-source, **D (web) first** is recommended (phone + no install); A
   follows. Independently, Track B (dancer links) can lead if audience reach is the priority.
5. **Track D web DJ login** — confirm we want to add a DJ-facing login + broadcaster role to the
   web app (today web only listens). This is the main net-new surface area.
6. **Track C** at all, given ToS-fragility and DJs not owning the playlists?

## 8. Spike scope — "read my own now-playing" (Track A de-risk, ~1–2 days)

**One question to answer:** is the currently-playing payload clean and timely enough to drive a
"Now Playing" broadcast for one-song-at-a-time play? Everything else (UI, token hardening,
coexistence) waits.

**In scope:**
- Register a Dev-Mode Spotify app (owner Premium ✓), allowlist your own account, scope
  `user-read-currently-playing`.
- Minimal Authorization-Code-+-PKCE flow against `127.0.0.1` loopback (throwaway local server
  catches `?code=`). Token in the existing settings path — **no keychain yet**.
- Poll `GET /me/player/currently-playing` every 3–5 s via `tauri-plugin-http` (add the two
  Spotify hosts to the capability allowlist + CSP). Log `item.name`, `artists`, `album.images`,
  `external_ids.isrc`, `external_urls.spotify`, `progress_ms`, `duration_ms`, `is_playing`.
- Play ~10 tracks the way you do in training; eyeball: correct track? ISRC present? clean
  track-change detection? acceptable lag? sane behaviour on pause / between songs?

**Explicitly out of scope:** keychain/Stronghold, dancer UI, dedup integration with
`useLiveSession`, Track B/C, Apple Music, schema migrations.

**Success = go/no-go signal:** payload is accurate + timely → green-light Phase 2 with the §7
resolved decisions baked in. Payload is messy → we learned it in 2 days, not 2 weeks.

## 9. Touch-point index (where the work lands)

- Contract: `packages/shared/src/schemas.ts` (`TrackInfoSchema`).
- Cloud: `db/schema.ts` (`played_tracks`, new `track_links`), new `routes/links.ts` /
  `lib/services/resolution`, recap in `routes/sessions.ts`.
- Web (Track B): `app/recap/[id]/page.tsx`, `app/live/page.tsx`, `useLiveListener`.
- Web (Track D): web DJ login already EXISTS but is **token-copy only** (`app/dj/login` returns a
  bearer token to paste into desktop) — net-new is a real **session** + a **"Go Live / Connect
  Spotify / Share"** UI + the **DJ control channel** (start/stop/share). Cloud: BFF Spotify OAuth
  (confidential client — Auth Code + client secret, HTTPS redirect), `spotify_connections`
  (encrypted token, keyed to `dj_users`), an **httpOnly cookie session layer** (middleware accepts
  Bearer OR cookie), and a per-session server-side **poll loop** calling the shared `applyNowPlaying`
  core and publishing via `getBroadcaster()`. New `routes/spotify.ts` (callback) + `routes/dj-live.ts`
  (control channel) + `lib/services/spotifyPoller` (PG-persisted, lease/heartbeat, restart-resume).
- Cloud refactor (A + D): extract `applyNowPlaying(sessionId, track)` core out of
  `handlers/dj.ts:handleBroadcastTrack` (decouple from `WSContext`); add `albumArtUrl` to the
  `NOW_PLAYING` payload; add manual-approval check to `routes/auth.ts` login.
- Desktop (Track A): new source service mirroring `services/virtualDjWatcher.ts`, wired into
  `useLiveSession`; Tauri `capabilities/default.json` + `tauri.conf.json` CSP (add the two Spotify
  hosts); Rust-side loopback OAuth + poll via `tauri-plugin-http`; `Cargo.toml` `tauri-plugin-keyring`
  (or Stronghold) for token storage. No deep-link plugin (loopback redirect).
- Shared (A + D): extract the OAuth/poll/now-playing-normalize logic into `@pika/shared` so both
  front-ends reuse it.

---

## 10. Track D V1 — BUILT + E2E-VERIFIED (June 2026)

**Status: verified end-to-end** against a real Spotify account in a browser (login → connect →
go live → dancers see the track → pause shows "between songs" → resume → stop). Two follow-on
fixes landed during verification: `SESSION_PAUSED`/`SESSION_RESUMED` added to the shared schema +
web (`useLiveListener` `isPaused` → `LivePlayer` "between songs"); and dev-gated config so the
cookie+OAuth flow runs locally on 127.0.0.1 (CORS reflects localhost+credentials, web CSP allows
127.0.0.1 in dev, `WEB_BASE_URL` override). **Local-run gotchas:** Spotify bans `localhost`
redirects (use `127.0.0.1`); the registered Spotify redirect URI must exactly match
`SPOTIFY_REDIRECT_URI`; web + cloud must share the host (`127.0.0.1`) so the session cookie is
same-site; `WEB_BASE_URL` must match the web port.


The web-DJ Spotify-source backbone is implemented on branch
`worktree-music-provider-blueprint`. **Cloud:** migration `0002` (`spotify_connections`,
`live_pollers`, `dj_users.status`); `lib/crypto.ts` (AES-256-GCM); cookie session +
`requireDjAuth` + approval gate; `lib/services/spotify.ts` (BFF OAuth) + `routes/spotify.ts`;
extracted `lib/live-session.ts` (`createLiveSession`/`applyNowPlaying`); `lib/services/spotifyPoller.ts`
(pure `evaluateTick` state machine, auto-pause/idle-end/429/needs_reauth, boot reconcile +
shutdown teardown); `routes/dj-live.ts` (`/api/live`). **Web:** `lib/djLive.ts`, `app/dj/live`
dashboard (connect → go-live → LIVE controls + privacy copy + mirror), cookie login.
Tests: unit across every piece + gated real-Postgres integration for the new tables; full cloud
suite + web dual-runner green.

**Owner prerequisites before running:**
1. Register a Spotify app (Dev Mode, owner Premium). Redirect URIs: `…/api/spotify/callback` for
   each env. Scope `user-read-currently-playing`. Allowlist test DJs (≤5).
2. Cloud `.env`: `SPOTIFY_CLIENT_ID/SECRET/REDIRECT_URI`, `TOKEN_ENCRYPTION_KEY`
   (`openssl rand -base64 32`).
3. Approve a DJ: `UPDATE dj_users SET status='approved' WHERE email='…';`

**Manual E2E (staging):**
1. Register + approve a test DJ → web login at `/dj/login` (sets the httpOnly cookie) →
   "Go to Live Dashboard".
2. `/dj/live` → **Connect Spotify** → consent → back with `?spotify=connected`.
3. **Go Live** → play a track on Spotify → in a second browser (dancer) the track appears.
4. Pause Spotify → dancer sees the "between songs" (paused) state; resume → track returns.
5. **Stop** → session ends. Restart the cloud mid-session → confirm clean shutdown (V1 ends
   the session; the DJ re-taps Go Live — auto-resume is deferred).

**Known V1 limits (documented):** 5-user Spotify cap (invite-only); cross-restart auto-resume
deferred (schema's `live_pollers.lease`/`heartbeat` supports it later); ISRC absent from
now-playing (Spotify URL/ID used for links; Apple cross-match needs a `/v1/tracks/{id}` follow-up);
album art + progress + "Listen on" links are the V1.1 enrichment (schema seam `albumArtUrl` etc.).
