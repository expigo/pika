import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DjUser } from "@/lib/djLive";
import { render, screen, userEvent, waitFor } from "../test/rtl";

const getMySessions = vi.fn();
const getMyPlaylists = vi.fn();
const setSessionPublished = vi.fn();
const addPlaylist = vi.fn();
const removePlaylist = vi.fn();
vi.mock("@/lib/djLive", () => ({
  getMySessions: (...a: unknown[]) => getMySessions(...a),
  getMyPlaylists: (...a: unknown[]) => getMyPlaylists(...a),
  setSessionPublished: (...a: unknown[]) => setSessionPublished(...a),
  addPlaylist: (...a: unknown[]) => addPlaylist(...a),
  removePlaylist: (...a: unknown[]) => removePlaylist(...a),
}));

import { ProfileManager } from "./ProfileManager";

const user: DjUser = {
  id: "u1",
  email: "a@b.c",
  displayName: "DJ One",
  slug: "dj-one",
  status: "approved",
};

describe("ProfileManager", () => {
  beforeEach(() => {
    for (const m of [
      getMySessions,
      getMyPlaylists,
      setSessionPublished,
      addPlaylist,
      removePlaylist,
    ])
      m.mockReset();
    getMySessions.mockResolvedValue({
      sessions: [
        {
          id: "s1",
          djName: "DJ One",
          startedAt: new Date().toISOString(),
          endedAt: null,
          published: true,
          trackCount: 5,
        },
      ],
    });
    getMyPlaylists.mockResolvedValue({
      playlists: [
        { id: 7, url: "https://open.spotify.com/playlist/abc", spotifyPlaylistId: "abc" },
      ],
    });
    setSessionPublished.mockResolvedValue({ success: true });
    addPlaylist.mockResolvedValue({ success: true, spotifyPlaylistId: "new" });
    removePlaylist.mockResolvedValue({ success: true });
  });

  it("loads and renders my sets + playlists", async () => {
    render(<ProfileManager user={user} />);
    expect(await screen.findByText(/5 tracks/i)).toBeInTheDocument();
    expect(screen.getByText("https://open.spotify.com/playlist/abc")).toBeInTheDocument();
    // "View public →" links to the public profile.
    expect(screen.getByRole("link", { name: /view public/i })).toHaveAttribute(
      "href",
      "/dj/dj-one",
    );
  });

  it("toggles a session's visibility", async () => {
    render(<ProfileManager user={user} />);
    await userEvent.click(await screen.findByRole("button", { name: /hide from profile/i }));
    await waitFor(() => expect(setSessionPublished).toHaveBeenCalledWith("s1", false));
  });

  it("adds a pasted playlist", async () => {
    render(<ProfileManager user={user} />);
    await userEvent.type(
      await screen.findByLabelText(/spotify playlist link/i),
      "https://open.spotify.com/playlist/new",
    );
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() =>
      expect(addPlaylist).toHaveBeenCalledWith("https://open.spotify.com/playlist/new"),
    );
  });

  it("removes a playlist", async () => {
    render(<ProfileManager user={user} />);
    await userEvent.click(await screen.findByRole("button", { name: /remove playlist/i }));
    await waitFor(() => expect(removePlaylist).toHaveBeenCalledWith(7));
  });
});
