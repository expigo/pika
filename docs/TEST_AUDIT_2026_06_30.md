# Test Audit & Improvement Report — 2026-06-30

Point-in-time audit after the Spotify-catalog workstream (CSV importer → Songs Catalog → desktop
feature display → played_tracks→Pika consensus → Better Auth harden). Supersedes
`archive/TEST_AUDIT_2026_02_02.md`. The **living** test conventions are in the root `CLAUDE.md`
(Testing section); this is the snapshot + what this pass changed.

## Summary

| Package | Runner | Tests (pass) | Notes |
|---|---|---|---|
| Cloud (unit) | `bun test` | ~416 (+~49 gated-skip) | gated integration is `describe.skip` here |
| Cloud (integration) | `bun run test:integration` | **41** | real Postgres, `RUN_DB_TESTS=1`, isolated |
| Desktop | `vitest run` | **417** (+1 skip) | ~unit + `*.rtl.tsx` (happy-dom) |
| Web | `bun test` + `vitest run` | **94 + 69 = 163** | dual-runner |
| Shared | `bun test` | **38** | |
| Python sidecar | `pytest` | **8** | NEW this pass |

**Total ≈ 1,040 JS/TS passing + 41 gated DB-integration + 8 Python.** All green.

### Coverage baselines (advisory — newly enabled for cloud/web/shared)
| Package | % Funcs/Stmts | % Lines | Caveat |
|---|--:|--:|---|
| Cloud (`bun test`) | 48.7 | 59.1 | **Understated** — most handlers/index/services run only under the gated integration suite, not counted here. |
| Shared | 72.2 | 83.7 | |
| Web (modules, `bun test`) | 53.0 | 71.6 | |
| Web (components, vitest/v8) | 78.4 | 82.5 | |
| Desktop (vitest/v8) | 66.0 | 67.6 | |

## What this pass fixed (gaps in the new code)

1. **Cloud Songs Catalog had zero CI coverage** (only auth-guard 401 tests + manual live verification).
   Added gated-integration (`__tests__/db.integration.test.ts` → "Songs Catalog"):
   `/catalog/songs/:id` Spotify features + **Pika consensus join** (seeds curated_tracks +
   spotify_track_features + curated_playlists + track_links + played_tracks w/ `match_key`, asserts the
   averaged 0–100 fingerprints + plays/DJ counts + appearances), `/catalog/songs` search/sort/counts,
   `/catalog` totals, 404.
2. **`seedFromPlaylist` + `getSpotifyFeatures`** — integration: writes curated_tracks + track_link
   (playlist source, exact `match_key`) + features; reads features by id, omits unknown.
3. **`played_tracks.match_key`** — asserted a real `persistTrack` stamps `getTrackKey(artist,title)`.
4. **Desktop `spotifyFeaturesRepository`** — unit: snake→camel remap, empty-id short-circuit, per-row upsert.
5. **Desktop feature display** — `CrateWorkspaceStats.rtl.tsx` (Spotify aggregate line) + a badge case in
   `BuildPlaylistModal.rtl.tsx`.

## Test infrastructure added
- **Coverage scripts**: `test:coverage` on cloud + shared (`bun test --coverage`) and web
  (`bun test --coverage && vitest run --coverage`; added `@vitest/coverage-v8`). Desktop already had it.
  Advisory — **not** CI-gating (no thresholds yet).
- **Python sidecar tests (first ever)**: `python-src/tests/` + `conftest.py`, `requirements-dev.txt`
  (pytest), `test:python` script. 8 tests over `clamp` (exact) + the librosa extractors on synthetic
  signals (contract: finite 0–100 floats; `estimate_key` → string; silence → 0 energy).

## Conventions (unchanged, reaffirmed)
- **Dual-runner web** (`bun test` pure modules + `vitest` components); RTL = `*.rtl.tsx` (happy-dom).
- **Gated integration runs ISOLATED** (`test:integration`) — bun/vitest `mock.module` is process-global
  and leaks across files; never `RUN_DB_TESTS=1 bun test`.
- Integration tests self-clean (delete seeded users/sessions/links; cascades handle curated_*).

## Remaining backlog (prioritized, NOT done this pass)
1. **`SetCanvas` Spotify aggregate** — not RTL-tested (heavy dnd-kit/sidecar/analyzer mocking; brittle).
   The aggregate logic is identical to `CrateWorkspaceStats` (tested) and the hook is service-tested, so
   risk is low — revisit if SetCanvas changes.
2. **Cloud coverage is understated** — consider a CI coverage job that runs `RUN_DB_TESTS=1` so the
   integration-only paths (handlers, index, services) count.
3. **Python sidecar** is smoke-level — grow real DSP assertions (golden files for a known WAV).
4. **No coverage thresholds / CI gating** — add once baselines are trusted.
5. **Web service-worker / offline-queue** paths remain lightly covered (pre-existing).

## Verification
- `bun test` (cloud/web/shared) + `bun run test:integration` (cloud) + `vitest run` (desktop/web) +
  `pytest` (sidecar) — all green at the counts above. `tsc` + biome clean.
