/**
 * Spotify track resolution (B3) — resolve a played VDJ track (artist/title [+ duration]) to a
 * Spotify recording via the app-token `/search`, ranked by name similarity + duration proximity +
 * popularity. Results are cached in `track_links` (the canonical, cross-DJ identity spine): a
 * `matched`/`manual` row short-circuits the Spotify call entirely. A DJ confirmation (`manual`)
 * always outranks an `auto` match. See docs/blueprints/music-provider-integration.md §5 + §12.
 */

import { getFuzzyKey, normalizeFuzzy } from "@pika/shared";
import { eq, ne } from "drizzle-orm";
import { db } from "../../db";
import { trackLinks } from "../../db/schema";
import { getAppAccessToken } from "./spotify";

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

export interface MatchCandidate {
  spotifyId: string;
  uri: string; // spotify:track:ID
  url: string; // open.spotify.com/track/ID
  name: string;
  artists: string;
  durationMs: number;
  popularity: number;
  albumArtUrl?: string | undefined;
}

export type MatchConfidence = "high" | "medium" | "low" | "none";

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
// Ranking (pure, unit-tested)
// ---------------------------------------------------------------------------

function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .split(/[^a-z0-9]+/i)
      .filter(Boolean),
  );
}

/** Sørensen–Dice coefficient over token sets (0..1). */
function diceSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return (2 * inter) / (a.size + b.size);
}

/** ±3 s → 1.0 (strong), then decays to 0 over the next 30 s. Neutral 0.5 when duration unknown. */
function durationScore(queryMs: number | undefined, candMs: number): number {
  if (!queryMs || !candMs) return 0.5;
  const diff = Math.abs(queryMs - candMs);
  if (diff <= 3000) return 1;
  return Math.max(0, 1 - (diff - 3000) / 30000);
}

// Version descriptors that distinguish recordings of the "same" song — the signal we must keep
// for WCS (acoustic/slow/remix/cover edits are the norm, not the studio original).
const DESCRIPTORS = [
  "acoustic",
  "unplugged",
  "instrumental",
  "live",
  "remix",
  "edit",
  "cover",
  "remaster",
  "remastered",
  "extended",
  "version",
  "demo",
  "reprise",
];

function descriptorSet(s: string): Set<string> {
  const l = s.toLowerCase();
  return new Set(DESCRIPTORS.filter((d) => l.includes(d)));
}

/**
 * Reward a candidate whose version descriptors match the played title's, and penalise mismatches —
 * so a played "Believer (Acoustic)" prefers the acoustic recording, and a plain "Believer" prefers
 * the studio original over a remix/live. (The fuzzy-key floor below treats all versions as the same
 * song, so this delta is what separates them.)
 */
function descriptorDelta(queryTitle: string, candidateName: string): number {
  const want = descriptorSet(queryTitle);
  const have = descriptorSet(candidateName);
  let d = 0;
  for (const x of want) d += have.has(x) ? 0.12 : -0.12; // a wanted descriptor present / missing
  for (const x of have) if (!want.has(x)) d -= 0.06; // candidate carries an un-asked-for version
  return d;
}

export function scoreCandidate(
  query: { artist: string; title: string; durationMs?: number | undefined },
  c: MatchCandidate,
): number {
  const qTokens = tokenize(`${query.artist} ${query.title}`);
  const nameSim = diceSimilarity(qTokens, tokenize(`${c.artists} ${c.name}`));
  const dur = durationScore(query.durationMs, c.durationMs);
  const pop = Math.max(0, Math.min(100, c.popularity)) / 100;
  let score = 0.55 * nameSim + 0.3 * dur + 0.15 * pop;
  // A fuzzy-key exact match (same normalized artist::title) is a strong identity signal.
  if (getFuzzyKey(c.artists, c.name) === getFuzzyKey(query.artist, query.title)) {
    score = Math.max(score, 0.85);
  }
  // …then nudge by version alignment so the right *recording* wins, not just the right song.
  score += descriptorDelta(query.title, c.name);
  return Math.max(0, Math.min(1, score));
}

export function confidenceTier(score: number): MatchConfidence {
  if (score >= 0.8) return "high";
  if (score >= 0.55) return "medium";
  if (score > 0) return "low";
  return "none";
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

/** Write-through an auto match — but NEVER downgrade an existing DJ-confirmed (`manual`) row. */
export async function cacheAutoMatch(
  matchKey: string,
  providerId: string,
  providerUrl: string,
  confidence: number,
): Promise<void> {
  await db
    .insert(trackLinks)
    .values({
      matchKey,
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

/** A DJ-confirmed match — authoritative; overwrites any prior auto match. */
export async function cacheManualMatch(
  matchKey: string,
  providerId: string,
  providerUrl: string,
): Promise<void> {
  await db
    .insert(trackLinks)
    .values({
      matchKey,
      provider: "spotify",
      providerId,
      providerUrl,
      status: "manual",
      confidence: null,
      source: "manual",
    })
    .onConflictDoUpdate({
      target: trackLinks.matchKey,
      set: {
        providerId,
        providerUrl,
        status: "manual",
        confidence: null,
        source: "manual",
        updatedAt: new Date(),
      },
    });
}

// ---------------------------------------------------------------------------
// Resolve
// ---------------------------------------------------------------------------

export async function searchAndRank(input: {
  artist: string;
  title: string;
  durationMs?: number | undefined;
}): Promise<MatchResult> {
  const fuzzyKey = getFuzzyKey(input.artist, input.title);

  // 1. Cache hit (matched/manual) short-circuits the Spotify call.
  const [cached] = await db
    .select()
    .from(trackLinks)
    .where(eq(trackLinks.matchKey, fuzzyKey))
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
      confidence: cached.source === "manual" || (cached.confidence ?? 0) >= 0.8 ? "high" : "medium",
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
    await cacheAutoMatch(fuzzyKey, top.spotifyId, top.url, best.score);
  }

  return { candidates: ordered, recommendedIndex: 0, confidence, cached: false };
}
