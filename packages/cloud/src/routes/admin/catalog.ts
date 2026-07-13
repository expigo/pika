/**
 * Admin Songs Catalog — read-only aggregates + song list/detail over the seeded repertoire (B3).
 * Split (2026-07) from routes/admin.ts, behavior-preserving.
 *
 * Auth: the composer (`../admin.ts`) applies adminLimiter + requireAdmin to every /api/admin
 * route BEFORE the mounts; CSRF (`X-Pika-Client`) is applied at the /api/admin mount in index.ts.
 */

import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../../db";

export const catalogRoutes = new Hono();

/**
 * Read-only "Songs Catalog" aggregates over the seeded repertoire (B3) — feature distributions and
 * cross-DJ overlap, so the owner can SEE what the CSV seed produced. Pure reads of `curated_tracks`
 * + `spotify_track_features`; no PII. Aliases are quoted to return the exact camelCase shape.
 */
type Row = Record<string, unknown>;
const n = (v: unknown): number => Number(v ?? 0);
catalogRoutes.get("/catalog", async (c) => {
  const res = (await Promise.all([
    db.execute(sql`
      select
        (select count(distinct spotify_id) from curated_tracks)                         as "tracks",
        (select count(*) from spotify_track_features)                                   as "features",
        (select count(distinct dj_user_id) from curated_tracks)                         as "djs",
        (select count(*) from spotify_track_features where tempo is not null)           as "withTempo",
        (select count(*) from spotify_track_features where genres is not null)          as "withGenres",
        (select count(*) from (select spotify_id from curated_tracks
           group by spotify_id having count(distinct dj_user_id) > 1) o)                as "overlap"`),
    db.execute(sql`
      select u.name as "djName", count(*)::int as "count"
      from curated_tracks c join "user" u on u.id = c.dj_user_id
      group by u.name order by "count" desc`),
    db.execute(sql`
      select (floor(tempo / 10) * 10)::int as "bucket", count(*)::int as "count"
      from spotify_track_features where tempo is not null
      group by "bucket" order by "bucket"`),
    db.execute(sql`
      select key_pitch as "key", count(*)::int as "count"
      from spotify_track_features where key_pitch is not null and key_pitch >= 0
      group by key_pitch order by key_pitch`),
    db.execute(sql`
      select round((floor(energy * 10) / 10)::numeric, 1) as "bucket", count(*)::int as "count"
      from spotify_track_features where energy is not null
      group by "bucket" order by "bucket"`),
    db.execute(sql`
      select max(c.name) as "name", max(c.artists) as "artists",
             count(distinct c.dj_user_id)::int as "djCount", max(f.popularity) as "popularity"
      from curated_tracks c left join spotify_track_features f on f.spotify_id = c.spotify_id
      group by c.spotify_id having count(distinct c.dj_user_id) > 1
      order by "djCount" desc, "popularity" desc nulls last limit 15`),
  ])) as unknown as Row[][];

  const totals = res[0] ?? [];
  const perDj = res[1] ?? [];
  const tempo = res[2] ?? [];
  const keys = res[3] ?? [];
  const energy = res[4] ?? [];
  const overlap = res[5] ?? [];
  const t = totals[0] ?? {};
  return c.json({
    totals: {
      tracks: n(t["tracks"]),
      features: n(t["features"]),
      djs: n(t["djs"]),
      overlap: n(t["overlap"]),
    },
    coverage: { tempo: n(t["withTempo"]), genres: n(t["withGenres"]) },
    perDj: perDj.map((r) => ({ djName: String(r["djName"] ?? "—"), count: n(r["count"]) })),
    tempo: tempo.map((r) => ({ bucket: n(r["bucket"]), count: n(r["count"]) })),
    keys: keys.map((r) => ({ key: n(r["key"]), count: n(r["count"]) })),
    energy: energy.map((r) => ({ bucket: n(r["bucket"]), count: n(r["count"]) })),
    topOverlap: overlap.map((r) => ({
      name: String(r["name"] ?? ""),
      artists: String(r["artists"] ?? ""),
      djCount: n(r["djCount"]),
      popularity: r["popularity"] == null ? null : n(r["popularity"]),
    })),
    generatedAt: new Date().toISOString(),
  });
});

// Whitelisted sort columns for the song list (never interpolate user input into SQL).
const SONG_SORT: Record<string, ReturnType<typeof sql>> = {
  popularity: sql`f.popularity`,
  tempo: sql`f.tempo`,
  energy: sql`f.energy`,
  djs: sql`"djCount"`,
  name: sql`b.name`,
};

/** Paginated, searchable song list — one row per Spotify track with features + DJ/playlist counts. */
catalogRoutes.get("/catalog/songs", async (c) => {
  const q = (c.req.query("q") ?? "").trim();
  const like = `%${q}%`;
  const sortKey = c.req.query("sort") ?? "popularity";
  const sortCol = SONG_SORT[sortKey] ?? SONG_SORT["popularity"];
  const dir = c.req.query("dir") === "asc" ? sql`asc` : sql`desc`;
  const limit = Math.min(200, Math.max(1, Number(c.req.query("limit") ?? 50)));
  const offset = Math.max(0, Number(c.req.query("offset") ?? 0));
  // `missing=1` → only songs with no Spotify features row yet (the enrichment backlog). Both queries
  // left-join `f`, so `f.spotify_id is null` is exactly the un-enriched set.
  const missing = c.req.query("missing") === "1";
  const conds = [
    ...(q ? [sql`(b.name ilike ${like} or b.artists ilike ${like})`] : []),
    ...(missing ? [sql`f.spotify_id is null`] : []),
  ];
  const filter = conds.length ? sql`where ${sql.join(conds, sql` and `)}` : sql``;

  const listRes = (await Promise.all([
    db.execute(sql`
      with base as (
        select spotify_id, max(name) as name, max(artists) as artists,
               count(distinct dj_user_id)::int as "djCount"
        from curated_tracks group by spotify_id
      )
      select b.spotify_id as "spotifyId", b.name, b.artists, b."djCount",
        f.tempo, f.key_pitch as "keyPitch", f.mode, f.energy, f.danceability, f.valence, f.popularity,
        coalesce(pc.cnt, 0) as "playlistCount"
      from base b
      left join spotify_track_features f on f.spotify_id = b.spotify_id
      left join (select spotify_id, count(distinct playlist_id)::int as cnt
                 from curated_playlist_tracks group by spotify_id) pc on pc.spotify_id = b.spotify_id
      ${filter}
      order by ${sortCol} ${dir} nulls last, b.name asc
      limit ${limit} offset ${offset}`),
    db.execute(sql`
      select count(*)::int as total from (
        select spotify_id, max(name) as name, max(artists) as artists
        from curated_tracks group by spotify_id
      ) b
      left join spotify_track_features f on f.spotify_id = b.spotify_id
      ${filter}`),
  ])) as unknown as Row[][];
  const rows = listRes[0] ?? [];
  const totalRows = listRes[1] ?? [];

  return c.json({
    total: n(totalRows[0]?.["total"]),
    limit,
    offset,
    songs: rows.map((r) => ({
      spotifyId: String(r["spotifyId"]),
      name: String(r["name"] ?? ""),
      artists: String(r["artists"] ?? ""),
      djCount: n(r["djCount"]),
      playlistCount: n(r["playlistCount"]),
      tempo: r["tempo"] == null ? null : n(r["tempo"]),
      keyPitch: r["keyPitch"] == null ? null : n(r["keyPitch"]),
      mode: r["mode"] == null ? null : n(r["mode"]),
      energy: r["energy"] == null ? null : n(r["energy"]),
      danceability: r["danceability"] == null ? null : n(r["danceability"]),
      valence: r["valence"] == null ? null : n(r["valence"]),
      popularity: r["popularity"] == null ? null : n(r["popularity"]),
    })),
  });
});

/** One song: full Spotify features + every DJ/playlist it appears in. Pika (sidecar) features are
 *  per-file and live desktop-side / on played_tracks — surfaced here once that linkage lands. */
catalogRoutes.get("/catalog/songs/:id", async (c) => {
  const id = c.req.param("id");
  const detailRes = (await Promise.all([
    db.execute(sql`
      select max(name) as name, max(artists) as artists,
             max(duration_ms) as "durationMs", max(album_art_url) as "albumArtUrl"
      from curated_tracks where spotify_id = ${id}`),
    db.execute(sql`select * from spotify_track_features where spotify_id = ${id}`),
    db.execute(sql`
      select cp.name as "playlistName", u.name as "djName", cp.source
      from curated_playlist_tracks cpt
      join curated_playlists cp on cp.id = cpt.playlist_id
      join "user" u on u.id = cp.dj_user_id
      where cpt.spotify_id = ${id}
      order by u.name, cp.name`),
    // Pika (sidecar) consensus: average the 0-100 fingerprints over every PLAY of this Spotify track,
    // joined via the normalized match_key (auto-reflects new resolutions; kept separate from Spotify's).
    db.execute(sql`
      select avg(pt.energy)::int as energy, avg(pt.danceability)::int as danceability,
             avg(pt.brightness)::int as brightness, avg(pt.acousticness)::int as acousticness,
             avg(pt.groove)::int as groove, avg(pt.bpm)::int as bpm,
             count(*)::int as plays, count(distinct s.dj_user_id)::int as djs
      from played_tracks pt
      join track_links tl on tl.match_key = pt.match_key
        and tl.provider_id = ${id} and tl.status in ('matched', 'manual')
      left join sessions s on s.id = pt.session_id
      where pt.match_key is not null`),
  ])) as unknown as Row[][];
  const metaR = detailRes[0] ?? [];
  const featR = detailRes[1] ?? [];
  const appsR = detailRes[2] ?? [];
  const pikaR = detailRes[3] ?? [];

  const meta = metaR[0];
  if (!meta?.["name"]) return c.json({ error: "Song not found" }, 404);
  const f = featR[0];
  const spotify = f
    ? {
        tempo: f["tempo"] == null ? null : n(f["tempo"]),
        keyPitch: f["key_pitch"] == null ? null : n(f["key_pitch"]),
        mode: f["mode"] == null ? null : n(f["mode"]),
        energy: f["energy"] == null ? null : n(f["energy"]),
        danceability: f["danceability"] == null ? null : n(f["danceability"]),
        valence: f["valence"] == null ? null : n(f["valence"]),
        acousticness: f["acousticness"] == null ? null : n(f["acousticness"]),
        instrumentalness: f["instrumentalness"] == null ? null : n(f["instrumentalness"]),
        liveness: f["liveness"] == null ? null : n(f["liveness"]),
        speechiness: f["speechiness"] == null ? null : n(f["speechiness"]),
        loudness: f["loudness"] == null ? null : n(f["loudness"]),
        timeSignature: f["time_signature"] == null ? null : n(f["time_signature"]),
        popularity: f["popularity"] == null ? null : n(f["popularity"]),
        releaseDate: f["release_date"] == null ? null : String(f["release_date"]),
        genres: f["genres"] == null ? null : String(f["genres"]),
        recordLabel: f["record_label"] == null ? null : String(f["record_label"]),
      }
    : null;

  // Pika consensus — null when this track was never played (no matched plays).
  const p = pikaR[0];
  const pika =
    p && n(p["plays"]) > 0
      ? {
          energy: p["energy"] == null ? null : n(p["energy"]),
          danceability: p["danceability"] == null ? null : n(p["danceability"]),
          brightness: p["brightness"] == null ? null : n(p["brightness"]),
          acousticness: p["acousticness"] == null ? null : n(p["acousticness"]),
          groove: p["groove"] == null ? null : n(p["groove"]),
          bpm: p["bpm"] == null ? null : n(p["bpm"]),
          plays: n(p["plays"]),
          djs: n(p["djs"]),
        }
      : null;

  return c.json({
    spotifyId: id,
    name: String(meta["name"]),
    artists: String(meta["artists"] ?? ""),
    durationMs: meta["durationMs"] == null ? null : n(meta["durationMs"]),
    albumArtUrl: meta["albumArtUrl"] == null ? null : String(meta["albumArtUrl"]),
    spotify,
    pika,
    appearances: appsR.map((r) => ({
      playlistName: String(r["playlistName"] ?? ""),
      djName: String(r["djName"] ?? ""),
      source: String(r["source"] ?? "csv"),
    })),
  });
});
