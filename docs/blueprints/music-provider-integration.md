# Blueprint: Music Provider Integration (Spotify / Apple Music)

> **STATUS (June 30 2026): LARGELY BUILT + on staging.** Spotify side shipped — B3 DJ-assist playlist,
> Exportify **CSV importer** → `spotify_track_features`, the **Songs Catalog**, desktop **feature display**,
> and the **Pika consensus** join. The current, accurate description of what exists is
> **[architecture/music-data-model.md](../architecture/music-data-model.md)**. Apple Music remains future.
> This blueprint is retained for the strategy/decision record below.

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
5. **Phase 5:** Track C export via the shared service account. ~~(optional)~~ — Track B (B1) + D (B2)
   have landed, so this is now the **active next feature (B3)**. See **§12** for the resolved design
   (DJ-assist tool, two-granularity cache, account-as-config, "My Sets" dashboard).

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

## 11. Deploying Track D to staging / production

The compose env passthroughs (`SPOTIFY_*`, `TOKEN_ENCRYPTION_KEY`, `WEB_BASE_URL`) are already in
`docker-compose.staging.yml` + `docker-compose.prod.yml`. Migrations auto-run on boot
(`drizzle-kit migrate`), so `0002` applies on deploy — no manual DB step. The deploy itself is a
push to the `staging` (or `main` → prod) branch via the existing GH Actions workflows.

**Per-environment one-time setup (do BEFORE the first deploy, else "Connect Spotify" fails):**

1. **Spotify app** (dashboard → Settings → Redirect URIs) — add the env's callback **exactly**:
   - staging: `https://staging-api.pika.stream/api/spotify/callback`
   - prod:    `https://api.pika.stream/api/spotify/callback`
   And under **User Management**, allowlist each test DJ's Spotify account (Dev-Mode 5-user cap).
   The app owner must hold **Premium**.

2. **VPS `.env`** (the file the compose `${...}` reads) — add:
   ```
   SPOTIFY_CLIENT_ID=...
   SPOTIFY_CLIENT_SECRET=...
   SPOTIFY_REDIRECT_URI=https://staging-api.pika.stream/api/spotify/callback   # prod: https://api.pika.stream/...
   TOKEN_ENCRYPTION_KEY=<openssl rand -base64 32>     # NEVER rotate casually — invalidates all stored connections
   WEB_BASE_URL=https://staging.pika.stream            # prod: https://pika.stream
   ```
   `WEB_BASE_URL` is **mandatory** in both: staging/prod run `NODE_ENV=production`, so without it the
   OAuth callback bounces to the prod web URL.

3. **Deploy:** merge the branch → push to `staging` (CI builds GHCR images + redeploys; ~migration runs
   on boot). Verify `/health` is green and the cloud log shows migrations applied.

4. **Approve DJs:** on the env's DB — `UPDATE dj_users SET status='approved' WHERE email='…';`
   (until the admin UI exists). Then walk the §10 E2E against the env's `/dj/login`.

**Why no extra web/CORS/CSP work:** staging/prod already serve web + cloud on same-site
`*.pika.stream` over HTTPS (cookie `Secure`+`SameSite=Lax` works), the CORS allowlist already
includes the staging/prod web origins (credentials enabled), and the web CSP already permits
`*.pika.stream`. The dev-only `127.0.0.1` CORS/CSP reflections do not apply when `NODE_ENV=production`.

---

## 12. Track C / B3 resolved design — the DJ playlist tool (June 2026 discussion)

**Where we are:** Track B (dancer "Listen on" links, shipped as **B1**) and Track D (web-DJ
Spotify broadcaster + the **B2** engagement bundle: announcements/polls) are **DONE and on
staging**. So Track C is no longer "Phase 5 optional" — it's the **active next feature (B3)**.

**Reframe (owner-aligned):** B3 is a **DJ-assist tool** — it helps DJs who already build Spotify
playlists of their sets *by hand* — **not** a fire-and-forget auto-export. The "remember the match"
mechanic is core to the value: the tool gets smarter every night.

### 12.1 Two cache granularities (refines §5 — this is the key design point)
There are **two** identities, and conflating them is the trap:
- **Canonical "song" identity** — collapse every spelling/version of a track into one entity,
  keyed by normalized `artist::title`. This is the **cloud `track_links` table (§5)**. It is the
  **canonical track-identity spine for analytics** (owner: *"the enabler for many analytics
  features — we cannot forget about it"*) and a cross-DJ recommendation seed. For a *specific*
  playlist match it is a **suggestion only** (two DJs' files can normalize to the same key yet be
  different versions).
- **Specific "recording" identity** — *this exact local file* → *this exact Spotify recording*
  (right edit, right length). Lives in the **desktop library** (per-DJ, file-keyed), disambiguated
  by **duration**, and is **authoritative** for that DJ's playlist. DJ confirmations are sticky.

**Build the canonical `track_links` layer now** (B3 is its first write-through writer); **defer the
analytics consumers** (charts) per the validation-first call — laying the foundation is near-free
since we generate the data anyway; building consumers waits for signal.

### 12.2 Duration is the strongest match signal — and we don't capture it yet
Add **`durationMs`** to the §4 seam (`TrackInfoSchema` + `played_tracks` + desktop `tracks`). The
desktop Rust VDJ parser **already extracts `SongLength`** (`src-tauri/src/lib.rs`) — just plumb it
through. Spotify's `audio-features` (their BPM/key) was **deprecated Nov 2024**, so we cannot
cross-check BPM against Spotify. Realistic match signals = **string-sim(artist,title) +
duration (±2–3 s) + Spotify popularity**. Expect ~70–90 % on mainstream, lower on edit-heavy sets
→ "a good, recognizable playlist," not an exact mirror.

### 12.3 Resolution flow — desktop-driven, cloud as a thin Spotify proxy
- **Desktop owns** the library + the per-file match cache + the review UX.
- **Cloud is a thin Spotify proxy:** an **app-token (Client Credentials) `/search`** endpoint
  (candidates; no user cap) + a **shared-account `playlist/create`** endpoint (write + return URL).
  Secrets stay cloud-side. (Today `spotify.ts` only does per-DJ read-only OAuth — both are net-new.)
- **Per played local song:** cached `dj_confirmed` → use it, locked, **no API call**; cached
  `auto` → show **recommended** pre-selected; no cache → cloud search → top hit recommended +
  alternates. DJ accepts-all / overrides; **every override is written back `dj_confirmed`**
  (sticky forever) → coverage compounds toward ~100 %, repeats become instant + free.
- Final Spotify track IDs → cloud `playlist/create` on the shared account → link.

### 12.4 Web-DJ (Spotify-source) sets need NO matching
A Track-D set's tracks already carry their Spotify IDs from the poller → **one-click playlist from
the web dashboard, no desktop, no search**. VDJ sets use the desktop assist tool. Both call the
same shared-account `playlist/create`. (Near-free fallout of B3.)

### 12.5 The shared playlist account — config, not code
- Model the writer account as a **configured OAuth identity** (encrypted refresh token, scope
  `playlist-modify-public`, same pattern as per-DJ tokens). **Swapping accounts is an ops step**
  (create → one-time OAuth → replace the stored token) — **zero code change, no redeploy**.
- **Dev on the owner's personal Premium now**, but **create the "Pika"-named account before any
  real pilot** — playlists **do not migrate between accounts**, so pilot DJs' playlists must be
  durable + on-brand from day one.
- **5-seat budget:** the writer account's OAuth consumes **1 of the 5** Dev-Mode seats on the Pika
  Spotify app (leaves 4 for web-DJ broadcasters). Same app = one budget.
- **Naming** `"{DJ} @ {Event} · {date} — via Pika"` (attribution + light brand reach).
- **ToS:** single-account mass automation is gray at *commercial* scale → fine for pilot/community
  scale; nothing should take a hard dependency on it.

### 12.6 DJ web dashboard ("My Sets") — fast-follow, cheap
The payoff of the now-shipped Better Auth foundation: a **private DJ dashboard** listing the DJ's
own past sets, each linking to its **existing recap** + its **Spotify playlist**, reachable from any
device via the cookie session. Mostly *surfacing data we already store* (sessions / played_tracks /
likes / tempo / polls / recap). **Scope to the DJ's OWN sets** — a private gig-history view is a
legit retention feature and is **not** the public-charts moat we're deliberately avoiding. Clean
split: **build/review on desktop** (library), **view/share/stats on web** (anywhere).

### 12.7 Recommended MVP + sequencing
1. **B3 core:** `durationMs` plumbing → cloud Spotify proxy (app-token `/search` + shared-account
   `playlist/create`) → `track_links` write-through cache → desktop assist tool
   (remember → recommend → DJ-confirm → create) → link. *Web-DJ one-click playlist falls out
   near-free.*
2. **Fast-follow:** the "My Sets" web dashboard (reuses recap data + surfaces the playlist).
3. **Deferred (signal-gated):** analytics / charts built on the canonical identity layer.

### 12.8 New surface (delta to §9)
- **Shared:** `durationMs` on `TrackInfoSchema`.
- **Cloud:** Client-Credentials app-token service + a `/search` proxy endpoint; a shared-account
  connection (config) + `playlist/create` endpoint (scope `playlist-modify-public`); `track_links`
  write-through on resolution.
- **Desktop:** `tracks` columns (`spotifyTrackId` / `spotifyUrl` / `matchConfidence` /
  `matchSource` `auto|dj_confirmed` / `matchedAt`) + migration; capture `SongLength`→`durationMs`
  into the broadcast + library path; a **"Build Spotify playlist for this set"** review UI.
- **Operational:** the shared "Pika" account + one-time OAuth (before pilot).
