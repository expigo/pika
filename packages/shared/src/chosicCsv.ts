/**
 * Chosic CSV → seed-track parser. Same purpose as `exportifyCsv.ts` (Spotify's deprecated
 * `audio-features` per track) but a *different* export tool with a richer, differently-scaled shape:
 *   - features are 0–100 integers (Exportify: 0–1 floats) → we rescale ÷100 to the canonical 0–1;
 *   - carries **ISRC** + **Camelot** (Exportify lacks both) — the reason to support it;
 *   - key is a human string ("G Major", "C♯/D♭ Major") → parsed to `keyPitch`+`mode`;
 *   - identity is a bare `Spotify Track Id` (no `spotify:track:` URI) + `mm:ss` duration.
 *
 * Emits the SAME `ExportifySeedTrack[]` shape as the Exportify parser, so the wire contract
 * (`SeedTrack`/`CurateBody`) is unchanged — the two sources are merged accretively cloud-side.
 */

import {
  type ExportifyParseResult,
  type ExportifySeedTrack,
  parseCsvRows,
  toNumber,
  toStr,
} from "./exportifyCsv";
import type { SpotifyAudioFeatures } from "./schemas";

/** Chosic 0–100 integer metric → canonical 0–1 ratio, clamped defensively. */
function ratio(v: string | undefined): number | undefined {
  const n = toNumber(v, "float");
  if (n === undefined) return undefined;
  const r = n / 100;
  return r < 0 ? 0 : r > 1 ? 1 : r;
}

/** `mm:ss` (or `h:mm:ss`) → milliseconds. */
function durationToMs(v: string | undefined): number | undefined {
  const t = v?.trim();
  if (!t) return undefined;
  const parts = t.split(":").map((p) => Number(p));
  if (parts.length === 0 || parts.some((n) => !Number.isFinite(n))) return undefined;
  let sec: number;
  if (parts.length === 1) sec = parts[0] as number;
  else if (parts.length === 2) sec = (parts[0] as number) * 60 + (parts[1] as number);
  else if (parts.length === 3)
    sec = (parts[0] as number) * 3600 + (parts[1] as number) * 60 + (parts[2] as number);
  else return undefined;
  return Math.round(sec * 1000);
}

const PITCH: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Human key ("G Major", "C♯/D♭ Major", "E Minor") → { keyPitch (0–11), mode (0 minor / 1 major) }. */
function parseHumanKey(v: string | undefined): { keyPitch?: number; mode?: number } {
  const t = v?.trim();
  if (!t) return {};
  const mode = /minor/i.test(t) ? 0 : /major/i.test(t) ? 1 : undefined;
  // Pitch = first whitespace-delimited token, first enharmonic before "/", unicode ♯/♭ folded.
  const firstTok = t.split(/\s+/)[0] ?? "";
  const enh = (firstTok.split("/")[0] ?? "").replace(/♯/g, "#").replace(/♭/g, "b").trim();
  const m = enh.match(/^([A-Ga-g])([#b]?)/);
  if (!m) return mode === undefined ? {} : { mode };
  const base = PITCH[(m[1] as string).toUpperCase()];
  if (base === undefined) return mode === undefined ? {} : { mode };
  let p = base;
  if (m[2] === "#") p = (p + 1) % 12;
  else if (m[2] === "b") p = (p + 11) % 12;
  return mode === undefined ? { keyPitch: p } : { keyPitch: p, mode };
}

/** Assign a value onto the features object only when defined (keeps the row sparse). */
function put<K extends keyof SpotifyAudioFeatures>(
  f: SpotifyAudioFeatures,
  key: K,
  value: SpotifyAudioFeatures[K] | undefined,
): void {
  if (value !== undefined) f[key] = value;
}

/**
 * Parse a full Chosic CSV. Maps columns by header (order-robust), reads the bare `Spotify Track Id`
 * (synthesizing a `spotify:track:` URI), rescales 0–100 metrics to 0–1, parses the human key, and
 * dedups by id. Rows with an empty `Spotify Track Id` are counted as skipped (no Spotify identity).
 */
export function parseChosicCsv(text: string): ExportifyParseResult {
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
    const id = col(row, "Spotify Track Id")?.trim() ?? "";
    if (!id) {
      skippedLocal++; // no Spotify identity → can't be seeded
      continue;
    }
    if (seen.has(id)) continue;

    const name = toStr(col(row, "Song"), 500);
    const artists = toStr(col(row, "Artist"), 500);
    if (!name || !artists) continue; // identity is required to seed

    const features: SpotifyAudioFeatures = {};
    put(features, "tempo", toNumber(col(row, "BPM"), "float"));
    put(features, "energy", ratio(col(row, "Energy")));
    put(features, "danceability", ratio(col(row, "Dance")));
    put(features, "acousticness", ratio(col(row, "Acoustic")));
    put(features, "instrumentalness", ratio(col(row, "Instrumental")));
    put(features, "valence", ratio(col(row, "Valence")));
    put(features, "speechiness", ratio(col(row, "Speech")));
    put(features, "liveness", ratio(col(row, "Live")));
    put(features, "loudness", toNumber(col(row, "Loud (Db)"), "float"));
    put(features, "timeSignature", toNumber(col(row, "Time Signature"), "int"));
    put(features, "popularity", toNumber(col(row, "Popularity"), "int"));
    put(features, "releaseDate", toStr(col(row, "Album Date"), 40));
    put(features, "genres", toStr(col(row, "Genres"), 500));
    put(features, "camelot", toStr(col(row, "Camelot"), 6));
    put(features, "isrc", toStr(col(row, "ISRC"), 40));
    const { keyPitch, mode } = parseHumanKey(col(row, "Key"));
    put(features, "keyPitch", keyPitch);
    put(features, "mode", mode);

    seen.add(id);
    tracks.push({
      spotifyId: id,
      uri: `spotify:track:${id}`,
      name,
      artists,
      durationMs: durationToMs(col(row, "Duration")),
      ...(Object.keys(features).length > 0 ? { features } : {}),
    });
  }

  return { tracks, skippedLocal };
}
