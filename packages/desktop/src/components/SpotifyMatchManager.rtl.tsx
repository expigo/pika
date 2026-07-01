// @vitest-environment happy-dom
import { waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Track } from "../db/repositories/trackRepository";
import { render, screen, userEvent } from "../test/rtl";
import { SpotifyMatchManager } from "./SpotifyMatchManager";

vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn().mockResolvedValue(undefined) }));

// vi.mock is hoisted; create the values it needs via vi.hoisted.
const { PlaylistApiError, searchSpotify, resolveSpotifyTrack, confirmSpotifyMatch } = vi.hoisted(
  () => {
    class PlaylistApiError extends Error {
      constructor(
        public readonly status: number,
        msg: string,
      ) {
        super(msg);
      }
    }
    return {
      PlaylistApiError,
      searchSpotify: vi.fn(),
      resolveSpotifyTrack: vi.fn(),
      confirmSpotifyMatch: vi.fn(),
    };
  },
);
vi.mock("../services/spotifyPlaylist", () => ({
  PlaylistApiError,
  searchSpotify: (...a: unknown[]) => searchSpotify(...a),
  resolveSpotifyTrack: (...a: unknown[]) => resolveSpotifyTrack(...a),
  confirmSpotifyMatch: (...a: unknown[]) => confirmSpotifyMatch(...a),
  parseSpotifyTrackId: (s: string) =>
    /track[/:]([A-Za-z0-9]{22})/.test(s) || /^[A-Za-z0-9]{22}$/.test(s)
      ? "pastedid0000000000000"
      : null,
}));

const repo = {
  setTrackSpotifyMatch: vi.fn(),
  clearTrackSpotifyMatch: vi.fn(),
  getTrackById: vi.fn(),
};
vi.mock("../db/repositories/trackRepository", () => ({
  trackRepository: {
    setTrackSpotifyMatch: (...a: unknown[]) => repo.setTrackSpotifyMatch(...a),
    clearTrackSpotifyMatch: (...a: unknown[]) => repo.clearTrackSpotifyMatch(...a),
    getTrackById: (...a: unknown[]) => repo.getTrackById(...a),
  },
}));

const track = (over: Partial<Track> = {}): Track =>
  ({
    id: 1,
    artist: "SYML",
    title: "Careful",
    duration: 180,
    spotifyId: null,
    spotifyUrl: null,
    spotifyAlbumArtUrl: null,
    spotifyMatchSource: null,
    spotifyMatchConfidence: null,
    ...over,
  }) as Track;

const candidate = {
  spotifyId: "c1",
  uri: "spotify:track:c1",
  url: "https://open.spotify.com/track/c1",
  name: "Careful",
  artists: "SYML",
  durationMs: 148000,
  popularity: 40,
  albumArtUrl: "https://art/c1",
};
const searchHit = {
  candidates: [candidate],
  recommendedIndex: 0,
  confidence: "high",
  cached: false,
};

describe("SpotifyMatchManager", () => {
  beforeEach(() => {
    for (const m of [
      searchSpotify,
      resolveSpotifyTrack,
      confirmSpotifyMatch,
      ...Object.values(repo),
    ])
      m.mockReset();
    repo.getTrackById.mockResolvedValue(
      track({ spotifyId: "c1", spotifyMatchSource: "dj_confirmed" }),
    );
  });

  it("shows a confirmed match (lock) and Remove clears it", async () => {
    const onChanged = vi.fn();
    render(
      <SpotifyMatchManager
        track={track({ spotifyId: "x", spotifyUrl: "u", spotifyMatchSource: "dj_confirmed" })}
        onChanged={onChanged}
      />,
    );
    expect(screen.getByText("Confirmed")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(repo.clearTrackSpotifyMatch).toHaveBeenCalledWith(1));
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("shows the confidence tier for an auto match", () => {
    render(
      <SpotifyMatchManager
        track={track({ spotifyId: "x", spotifyMatchSource: "auto", spotifyMatchConfidence: 0.6 })}
        onChanged={vi.fn()}
      />,
    );
    expect(screen.getByText(/likely — verify/i)).toBeInTheDocument();
  });

  it("Change → re-search → Use confirms as dj_confirmed and promotes to the shared cache", async () => {
    searchSpotify.mockResolvedValue(searchHit);
    confirmSpotifyMatch.mockResolvedValue({ success: true });
    const onChanged = vi.fn();
    render(
      <SpotifyMatchManager
        track={track({ spotifyId: "old", spotifyMatchSource: "auto", spotifyMatchConfidence: 0.6 })}
        onChanged={onChanged}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Change" }));
    await userEvent.click(await screen.findByRole("button", { name: /use/i }));

    await waitFor(() => expect(repo.setTrackSpotifyMatch).toHaveBeenCalled());
    expect(repo.setTrackSpotifyMatch).toHaveBeenCalledWith(1, {
      spotifyId: "c1",
      spotifyUrl: "https://open.spotify.com/track/c1",
      albumArtUrl: "https://art/c1",
      confidence: null,
      source: "dj_confirmed",
    });
    expect(confirmSpotifyMatch).toHaveBeenCalledWith({
      artist: "SYML",
      title: "Careful",
      spotifyId: "c1",
      spotifyUrl: "https://open.spotify.com/track/c1",
    });
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("unmatched → Match to Spotify runs a search", async () => {
    searchSpotify.mockResolvedValue(searchHit);
    render(<SpotifyMatchManager track={track()} onChanged={vi.fn()} />);
    expect(screen.getByText(/not matched to spotify/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /match to spotify/i }));
    expect(await screen.findByRole("button", { name: /use/i })).toBeInTheDocument();
    expect(searchSpotify).toHaveBeenCalledWith(
      expect.objectContaining({ artist: "SYML", title: "Careful" }),
    );
  });

  it("paste-a-link resolves a candidate that can be confirmed", async () => {
    searchSpotify.mockResolvedValue({ candidates: [], recommendedIndex: null, confidence: "none" });
    resolveSpotifyTrack.mockResolvedValue({ candidate });
    render(<SpotifyMatchManager track={track()} onChanged={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /match to spotify/i }));
    await userEvent.type(
      await screen.findByLabelText(/spotify track link/i),
      "https://open.spotify.com/track/abcdefghijklmnopqrstuv",
    );
    await userEvent.click(screen.getByRole("button", { name: /resolve/i }));
    expect(await screen.findByRole("button", { name: /use/i })).toBeInTheDocument();
    expect(resolveSpotifyTrack).toHaveBeenCalled();
  });

  it("surfaces an auth error from search", async () => {
    searchSpotify.mockRejectedValue(new PlaylistApiError(401, "unauth"));
    render(
      <SpotifyMatchManager
        track={track({ spotifyId: "x", spotifyMatchSource: "auto" })}
        onChanged={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Change" }));
    expect(await screen.findByText(/reconnect your pika account/i)).toBeInTheDocument();
  });
});
