// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "../test/rtl";

// The set store + stats helper (the component reads activeSet + aggregate stats from here).
vi.mock("../hooks/useSetBuilder", () => ({
  useSetStore: () => ({
    activeSet: [
      {
        id: 1,
        spotifyId: "s1",
        analyzed: true,
        energy: 70,
        danceability: 60,
        brightness: 55,
        acousticness: 20,
        groove: 65,
      },
    ],
  }),
  getSetStats: () => ({
    totalTracks: 1,
    avgEnergy: 70,
    avgBpm: 120,
    totalDuration: 200,
  }),
}));
// recharts radar is irrelevant here (and awkward in happy-dom) — stub it.
vi.mock("./TrackFingerprint", () => ({ TrackFingerprint: () => <div data-testid="radar" /> }));
// The Spotify-features batch hook — return one matched track's canonical features.
vi.mock("../hooks/useSpotifyFeatures", () => ({
  useSpotifyFeaturesBatch: () => ({
    features: new Map([["s1", { tempo: 120, energy: 0.8, valence: 0.5 }]]),
    loading: false,
  }),
}));

import { CrateWorkspaceStats } from "./CrateWorkspaceStats";

describe("CrateWorkspaceStats", () => {
  it("renders the Spotify aggregate (avg tempo/energy/valence) beside the Pika radar", () => {
    render(<CrateWorkspaceStats />);
    expect(screen.getByText("Spotify")).toBeInTheDocument();
    expect(screen.getByText("120 BPM")).toBeInTheDocument();
    expect(screen.getByText("E 0.80")).toBeInTheDocument();
    expect(screen.getByText("V 0.50")).toBeInTheDocument();
    expect(screen.getByText(/n=1/)).toBeInTheDocument();
  });
});
