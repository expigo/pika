/**
 * Pure-function unit tests for the service-account playlist layer — moved (2026-07) from
 * spotify.test.ts alongside the spotifyPlaylist.ts split (X.ts/X.test.ts pairing).
 */

import { describe, expect, test } from "bun:test";
import { isPlaylistGoneStatus, planReplaceBatches } from "./spotifyPlaylist";

describe("planReplaceBatches", () => {
  const uris = (n: number) => Array.from({ length: n }, (_, i) => `spotify:track:t${i}`);

  test("≤100 URIs → single PUT, no appends", () => {
    const plan = planReplaceBatches(uris(42));
    expect(plan.put.length).toBe(42);
    expect(plan.posts).toEqual([]);
  });

  test("250 URIs → 1 PUT of 100 + POST batches of 100 and 50, order preserved", () => {
    const plan = planReplaceBatches(uris(250));
    expect(plan.put.length).toBe(100);
    expect(plan.put[0]).toBe("spotify:track:t0");
    expect(plan.posts.length).toBe(2);
    expect(plan.posts[0]?.length).toBe(100);
    expect(plan.posts[0]?.[0]).toBe("spotify:track:t100");
    expect(plan.posts[1]?.length).toBe(50);
    expect(plan.posts[1]?.[49]).toBe("spotify:track:t249");
  });

  test("exactly 100 → PUT only", () => {
    const plan = planReplaceBatches(uris(100));
    expect(plan.put.length).toBe(100);
    expect(plan.posts).toEqual([]);
  });
});

describe("isPlaylistGoneStatus", () => {
  test("client errors that mean the playlist is unusable → recreate", () => {
    // Spotify "delete" = unfollow: writes to the ghost playlist surface as 403/400, not only 404.
    expect(isPlaylistGoneStatus(400)).toBe(true);
    expect(isPlaylistGoneStatus(403)).toBe(true);
    expect(isPlaylistGoneStatus(404)).toBe(true);
  });

  test("rate limits and transient server errors must NOT trigger a recreate", () => {
    expect(isPlaylistGoneStatus(429)).toBe(false);
    expect(isPlaylistGoneStatus(500)).toBe(false);
    expect(isPlaylistGoneStatus(503)).toBe(false);
    expect(isPlaylistGoneStatus(200)).toBe(false);
  });
});
