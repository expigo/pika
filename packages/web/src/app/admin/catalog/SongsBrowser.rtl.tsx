import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, userEvent } from "../../../test/rtl";
import { SongsBrowser } from "./SongsBrowser";

vi.mock("@/lib/admin", () => ({ getCatalogSongs: vi.fn(), getCatalogSong: vi.fn() }));

import * as admin from "@/lib/admin";

const song = {
  spotifyId: "s1",
  name: "500 Miles",
  artists: "ROYA",
  djCount: 2,
  playlistCount: 4,
  tempo: 88.5,
  keyPitch: 0,
  mode: 1,
  energy: 0.155,
  danceability: 0.5,
  valence: 0.18,
  popularity: 36,
};

const detail = {
  spotifyId: "s1",
  name: "500 Miles",
  artists: "ROYA",
  durationMs: 209333,
  albumArtUrl: null,
  spotify: { tempo: 88.5, keyPitch: 0, mode: 1, energy: 0.155, popularity: 36 },
  pika: {
    energy: 70,
    danceability: 60,
    brightness: 55,
    acousticness: 20,
    groove: 65,
    bpm: 120,
    plays: 2,
    djs: 1,
  },
  appearances: [
    { playlistName: "DJ_K+_All_Star", djName: "DJ Pikachu", source: "csv" },
    { playlistName: "MADjam", djName: "DJ Two", source: "csv" },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(admin.getCatalogSongs).mockResolvedValue({
    total: 1,
    limit: 25,
    offset: 0,
    songs: [song],
  });
  // biome-ignore lint/suspicious/noExplicitAny: partial detail fixture is enough for this render test
  vi.mocked(admin.getCatalogSong).mockResolvedValue(detail as any);
});

describe("SongsBrowser", () => {
  it("lists songs and opens a detail with Spotify features, the Pika section and appearances", async () => {
    render(<SongsBrowser />);

    // Row renders with the key formatted (C major) + BPM.
    expect(await screen.findByText("500 Miles")).toBeInTheDocument();
    expect(screen.getByText("C")).toBeInTheDocument(); // keyPitch 0, mode 1 → "C"
    expect(screen.getByText("89")).toBeInTheDocument(); // tempo rounded

    await userEvent.click(screen.getByText("500 Miles"));

    expect(await screen.findByText("Spotify features")).toBeInTheDocument();
    expect(screen.getByText("Pika features")).toBeInTheDocument(); // the catalog split is visible
    expect(screen.getByText(/consensus · 2 plays · 1 DJ/)).toBeInTheDocument(); // pika aggregate
    expect(screen.getByText(/Appears in \(2\)/)).toBeInTheDocument();
    expect(screen.getByText("DJ Pikachu")).toBeInTheDocument();
    expect(admin.getCatalogSong).toHaveBeenCalledWith("s1");
  });

  it("searches by query", async () => {
    render(<SongsBrowser />);
    await userEvent.type(screen.getByLabelText("Search songs"), "roya");
    // Debounced; eventually called with the query.
    await vi.waitFor(() =>
      expect(admin.getCatalogSongs).toHaveBeenCalledWith(
        expect.objectContaining({ q: "roya", sort: "popularity" }),
      ),
    );
  });

  it("threads the 'missing features' toggle into the query", async () => {
    render(<SongsBrowser />);
    await screen.findByText("500 Miles"); // initial load done
    await userEvent.click(screen.getByLabelText(/missing spotify features/i));
    await vi.waitFor(() =>
      expect(admin.getCatalogSongs).toHaveBeenCalledWith(
        expect.objectContaining({ missing: true }),
      ),
    );
  });
});
