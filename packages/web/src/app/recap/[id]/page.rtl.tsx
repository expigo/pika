import { useParams } from "next/navigation";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockFetch, render, screen, userEvent } from "../../../test/rtl";
import RecapPage from "./page";

function recap(overrides: Record<string, unknown> = {}) {
  return {
    sessionId: "sess-1",
    djName: "DJ Nova",
    startedAt: "2026-06-20T20:00:00Z",
    endedAt: "2026-06-20T22:00:00Z",
    trackCount: 2,
    totalLikes: 5,
    tracks: [
      {
        position: 1,
        artist: "Daft Punk",
        title: "Get Lucky",
        bpm: 116,
        key: "F#m",
        playedAt: "2026-06-20T20:05:00Z",
        likes: 4,
      },
      {
        position: 2,
        artist: "Chic",
        title: "Le Freak",
        bpm: 120,
        key: "Am",
        playedAt: "2026-06-20T20:10:00Z",
        likes: 1,
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(useParams).mockReturnValue({ id: "sess-1" });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("RecapPage", () => {
  it("shows the not-available state on a 404", async () => {
    vi.stubGlobal("fetch", mockFetch({})); // unmatched → 404
    render(<RecapPage />);
    expect(await screen.findByText(/the waves went flat/i)).toBeInTheDocument();
  });

  it("renders the recap with DJ, stats, peak and tracklist", async () => {
    vi.stubGlobal("fetch", mockFetch({ "/recap": recap() }));
    render(<RecapPage />);
    expect(await screen.findByRole("heading", { name: "DJ Nova" })).toBeInTheDocument();
    expect(screen.getByText("Le Freak")).toBeInTheDocument();
    // "Get Lucky" is the most-liked track, so it appears in both the peak banner and the list.
    expect(screen.getAllByText("Get Lucky").length).toBeGreaterThan(0);
    expect(screen.getByText(/peak of the night/i)).toBeInTheDocument();
    expect(screen.getByText(/4 instant favorites/i)).toBeInTheDocument();
  });

  it("expands the tracklist when there are more than 10 tracks", async () => {
    const tracks = Array.from({ length: 12 }, (_, i) => ({
      position: i + 1,
      artist: `Artist ${i + 1}`,
      title: `Track ${i + 1}`,
      bpm: 120,
      key: "Am",
      playedAt: "2026-06-20T20:05:00Z",
      likes: 0,
    }));
    vi.stubGlobal("fetch", mockFetch({ "/recap": recap({ trackCount: 12, tracks }) }));
    render(<RecapPage />);
    // Initially only the first 10 are shown.
    expect(await screen.findByText("Track 1")).toBeInTheDocument();
    expect(screen.queryByText("Track 12")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /expand 12 syncs/i }));
    expect(screen.getByText("Track 12")).toBeInTheDocument();
  });

  it("embeds the set playlist when the DJ shared one", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({ "/recap": recap({ spotifyPlaylistId: "37i9dQZF1DXcBWIGoYBM5M" }) }),
    );
    render(<RecapPage />);
    const iframe = await screen.findByTitle(/set playlist/i);
    expect(iframe.getAttribute("src")).toContain("37i9dQZF1DXcBWIGoYBM5M");
  });

  it("omits the set-playlist section when none was shared", async () => {
    vi.stubGlobal("fetch", mockFetch({ "/recap": recap() })); // no spotifyPlaylistId
    render(<RecapPage />);
    await screen.findByRole("heading", { name: "DJ Nova" });
    expect(screen.queryByTitle(/set playlist/i)).not.toBeInTheDocument();
  });
});
