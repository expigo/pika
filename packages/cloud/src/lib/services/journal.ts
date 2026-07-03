/**
 * Dancer Journal — retro-enrichment + "My Pika Journal" playlist export.
 *
 * A dancer's likes resolve to Spotify identity two ways: the broadcast-time snapshot on
 * `played_tracks.spotify_url` (wedge-era plays), else the shared identity spine
 * (`track_links` by `match_key`) — TRUST-GATED so a low-confidence auto guess never reaches a
 * dancer's journal or playlist. Export creates ONE unlisted (link-only) playlist per clientId on
 * the shared Pika service account and regenerates it in place on re-export (per-dancer OAuth is
 * impossible under Spotify's 5-user dev-mode wall). Until the service account is re-authorized
 * with `playlist-modify-private`, creation degrades to public with a warning.
 *
 * All I/O is injected (`JournalExportDeps`) so unit tests fake DB + Spotify without
 * `mock.module` (process-global, leaks between files — see CLAUDE.md).
 */

import { LIMITS } from "@pika/shared";
import { and, asc, eq, gte, inArray, isNotNull, ne, or, type SQL } from "drizzle-orm";
import { db } from "../../db";
import { journalPlaylists, likes, playedTracks, trackLinks } from "../../db/schema";
import { parseSpotifyTrackId } from "./finalizeWebSet";
import { createPlaylist, replacePlaylistItems, SpotifyPlaylistNotFoundError } from "./spotify";

export const JOURNAL_PLAYLIST_NAME = "My Pika Journal";
export const JOURNAL_PLAYLIST_DESCRIPTION = "Songs I loved on the dance floor · pika.stream";

/** Spotify track ids are base-62; anything else never reaches a URI. */
const SPOTIFY_ID_RE = /^[A-Za-z0-9]+$/;

// ---------------------------------------------------------------------------
// Retro-enrichment (shared by the journal read endpoint and the export query)
// ---------------------------------------------------------------------------

/**
 * Trust-gated LEFT JOIN condition `played_tracks ⟕ track_links`: only links safe to show a
 * dancer — DJ-confirmed (`manual`), playlist-seeded (exact Spotify metadata), or auto with
 * confidence ≥ 0.8. NULL confidence on `auto` rows fails `gte` (SQL three-valued logic) and a
 * NULL `match_key` never joins — both excluded by construction.
 */
export function trustedSpotifyLinkOn(): SQL<unknown> {
  const cond = and(
    eq(trackLinks.matchKey, playedTracks.matchKey),
    eq(trackLinks.provider, "spotify"),
    ne(trackLinks.status, "unmatched"),
    isNotNull(trackLinks.providerId),
    or(inArray(trackLinks.source, ["manual", "playlist"]), gte(trackLinks.confidence, 0.8)),
  );
  if (!cond) throw new Error("unreachable: static join condition");
  return cond;
}

/** Display URL for a trusted link row: stored URL, else built from the id. */
export function linkFallbackUrl(
  providerUrl: string | null,
  providerId: string | null,
): string | null {
  if (providerUrl) return providerUrl;
  if (providerId && SPOTIFY_ID_RE.test(providerId)) {
    return `https://open.spotify.com/track/${providerId}`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// URI resolution (pure)
// ---------------------------------------------------------------------------

/** A liked play reduced to its two possible Spotify identity sources. */
export interface JournalLikeRow {
  /** Broadcast-time snapshot (`played_tracks.spotify_url`). */
  spotifyUrl: string | null;
  /** Trusted `track_links.provider_id` (NULL when the trust gate failed). */
  linkProviderId: string | null;
}

export interface ResolvedJournalUris {
  /** `spotify:track:<id>` URIs, first-like order, deduped, capped at JOURNAL_EXPORT_MAX_URIS. */
  uris: string[];
  /** Distinct resolvable ids BEFORE the cap — `matchedCount > uris.length` signals truncation. */
  matchedCount: number;
  /** Total liked rows considered (matched or not). */
  totalLiked: number;
}

/**
 * Resolve liked rows (ordered `likes.created_at ASC`) to playlist URIs: snapshot URL wins, else
 * the trusted link id; dedupe keeps the first occurrence (mirrors `tracksFromPlays`).
 */
export function resolveJournalUris(rows: JournalLikeRow[]): ResolvedJournalUris {
  const seen = new Set<string>();
  for (const row of rows) {
    const id =
      parseSpotifyTrackId(row.spotifyUrl) ??
      (row.linkProviderId && SPOTIFY_ID_RE.test(row.linkProviderId) ? row.linkProviderId : null);
    if (id) seen.add(id); // Set preserves first-insertion order
  }
  const ids = [...seen];
  return {
    uris: ids.slice(0, LIMITS.JOURNAL_EXPORT_MAX_URIS).map((id) => `spotify:track:${id}`),
    matchedCount: ids.length,
    totalLiked: rows.length,
  };
}

// ---------------------------------------------------------------------------
// Export orchestration
// ---------------------------------------------------------------------------

/** The journal has no likes at all. */
export class JournalEmptyError extends Error {
  constructor() {
    super("No liked tracks to export");
    this.name = "JournalEmptyError";
  }
}

/** Likes exist but none resolve to a Spotify identity. */
export class JournalNoMatchesError extends Error {
  constructor(public readonly totalLiked: number) {
    super("No liked tracks matched Spotify");
    this.name = "JournalNoMatchesError";
  }
}

/** An export for this clientId is already running. */
export class JournalExportInFlightError extends Error {
  constructor() {
    super("Export already in progress");
    this.name = "JournalExportInFlightError";
  }
}

/** Re-export attempted before the per-client cooldown elapsed. */
export class JournalExportCooldownError extends Error {
  constructor(public readonly retryAfterSec: number) {
    super("Export cooldown");
    this.name = "JournalExportCooldownError";
  }
}

/** Process-wide daily Spotify-write budget spent. */
export class JournalExportDailyCapError extends Error {
  constructor() {
    super("Daily export budget exhausted");
    this.name = "JournalExportDailyCapError";
  }
}

export interface JournalPlaylistRow {
  spotifyPlaylistId: string;
  spotifyPlaylistUrl: string;
  updatedAt: Date;
}

export interface JournalExportDeps {
  loadLikedRows: (clientId: string) => Promise<JournalLikeRow[]>;
  getPlaylistRow: (clientId: string) => Promise<JournalPlaylistRow | null>;
  upsertPlaylistRow: (row: {
    clientId: string;
    spotifyPlaylistId: string;
    spotifyPlaylistUrl: string;
    trackCount: number;
  }) => Promise<void>;
  createPlaylist: typeof createPlaylist;
  replacePlaylistItems: typeof replacePlaylistItems;
  now: () => number;
}

export interface JournalExportResult {
  playlistUrl: string;
  trackCount: number;
  matchedCount: number;
  totalLiked: number;
  /** true when an existing journal playlist was refreshed (incl. the 404-recreate path). */
  updated: boolean;
}

async function loadLikedRowsFromDb(clientId: string): Promise<JournalLikeRow[]> {
  return db
    .select({ spotifyUrl: playedTracks.spotifyUrl, linkProviderId: trackLinks.providerId })
    .from(likes)
    .innerJoin(playedTracks, eq(likes.playedTrackId, playedTracks.id))
    .leftJoin(trackLinks, trustedSpotifyLinkOn())
    .where(eq(likes.clientId, clientId))
    .orderBy(asc(likes.createdAt))
    .limit(5000); // memory sanity bound; the URI cap is JOURNAL_EXPORT_MAX_URIS anyway
}

async function getPlaylistRowFromDb(clientId: string): Promise<JournalPlaylistRow | null> {
  const [row] = await db
    .select({
      spotifyPlaylistId: journalPlaylists.spotifyPlaylistId,
      spotifyPlaylistUrl: journalPlaylists.spotifyPlaylistUrl,
      updatedAt: journalPlaylists.updatedAt,
    })
    .from(journalPlaylists)
    .where(eq(journalPlaylists.clientId, clientId))
    .limit(1);
  return row ?? null;
}

async function upsertPlaylistRowInDb(row: {
  clientId: string;
  spotifyPlaylistId: string;
  spotifyPlaylistUrl: string;
  trackCount: number;
}): Promise<void> {
  await db
    .insert(journalPlaylists)
    .values(row)
    .onConflictDoUpdate({
      target: journalPlaylists.clientId,
      set: {
        spotifyPlaylistId: row.spotifyPlaylistId,
        spotifyPlaylistUrl: row.spotifyPlaylistUrl,
        trackCount: row.trackCount,
        updatedAt: new Date(),
      },
    });
}

export const defaultJournalExportDeps: JournalExportDeps = {
  loadLikedRows: loadLikedRowsFromDb,
  getPlaylistRow: getPlaylistRowFromDb,
  upsertPlaylistRow: upsertPlaylistRowInDb,
  createPlaylist,
  replacePlaylistItems,
  now: () => Date.now(),
};

// Concurrency + budget guards. Module-level singletons are safe on this single-process server
// (documented architecture); the journal_playlists PK is the cross-restart backstop.
const inFlight = new Set<string>();
let dailyBudget = { day: "", count: 0 };

function currentUtcDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

/** Test hook: clears the in-flight set + daily counter. */
export function resetJournalExportGuardsForTests(): void {
  inFlight.clear();
  dailyBudget = { day: "", count: 0 };
}

/**
 * Create or regenerate the dancer's journal playlist. Guards (in order): in-flight per client,
 * global daily budget, per-client cooldown (`journal_playlists.updated_at`). The row is upserted
 * ONLY after Spotify succeeds, so a failed export never starts a phantom cooldown; an orphaned
 * Spotify playlist from a create-then-upsert-crash is unreferenced and harmless (same best-effort
 * stance as `finalizeWebSet`).
 */
export async function exportJournalPlaylist(
  clientId: string,
  deps: JournalExportDeps = defaultJournalExportDeps,
): Promise<JournalExportResult> {
  // Synchronous check-add before the first await — atomic on Bun's single-threaded loop.
  if (inFlight.has(clientId)) throw new JournalExportInFlightError();
  inFlight.add(clientId);
  try {
    const day = currentUtcDay(deps.now());
    if (dailyBudget.day !== day) dailyBudget = { day, count: 0 };
    if (dailyBudget.count >= LIMITS.JOURNAL_EXPORT_GLOBAL_DAILY_MAX) {
      throw new JournalExportDailyCapError();
    }

    const existing = await deps.getPlaylistRow(clientId);
    if (existing) {
      const elapsed = deps.now() - existing.updatedAt.getTime();
      // Negative elapsed (clock skew / manual edit) stays blocked and self-heals with time.
      if (elapsed < LIMITS.JOURNAL_EXPORT_COOLDOWN_MS) {
        const remaining = LIMITS.JOURNAL_EXPORT_COOLDOWN_MS - elapsed;
        throw new JournalExportCooldownError(Math.max(1, Math.ceil(remaining / 1000)));
      }
    }

    const rows = await deps.loadLikedRows(clientId);
    const { uris, matchedCount, totalLiked } = resolveJournalUris(rows);
    if (totalLiked === 0) throw new JournalEmptyError();
    if (uris.length === 0) throw new JournalNoMatchesError(totalLiked);

    dailyBudget.count++; // about to spend a Spotify write (failures consume budget — intentional)

    let playlistId: string;
    let playlistUrl: string;
    let updated: boolean;
    if (existing) {
      updated = true;
      try {
        await deps.replacePlaylistItems(existing.spotifyPlaylistId, uris);
        playlistId = existing.spotifyPlaylistId;
        playlistUrl = existing.spotifyPlaylistUrl;
      } catch (e) {
        if (!(e instanceof SpotifyPlaylistNotFoundError)) throw e;
        // Deleted (= unfollowed) on Spotify's side — recreate; the upsert swaps the row to the new id.
        const created = await deps.createPlaylist(
          JOURNAL_PLAYLIST_NAME,
          uris,
          JOURNAL_PLAYLIST_DESCRIPTION,
          { isPublic: false },
        );
        playlistId = created.playlistId;
        playlistUrl = created.playlistUrl;
      }
    } else {
      updated = false;
      const created = await deps.createPlaylist(
        JOURNAL_PLAYLIST_NAME,
        uris,
        JOURNAL_PLAYLIST_DESCRIPTION,
        { isPublic: false },
      );
      playlistId = created.playlistId;
      playlistUrl = created.playlistUrl;
    }

    await deps.upsertPlaylistRow({
      clientId,
      spotifyPlaylistId: playlistId,
      spotifyPlaylistUrl: playlistUrl,
      trackCount: uris.length,
    });

    return { playlistUrl, trackCount: uris.length, matchedCount, totalLiked, updated };
  } finally {
    inFlight.delete(clientId);
  }
}
