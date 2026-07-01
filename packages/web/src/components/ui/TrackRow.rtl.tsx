import { describe, expect, it } from "vitest";
import { render, screen } from "../../test/rtl";
import { TrackRow } from "./TrackRow";

describe("TrackRow", () => {
  it("renders title, artist, and the trailing children slot", () => {
    render(
      <TrackRow title="Careful" artist="SYML" position={3}>
        <span>trailing-stat</span>
      </TrackRow>,
    );
    expect(screen.getByText("Careful")).toBeInTheDocument();
    expect(screen.getByText("SYML")).toBeInTheDocument();
    expect(screen.getByText("trailing-stat")).toBeInTheDocument();
    expect(screen.getByText("03")).toBeInTheDocument(); // zero-padded position
  });

  it("shows the album-art image when albumArtUrl is set", () => {
    render(<TrackRow title="Careful" artist="SYML" albumArtUrl="https://i.scdn.co/image/x" />);
    const img = screen.getByRole("img", { name: /careful cover/i });
    expect(img).toHaveAttribute("src", "https://i.scdn.co/image/x");
  });

  it("shows the fallback tile (no image) when there is no album art", () => {
    render(<TrackRow title="Careful" artist="SYML" />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("renders a 'Listen on Spotify' link when spotifyUrl is set", () => {
    render(
      <TrackRow title="Careful" artist="SYML" spotifyUrl="https://open.spotify.com/track/abc" />,
    );
    const link = screen.getByRole("link", { name: /listen to careful on spotify/i });
    expect(link).toHaveAttribute("href", "https://open.spotify.com/track/abc");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("omits the Listen-on link when spotifyUrl is absent", () => {
    render(<TrackRow title="Careful" artist="SYML" />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
