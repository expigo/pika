import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSelect = vi.fn();
const mockUpsert = vi.fn();

vi.mock("../index", () => ({
  getSqlite: vi.fn(() => Promise.resolve({ select: mockSelect })),
  db: {
    insert: () => ({ values: () => ({ onConflictDoUpdate: mockUpsert }) }),
  },
}));

import { spotifyFeaturesRepository } from "./spotifyFeaturesRepository";

const nullRow = {
  keyPitch: null,
  mode: null,
  energy: null,
  danceability: null,
  valence: null,
  acousticness: null,
  instrumentalness: null,
  liveness: null,
  speechiness: null,
  loudness: null,
  timeSignature: null,
  popularity: null,
  releaseDate: null,
  genres: null,
  recordLabel: null,
};

beforeEach(() => {
  mockSelect.mockReset().mockResolvedValue([]);
  mockUpsert.mockReset().mockResolvedValue(undefined);
});

describe("spotifyFeaturesRepository", () => {
  it("getByIds short-circuits an empty id list without querying", async () => {
    expect(await spotifyFeaturesRepository.getByIds([])).toEqual([]);
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("getByIds builds an IN clause and remaps snake_case → camelCase", async () => {
    mockSelect.mockResolvedValue([
      {
        spotify_id: "a",
        tempo: 120,
        key_pitch: 5,
        mode: 1,
        energy: 0.8,
        danceability: 0.6,
        valence: 0.4,
        acousticness: 0.1,
        instrumentalness: 0,
        liveness: 0.2,
        speechiness: 0.05,
        loudness: -6,
        time_signature: 4,
        popularity: 50,
        release_date: "2020-01-01",
        genres: "pop",
        record_label: "Label",
        fetched_at: 123,
      },
    ]);

    const rows = await spotifyFeaturesRepository.getByIds(["a", "b"]);
    expect(mockSelect).toHaveBeenCalledWith(expect.stringContaining("IN (?,?)"), ["a", "b"]);
    expect(rows[0]).toMatchObject({
      spotifyId: "a",
      keyPitch: 5,
      timeSignature: 4,
      releaseDate: "2020-01-01",
      recordLabel: "Label",
      fetchedAt: 123,
    });
  });

  it("upsertMany writes one onConflictDoUpdate per row", async () => {
    await spotifyFeaturesRepository.upsertMany([
      { spotifyId: "a", tempo: 100, fetchedAt: 1, ...nullRow },
      { spotifyId: "b", tempo: 90, fetchedAt: 1, ...nullRow },
    ]);
    expect(mockUpsert).toHaveBeenCalledTimes(2);
  });
});
