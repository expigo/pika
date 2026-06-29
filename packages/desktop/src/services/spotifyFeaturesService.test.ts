import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/repositories/spotifyFeaturesRepository", () => ({
  spotifyFeaturesRepository: { getByIds: vi.fn(), upsertMany: vi.fn() },
}));
vi.mock("./spotifyPlaylist", () => ({ fetchSpotifyFeatures: vi.fn() }));

import { spotifyFeaturesRepository } from "../db/repositories/spotifyFeaturesRepository";
import { getFeaturesForTracks } from "./spotifyFeaturesService";
import { fetchSpotifyFeatures } from "./spotifyPlaylist";

const repo = vi.mocked(spotifyFeaturesRepository);
const fetchFeatures = vi.mocked(fetchSpotifyFeatures);

// A cached row is all-null except the fields we set + fetchedAt.
function row(spotifyId: string, tempo: number) {
  return {
    spotifyId,
    tempo,
    keyPitch: 0,
    mode: 1,
    energy: 0.5,
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
    fetchedAt: 1,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  repo.getByIds.mockResolvedValue([]);
  repo.upsertMany.mockResolvedValue();
  fetchFeatures.mockResolvedValue({ features: {} });
});

describe("getFeaturesForTracks", () => {
  it("serves cache hits without hitting the network", async () => {
    repo.getByIds.mockResolvedValue([row("a", 120)]);

    const map = await getFeaturesForTracks(["a"]);

    expect(map.get("a")).toEqual({ tempo: 120, keyPitch: 0, mode: 1, energy: 0.5 });
    expect(fetchFeatures).not.toHaveBeenCalled();
  });

  it("fetches + caches the missing ids and merges with cache", async () => {
    repo.getByIds.mockResolvedValue([row("a", 120)]);
    fetchFeatures.mockResolvedValue({ features: { b: { tempo: 90, energy: 0.7 } } });

    const map = await getFeaturesForTracks(["a", "b"]);

    expect(fetchFeatures).toHaveBeenCalledWith(["b"]); // only the miss
    expect(repo.upsertMany).toHaveBeenCalledTimes(1);
    expect(map.get("a")?.tempo).toBe(120);
    expect(map.get("b")).toEqual({ tempo: 90, energy: 0.7 });
  });

  it("degrades to cache-only when the fetch fails", async () => {
    repo.getByIds.mockResolvedValue([row("a", 120)]);
    fetchFeatures.mockRejectedValue(new Error("offline"));

    const map = await getFeaturesForTracks(["a", "b"]);

    expect(map.get("a")?.tempo).toBe(120);
    expect(map.has("b")).toBe(false);
    expect(repo.upsertMany).not.toHaveBeenCalled();
  });

  it("dedups ids and short-circuits an empty input", async () => {
    expect((await getFeaturesForTracks([])).size).toBe(0);
    expect(repo.getByIds).not.toHaveBeenCalled();

    await getFeaturesForTracks(["a", "a", ""]);
    expect(repo.getByIds).toHaveBeenCalledWith(["a"]);
  });
});
