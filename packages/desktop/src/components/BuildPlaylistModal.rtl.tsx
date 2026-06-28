// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, userEvent } from "../test/rtl";
import { BuildPlaylistModal } from "./BuildPlaylistModal";

vi.mock("../db/repositories/trackRepository", () => ({
  trackRepository: {
    getSessionTracksForMatching: vi.fn(),
    setTrackSpotifyMatch: vi.fn(() => Promise.resolve()),
  },
}));
vi.mock("../services/spotifyPlaylist", () => ({
  searchSpotify: vi.fn(),
  createSpotifyPlaylist: vi.fn(() =>
    Promise.resolve({
      success: true,
      playlistUrl: "https://open.spotify.com/playlist/abc",
      playlistId: "abc",
    }),
  ),
}));

import { trackRepository } from "../db/repositories/trackRepository";
import { createSpotifyPlaylist, searchSpotify } from "../services/spotifyPlaylist";

const cachedTrack = {
  trackId: 1,
  artist: "Daft Punk",
  title: "Get Lucky",
  durationSec: 248,
  spotifyId: "cached1",
  spotifyUrl: "https://open.spotify.com/track/cached1",
  spotifyMatchSource: "dj_confirmed",
  spotifyMatchConfidence: null,
  firstPlayedAt: 1,
};
const uncachedTrack = {
  trackId: 2,
  artist: "Queen",
  title: "Don't Stop Me Now",
  durationSec: 210,
  spotifyId: null,
  spotifyUrl: null,
  spotifyMatchSource: null,
  spotifyMatchConfidence: null,
  firstPlayedAt: 2,
};

const searchResult = {
  candidates: [
    {
      spotifyId: "q1",
      uri: "spotify:track:q1",
      url: "https://open.spotify.com/track/q1",
      name: "Don't Stop Me Now",
      artists: "Queen",
      durationMs: 210_000,
      popularity: 85,
    },
    {
      spotifyId: "q2",
      uri: "spotify:track:q2",
      url: "https://open.spotify.com/track/q2",
      name: "Don't Stop Me Now - Remastered",
      artists: "Queen",
      durationMs: 211_000,
      popularity: 70,
    },
  ],
  recommendedIndex: 0,
  confidence: "high" as const,
  cached: false,
};

beforeEach(() => {
  vi.mocked(trackRepository.getSessionTracksForMatching).mockResolvedValue([
    cachedTrack,
    uncachedTrack,
    // biome-ignore lint/suspicious/noExplicitAny: test fixture shape
  ] as any);
  vi.mocked(searchSpotify).mockResolvedValue(searchResult);
  vi.mocked(createSpotifyPlaylist).mockClear();
  vi.mocked(trackRepository.setTrackSpotifyMatch).mockClear();
});

function renderModal() {
  render(<BuildPlaylistModal session={{ id: 7, name: "Friday Set" }} onClose={vi.fn()} />);
}

describe("BuildPlaylistModal", () => {
  it("searches only the uncached track and pre-fills the recommended match", async () => {
    renderModal();
    // The uncached row resolves via search; its select appears with the recommendation.
    const select = await screen.findByLabelText("Spotify match for Don't Stop Me Now");
    expect(select).toHaveValue("0");
    // Cached track did NOT trigger a search; only the one uncached track did.
    expect(searchSpotify).toHaveBeenCalledTimes(1);
    expect(searchSpotify).toHaveBeenCalledWith(
      expect.objectContaining({ artist: "Queen", title: "Don't Stop Me Now" }),
    );
    expect(screen.getByText("2 tracks selected")).toBeInTheDocument();
  });

  it("creates the playlist from the selected tracks and remembers the matches", async () => {
    renderModal();
    await screen.findByLabelText("Spotify match for Don't Stop Me Now");

    await userEvent.click(screen.getByRole("button", { name: /create playlist/i }));

    expect(createSpotifyPlaylist).toHaveBeenCalledTimes(1);
    const arg = vi.mocked(createSpotifyPlaylist).mock.calls[0]?.[0];
    expect(arg?.name).toBe("Friday Set");
    expect(arg?.tracks).toEqual([
      expect.objectContaining({ spotifyId: "cached1" }),
      expect.objectContaining({ spotifyId: "q1" }),
    ]);
    // Confirmed matches written back as sticky (dj_confirmed).
    expect(trackRepository.setTrackSpotifyMatch).toHaveBeenCalledWith(
      2,
      expect.objectContaining({ spotifyId: "q1", source: "dj_confirmed" }),
    );
    expect(await screen.findByRole("link", { name: /open in spotify/i })).toHaveAttribute(
      "href",
      "https://open.spotify.com/playlist/abc",
    );
  });

  it("honours an override of the recommended match", async () => {
    renderModal();
    const select = await screen.findByLabelText("Spotify match for Don't Stop Me Now");
    await userEvent.selectOptions(select, "1"); // pick the remastered version

    await userEvent.click(screen.getByRole("button", { name: /create playlist/i }));

    const arg = vi.mocked(createSpotifyPlaylist).mock.calls[0]?.[0];
    expect(arg?.tracks).toContainEqual(expect.objectContaining({ spotifyId: "q2" }));
  });
});
