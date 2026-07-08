/**
 * Signature pure-core tests — percentile math, era bucketing, coverage, and the LOAD-BEARING
 * floors. The DB assembly (contexts, one-dial behavior, strict gate) runs against real Postgres
 * in the integration suite.
 */

import { describe, expect, test } from "bun:test";
import { LIMITS, type SpotifyAudioFeatures } from "@pika/shared";
import { computeSignatureFromRows, releaseYear, splitFeaturedBySource } from "./signature";

/** N fully-featured rows spread linearly across the given tempo range. */
function rows(
  n: number,
  overrides: (i: number) => Partial<SpotifyAudioFeatures> = () => ({}),
): SpotifyAudioFeatures[] {
  return Array.from({ length: n }, (_, i) => ({
    tempo: 80 + (40 * i) / Math.max(n - 1, 1), // 80..120
    energy: 0.5,
    danceability: 0.6,
    valence: 0.4,
    releaseDate: "2016-03-04",
    ...overrides(i),
  }));
}

const CONTEXTS = { live: 2, imported: 1, liveTracks: 10, importedTracks: 31 };

describe("computeSignatureFromRows", () => {
  test("below the track floor → null (the card renders nothing, never a thin statistic)", () => {
    const sig = computeSignatureFromRows(
      rows(LIMITS.SIGNATURE_MIN_TRACKS - 1),
      CONTEXTS,
      LIMITS.SIGNATURE_MIN_TRACKS - 1,
    );
    expect(sig).toBeNull();
  });

  test("below the context floor → null even with plenty of tracks", () => {
    expect(computeSignatureFromRows(rows(50), { live: 1, imported: 0 }, 50)).toBeNull();
  });

  test("featureless rows don't count toward the floor (coverage is honest)", () => {
    // 30 rows but only 10 carry a tempo → featured=10 < floor → null.
    const mixed = rows(30, (i) => (i < 20 ? { tempo: undefined } : {}));
    expect(computeSignatureFromRows(mixed, CONTEXTS, 30)).toBeNull();
  });

  test("computes tempo range, metric bands, coverage and the denominator fields", () => {
    const sig = computeSignatureFromRows(rows(41), CONTEXTS, 50);
    expect(sig).not.toBeNull();
    if (!sig) throw new Error("unreachable");
    expect(sig.tempo.min).toBe(80);
    expect(sig.tempo.max).toBe(120);
    expect(sig.tempo.p25).toBe(90);
    expect(sig.tempo.median).toBe(100);
    expect(sig.tempo.p75).toBe(110);
    expect(sig.energy).toEqual({ p25: 0.5, median: 0.5, p75: 0.5 });
    expect(sig.contexts).toEqual(CONTEXTS);
    expect(sig.distinctTracks).toBe(50);
    expect(sig.featuredTracks).toBe(41);
    expect(sig.coverage).toBe(0.82); // 41/50
    // The fixture rows carry no acousticness → the band must be ABSENT, never a fake zero band.
    expect(sig.acousticness).toBeUndefined();
  });

  test("acousticness band appears only when the corpus carries values", () => {
    const sig = computeSignatureFromRows(
      rows(40, () => ({ acousticness: 0.3 })),
      CONTEXTS,
      40,
    );
    if (!sig) throw new Error("expected a signature");
    expect(sig.acousticness).toEqual({ p25: 0.3, median: 0.3, p75: 0.3 });
  });

  test("eras: top decades by share of parseable years, defensive on garbage dates", () => {
    const sig = computeSignatureFromRows(
      rows(40, (i) => ({
        releaseDate: i < 20 ? "2016-03-04" : i < 30 ? "1998" : i < 35 ? "0000" : undefined,
      })),
      CONTEXTS,
      40,
    );
    if (!sig) throw new Error("expected a signature");
    // 20× 2010s, 10× 1990s; "0000" and missing dates are ignored.
    expect(sig.eras[0]).toEqual({ decade: "2010s", share: 0.67 });
    expect(sig.eras[1]).toEqual({ decade: "1990s", share: 0.33 });
  });
});

describe("splitFeaturedBySource", () => {
  const featureFor = (tempo: number | undefined): SpotifyAudioFeatures => ({ tempo });

  test("live-first attribution: an overlapping track credits live, and the parts sum exactly", () => {
    const features: Record<string, SpotifyAudioFeatures> = {
      a: featureFor(100), // live only
      b: featureFor(105), // BOTH → credits live (the prize)
      c: featureFor(110), // imported only
      d: featureFor(115), // imported only
    };
    const split = splitFeaturedBySource(features, new Set(["a", "b"]), new Set(["b", "c", "d"]));
    expect(split).toEqual({ liveTracks: 2, importedTracks: 2 });
    const featuredTracks = Object.values(features).filter((f) => f.tempo != null).length;
    expect(split.liveTracks + split.importedTracks).toBe(featuredTracks);
  });

  test("featureless (tempo-less) ids count toward neither source", () => {
    const features: Record<string, SpotifyAudioFeatures> = {
      a: featureFor(undefined),
      b: featureFor(120),
    };
    const split = splitFeaturedBySource(features, new Set(["a"]), new Set(["b"]));
    expect(split).toEqual({ liveTracks: 0, importedTracks: 1 });
  });
});

describe("releaseYear", () => {
  test("parses leading years from both Exportify and Chosic date shapes", () => {
    expect(releaseYear("2016-03-04")).toBe(2016);
    expect(releaseYear("1998")).toBe(1998);
  });
  test("rejects garbage, out-of-range and missing values", () => {
    expect(releaseYear("0000")).toBeNull();
    expect(releaseYear("next year")).toBeNull();
    expect(releaseYear(undefined)).toBeNull();
    expect(releaseYear("2222")).toBeNull();
  });
});
