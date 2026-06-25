# Blueprint: Music Provider Integration (Spotify / Apple Music)

**Status:** Research complete, design draft — NOT scheduled for implementation.
**Author:** Lead eng research pass, June 2026. Track A design decisions resolved (§7); spike
scoped (§8). Tracks B/C still need a discussion pass.
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

**Recommended first spike:** Track A. It's small, it kills the matching problem entirely, and it
directly serves the "I DJ from Spotify during training" use case.

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

---

## 4. Schema changes (shared seam for A + B + C)

Today **nothing** carries external IDs. Add (all additive / optional, flows through the existing
broadcast pipe untouched):

- `packages/shared/src/schemas.ts` → `TrackInfoSchema`: optional `isrc`, `spotifyUrl`,
  `spotifyId`, `appleMusicUrl`.
- `packages/cloud` `played_tracks` + `packages/desktop` `tracks`: same optional columns
  (`db:generate` migrations, commit the SQL — see root CLAUDE.md "Adding a Column").
- These are nullable everywhere; a stage-less / link-less track behaves exactly as before.

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
- **Track A feeds it for free:** now-playing gives canonical ISRC/ID → high-confidence `matched`
  rows with no search at all.
- Privacy note: this is track-identity metadata only (artist/title/links), not user data — safe
  to share across DJs.

---

## 6. Phasing (proposal, debate at impl time)

0. **Spike (1–2 d):** Track A — read now-playing on the owner account; confirm the payload is
   accurate/timely. Full scope in **§8**. De-risks all.
1. **Phase 1:** schema seam (§4) + `track_links` cache (§5) + Track B links on the **recap** page.
2. **Phase 2:** Track A as a first-class ingestion source (token storage + CSP/allowlist + dedup).
3. **Phase 3:** Track B links on the **live** page; manual-correction UI over the unmatched worklist.
4. **Phase 4 (optional):** Track C export via the shared service account — only if A/B prove out.

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
4. **Priority** — A-first (recommended), or B (dancer links) first for the audience?
5. **Track C** at all, given ToS-fragility and DJs not owning the playlists?

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
- Web: `app/recap/[id]/page.tsx`, `app/live/page.tsx`, `useLiveListener`.
- Desktop (Track A): new source service mirroring `services/virtualDjWatcher.ts`, wired into
  `useLiveSession`; Tauri `capabilities/default.json` + `tauri.conf.json` CSP (add the two Spotify
  hosts); Rust-side loopback OAuth + poll via `tauri-plugin-http`; `Cargo.toml` `tauri-plugin-keyring`
  (or Stronghold) for token storage. No deep-link plugin (loopback redirect).
