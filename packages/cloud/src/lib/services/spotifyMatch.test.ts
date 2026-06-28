import { describe, expect, test } from "bun:test";
import { confidenceTier, type MatchCandidate, scoreCandidate } from "./spotifyMatch";

function cand(over: Partial<MatchCandidate>): MatchCandidate {
  return {
    spotifyId: "id",
    uri: "spotify:track:id",
    url: "https://open.spotify.com/track/id",
    name: "Song",
    artists: "Artist",
    durationMs: 200_000,
    popularity: 50,
    ...over,
  };
}

describe("confidenceTier", () => {
  test("maps scores to tiers", () => {
    expect(confidenceTier(0.9)).toBe("high");
    expect(confidenceTier(0.8)).toBe("high");
    expect(confidenceTier(0.6)).toBe("medium");
    expect(confidenceTier(0.3)).toBe("low");
    expect(confidenceTier(0)).toBe("none");
  });
});

describe("scoreCandidate", () => {
  const query = { artist: "Daft Punk", title: "Get Lucky", durationMs: 248_000 };

  test("an exact fuzzy-key match floors at high confidence", () => {
    const s = scoreCandidate(query, cand({ artists: "Daft Punk", name: "Get Lucky" }));
    expect(s).toBeGreaterThanOrEqual(0.85);
  });

  test("strips remix/feat. noise via the fuzzy key (still an identity match)", () => {
    const s = scoreCandidate(
      query,
      cand({ artists: "Daft Punk feat. Pharrell", name: "Get Lucky (Radio Edit)" }),
    );
    expect(s).toBeGreaterThanOrEqual(0.85);
  });

  test("a wrong title scores low", () => {
    const s = scoreCandidate(
      query,
      cand({ artists: "Daft Punk", name: "Something Completely Different" }),
    );
    expect(s).toBeLessThan(0.55);
  });

  test("duration proximity breaks ties between same-name candidates", () => {
    const close = scoreCandidate(
      query,
      cand({ artists: "Daft Punk", name: "Get Lucky", durationMs: 248_500 }),
    );
    const far = scoreCandidate(
      query,
      cand({ artists: "Daft Punk", name: "Get Lucky", durationMs: 600_000 }),
    );
    expect(close).toBeGreaterThanOrEqual(far);
  });

  test("ranking picks the closest-duration version among identical names", () => {
    const candidates = [
      cand({ spotifyId: "long", name: "Get Lucky", artists: "Daft Punk", durationMs: 369_000 }), // 10-min mix
      cand({ spotifyId: "radio", name: "Get Lucky", artists: "Daft Punk", durationMs: 248_000 }), // album
    ];
    const ranked = [...candidates].sort(
      (a, b) => scoreCandidate(query, b) - scoreCandidate(query, a),
    );
    expect(ranked[0]?.spotifyId).toBe("radio");
  });
});
