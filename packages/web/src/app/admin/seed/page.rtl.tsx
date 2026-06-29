import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, userEvent } from "../../../test/rtl";
import AdminSeedPage from "./page";

vi.mock("@/lib/admin", () => ({
  getDjs: vi.fn(),
  getSeedPlaylists: vi.fn(),
  getSeedPlaylistTracks: vi.fn(),
  seedCurated: vi.fn(),
}));

import * as admin from "@/lib/admin";

const dj = {
  id: "dj1",
  email: "a@b.co",
  displayName: "DJ One",
  slug: "dj-one",
  status: "approved",
  role: "dj",
  createdAt: "",
  lastSeen: null,
  spotifyStatus: null,
};
const playlist = { playlistId: "p1", name: "WCS Blues", trackCount: 2, url: "https://x" };
const track = { spotifyId: "t1", uri: "spotify:track:t1", name: "Song", artists: "Artist" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(admin.getDjs).mockResolvedValue([dj]);
  vi.mocked(admin.getSeedPlaylists).mockResolvedValue({ userId: "u", playlists: [playlist] });
  vi.mocked(admin.getSeedPlaylistTracks).mockResolvedValue({ tracks: [track] });
  vi.mocked(admin.seedCurated).mockResolvedValue({ success: true, seeded: 1 });
});

describe("AdminSeedPage", () => {
  it("loads a profile's playlists and seeds the selected one to the chosen DJ", async () => {
    render(<AdminSeedPage />);

    await userEvent.selectOptions(await screen.findByLabelText("DJ"), "dj1");
    await userEvent.type(
      screen.getByLabelText("Spotify profile link"),
      "https://open.spotify.com/user/ichikoo",
    );
    await userEvent.click(screen.getByRole("button", { name: /load playlists/i }));

    expect(admin.getSeedPlaylists).toHaveBeenCalledWith("https://open.spotify.com/user/ichikoo");
    await userEvent.click(await screen.findByLabelText("Select WCS Blues"));
    await userEvent.click(screen.getByRole("button", { name: /seed 1 playlist into catalog/i }));

    expect(admin.seedCurated).toHaveBeenCalledWith({
      djUserId: "dj1",
      playlistName: "WCS Blues",
      tracks: [track],
    });
    expect(await screen.findByText(/seeded 1 tracks/i)).toBeInTheDocument();
  });

  it("shows a friendly error when the profile has no public playlists", async () => {
    vi.mocked(admin.getSeedPlaylists).mockResolvedValue({ userId: "u", playlists: [] });
    render(<AdminSeedPage />);
    await userEvent.type(screen.getByLabelText("Spotify profile link"), "open.spotify.com/user/x");
    await userEvent.click(screen.getByRole("button", { name: /load playlists/i }));
    expect(await screen.findByText(/no public playlists/i)).toBeInTheDocument();
  });
});
