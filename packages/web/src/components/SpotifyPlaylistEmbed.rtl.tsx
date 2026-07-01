import { describe, expect, it } from "vitest";
import { render, screen } from "../test/rtl";
import { SpotifyPlaylistEmbed } from "./SpotifyPlaylistEmbed";

describe("SpotifyPlaylistEmbed", () => {
  it("renders an iframe pointing at the Spotify embed URL for the playlist", () => {
    render(<SpotifyPlaylistEmbed spotifyPlaylistId="abc123" title="My playlist" />);
    const frame = screen.getByTitle("My playlist");
    expect(frame.tagName).toBe("IFRAME");
    expect(frame).toHaveAttribute("src", "https://open.spotify.com/embed/playlist/abc123");
  });
});
