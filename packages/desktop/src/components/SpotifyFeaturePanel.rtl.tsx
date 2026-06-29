// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { render, screen } from "../test/rtl";
import { SpotifyFeaturePanel } from "./SpotifyFeaturePanel";

describe("SpotifyFeaturePanel", () => {
  it("prompts to match when the track has no Spotify id", () => {
    render(<SpotifyFeaturePanel features={null} loading={false} hasMatch={false} />);
    expect(screen.getByText(/not matched to spotify/i)).toBeInTheDocument();
    expect(screen.getByText(/Build Playlist/)).toBeInTheDocument();
  });

  it("shows a not-in-catalog message when matched but features are absent", () => {
    render(<SpotifyFeaturePanel features={null} loading={false} hasMatch={true} />);
    expect(screen.getByText(/no spotify features/i)).toBeInTheDocument();
  });

  it("renders the features (tempo, key+camelot, energy) when present", () => {
    render(
      <SpotifyFeaturePanel
        features={{ tempo: 88.5, keyPitch: 0, mode: 1, energy: 0.16, popularity: 36 }}
        loading={false}
        hasMatch={true}
      />,
    );
    expect(screen.getByText("89 BPM")).toBeInTheDocument(); // tempo rounded
    expect(screen.getByText("C · 8B")).toBeInTheDocument(); // C major → Camelot 8B
    expect(screen.getByText("0.16")).toBeInTheDocument(); // energy
    expect(screen.getByText("36")).toBeInTheDocument(); // popularity
  });
});
