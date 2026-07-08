/**
 * Exportify CSV → seed-track parser (B3 catalog seed). Spotify locked new apps out of reading
 * playlists, so a DJ exports their playlists with Exportify (a grandfathered tool) and we import the
 * CSV. The CSV carries identity (Spotify URI + name/artist) AND Spotify's own `audio-features`
 * (tempo/key/energy/…) that Spotify deprecated for new apps — canonical, per-URI.
 *
 * Lives in @pika/shared so BOTH the web admin importer and cloud-side seed tooling use one parser.
 * No CSV dependency (web is a bundle-sensitive PWA): a small quote-aware state machine parses the
 * rows, then columns are mapped BY HEADER NAME (order-robust). `spotify:local:` rows are skipped.
 */

import type { SpotifyAudioFeatures } from "./schemas";

/** The minimal track shape the parser emits — assignable to the cloud/web `SeedTrack` types. */
export interface ExportifySeedTrack {
  spotifyId: string;
  uri: string;
  name: string;
  artists: string;
  durationMs?: number | undefined;
  /** From Exportify's "Album Image URL" column (Slice D) — native Booth lists get art for free. */
  albumArtUrl?: string | undefined;
  features?: SpotifyAudioFeatures | undefined;
}

/**
 * Parse CSV text into rows of string cells. Quote-aware: handles quoted commas, embedded newlines,
 * escaped quotes (`""`), CRLF line endings, and a leading UTF-8 BOM.
 */
export function parseCsvRows(text: string): string[][] {
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text; // strip BOM
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          cell += '"'; // escaped quote
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (ch !== "\r") {
      cell += ch;
    }
  }
  // Flush a trailing row that wasn't newline-terminated.
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

export interface ExportifyParseResult {
  tracks: ExportifySeedTrack[];
  skippedLocal: number; // `spotify:local:` rows (no Spotify identity, can't be seeded)
}

// Exportify feature column header → SpotifyAudioFeatures field + how to coerce it.
const NUM_FEATURES: Array<[keyof SpotifyAudioFeatures, string, "float" | "int"]> = [
  ["tempo", "Tempo", "float"],
  ["keyPitch", "Key", "int"],
  ["mode", "Mode", "int"],
  ["energy", "Energy", "float"],
  ["danceability", "Danceability", "float"],
  ["valence", "Valence", "float"],
  ["acousticness", "Acousticness", "float"],
  ["instrumentalness", "Instrumentalness", "float"],
  ["liveness", "Liveness", "float"],
  ["speechiness", "Speechiness", "float"],
  ["loudness", "Loudness", "float"],
  ["timeSignature", "Time Signature", "int"],
  ["popularity", "Popularity", "int"],
];
// String features + a max length matching the server's Zod caps — Spotify's multi-genre lists can
// run long, so truncate defensively rather than let a whole batch 400.
const STR_FEATURES: Array<[keyof SpotifyAudioFeatures, string, number]> = [
  ["releaseDate", "Release Date", 40],
  ["genres", "Genres", 500],
  ["recordLabel", "Record Label", 300],
];

export function toNumber(v: string | undefined, kind: "float" | "int"): number | undefined {
  const t = v?.trim();
  if (!t) return undefined;
  const n = Number(t);
  if (!Number.isFinite(n)) return undefined;
  return kind === "int" ? Math.trunc(n) : n;
}

export function toStr(v: string | undefined, maxLen?: number): string | undefined {
  const t = v?.trim();
  if (!t) return undefined;
  return maxLen && t.length > maxLen ? t.slice(0, maxLen) : t;
}

/** Extract a Spotify track id from an Exportify `Track URI` cell, or null for local/non-track rows. */
function trackId(uri: string): string | null {
  if (uri.startsWith("spotify:track:")) {
    const id = uri.slice("spotify:track:".length).trim();
    return id || null;
  }
  return null;
}

/**
 * Parse a full Exportify CSV. Maps columns by header (order-robust), extracts the Spotify id from
 * `Track URI`, skips `spotify:local:` rows, tolerates empty feature cells, and dedups by id.
 */
export function parseExportifyCsv(text: string): ExportifyParseResult {
  const rows = parseCsvRows(text);
  if (rows.length < 2) return { tracks: [], skippedLocal: 0 };

  const header = rows[0] ?? [];
  const idx = new Map<string, number>();
  header.forEach((h, i) => {
    idx.set(h.trim().toLowerCase(), i);
  });
  const col = (row: string[], name: string): string | undefined => {
    const i = idx.get(name.toLowerCase());
    return i === undefined ? undefined : row[i];
  };

  const tracks: ExportifySeedTrack[] = [];
  const seen = new Set<string>();
  let skippedLocal = 0;

  for (const row of rows.slice(1)) {
    const uri = col(row, "Track URI")?.trim() ?? "";
    if (!uri) continue;
    if (uri.startsWith("spotify:local:")) {
      skippedLocal++;
      continue;
    }
    const id = trackId(uri);
    if (!id || seen.has(id)) continue;

    const name = toStr(col(row, "Track Name"), 500);
    const artists = toStr(col(row, "Artist Name(s)"), 500);
    if (!name || !artists) continue; // identity is required to seed

    const features: SpotifyAudioFeatures = {};
    for (const [key, headerName, kind] of NUM_FEATURES) {
      const n = toNumber(col(row, headerName), kind);
      if (n !== undefined) features[key] = n as never;
    }
    for (const [key, headerName, maxLen] of STR_FEATURES) {
      const v = toStr(col(row, headerName), maxLen);
      if (v !== undefined) features[key] = v as never;
    }

    // Only a real https URL — the cloud validates albumArtUrl with z.string().url(), and one bad
    // cell must not 400 a whole import.
    const art = toStr(col(row, "Album Image URL"), 500);
    const albumArtUrl = art && /^https?:\/\//i.test(art) ? art : undefined;

    seen.add(id);
    tracks.push({
      spotifyId: id,
      uri,
      name,
      artists,
      durationMs: toNumber(col(row, "Duration (ms)"), "int"),
      ...(albumArtUrl ? { albumArtUrl } : {}),
      ...(Object.keys(features).length > 0 ? { features } : {}),
    });
  }

  return { tracks, skippedLocal };
}
