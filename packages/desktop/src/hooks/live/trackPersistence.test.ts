import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { trackRepository } from "../../db/repositories/trackRepository";
import { findOrCreateTrack } from "./trackPersistence";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("../../db/repositories/trackRepository", () => ({
  trackRepository: { findByTrackKey: vi.fn(), insertTrack: vi.fn() },
}));
vi.mock("../../utils/logger", () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockInvoke = vi.mocked(invoke);
const mockFind = vi.mocked(trackRepository.findByTrackKey);
const mockInsert = vi.mocked(trackRepository.insertTrack);

// A fully-populated library row (incl. remembered Spotify identity) as findByTrackKey returns.
const existingTrack = {
  id: 7,
  bpm: 120,
  key: "Am",
  energy: 50,
  danceability: 60,
  brightness: 40,
  acousticness: 30,
  groove: 70,
  spotifyUrl: "https://open.spotify.com/track/abc",
  spotifyAlbumArtUrl: "https://img/abc.jpg",
  spotifyMatchConfidence: 0.9,
  spotifyMatchSource: "dj_confirmed",
};

describe("findOrCreateTrack", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an existing track (with its Spotify identity) without touching VDJ or inserting", async () => {
    mockFind.mockResolvedValue(existingTrack as any);

    const result = await findOrCreateTrack("Artist", "Title", "/music/song.mp3");

    expect(result.id).toBe(7);
    expect(result.bpm).toBe(120);
    expect(result.spotifyUrl).toBe("https://open.spotify.com/track/abc");
    expect(result.spotifyMatchSource).toBe("dj_confirmed");
    expect(mockInvoke).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("heals a bpm-less existing track from VDJ metadata (and persists the duration)", async () => {
    mockFind.mockResolvedValue({ ...existingTrack, bpm: null } as any);
    mockInvoke.mockResolvedValue({ bpm: 128, key: "Bm", volume: null, duration: 200 });

    const result = await findOrCreateTrack("Artist", "Title", "/music/song.mp3");

    expect(mockInvoke).toHaveBeenCalledWith("lookup_vdj_track_metadata", {
      filePath: "/music/song.mp3",
    });
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ bpm: 128, key: "Bm", duration: 200 }),
    );
    expect(result.bpm).toBe(128);
    expect(result.key).toBe("Bm");
    // Spread of the existing row keeps the remembered Spotify identity through the heal.
    expect(result.spotifyUrl).toBe("https://open.spotify.com/track/abc");
  });

  it("creates a new track from VDJ metadata (capturing duration) when none exists", async () => {
    mockFind.mockResolvedValue(null);
    mockInvoke.mockResolvedValue({ bpm: 100, key: "C", volume: null, duration: 180 });
    mockInsert.mockResolvedValue(42);

    const result = await findOrCreateTrack("New", "Song", "/music/new.mp3");

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ artist: "New", title: "Song", bpm: 100, duration: 180 }),
    );
    expect(result).toMatchObject({ id: 42, bpm: 100, key: "C", spotifyUrl: null });
  });

  it("creates a ghost track (no VDJ lookup) when there is no real file path", async () => {
    mockFind.mockResolvedValue(null);
    mockInsert.mockResolvedValue(43);

    const result = await findOrCreateTrack("Ghost", "Track");

    expect(mockInvoke).not.toHaveBeenCalled(); // ghost path skips the Rust lookup
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ filePath: "ghost://Ghost/Track", bpm: null }),
    );
    expect(result).toMatchObject({ id: 43, spotifyUrl: null, spotifyMatchSource: null });
  });
});
