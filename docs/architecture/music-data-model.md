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

## Cloud tables (`packages/cloud/src/db/schema.ts`)
- `spotify_track_features` — canonical per-URI Spotify features (tempo/key/energy/…) + `isrc`, `camelot`,
  `features_source`; one row per `spotify_id`. Seeded only via CSV import (accretive merge — see below).
- `curated_tracks` — a DJ's repertoire edge: one row per `(dj_user_id, spotify_id)` (name/artists/art).
- `curated_playlists` + `curated_playlist_tracks` — **first-class playlists** + membership (a track is in
  many playlists; this powers "appears in" and isn't lossy like the legacy `curated_tracks.playlist_name`).
- `track_links` — the identity spine (above).
- `played_tracks.match_key` — `getTrackKey` set at persist time; **joins to `track_links`** to reach the
  Spotify identity (and so the cloud catalog can show Pika features) — auto-reflects new resolutions.

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
(`db.integration.test.ts` → Songs Catalog features + consensus join + search + appearances, the
seed/`getSpotifyFeatures` cases, and the **order-independent accretive merge**); desktop
`spotifyFeaturesService`/`spotifyFeaturesRepository` + feature-panel/analytics RTL, `trackRepository`
identity-column mapping + library-pre-match queries, the `toTrackInfo` live-identity **gate** cases, and
`useSpotifyMatcher` (gate/backfill/429/401 loop) + `SpotifyMatchStatus` RTL.

---
*Added June 30, 2026; dual-CSV accretive import + live dancer identity + background library pre-match
added July 1, 2026. Related: `music-provider-integration.md` (strategy), `schema-versioning.md`.*
