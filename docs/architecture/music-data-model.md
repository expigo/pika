# Architecture: Music Data Model (catalog, features, identity spine)

How Pika! turns a DJ's repertoire + plays into a cross-DJ analytics catalog with **two feature
sources kept strictly separate**. Built June 2026 (B3 + CSV importer + Songs Catalog + desktop feature
display + Pika consensus). Strategic constraints: `docs/blueprints/music-provider-integration.md`.

## The two catalogs (never merged)

| | **Spotify catalog** | **Pika catalog** |
|---|---|---|
| Source | Spotify's `audio-features` (deprecated for new apps → only via Exportify **or Chosic** CSV) | our Python sidecar (librosa) |
| Identity | **canonical per Spotify URI** | **per-file / per-DJ** (no single value per song) |
| Store | `spotify_track_features` (cloud) + desktop mirror | desktop `tracks` + cloud `played_tracks` (0–100 fingerprints) |
| Scale | 0–1 ratios, dB, BPM | 0–100 DJ-friendly |
| Coverage | only tracks present on Spotify *and* seeded | everything a DJ plays/analyzes (incl. the Spotify-less long tail) |

They are **joined**, never averaged together — different sources/scales; the *comparison* is the signal.

## The identity spine: `track_links`
Cross-DJ identity is keyed by `getTrackKey(artist,title)` (the **exact**, version-preserving
`match_key`) → a resolved Spotify id. `getFuzzyKey` (`song_key`) is the version-collapsing axis for
grouping. `track_links` (cloud) maps `match_key → provider_id (spotify_id)` with a `status`
(`matched`/`manual`) and `source` (`auto`/`manual`/`playlist`). A DJ confirmation (`manual`) outranks an
`auto` match. Both `getTrackKey`/`getFuzzyKey` live in `@pika/shared` (`utils.ts`, diacritic-folding +
version-suffix stripping hardened from real WCS playlists).

## Provenance doctrine (Slice D — Musical Identity)
`played_tracks` = **witnessed live plays ONLY**; an import can never mint a play. DJ-imported
playlists land in `curated_*` — `curated_playlists.source` IS the provenance (`'profile'` =
live-derived → badge "⚡ Played live on Pika", the earned prize; `'csv'` = imported → "DJ's pick";
never "Imported" as user-facing copy). **Consumer rule:** the Signature + dancer↔DJ compatibility
read BOTH sources; Charts/consensus/reactions (any cross-DJ public aggregate) read `played_tracks`
only. **One dial per surface:** `sessions.published` (live) and `curated_playlists.show_on_booth`
(imports) each gate Booth display AND Signature input together — hiding removes from both, and the
visible cost is the Signature's load-bearing denominator line — since D.1 with **per-context
featured-track counts** ("based on N live sets (X tracks) · M imported playlists (Y tracks) · Z%
feature coverage"; live-first attribution on overlap, so X+Y always equals featuredTracks — the
denominator states each context's real weight, not just its presence). Below the floors the owner
sees a private **floors-progress** panel on `/me/booth` ("12 of 20 tracks · 1 of 2 contexts" +
next action) — progress numbers are owner-only and never enter the public payload. The optional
`acousticness` band (present only when the corpus carries values) powers the SignatureCard's
**radar**, which plots the p25–p75 band as a RING — never a single-value/median polygon
(range-not-average doctrine, enforced in `SignatureRadar.tsx`). The Signature is computed over **ALL** published
sessions (≥3 plays each), not the Booth's 20-row display window, on the Spotify feature scale only
(0–1 floats + BPM — never blended with the Pika 0–100 sidecar axes), with live-side identity behind
the strict trust gate (`trustedSpotifyLinkOn`: `manual`/`playlist`, or `auto` with confidence ≥0.8).
DJ imports write the global `track_links` spine in **fill mode** (`seedFromPlaylist` `linkMode:
"fill"`): they may fill `unmatched`/low-confidence-`auto` rows but never overwrite the
`manual`/`playlist`/high-confidence links that journals, exports and recaps trust (admin seed +
`finalizeWebSet` remain `authoritative`).

## Cloud tables (`packages/cloud/src/db/schema.ts`)
- `spotify_track_features` — canonical per-URI Spotify features (tempo/key/energy/…) + `isrc`, `camelot`,
  `features_source`; one row per `spotify_id`. Seeded only via CSV import (accretive merge — see below).
- `curated_tracks` — a DJ's repertoire edge: one row per `(dj_user_id, spotify_id)` (name/artists/art).
- `curated_playlists` + `curated_playlist_tracks` — **first-class playlists** + membership (a track is in
  many playlists; this powers "appears in" and isn't lossy like the legacy `curated_tracks.playlist_name`).
  Slice D (migration `0015`) adds `show_on_booth` (the promote dial — also the Signature dial for
  imports), `label` (narrative, ≤120), `kind` (`set|crate`, display hint), `spotify_url` (link-only).
- `track_links` — the identity spine (above).
- `played_tracks.match_key` — `getTrackKey` set at persist time; **joins to `track_links`** to reach the
  Spotify identity (and so the cloud catalog can show Pika features) — auto-reflects new resolutions.
- `dj_playlists` — DJ-pasted public Spotify playlists embedded on `/dj/[slug]` (Slice 5; `unique(dj_user_id,
  spotify_playlist_id)`). Cap-free marketing embeds (a plain iframe), *not* the OAuth/matching path.
  D.1 adds `title` (migration `0016`) — display metadata fetched ONCE at add-time from the fixed
  Spotify **oEmbed** host (URL built from the parsed 22-char id — no SSRF surface; 4s timeout;
  every failure → null + a generic UI label). The narrow carve-out to "embeds are never fetched":
  metadata only, playlist CONTENT is still never fetched. Backfill for pre-D.1 rows:
  `POST /api/admin/playlists/backfill-titles` (idempotent, audited, ≤200 rows/call).
- `sessions.published` — `boolean DEFAULT true`; the DJ curates which sets appear on their public profile.
- `sessions.spotify_playlist_id` / `spotify_playlist_url` — the desktop-built set playlist the DJ **shared**
  to their profile (mirrors the desktop `sessions` columns; migration `0010`). Embeds on the set's recap +
  a badge on the profile session row. Null = not shared.

## Data flow
1. **Seed (identity + Spotify features)** — admin `/admin/seed`: **Import CSV** — Exportify
   (`@pika/shared/exportifyCsv`) *or* Chosic (`@pika/shared/chosicCsv`), **auto-detected by header**;
   both normalize to the same `SeedTrack[]` — or the dormant **profile-load** (Spotify blocks new apps
   from reading playlists). `POST /api/admin/seed/curate` (with `featuresSource`) → `seedFromPlaylist`
   writes `curated_tracks` + `curated_playlists`/membership + `track_links` (source `playlist`) +
   `spotify_track_features`. Bulk dev path: `packages/cloud/scripts/import-csvs.ts`.
   - **Accretive merge (dual-CSV):** the two exports are the *same* Spotify data shaped differently —
     Exportify carries 0–1 float precision + `recordLabel`; Chosic carries `ISRC` + `Camelot` (but rounds
     to 0–100 ints). The `spotify_track_features` upsert merges **best-of-both, any upload order**
     (`spotifyMatch.ts`): the numeric block is precision-guarded by `features_source`
     (exportify > chosic > csv) so a rounded value never clobbers a float; the extras (isrc/camelot/
     recordLabel/…) are fill-if-missing so neither source nulls the other.
2. **Browse (Songs Catalog)** — web `/admin/catalog`: `GET /api/admin/catalog` (feature distributions,
   cross-DJ overlap) + `/catalog/songs` (search/sort/paginate) + `/catalog/songs/:id` (Spotify features +
   **Pika consensus** + DJ/playlist appearances).
3. **Pika consensus** — `/catalog/songs/:id` averages the 0–100 fingerprints over every **play**
   (`played_tracks`) of that Spotify id, joined `played_tracks.match_key = track_links.match_key WHERE
   provider_id = :id`. Returned as `pika` (separate, labeled section); `null` if never played.
4. **Desktop feature display** — the desktop reads Spotify features by `spotify_id` from
   `GET /api/playlist/features` (`getSpotifyFeatures`), caches them in a **local SQLite mirror**
   (`spotify_track_features` + `spotifyFeaturesService`, cache-first), and shows them **beside** its own
   Pika radar — library detail, Build-Playlist row badges, set/crate analytics. Coverage = a DJ's
   *matched* library ∩ the *seeded* catalog; degrades gracefully ("not matched" / "no features yet").
5. **Live dancer identity (the wedge)** — when a matched local track is played live, the desktop surfaces
   its stored Spotify identity to dancers: `trackRepository` selects `spotify_url`/`spotify_album_art_url`
   /confidence/source, `useLiveSession` threads them onto the played track, and `toTrackInfo`
   (`virtualDjWatcher.ts`) maps them to the broadcast's `albumArtUrl`/`spotifyUrl` — **gated** so only a
   *trusted* match shows (`dj_confirmed` **or** confidence ≥ 0.8, mirroring the cloud `confidenceTier`
   "high" band); a low-confidence guess is never shown live. The web `LivePlayer` renders album art +
   "Listen on Spotify" from those existing fields — no shared/web change. (This is the local↔Spotify
   *identity* join; it does not touch the two feature catalogs above.)
6. **Background library pre-match (feeds the wedge)** — step 5 only fires for *matched* tracks, so the
   desktop `SpotifyMatchStatus` pill drives `useSpotifyMatcher`: an opt-in, throttled (~1.1s, ≤60/min/DJ
   limiter), resumable serial loop over `trackRepository.getUnmatchedLibraryTracks` that calls the
   **cache-first** cloud `searchSpotify` and writes **only high-confidence** matches
   (`setTrackSpotifyMatch(source:"auto", confidence:0.8)` → the step-5 gate surfaces them), marking the
   rest attempted (`spotify_matched_at` reused as the "tried, no match" marker). Cache-hit matches carry
   no cover, so art is backfilled via `resolveSpotifyTracks`. Cap-free (app-token search); needs only the
   DJ's Pika login. Pre-warms coverage so the live wedge fires for the bulk of a set.
7. **Verify / correct a match (human-in-the-loop)** — auto-matching is fuzzy, so `SpotifyMatchManager`
   (LibraryBrowser inspector) lets the DJ see a track's match + confidence and **Change** (re-search / pick
   / paste-link), **Confirm** (→ `setTrackSpotifyMatch(source:"dj_confirmed")`), or **Remove**
   (`clearTrackSpotifyMatch` — sticky). A confirm is **promoted to the shared cache** best-effort via
   `POST /api/playlist/confirm` → `cacheManualMatch`, which writes an authoritative `manual` `track_links`
   row that **overrides any `auto` match for every DJ** (keyed by the version-precise `match_key`). So DJ
   corrections compound: the crowd continuously improves the shared identity spine.
8. **Identity after the set (recap + my-likes)** — the wedge closes post-event: `played_tracks` now
   **persists** the broadcast's `album_art_url`/`spotify_url` (Slice 4 — `persistTrack` stopped dropping
   them; migration `0008`), so the recap endpoint and the my-likes endpoint (which inherits via the
   like→played_track FK) return per-track art + link. A shared web **`TrackRow`** (`components/ui`) renders
   album art + title/artist + "Listen on Spotify" on both surfaces (mirrors the live `LivePlayer`). Snapshot
   semantics (what was live at play time); coverage = tracks matched *before/during* the set, so
   pre-matching (step 6) maximizes it — unmatched plays show a graceful fallback tile.
9. **DJ profile as a storefront (Slice 5)** — the DJ curates their public `/dj/[slug]`: authed `/api/dj/me/*`
   routes (per-route `requireDjAuth`, scoped by `getUser(c).id`, CSRF-mounted) let them **hide/show** each
   recorded set (`PATCH /me/sessions/:id` → `sessions.published`; the public `GET /:slug` filters
   `published = true`) and **paste public Spotify playlist URLs** to embed (`POST /me/playlists` →
   `parseSpotifyPlaylistId` → `dj_playlists`). Management lives on `/dj/booth` (the `ProfileManager` panel,
   shown across the whole ready phase — connected or not); the public page renders a lazy
   `SpotifyPlaylistEmbed` iframe per playlist (needs web CSP `frame-src https://open.spotify.com`). Migration
   `0009`; cap-free (no OAuth/matching — external embeds + a publish flag).
10. **Set-playlist sync (desktop→cloud)** — the desktop `BuildPlaylistModal` creates a real Spotify playlist
   for a *past* set on the shared Pika account (`POST /api/playlist/create`) and, on the done screen, the DJ
   can **"Share on my Pika profile"**. That POSTs the real playlist id to `POST /api/dj/me/sessions/:id/playlist`
   (authed bearer + `requireDjAuth`, scoped by `getUser(c).id` → 404 if not mine; id validated by
   `parseSpotifyPlaylistId`), storing it on the **cloud** `sessions.spotify_playlist_id/url`. It then embeds on
   the set's recap (`buildRecap` carries the id → `SpotifyPlaylistEmbed`) and shows a badge on the profile
   session row (`GET /:slug`). `DELETE` un-shares. The desktop remembers the shared state in
   `sessions.spotify_playlist_synced_at`. Cap-free (shared-account playlist, no per-DJ OAuth); the set must have
   gone live (it needs a `cloud_session_id`). Migration `0010` (cloud) + desktop `0005`.
11. **Musical identity (Slice D)** — the DJ-facing end of the catalog. **Import:**
   `POST /api/dj/me/playlists/import` (requireDjAuth, per-user rate limit, 1000-track cap,
   playlist cap with **existing names exempt** so the dual-CSV re-upload works at cap) takes
   client-parsed Exportify/Chosic rows (same shared parsers, auto-detected by header) →
   `seedFromPlaylist(..., "csv", featuresSource, { linkMode: "fill" })`; re-import preserves
   `show_on_booth`/label/kind/url. Manage/promote: `GET/PATCH/DELETE /api/dj/me/curated-playlists`.
   **Booth render:** promoted playlists appear natively (5-track previews via `curated_tracks`,
   provenance badges, optional Spotify link; legacy iframe embeds collapse behind a tap) plus the
   **Signature** card (`lib/services/signature.ts`: percentile ranges for tempo/energy/danceability/
   valence + era decades over the distinct ids of published-live ∪ promoted-import contexts; hard
   floors `SIGNATURE_MIN_TRACKS`/`SIGNATURE_MIN_CONTEXTS`; `user.show_signature` toggle, owner
   always gets a private preview). **Compatibility:** `GET /api/me/compat/:slug` — the viewer's
   journal likes (snapshot-first: broadcast `spotify_url` ?? trusted link) intersected with the
   same repertoire set; per-viewer, so never inside the slug-cached Booth payload.
   **Crowd-pleasers:** `GET /api/dj/me/crowd-pleasers` — DJ-private likes-per-play leaderboard
   across ALL own sessions (publish-agnostic; legacy anonymous sessions invisible — documented).

## Why CSV (not the API)
Spotify's Nov-2024 lockdown blocks new apps from reading playlists *and* deprecated the `audio-features`
endpoint. Exportify and Chosic (grandfathered browser tools) are the only way to grab features → a human
exports → we import the CSV. Neither exposes a data API (both call Spotify with a user token), so the
canonical-feature well is a manual, finite source; the identity layer (art/ISRC/"Listen on") is separately
resolvable via the cap-free app token. The profile-load flow is kept dormant for a possible grandfathered
account.

## Tests
Shared `exportifyCsv` + `chosicCsv` (parsers: scale/key/Camelot/ISRC/duration/skip); web catalog + seed
RTL (Exportify **and** Chosic import, format auto-detect, `featuresSource`); cloud gated integration
(`spotify-catalog.integration.test.ts` → Songs Catalog features + consensus join + search + appearances, the
seed/`getSpotifyFeatures` cases, and the **order-independent accretive merge**); desktop
`spotifyFeaturesService`/`spotifyFeaturesRepository` + feature-panel/analytics RTL, `trackRepository`
identity-column mapping + library-pre-match queries, the `toTrackInfo` live-identity **gate** cases, and
`useSpotifyMatcher` (gate/backfill/429/401 loop) + `SpotifyMatchStatus` RTL; `clearTrackSpotifyMatch` +
`SpotifyMatchManager` RTL + the `/api/playlist/confirm` route guard and its real-Postgres
`track_links` manual-write/override-auto integration tests; `TrackRow` RTL + the real-Postgres
`persistTrack`-persists-identity and recap/my-likes-return-identity integration tests. **Slice D:**
`signature.test.ts` (pure math: percentiles, floors → null, era bucketing, distinct-id dedupe);
integration "musical identity" describe (import + dual-CSV accretion + at-cap existing-name
exemption + re-import preserves promotion; **linkMode fill never clobbers a `manual` link, fills
`unmatched`**; signature one-dial — unpublish/un-promote both shrink the denominator — +
`show_signature` public-hide/owner-preview; direct-insert `source='profile'` badge branch; compat
snapshot-first + low-confidence exclusion; crowd-pleasers publish-agnostic aggregation;
delete-playlist leaves the shared corpus); web RTL: SignatureCard (ranges + load-bearing
denominator), CompatCard (signed-out invisible, overlap floor), CrowdPleasers, PlaylistManager
(badges, optimistic promote, CSV rejection), Booth-page fixture with both badge branches.
**D.1:** `splitFeaturedBySource` units (live-first attribution, sum invariant) + integration
per-source contexts assert on the overlap fixture; `spotifyOembed` units (DI'd fetch — timeout/
redirect/content-type/oversize/truncation → null) + the backfill route integration test;
`radarPath` geometry units (band ring, min-thickness clamp, swapped-input normalization);
RTL: promote-nudge flows, floors-progress panel, merged embed rows (titled + fallback),
/dj/booth page suite (the management regression guard moved there), stale-payload denominator
fallback.

---
*Added June 30, 2026; dual-CSV accretive import + live dancer identity + background library pre-match +
match verify/correct (shared-cache promote) + recap/my-likes identity (`TrackRow`) added July 1, 2026;
Slice D (provenance doctrine, DJ import + fill-mode links, Signature, compat, crowd-pleasers) added
July 7, 2026; D.1 (per-source denominator, floors progress, radar, oEmbed titles, /dj/booth split)
added July 8, 2026. Related:
`music-provider-integration.md` (strategy), `schema-versioning.md`.*
