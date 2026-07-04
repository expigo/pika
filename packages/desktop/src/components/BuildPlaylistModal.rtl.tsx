// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, userEvent, waitFor } from "../test/rtl";
import { BuildPlaylistModal } from "./BuildPlaylistModal";

vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn(() => Promise.resolve()) }));
vi.mock("../db/repositories/trackRepository", () => ({
  trackRepository: {
    getSessionTracksForMatching: vi.fn(),
    setTrackSpotifyMatch: vi.fn(() => Promise.resolve()),
  },
}));
vi.mock("../db/repositories/sessionRepository", () => ({
  sessionRepository: {
    getSessionPlaylistUrl: vi.fn(() => Promise.resolve(null)),
    setSessionPlaylist: vi.fn(() => Promise.resolve()),
    getSessionPlaylistState: vi.fn(),
    setSessionPlaylistSynced: vi.fn(() => Promise.resolve()),
  },
}));
vi.mock("../services/djApi", () => ({
  syncSessionPlaylist: vi.fn(() => Promise.resolve()),
  unsyncSessionPlaylist: vi.fn(() => Promise.resolve()),
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
  resolveSpotifyTrack: vi.fn(),
  resolveSpotifyTracks: vi.fn(() => Promise.resolve({ candidates: [] })),
  parseSpotifyTrackId: (s: string) => {
    const m = s.match(/track[/:]([A-Za-z0-9]{22})/);
    return m?.[1] ?? (/^[A-Za-z0-9]{22}$/.test(s.trim()) ? s.trim() : null);
  },
  PlaylistApiError: class extends Error {},
}));
// Canonical Spotify features for the matched rows → the per-row badge.
vi.mock("../hooks/useSpotifyFeatures", () => ({
  useSpotifyFeaturesBatch: () => ({
    features: new Map([["q1", { tempo: 120, keyPitch: 0, mode: 1, energy: 0.78 }]]),
    loading: false,
  }),
}));

import { sessionRepository } from "../db/repositories/sessionRepository";
import { trackRepository } from "../db/repositories/trackRepository";
import { syncSessionPlaylist, unsyncSessionPlaylist } from "../services/djApi";
import {
  createSpotifyPlaylist,
  resolveSpotifyTrack,
  searchSpotify,
} from "../services/spotifyPlaylist";

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
  vi.mocked(sessionRepository.getSessionPlaylistUrl).mockResolvedValue(null);
  vi.mocked(sessionRepository.setSessionPlaylist).mockClear();
  vi.mocked(trackRepository.getSessionTracksForMatching).mockResolvedValue([
    cachedTrack,
    uncachedTrack,
  ] as any);
  vi.mocked(searchSpotify).mockClear();
  vi.mocked(searchSpotify).mockResolvedValue(searchResult);
  vi.mocked(createSpotifyPlaylist).mockClear();
  vi.mocked(trackRepository.setTrackSpotifyMatch).mockClear();
  // Playlist-sync defaults: a live set with a built playlist, not yet shared.
  vi.mocked(sessionRepository.getSessionPlaylistState).mockResolvedValue({
    url: "https://open.spotify.com/playlist/abc",
    playlistId: "abc",
    cloudSessionId: "pika_1",
    syncedAt: null,
  });
  vi.mocked(sessionRepository.setSessionPlaylistSynced).mockClear();
  vi.mocked(syncSessionPlaylist).mockClear();
  vi.mocked(syncSessionPlaylist).mockResolvedValue(undefined);
  vi.mocked(unsyncSessionPlaylist).mockClear();
  vi.mocked(unsyncSessionPlaylist).mockResolvedValue(undefined);
});

function renderModal() {
  render(<BuildPlaylistModal session={{ id: 7, name: "Friday Set" }} onClose={vi.fn()} />);
}

describe("BuildPlaylistModal", () => {
  it("searches only the uncached track and shows the recommended match with detail", async () => {
    renderModal();
    expect(await screen.findByText("Strong match")).toBeInTheDocument(); // confidence shown
    expect(screen.getByText(/85% popular/)).toBeInTheDocument(); // recommended candidate detail
    expect(searchSpotify).toHaveBeenCalledTimes(1); // cached track skipped search
    expect(screen.getByText("2 tracks selected")).toBeInTheDocument();
  });

  it("shows a Spotify tempo/key/energy badge for a row with canonical features", async () => {
    renderModal();
    await screen.findByText("Strong match"); // q1 is the recommended candidate (has features)
    expect(screen.getByText(/120 BPM · C · E 0\.78/)).toBeInTheDocument();
  });

  it("creates the playlist, remembers it on the session, and writes back the matches", async () => {
    renderModal();
    await screen.findByText("Strong match");

    await userEvent.click(screen.getByRole("button", { name: /create playlist/i }));

    const arg = vi.mocked(createSpotifyPlaylist).mock.calls[0]?.[0];
    expect(arg?.tracks).toEqual([
      expect.objectContaining({ spotifyId: "cached1" }),
      expect.objectContaining({ spotifyId: "q1" }),
    ]);
    expect(sessionRepository.setSessionPlaylist).toHaveBeenCalledWith(
      7,
      "https://open.spotify.com/playlist/abc",
      "abc",
    );
    expect(trackRepository.setTrackSpotifyMatch).toHaveBeenCalledWith(
      2,
      expect.objectContaining({ spotifyId: "q1", source: "dj_confirmed" }),
    );
    expect(screen.getByRole("button", { name: /open in spotify/i })).toBeInTheDocument();
  });

  it("lets the DJ change the match via the candidate picker", async () => {
    renderModal();
    await screen.findByText("Strong match");

    await userEvent.click(
      screen.getByRole("button", { name: /change match for Don't Stop Me Now/i }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: /pick Don't Stop Me Now - Remastered by Queen/i }),
    );
    await userEvent.click(screen.getByRole("button", { name: /create playlist/i }));

    const arg = vi.mocked(createSpotifyPlaylist).mock.calls[0]?.[0];
    expect(arg?.tracks).toContainEqual(expect.objectContaining({ spotifyId: "q2" }));
  });

  it("re-matches a remembered track on demand (fetches fresh candidates)", async () => {
    renderModal();
    await screen.findByText("Strong match"); // wait for initial load (uncached row searched once)
    expect(searchSpotify).toHaveBeenCalledTimes(1);

    // The remembered (cached) track shows Re-match, not Change.
    await userEvent.click(screen.getByRole("button", { name: /re-match Get Lucky/i }));

    expect(searchSpotify).toHaveBeenCalledTimes(2);
    expect(searchSpotify).toHaveBeenLastCalledWith(
      expect.objectContaining({ artist: "Daft Punk", title: "Get Lucky" }),
    );
  });

  it("lets the DJ paste a Spotify link for an unmatched track", async () => {
    vi.mocked(searchSpotify).mockResolvedValue({
      candidates: [],
      recommendedIndex: null,
      confidence: "none",
      cached: false,
    });
    vi.mocked(resolveSpotifyTrack).mockResolvedValue({
      candidate: {
        spotifyId: "pasted1",
        uri: "spotify:track:pasted1",
        url: "https://open.spotify.com/track/pasted1",
        name: "Pasted Song",
        artists: "Someone",
        durationMs: 200_000,
        popularity: 50,
      },
    });
    renderModal();

    const input = await screen.findByLabelText("Paste a Spotify track link"); // the unmatched row
    await userEvent.type(input, "https://open.spotify.com/track/abcdefghij1234567890ab");
    await userEvent.click(screen.getByRole("button", { name: /use link/i }));

    expect(resolveSpotifyTrack).toHaveBeenCalledWith("abcdefghij1234567890ab");
  });

  it("short-circuits to the remembered playlist without re-searching", async () => {
    vi.mocked(sessionRepository.getSessionPlaylistUrl).mockResolvedValue(
      "https://open.spotify.com/playlist/old",
    );
    renderModal();
    expect(await screen.findByText(/already has a playlist/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /open in spotify/i })).toBeInTheDocument();
    expect(searchSpotify).not.toHaveBeenCalled();
  });

  describe("share to profile", () => {
    // Reach the done screen via the remembered-playlist short-circuit (no create flow needed).
    const openDone = () =>
      vi
        .mocked(sessionRepository.getSessionPlaylistUrl)
        .mockResolvedValue("https://open.spotify.com/playlist/abc");

    it("shares the set playlist and flips to the synced state", async () => {
      openDone();
      renderModal();
      await userEvent.click(
        await screen.findByRole("button", { name: /share on my pika profile/i }),
      );
      await waitFor(() =>
        expect(syncSessionPlaylist).toHaveBeenCalledWith(
          "pika_1",
          expect.objectContaining({ spotifyPlaylistId: "abc" }),
        ),
      );
      expect(sessionRepository.setSessionPlaylistSynced).toHaveBeenCalledWith(
        7,
        expect.any(Number),
      );
      expect(await screen.findByText(/on your pika profile/i)).toBeInTheDocument();
    });

    it("disables sharing when the set was never broadcast live (no cloud session)", async () => {
      openDone();
      vi.mocked(sessionRepository.getSessionPlaylistState).mockResolvedValue({
        url: "https://open.spotify.com/playlist/abc",
        playlistId: "abc",
        cloudSessionId: null,
        syncedAt: null,
      });
      renderModal();
      expect(await screen.findByText(/go live with a set to share/i)).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /share on my pika profile/i }),
      ).not.toBeInTheDocument();
    });

    it("shows the synced state and un-shares on demand", async () => {
      openDone();
      vi.mocked(sessionRepository.getSessionPlaylistState).mockResolvedValue({
        url: "https://open.spotify.com/playlist/abc",
        playlistId: "abc",
        cloudSessionId: "pika_1",
        syncedAt: 1705968000,
      });
      renderModal();
      expect(await screen.findByText(/on your pika profile/i)).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: /remove from profile/i }));
      await waitFor(() => expect(unsyncSessionPlaylist).toHaveBeenCalledWith("pika_1"));
      expect(sessionRepository.setSessionPlaylistSynced).toHaveBeenCalledWith(7, null);
    });

    it("surfaces an error when sharing fails", async () => {
      openDone();
      vi.mocked(syncSessionPlaylist).mockRejectedValue(new Error("network down"));
      renderModal();
      await userEvent.click(
        await screen.findByRole("button", { name: /share on my pika profile/i }),
      );
      expect(await screen.findByText(/network down/i)).toBeInTheDocument();
    });
  });
});
