import { describe, expect, test } from "bun:test";
import { parseCsvRows, parseExportifyCsv } from "./exportifyCsv";

describe("parseCsvRows", () => {
  test("handles quoted commas, escaped quotes, CRLF and a BOM", () => {
    const csv = '﻿a,b,c\r\n"x,1","He said ""hi""",z\r\n';
    expect(parseCsvRows(csv)).toEqual([
      ["a", "b", "c"],
      ["x,1", 'He said "hi"', "z"],
    ]);
  });

  test("flushes a final row without a trailing newline", () => {
    expect(parseCsvRows("a,b\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

// Realistic Exportify subset (mapped by header name, so column order/extra cols don't matter).
const HEADER =
  "Track URI,Track Name,Artist Name(s),Duration (ms),Popularity,Release Date,Genres,Record Label,Danceability,Energy,Key,Loudness,Mode,Speechiness,Acousticness,Instrumentalness,Liveness,Valence,Tempo,Time Signature";
const FULL =
  'spotify:track:abc123,Believer - Acoustic,Imagine Dragons,204000,80,2017-02-01,"pop,rock",Universal,0.5,0.6,7,-5.5,1,0.04,0.2,0,0.1,0.4,125,4';
const QUOTED_ARTIST =
  'spotify:track:def456,Song Two,"Tyler, The Creator",200000,55,2019,,Sony,0.7,0.8,2,-4,0,0.1,0.05,0,0.2,0.6,90.5,4';
const LOCAL = "spotify:local:::file:::,Local Song,Someone,,,,,,,,,,,,,,,,,";
const NO_FEATURES = "spotify:track:ghi789,No Features,Artist X,180000,,,,,,,,,,,,,,,,";
const DUP = "spotify:track:abc123,Believer - Acoustic,Imagine Dragons,204000,80,,,,,,,,,,,,,,,";

describe("parseExportifyCsv", () => {
  const csv = `﻿${[HEADER, FULL, QUOTED_ARTIST, LOCAL, NO_FEATURES, DUP].join("\n")}\n`;
  const { tracks, skippedLocal } = parseExportifyCsv(csv);

  test("skips spotify:local rows (counted) and dedups by id", () => {
    expect(skippedLocal).toBe(1);
    expect(tracks.map((t) => t.spotifyId)).toEqual(["abc123", "def456", "ghi789"]);
  });

  test("maps identity + canonical Spotify features", () => {
    const t = tracks[0];
    expect(t).toMatchObject({
      spotifyId: "abc123",
      uri: "spotify:track:abc123",
      name: "Believer - Acoustic",
      artists: "Imagine Dragons",
      durationMs: 204000,
    });
    expect(t?.features).toEqual({
      tempo: 125,
      keyPitch: 7,
      mode: 1,
      energy: 0.6,
      danceability: 0.5,
      valence: 0.4,
      acousticness: 0.2,
      instrumentalness: 0,
      liveness: 0.1,
      speechiness: 0.04,
      loudness: -5.5,
      timeSignature: 4,
      popularity: 80,
      releaseDate: "2017-02-01",
      genres: "pop,rock",
      recordLabel: "Universal",
    });
  });

  test("preserves a quoted comma inside a field", () => {
    expect(tracks[1]?.artists).toBe("Tyler, The Creator");
  });

  test("omits features entirely when the row has none", () => {
    expect(tracks[2]).toMatchObject({ spotifyId: "ghi789", durationMs: 180000 });
    expect(tracks[2]?.features).toBeUndefined();
  });

  test("returns empty for a header-only / empty CSV", () => {
    expect(parseExportifyCsv("")).toEqual({ tracks: [], skippedLocal: 0 });
    expect(parseExportifyCsv(HEADER).tracks).toEqual([]);
  });

  test("truncates an over-long genres field to the server cap (500)", () => {
    const longGenres = Array.from({ length: 200 }, (_, i) => `genre${i}`).join(",");
    const row = `spotify:track:long1,Long,Artist,,,,"${longGenres}",,,,,,,,,,,,,`;
    const { tracks } = parseExportifyCsv(`${HEADER}\n${row}\n`);
    expect(longGenres.length).toBeGreaterThan(500);
    expect(tracks[0]?.features?.genres?.length).toBe(500);
  });
});
