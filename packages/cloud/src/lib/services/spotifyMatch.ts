/**
 * Spotify track resolution (B3) — resolve a played VDJ track (artist/title [+ duration]) to a
 * Spotify recording via the app-token `/search`, ranked by name similarity + duration proximity +
 * popularity. Results are cached in `track_links` (the canonical, cross-DJ identity spine): a
 * `matched`/`manual` row short-circuits the Spotify call entirely. A DJ confirmation (`manual`)
 * always outranks an `auto` match. See docs/blueprints/music-provider-integration.md §5 + §12.
 */

import { getFuzzyKey, getTrackKey, normalizeFuzzy, type SpotifyAudioFeatures } from "@pika/shared";
import { eq, inArray, ne, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { db } from "../../db";
import {
  curatedPlaylists,
  curatedPlaylistTracks,
  curatedTracks,
  spotifyTrackFeatures,
  trackLinks,
} from "../../db/schema";
import { getAppAccessToken } from "./spotify";
import {
  confidenceTier,
  type MatchCandidate,
  type MatchConfidence,
  scoreCandidate,
} from "./spotifyMatchScore";

const API = "https://api.spotify.com/v1";

/** One Spotify track search (app token), returning the raw items. */
async function spotifySearch(token: string, q: string): Promise<SpotifySearchResponse["tracks"]> {
  const res = await fetch(`${API}/search?type=track&limit=10&q=${encodeURIComponent(q)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Spotify search failed: ${res.status}`);
  return ((await res.json()) as SpotifySearchResponse).tracks;
}

interface SpotifyTrackItem {
  id: string;
  uri: string;
  name: string;
  duration_ms: number;
  popularity: number;
  external_urls?: { spotify?: string };
  artists: Array<{ name: string }>;
  album?: { images?: Array<{ url: string }> };
}

function toCandidate(t: SpotifyTrackItem): MatchCandidate {
  return {
    spotifyId: t.id,
    uri: t.uri,
    url: t.external_urls?.spotify ?? `https://open.spotify.com/track/${t.id}`,
    name: t.name,
    artists: t.artists.map((a) => a.name).join(", "),
    durationMs: t.duration_ms,
    popularity: t.popularity,
    albumArtUrl: t.album?.images?.[0]?.url,
  };
}

/** Resolve a specific Spotify track id → a candidate (for the "paste a link" override). */
export async function resolveTrack(spotifyId: string): Promise<MatchCandidate | null> {
  const token = await getAppAccessToken();
  const res = await fetch(`${API}/tracks/${encodeURIComponent(spotifyId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 404 || res.status === 400) return null;
  if (!res.ok) throw new Error(`Spotify track lookup failed: ${res.status}`);
  return toCandidate((await res.json()) as SpotifyTrackItem);
}

/** Resolve many Spotify track ids → candidates (≤50/request) — used to backfill missing album art. */
export async function resolveTracks(ids: string[]): Promise<MatchCandidate[]> {
  if (ids.length === 0) return [];
  const token = await getAppAccessToken();
  const out: MatchCandidate[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    const res = await fetch(`${API}/tracks?ids=${batch.map(encodeURIComponent).join(",")}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Spotify tracks lookup failed: ${res.status}`);
    const json = (await res.json()) as { tracks: Array<SpotifyTrackItem | null> };
    for (const t of json.tracks) if (t) out.push(toCandidate(t));
  }
  return out;
}

export interface MatchResult {
  candidates: MatchCandidate[]; // recommended first
  recommendedIndex: number | null;
  confidence: MatchConfidence;
  cached: boolean;
}

interface SpotifySearchResponse {
  tracks?: {
    items: Array<{
      id: string;
      uri: string;
      name: string;
      duration_ms: number;
      popularity: number;
      external_urls?: { spotify?: string };
      artists: Array<{ name: string }>;
      album?: { images?: Array<{ url: string }> };
    }>;
  };
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

/** Write-through an auto match — but NEVER downgrade an existing DJ-confirmed (`manual`) row. */
export async function cacheAutoMatch(
  matchKey: string,
  songKey: string,
  providerId: string,
  providerUrl: string,
  confidence: number,
): Promise<void> {
  await db
    .insert(trackLinks)
    .values({
      matchKey,
      songKey,
      provider: "spotify",
      providerId,
      providerUrl,
      status: "matched",
      confidence,
      source: "auto",
    })
    .onConflictDoUpdate({
      target: trackLinks.matchKey,
      set: {
        songKey,
        providerId,
        providerUrl,
        status: "matched",
        confidence,
        source: "auto",
        updatedAt: new Date(),
      },
      setWhere: ne(trackLinks.source, "manual"),
    });
}

/** An authoritative match (DJ confirmation or a curated-playlist seed) — overwrites an auto match. */
export async function cacheAuthoritativeMatch(
  matchKey: string,
  songKey: string,
  providerId: string,
  providerUrl: string,
  source: "manual" | "playlist",
): Promise<void> {
  await db
    .insert(trackLinks)
    .values({
      matchKey,
      songKey,
      provider: "spotify",
      providerId,
      providerUrl,
      status: "manual",
      confidence: null,
      source,
    })
    .onConflictDoUpdate({
      target: trackLinks.matchKey,
      set: {
        songKey,
        providerId,
        providerUrl,
        status: "manual",
        confidence: null,
        source,
        updatedAt: new Date(),
      },
    });
}

/** A DJ-confirmed match (from the desktop Build-Playlist tool). */
export function cacheManualMatch(
  matchKey: string,
  songKey: string,
  providerId: string,
  providerUrl: string,
): Promise<void> {
  return cacheAuthoritativeMatch(matchKey, songKey, providerId, providerUrl, "manual");
}

// ---------------------------------------------------------------------------
// Resolve
// ---------------------------------------------------------------------------

export async function searchAndRank(input: {
  artist: string;
  title: string;
  durationMs?: number | undefined;
}): Promise<MatchResult> {
  // EXACT key for the cache (version-precise: "Believer" ≠ "Believer (Acoustic)"); FUZZY song key
  // is stored alongside for analytics grouping only.
  const matchKey = getTrackKey(input.artist, input.title);
  const songKey = getFuzzyKey(input.artist, input.title);

  // 1. Cache hit (matched/manual) short-circuits the Spotify call.
  const [cached] = await db
    .select()
    .from(trackLinks)
    .where(eq(trackLinks.matchKey, matchKey))
    .limit(1);
  if (cached?.providerId && (cached.status === "matched" || cached.status === "manual")) {
    const id = cached.providerId;
    return {
      candidates: [
        {
          spotifyId: id,
          uri: `spotify:track:${id}`,
          url: cached.providerUrl ?? `https://open.spotify.com/track/${id}`,
          name: input.title,
          artists: input.artist,
          durationMs: input.durationMs ?? 0,
          popularity: 0,
        },
      ],
      recommendedIndex: 0,
      confidence:
        cached.source === "manual" ||
        cached.source === "playlist" ||
        (cached.confidence ?? 0) >= 0.8
          ? "high"
          : "medium",
      cached: true,
    };
  }

  // 2. Search via the app token. A strict `track:<base title> artist:<artist>` filter is precise
  // AND still returns versions (Spotify's `track:` matches names CONTAINING the term, so
  // "Believer (Acoustic)" comes back for `track:believer`) — while tolerating noisy VDJ titles
  // ("… (live at ATP-NY 2010)") that a plain query turns into garbage. We clean the title for the
  // QUERY (recall) but rank with the ORIGINAL title (version awareness via descriptorDelta), so the
  // right *recording* wins. Plain cleaned query is a recall fallback only.
  const token = await getAppAccessToken();
  const cleanTitle = normalizeFuzzy(input.title) || input.title;
  let items =
    (await spotifySearch(token, `track:${cleanTitle} artist:${input.artist}`))?.items ?? [];
  if (items.length === 0) {
    items = (await spotifySearch(token, `${input.artist} ${cleanTitle}`))?.items ?? [];
  }

  const candidates: MatchCandidate[] = items.map(toCandidate);
  if (candidates.length === 0) {
    return { candidates: [], recommendedIndex: null, confidence: "none", cached: false };
  }

  // 3. Rank (recommended first).
  const scored = candidates
    .map((c, i) => ({ i, score: scoreCandidate(input, c) }))
    .sort((a, b) => b.score - a.score);
  const best = scored[0];
  const confidence = confidenceTier(best?.score ?? 0);
  const ordered = scored.map((s) => candidates[s.i]).filter((c): c is MatchCandidate => Boolean(c));

  // 4. Write-through a confident auto match.
  const top = ordered[0];
  if (confidence === "high" && top && best) {
    await cacheAutoMatch(matchKey, songKey, top.spotifyId, top.url, best.score);
  }

  return { candidates: ordered, recommendedIndex: 0, confidence, cached: false };
}

// ---------------------------------------------------------------------------
// Seed (B3) — bootstrap the catalog from a DJ's curated public playlist
// ---------------------------------------------------------------------------

export interface SeedTrack {
  spotifyId: string;
  uri: string;
  name: string;
  artists: string;
  durationMs?: number | undefined;
  albumArtUrl?: string | undefined;
  // Spotify's own audio features (CSV import only — the profile-load path omits these).
  features?: SpotifyAudioFeatures | undefined;
}

/**
 * Record a DJ's curated playlist tracks: append to `curated_tracks` (their repertoire — distinct
 * from what they *played*) and seed `track_links` (authoritative `playlist` source) so future
 * matching gets a head start. Keyed on the EXACT key from the Spotify track's own artist/title.
 * When a track carries Spotify's own `features` (CSV import), upserts the canonical per-URI
 * `spotify_track_features` row too. When `playlistName` is given, the playlist becomes a first-class
 * entity and per-track membership is recorded (re-import is authoritative — memberships replaced).
 *
 * `linkMode` is the identity-spine write policy (Slice D). `track_links` is GLOBAL (one row per
 * matchKey, no DJ scoping) and the public trust gate honors `source='playlist'` outright — so:
 *  - "authoritative" (admin seed, finalizeWebSet — witnessed or operator-curated data): the
 *    historical behavior, conflict rows are overwritten.
 *  - "fill" (DJ-facing import — self-asserted data): conflict rows are updated ONLY while still
 *    untrusted (`unmatched`, or low-confidence `auto`); `manual`/`playlist`/high-confidence links
 *    that other dancers' journals, exports and compat already rely on are never clobbered. New
 *    matchKeys still insert — that's the value of the import.
 */
export async function seedFromPlaylist(
  djUserId: string,
  playlistName: string,
  tracks: SeedTrack[],
  source: "csv" | "profile" = "csv",
  featuresSource = "csv",
  opts: { linkMode?: "authoritative" | "fill" } = {},
): Promise<{ playlistId: number | null; trackCount: number }> {
  const linkMode = opts.linkMode ?? "authoritative";
  // Dedupe by spotify id (a multi-row upsert can't touch the same conflict target twice); latest wins.
  const byId = new Map<string, SeedTrack>();
  for (const t of tracks) byId.set(t.spotifyId, t);
  const uniq = [...byId.values()];

  // One transaction with a handful of MULTI-ROW upserts — vs the old ~4 writes/track (a 600-track
  // playlist was ~2,400 sequential round-trips). Keeps a big CSV import to a couple of statements.
  return db.transaction(async (tx) => {
    let playlistId: number | null = null;
    if (playlistName) {
      const [pl] = await tx
        .insert(curatedPlaylists)
        .values({ djUserId, name: playlistName, source })
        .onConflictDoUpdate({
          target: [curatedPlaylists.djUserId, curatedPlaylists.name],
          set: { source, updatedAt: new Date() },
        })
        .returning({ id: curatedPlaylists.id });
      playlistId = pl?.id ?? null;
      // Membership replaced so a re-import is authoritative (done ONCE, not per chunk).
      if (playlistId !== null) {
        await tx
          .delete(curatedPlaylistTracks)
          .where(eq(curatedPlaylistTracks.playlistId, playlistId));
      }
    }
    if (uniq.length === 0) return { playlistId, trackCount: 0 };

    // 1. curated_tracks (repertoire edge).
    await tx
      .insert(curatedTracks)
      .values(
        uniq.map((t) => ({
          djUserId,
          spotifyId: t.spotifyId,
          name: t.name,
          artists: t.artists,
          durationMs: t.durationMs ?? null,
          albumArtUrl: t.albumArtUrl ?? null,
          playlistName,
        })),
      )
      .onConflictDoUpdate({
        target: [curatedTracks.djUserId, curatedTracks.spotifyId],
        set: {
          name: sql`excluded.name`,
          artists: sql`excluded.artists`,
          playlistName: sql`excluded.playlist_name`,
        },
      });

    // 2. playlist membership.
    if (playlistId !== null) {
      await tx
        .insert(curatedPlaylistTracks)
        .values(uniq.map((t) => ({ playlistId: playlistId as number, spotifyId: t.spotifyId })))
        .onConflictDoNothing();
    }

    // 3. track_links (identity spine). Dedupe by match_key; write policy per `linkMode` (see
    // the function docstring — "fill" must never overwrite links other surfaces already trust).
    const linkByKey = new Map<string, { matchKey: string; songKey: string; spotifyId: string }>();
    for (const t of uniq) {
      const matchKey = getTrackKey(t.artists, t.name);
      linkByKey.set(matchKey, {
        matchKey,
        songKey: getFuzzyKey(t.artists, t.name),
        spotifyId: t.spotifyId,
      });
    }
    await tx
      .insert(trackLinks)
      .values(
        [...linkByKey.values()].map((l) => ({
          matchKey: l.matchKey,
          songKey: l.songKey,
          provider: "spotify",
          providerId: l.spotifyId,
          providerUrl: `https://open.spotify.com/track/${l.spotifyId}`,
          status: "manual",
          confidence: null,
          source: "playlist",
        })),
      )
      .onConflictDoUpdate({
        target: trackLinks.matchKey,
        set: {
          songKey: sql`excluded.song_key`,
          providerId: sql`excluded.provider_id`,
          providerUrl: sql`excluded.provider_url`,
          status: "manual",
          confidence: null,
          source: "playlist",
          updatedAt: new Date(),
        },
        ...(linkMode === "fill" && {
          // Only fill rows that are still untrusted; existing row columns are table-qualified.
          setWhere: sql`${trackLinks.status} = 'unmatched' or (${trackLinks.source} = 'auto' and (${trackLinks.confidence} is null or ${trackLinks.confidence} < 0.8))`,
        }),
      });

    // 4. canonical Spotify features (CSV import) for the tracks that carry them.
    const featRows = uniq
      .filter((t) => t.features)
      .map((t) => spotifyFeatureRow(t.spotifyId, t.features!, featuresSource));
    if (featRows.length > 0) {
      await tx.insert(spotifyTrackFeatures).values(featRows).onConflictDoUpdate({
        target: spotifyTrackFeatures.spotifyId,
        set: SPOTIFY_FEATURE_EXCLUDED,
      });
    }

    return { playlistId, trackCount: uniq.length };
  });
}

/** Map shared features → the per-URI features row (null-filled). `featuresSource` drives merge precedence. */
function spotifyFeatureRow(spotifyId: string, f: SpotifyAudioFeatures, featuresSource: string) {
  return {
    spotifyId,
    tempo: f.tempo ?? null,
    keyPitch: f.keyPitch ?? null,
    mode: f.mode ?? null,
    energy: f.energy ?? null,
    danceability: f.danceability ?? null,
    valence: f.valence ?? null,
    acousticness: f.acousticness ?? null,
    instrumentalness: f.instrumentalness ?? null,
    liveness: f.liveness ?? null,
    speechiness: f.speechiness ?? null,
    loudness: f.loudness ?? null,
    timeSignature: f.timeSignature ?? null,
    popularity: f.popularity ?? null,
    releaseDate: f.releaseDate ?? null,
    genres: f.genres ?? null,
    recordLabel: f.recordLabel ?? null,
    isrc: f.isrc ?? null,
    camelot: f.camelot ?? null,
    featuresSource,
  };
}

// Precision rank of a features source: exportify (0-1 floats) > chosic (rounded 0-100 ints) > other.
const RANK_EXC = sql.raw(
  "(case excluded.features_source when 'exportify' then 2 when 'chosic' then 1 else 0 end)",
);
const RANK_CUR = sql.raw(
  "(case spotify_track_features.features_source when 'exportify' then 2 when 'chosic' then 1 else 0 end)",
);

/**
 * Numeric-block merge: prefer the incoming value when its source ranks ≥ the stored one (a rounded
 * Chosic value never clobbers an Exportify float), but `coalesce` both ways so a null never wipes an
 * existing value. `col` is the raw DB column name (e.g. "key_pitch"), `cur` the Drizzle column.
 */
function precMerge(col: string, cur: AnyPgColumn) {
  const exc = sql.raw(`excluded.${col}`);
  return sql`case when ${RANK_EXC} >= ${RANK_CUR} then coalesce(${exc}, ${cur}) else coalesce(${cur}, ${exc}) end`;
}

/**
 * The ON CONFLICT SET clause for the per-URI features upsert — ACCRETIVE (best-of-both across
 * Exportify + Chosic, any upload order): numeric block is precision-guarded (`precMerge`); the
 * identity/extras are fill-if-missing (never overwrite an existing value); `features_source` tracks
 * the winning numeric block.
 */
const SPOTIFY_FEATURE_EXCLUDED = {
  tempo: precMerge("tempo", spotifyTrackFeatures.tempo),
  keyPitch: precMerge("key_pitch", spotifyTrackFeatures.keyPitch),
  mode: precMerge("mode", spotifyTrackFeatures.mode),
  energy: precMerge("energy", spotifyTrackFeatures.energy),
  danceability: precMerge("danceability", spotifyTrackFeatures.danceability),
  valence: precMerge("valence", spotifyTrackFeatures.valence),
  acousticness: precMerge("acousticness", spotifyTrackFeatures.acousticness),
  instrumentalness: precMerge("instrumentalness", spotifyTrackFeatures.instrumentalness),
  liveness: precMerge("liveness", spotifyTrackFeatures.liveness),
  speechiness: precMerge("speechiness", spotifyTrackFeatures.speechiness),
  loudness: precMerge("loudness", spotifyTrackFeatures.loudness),
  timeSignature: precMerge("time_signature", spotifyTrackFeatures.timeSignature),
  // Extras: fill-if-missing (keep existing, fill only when null) — isrc/camelot are Chosic-only,
  // recordLabel is Exportify-only, so each source enriches the other without clobbering.
  popularity: sql`coalesce(${spotifyTrackFeatures.popularity}, excluded.popularity)`,
  releaseDate: sql`coalesce(${spotifyTrackFeatures.releaseDate}, excluded.release_date)`,
  genres: sql`coalesce(${spotifyTrackFeatures.genres}, excluded.genres)`,
  recordLabel: sql`coalesce(${spotifyTrackFeatures.recordLabel}, excluded.record_label)`,
  isrc: sql`coalesce(${spotifyTrackFeatures.isrc}, excluded.isrc)`,
  camelot: sql`coalesce(${spotifyTrackFeatures.camelot}, excluded.camelot)`,
  featuresSource: sql`case when ${RANK_EXC} >= ${RANK_CUR} then excluded.features_source else ${spotifyTrackFeatures.featuresSource} end`,
  updatedAt: new Date(),
};

/**
 * Look up canonical Spotify audio features for a set of track ids (the desktop reads these by
 * `spotify_id` to display Spotify's features beside its own Pika sidecar features). Returns only the
 * ids we actually have features for; each result drops null fields. Pure DB read — no Spotify call.
 */
export async function getSpotifyFeatures(
  ids: string[],
): Promise<Record<string, SpotifyAudioFeatures>> {
  if (ids.length === 0) return {};
  const rows = await db
    .select()
    .from(spotifyTrackFeatures)
    .where(inArray(spotifyTrackFeatures.spotifyId, ids));

  const out: Record<string, SpotifyAudioFeatures> = {};
  for (const r of rows) {
    const f: SpotifyAudioFeatures = {};
    if (r.tempo != null) f.tempo = r.tempo;
    if (r.keyPitch != null) f.keyPitch = r.keyPitch;
    if (r.mode != null) f.mode = r.mode;
    if (r.energy != null) f.energy = r.energy;
    if (r.danceability != null) f.danceability = r.danceability;
    if (r.valence != null) f.valence = r.valence;
    if (r.acousticness != null) f.acousticness = r.acousticness;
    if (r.instrumentalness != null) f.instrumentalness = r.instrumentalness;
    if (r.liveness != null) f.liveness = r.liveness;
    if (r.speechiness != null) f.speechiness = r.speechiness;
    if (r.loudness != null) f.loudness = r.loudness;
    if (r.timeSignature != null) f.timeSignature = r.timeSignature;
    if (r.popularity != null) f.popularity = r.popularity;
    if (r.releaseDate != null) f.releaseDate = r.releaseDate;
    if (r.genres != null) f.genres = r.genres;
    if (r.recordLabel != null) f.recordLabel = r.recordLabel;
    if (r.isrc != null) f.isrc = r.isrc;
    if (r.camelot != null) f.camelot = r.camelot;
    out[r.spotifyId] = f;
  }
  return out;
}
