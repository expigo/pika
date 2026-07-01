import { describe, expect, test } from "bun:test";
import { parseChosicCsv } from "./chosicCsv";

// Real Chosic export header (order-robust: mapped by header name).
const HEADER =
  "#,Song,Artist,BPM,Camelot,Energy,Added At,Duration,Popularity,Genres,Album,Album Date,Dance,Acoustic,Instrumental,Valence,Speech,Live,Loud (Db),Key,Time Signature,Spotify Track Id,ISRC,Explicit";

// "Careful" / SYML — the real Baltic Swing row.
const CAREFUL =
  '1,"Careful","SYML",90,9B,25,2026-06-13,02:28,40,"","Nobody Lives Here",2025-04-04,60,90,0,26,0,10,-9,G Major,4,3HMqKVDv5l7flbKoHdrJa5,CAN112402678,no';

describe("parseChosicCsv", () => {
  test("maps identity, rescales 0-100 → 0-1, and captures ISRC + Camelot", () => {
    const { tracks, skippedLocal } = parseChosicCsv(`${HEADER}\n${CAREFUL}\n`);
    expect(skippedLocal).toBe(0);
    expect(tracks).toHaveLength(1);
    const t = tracks[0]!;

    // Identity: bare id → synthesized URI.
    expect(t.spotifyId).toBe("3HMqKVDv5l7flbKoHdrJa5");
    expect(t.uri).toBe("spotify:track:3HMqKVDv5l7flbKoHdrJa5");
    expect(t.name).toBe("Careful");
    expect(t.artists).toBe("SYML");
    // Duration mm:ss → ms.
    expect(t.durationMs).toBe(148000);

    const f = t.features!;
    // Rescaled ratios (0-100 int → 0-1).
    expect(f.energy).toBeCloseTo(0.25, 5);
    expect(f.danceability).toBeCloseTo(0.6, 5);
    expect(f.acousticness).toBeCloseTo(0.9, 5);
    expect(f.valence).toBeCloseTo(0.26, 5);
    expect(f.liveness).toBeCloseTo(0.1, 5);
    expect(f.speechiness).toBe(0);
    expect(f.instrumentalness).toBe(0);
    // As-is fields.
    expect(f.tempo).toBe(90);
    expect(f.loudness).toBe(-9);
    expect(f.timeSignature).toBe(4);
    expect(f.popularity).toBe(40);
    // Chosic-only richness.
    expect(f.camelot).toBe("9B");
    expect(f.isrc).toBe("CAN112402678");
    // Human key → pitch + mode.
    expect(f.keyPitch).toBe(7); // G
    expect(f.mode).toBe(1); // Major
  });

  test("parses enharmonic sharp keys and minor mode", () => {
    const rows = [
      HEADER,
      `1,"A","X",100,1B,50,2026,03:00,10,"","Al",2020,50,50,0,50,0,10,-6,C♯/D♭ Major,4,idsharp,ISRC1,no`,
      `2,"B","Y",100,2A,50,2026,03:00,10,"","Al",2020,50,50,0,50,0,10,-6,E Minor,4,idminor,ISRC2,no`,
    ].join("\n");
    const { tracks } = parseChosicCsv(rows);
    const sharp = tracks.find((t) => t.spotifyId === "idsharp")!;
    const minor = tracks.find((t) => t.spotifyId === "idminor")!;
    expect(sharp.features!.keyPitch).toBe(1); // C# = 1
    expect(sharp.features!.mode).toBe(1); // Major
    expect(minor.features!.keyPitch).toBe(4); // E
    expect(minor.features!.mode).toBe(0); // Minor
  });

  test("parses flat keys (unicode ♭)", () => {
    const rows = [
      HEADER,
      `1,"A","X",100,7A,50,2026,03:00,10,"","Al",2020,50,50,0,50,0,10,-6,B♭ Minor,4,idflat,ISRC1,no`,
    ].join("\n");
    const { tracks } = parseChosicCsv(rows);
    expect(tracks[0]!.features!.keyPitch).toBe(10); // Bb = 10
    expect(tracks[0]!.features!.mode).toBe(0); // Minor
  });

  test("tolerates empty feature cells (sparse row) — omits missing metrics", () => {
    // Everything blank except identity + BPM.
    const rows = [HEADER, `1,"Sparse","X",95,,,2026,,,"",,,,,,,,,,,,idsparse,,no`].join("\n");
    const { tracks } = parseChosicCsv(rows);
    const f = tracks[0]!.features!;
    expect(f.tempo).toBe(95);
    expect(f.energy).toBeUndefined();
    expect(f.isrc).toBeUndefined();
    expect(f.keyPitch).toBeUndefined();
    expect(tracks[0]!.durationMs).toBeUndefined();
  });

  test("skips rows with no Spotify id and dedups by id", () => {
    const rows = [
      HEADER,
      `1,"A","X",100,1B,50,2026,03:00,10,"","Al",2020,50,50,0,50,0,10,-6,C Major,4,,ISRC1,no`, // empty id → skipped
      `2,"Dup","X",100,1B,50,2026,03:00,10,"","Al",2020,50,50,0,50,0,10,-6,C Major,4,dupid,ISRC2,no`,
      `3,"Dup2","X",100,1B,50,2026,03:00,10,"","Al",2020,50,50,0,50,0,10,-6,C Major,4,dupid,ISRC3,no`, // duplicate id → ignored
    ].join("\n");
    const { tracks, skippedLocal } = parseChosicCsv(rows);
    expect(skippedLocal).toBe(1);
    expect(tracks).toHaveLength(1);
    expect(tracks[0]!.spotifyId).toBe("dupid");
    expect(tracks[0]!.name).toBe("Dup");
  });
});
