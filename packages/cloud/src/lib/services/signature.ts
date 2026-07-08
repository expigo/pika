/**
 * The DJ Signature (Slice D) — the honest, computed "what to expect from this DJ".
 *
 * Doctrine (locked 2026-07-07, three-way convergence):
 *  - Computed from EXACTLY what the Booth displays: ALL published live sessions (the Booth's
 *    20-row session list is pagination, not the definition) + `showOnBooth` curated playlists.
 *    One dial per surface; hiding something has a visible cost — the denominator shrinks.
 *  - SPOTIFY features are the ONLY scale here (0–1 floats + tempo + releaseDate from
 *    `spotify_track_features`). The Pika 0–100 sidecar axes live on recap/analytics surfaces —
 *    the two scales are never blended (schema doctrine).
 *  - Distributions run over DISTINCT spotify ids across all contexts — the same-night
 *    live+import dedupe falls out for free. Ranges come from percentiles, never averages
 *    ("signature, never a box").
 *  - The floors are LOAD-BEARING: below SIGNATURE_MIN_TRACKS featured tracks or
 *    SIGNATURE_MIN_CONTEXTS contexts the card renders NOTHING — a thin statistic is a gameable
 *    one, and the denominator line ships with every card so thinness stays visible (Signature
 *    honesty is socially enforced at pilot scale, by explicit choice).
 *  - Live plays resolve through the STRICT public trust gate (trustedSpotifyLinkOn) — never a
 *    low-confidence guess on a public surface. Legacy anonymous sessions (djUserId NULL) are
 *    invisible here; documented limitation.
 */

import { LIMITS, type SpotifyAudioFeatures } from "@pika/shared";
import { and, asc, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "../../db";
import {
  curatedPlaylists,
  curatedPlaylistTracks,
  curatedTracks,
  playedTracks,
  sessions,
  trackLinks,
} from "../../db/schema";
import { trustedSpotifyLinkOn } from "./journal";
import { getSpotifyFeatures } from "./spotifyMatch";

/** A context must have at least this many plays to count (mirrors the recap's noise floor). */
const MIN_TRACKS_PER_CONTEXT = 3;

export interface SignatureBand {
  p25: number;
  median: number;
  p75: number;
}

export interface DjSignature {
  /**
   * The LOAD-BEARING denominator — always rendered with the card. `liveTracks`/`importedTracks`
   * are FEATURED counts per source (live-first attribution on overlap, so the two always sum to
   * `featuredTracks`): the denominator states each context's real weight, not just its presence.
   */
  contexts: { live: number; imported: number; liveTracks: number; importedTracks: number };
  distinctTracks: number;
  featuredTracks: number;
  /** featuredTracks / distinctTracks, 0–1 (two decimals). */
  coverage: number;
  tempo: { min: number; p25: number; median: number; p75: number; max: number };
  energy: SignatureBand;
  danceability: SignatureBand;
  valence: SignatureBand;
  /** Present only when the corpus carries acousticness values (never a fake zero band). */
  acousticness?: SignatureBand;
  /** Top decades by share of featured tracks with a parseable year, e.g. "2010s". */
  eras: { decade: string; share: number }[];
}

/** Owner-only "why no card yet" numbers — returned ONLY on /me/booth, never publicly. */
export interface SignatureProgress {
  featuredTracks: number;
  distinctTracks: number;
  contexts: { live: number; imported: number };
}

/** Linear-interpolated percentile over a SORTED ascending array. */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  const w = idx - lo;
  return sorted[lo]! * (1 - w) + sorted[hi]! * w;
}

function band(values: number[], round: (n: number) => number): SignatureBand {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    p25: round(percentile(sorted, 0.25)),
    median: round(percentile(sorted, 0.5)),
    p75: round(percentile(sorted, 0.75)),
  };
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Parse the leading year of a free-text release date ("2016-03-04" or "1998"); null if absent. */
export function releaseYear(releaseDate: string | undefined): number | null {
  if (!releaseDate) return null;
  const m = releaseDate.match(/^(\d{4})/);
  if (!m) return null;
  const y = Number(m[1]);
  return y >= 1900 && y <= 2100 ? y : null;
}

/**
 * Pure core — exported for unit tests. `rows` are the feature objects for the DJ's distinct
 * repertoire ids; a track is "featured" when it carries a tempo (the same criterion as the
 * catalog's coverage stats and the manager's featureCount hint).
 */
export function computeSignatureFromRows(
  rows: SpotifyAudioFeatures[],
  contexts: DjSignature["contexts"],
  distinctTracks: number,
): DjSignature | null {
  const featured = rows.filter((r) => r.tempo != null);
  if (featured.length < LIMITS.SIGNATURE_MIN_TRACKS) return null;
  if (contexts.live + contexts.imported < LIMITS.SIGNATURE_MIN_CONTEXTS) return null;

  const tempos = featured
    .map((r) => r.tempo)
    .filter((t): t is number => t != null)
    .sort((a, b) => a - b);
  const pick = (metric: (r: SpotifyAudioFeatures) => number | undefined): number[] =>
    featured.map(metric).filter((v): v is number => v != null);

  const years = featured
    .map((r) => releaseYear(r.releaseDate))
    .filter((y): y is number => y != null);
  const byDecade = new Map<string, number>();
  for (const y of years) {
    const decade = `${Math.floor(y / 10) * 10}s`;
    byDecade.set(decade, (byDecade.get(decade) ?? 0) + 1);
  }
  const eras = [...byDecade.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([decade, n]) => ({ decade, share: round2(n / years.length) }));

  const acousticnessValues = pick((r) => r.acousticness);

  return {
    contexts,
    distinctTracks,
    featuredTracks: featured.length,
    coverage: distinctTracks > 0 ? round2(featured.length / distinctTracks) : 0,
    tempo: {
      min: Math.round(tempos[0]!),
      p25: Math.round(percentile(tempos, 0.25)),
      median: Math.round(percentile(tempos, 0.5)),
      p75: Math.round(percentile(tempos, 0.75)),
      max: Math.round(tempos[tempos.length - 1]!),
    },
    energy: band(
      pick((r) => r.energy),
      round2,
    ),
    danceability: band(
      pick((r) => r.danceability),
      round2,
    ),
    valence: band(
      pick((r) => r.valence),
      round2,
    ),
    ...(acousticnessValues.length > 0 ? { acousticness: band(acousticnessValues, round2) } : {}),
    eras,
  };
}

/**
 * Split the FEATURED (tempo-bearing) ids by provenance, live-first on overlap: a track both
 * played live and imported credits live (the prize — and the two counts sum exactly to
 * featuredTracks, so the denominator's parts never contradict its total).
 */
export function splitFeaturedBySource(
  featuresById: Record<string, SpotifyAudioFeatures>,
  liveIds: Set<string>,
  importedIds: Set<string>,
): { liveTracks: number; importedTracks: number } {
  let liveTracks = 0;
  let importedTracks = 0;
  for (const [id, f] of Object.entries(featuresById)) {
    if (f.tempo == null) continue;
    if (liveIds.has(id)) liveTracks++;
    else if (importedIds.has(id)) importedTracks++;
  }
  return { liveTracks, importedTracks };
}

/**
 * The DJ's public repertoire: distinct spotify ids from ALL published live sessions (strict
 * trust gate) ∪ promoted (showOnBooth) curated playlists — the Signature's context set, shared
 * with the compatibility score so both surfaces describe the same repertoire.
 */
export async function getDjRepertoire(djUserId: string): Promise<{
  ids: Set<string>;
  /** Per-source distinct ids (overlap allowed) — provenance for the denominator's track counts. */
  liveIds: Set<string>;
  importedIds: Set<string>;
  contexts: { live: number; imported: number };
}> {
  // Contexts: ALL published live sessions with enough plays…
  const liveSessions = await db
    .select({ id: sessions.id })
    .from(sessions)
    .innerJoin(playedTracks, eq(playedTracks.sessionId, sessions.id))
    .where(and(eq(sessions.djUserId, djUserId), eq(sessions.published, true)))
    .groupBy(sessions.id)
    .having(sql`count(*) >= ${MIN_TRACKS_PER_CONTEXT}`);

  // …plus the DJ's promoted (showOnBooth) curated playlists.
  const promoted = await db
    .select({ id: curatedPlaylists.id })
    .from(curatedPlaylists)
    .where(and(eq(curatedPlaylists.djUserId, djUserId), eq(curatedPlaylists.showOnBooth, true)));

  // Distinct spotify ids per source. Live resolves via the strict trust gate.
  const liveIdRows =
    liveSessions.length > 0
      ? await db
          .selectDistinct({ id: trackLinks.providerId })
          .from(playedTracks)
          .innerJoin(sessions, eq(playedTracks.sessionId, sessions.id))
          .innerJoin(trackLinks, trustedSpotifyLinkOn())
          .where(
            and(
              eq(sessions.djUserId, djUserId),
              eq(sessions.published, true),
              isNotNull(playedTracks.matchKey),
              isNotNull(trackLinks.providerId),
            ),
          )
      : [];
  const importedIdRows =
    promoted.length > 0
      ? await db
          .selectDistinct({ id: curatedPlaylistTracks.spotifyId })
          .from(curatedPlaylistTracks)
          .where(
            inArray(
              curatedPlaylistTracks.playlistId,
              promoted.map((p) => p.id),
            ),
          )
      : [];

  const liveIds = new Set<string>();
  for (const r of liveIdRows) if (r.id) liveIds.add(r.id);
  const importedIds = new Set<string>();
  for (const r of importedIdRows) importedIds.add(r.id);
  const ids = new Set<string>([...liveIds, ...importedIds]);
  return {
    ids,
    liveIds,
    importedIds,
    contexts: { live: liveSessions.length, imported: promoted.length },
  };
}

/**
 * Compute a DJ's Signature plus the owner-only floors progress (same single repertoire query +
 * features fetch). `signature` is null below the floors; `progress` always carries the raw
 * counts so the Booth manager can say WHY and what to do next. Progress never ships publicly.
 */
export async function computeSignatureWithProgress(
  djUserId: string,
): Promise<{ signature: DjSignature | null; progress: SignatureProgress }> {
  const { ids, liveIds, importedIds, contexts } = await getDjRepertoire(djUserId);
  if (ids.size === 0) {
    return { signature: null, progress: { featuredTracks: 0, distinctTracks: 0, contexts } };
  }

  const features = await getSpotifyFeatures([...ids]);
  const { liveTracks, importedTracks } = splitFeaturedBySource(features, liveIds, importedIds);
  const signature = computeSignatureFromRows(
    Object.values(features),
    { ...contexts, liveTracks, importedTracks },
    ids.size,
  );
  return {
    signature,
    progress: {
      featuredTracks: liveTracks + importedTracks,
      distinctTracks: ids.size,
      contexts,
    },
  };
}

/**
 * Compute a DJ's Signature from the live DB. Returns null below the floors (the card renders
 * nothing). Called inside the slug-cached Booth payload — slug-global data, no per-viewer state.
 */
export async function computeSignature(djUserId: string): Promise<DjSignature | null> {
  return (await computeSignatureWithProgress(djUserId)).signature;
}

// ────────────────────────────────────────────────────────────────────────────
// Booth native playlists (promoted curated playlists + preview tracks)
// ────────────────────────────────────────────────────────────────────────────

export interface BoothPlaylistTrack {
  title: string;
  artist: string;
  albumArtUrl: string | null;
  spotifyUrl: string;
}

export interface BoothPlaylist {
  id: number;
  name: string;
  label: string | null;
  kind: string | null;
  /** PROVENANCE: 'profile' → "⚡ Played live on Pika", 'csv' → "DJ's pick". */
  source: string;
  spotifyUrl: string | null;
  trackCount: number;
  tracks: BoothPlaylistTrack[];
}

/**
 * The DJ's promoted playlists for the public Booth, each with a short native preview
 * (no iframes — the data we own, rendered light). Preview order = insertion order
 * (curated_playlist_tracks has no position column; memberships are rewritten per import).
 */
export async function getBoothPlaylists(djUserId: string): Promise<BoothPlaylist[]> {
  const lists = await db
    .select({
      id: curatedPlaylists.id,
      name: curatedPlaylists.name,
      label: curatedPlaylists.label,
      kind: curatedPlaylists.kind,
      source: curatedPlaylists.source,
      spotifyUrl: curatedPlaylists.spotifyUrl,
    })
    .from(curatedPlaylists)
    .where(and(eq(curatedPlaylists.djUserId, djUserId), eq(curatedPlaylists.showOnBooth, true)))
    .orderBy(desc(curatedPlaylists.updatedAt));
  if (lists.length === 0) return [];

  // Track counts as a grouped query — NOT a correlated sql`` subquery in the projection:
  // drizzle renders embedded column refs there UNQUALIFIED, so the correlation silently binds
  // to the subquery's own table (verified live — it returned garbage counts).
  const countRows = await db
    .select({ playlistId: curatedPlaylistTracks.playlistId, n: sql<number>`count(*)::int` })
    .from(curatedPlaylistTracks)
    .where(
      inArray(
        curatedPlaylistTracks.playlistId,
        lists.map((l) => l.id),
      ),
    )
    .groupBy(curatedPlaylistTracks.playlistId);
  const countById = new Map(countRows.map((r) => [r.playlistId, r.n]));

  const out: BoothPlaylist[] = [];
  for (const pl of lists) {
    const preview = await db
      .select({
        spotifyId: curatedPlaylistTracks.spotifyId,
        title: curatedTracks.name,
        artist: curatedTracks.artists,
        albumArtUrl: curatedTracks.albumArtUrl,
      })
      .from(curatedPlaylistTracks)
      .innerJoin(
        curatedTracks,
        and(
          eq(curatedTracks.spotifyId, curatedPlaylistTracks.spotifyId),
          eq(curatedTracks.djUserId, djUserId),
        ),
      )
      .where(eq(curatedPlaylistTracks.playlistId, pl.id))
      .orderBy(asc(curatedPlaylistTracks.id))
      .limit(LIMITS.BOOTH_PLAYLIST_PREVIEW_TRACKS);
    out.push({
      ...pl,
      trackCount: countById.get(pl.id) ?? 0,
      tracks: preview.map((t) => ({
        title: t.title,
        artist: t.artist,
        albumArtUrl: t.albumArtUrl ?? null,
        spotifyUrl: `https://open.spotify.com/track/${t.spotifyId}`,
      })),
    });
  }
  return out;
}
