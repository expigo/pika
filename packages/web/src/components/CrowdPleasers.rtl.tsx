import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockFetch, render, screen } from "../test/rtl";

vi.mock("@/lib/djLive", () => ({
  getMyCrowdPleasers: vi.fn(),
}));

import { getMyCrowdPleasers } from "@/lib/djLive";
import { CrowdPleasers } from "./CrowdPleasers";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", mockFetch({ "/telemetry/events": { status: 204, body: null } }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("CrowdPleasers", () => {
  it("renders nothing with no liked tracks yet", async () => {
    vi.mocked(getMyCrowdPleasers).mockResolvedValue({
      totals: { sessions: 0, likes: 0, dancers: 0 },
      tracks: [],
    });
    const { container } = render(<CrowdPleasers />);
    await vi.waitFor(() => expect(getMyCrowdPleasers).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("renders totals + the floor-love leaderboard", async () => {
    vi.mocked(getMyCrowdPleasers).mockResolvedValue({
      totals: { sessions: 4, likes: 130, dancers: 27 },
      tracks: [
        {
          artist: "Daft Punk",
          title: "Get Lucky",
          albumArtUrl: null,
          spotifyUrl: null,
          plays: 4,
          likes: 21,
          likesPerPlay: 5.3,
        },
      ],
    });
    render(<CrowdPleasers />);
    expect(await screen.findByText(/crowd-pleasers/i)).toBeInTheDocument();
    expect(screen.getByText("130")).toBeInTheDocument();
    expect(screen.getByText("Get Lucky")).toBeInTheDocument();
    expect(screen.getByText(/4 plays/i)).toBeInTheDocument();
  });
});
