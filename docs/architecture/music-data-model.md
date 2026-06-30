# Architecture: Music Data Model (catalog, features, identity spine)

How Pika! turns a DJ's repertoire + plays into a cross-DJ analytics catalog with **two feature
sources kept strictly separate**. Built June 2026 (B3 + CSV importer + Songs Catalog + desktop feature
display + Pika consensus). Strategic constraints: `docs/blueprints/music-provider-integration.md`.

## The two catalogs (never merged)

| | **Spotify catalog** | **Pika catalog** |
|---|---|---|
| Source | Spotify's `audio-features` (deprecated for new apps → only via Exportify CSV) | our Python sidecar (librosa) |
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
- `spotify_track_features` — canonical per-URI Spotify features (tempo/key/energy/…); one row per
  `spotify_id`. Seeded only via CSV import.
- `curated_tracks` — a DJ's repertoire edge: one row per `(dj_user_id, spotify_id)` (name/artists/art).
- `curated_playlists` + `curated_playlist_tracks` — **first-class playlists** + membership (a track is in
  many playlists; this powers "appears in" and isn't lossy like the legacy `curated_tracks.playlist_name`).
- `track_links` — the identity spine (above).
- `played_tracks.match_key` — `getTrackKey` set at persist time; **joins to `track_links`** to reach the
  Spotify identity (and so the cloud catalog can show Pika features) — auto-reflects new resolutions.

## Data flow
1. **Seed (identity + Spotify features)** — admin `/admin/seed`: **Import CSV** (Exportify export, parsed
   by `@pika/shared/exportifyCsv`) or the dormant **profile-load** (Spotify blocks new apps from reading
   playlists). `POST /api/admin/seed/curate` → `seedFromPlaylist` writes `curated_tracks` +
   `curated_playlists`/membership + `track_links` (source `playlist`) + `spotify_track_features`.
   Bulk dev path: `packages/cloud/scripts/import-csvs.ts`.
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

## Why CSV (not the API)
Spotify's Nov-2024 lockdown blocks new apps from reading playlists *and* deprecated the `audio-features`
endpoint. Exportify (a grandfathered browser tool) is the only way to grab features → a human exports →
we import the CSV. The profile-load flow is kept dormant for a possible grandfathered account.

## Tests
Web `exportifyCsv` (parser) + catalog RTL; cloud gated integration (`db.integration.test.ts` → Songs
Catalog: features + consensus join + search + appearances) + the seed/`getSpotifyFeatures` cases; desktop
`spotifyFeaturesService`/`spotifyFeaturesRepository` + feature-panel/analytics RTL.

---
*Added June 30, 2026. Related: `music-provider-integration.md` (strategy), `schema-versioning.md`.*
