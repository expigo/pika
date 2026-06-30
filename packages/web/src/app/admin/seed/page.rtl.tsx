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
  localStorage.clear(); // the page persists the selected DJ — keep tests independent
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

  it("imports multiple Exportify CSVs, each as an editable-named playlist, WITH features", async () => {
    render(<AdminSeedPage />);

    await userEvent.click(screen.getByRole("tab", { name: /import csv/i }));
    await userEvent.selectOptions(await screen.findByLabelText("DJ"), "dj1");

    const f1 = new File(
      [
        "Track URI,Track Name,Artist Name(s),Tempo,Energy\nspotify:track:z1,My Song,My Artist,128,0.7\n",
      ],
      "myset.csv",
      { type: "text/csv" },
    );
    const f2 = new File(
      ["Track URI,Track Name,Artist Name(s),Tempo\nspotify:track:z2,Other Song,Other Artist,90\n"],
      "Other_Set.csv",
      { type: "text/csv" },
    );
    await userEvent.upload(screen.getByLabelText("Exportify CSVs"), [f1, f2]);

    // Playlist names default from the filename (de-munged); the first is edited.
    const name1 = (await screen.findByLabelText("Playlist name for myset.csv")) as HTMLInputElement;
    expect(name1.value).toBe("myset");
    expect(
      (screen.getByLabelText("Playlist name for Other_Set.csv") as HTMLInputElement).value,
    ).toBe("Other Set");
    await userEvent.clear(name1);
    await userEvent.type(name1, "My Set");

    await userEvent.click(
      await screen.findByRole("button", { name: /seed 2 tracks · 2 playlists/i }),
    );

    expect(admin.seedCurated).toHaveBeenCalledWith(
      expect.objectContaining({
        djUserId: "dj1",
        playlistName: "My Set",
        tracks: [
          expect.objectContaining({
            spotifyId: "z1",
            features: expect.objectContaining({ tempo: 128 }),
          }),
        ],
      }),
    );
    expect(admin.seedCurated).toHaveBeenCalledWith(
      expect.objectContaining({ djUserId: "dj1", playlistName: "Other Set" }),
    );
    expect(await screen.findByText(/seeded 2 tracks across 2 playlists/i)).toBeInTheDocument();
  });
});
