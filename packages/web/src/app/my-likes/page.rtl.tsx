import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockFetch, render, screen, userEvent, waitFor } from "../../test/rtl";
import MyLikesPage from "./page";

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

interface LikeFixture {
  id: number;
  sessionId: string | null;
  djName: string | null;
  sessionDate: string | null;
  artist: string;
  title: string;
  albumArtUrl: string | null;
  spotifyUrl: string | null;
  likedAt: string;
}

function like(id: number, sessionId = "s1", overrides: Partial<LikeFixture> = {}): LikeFixture {
  return {
    id,
    sessionId,
    djName: "DJ Nova",
    sessionDate: "2026-06-20T20:00:00Z",
    artist: `Artist ${id}`,
    title: `Track ${id}`,
    albumArtUrl: null,
    spotifyUrl: null,
    likedAt: "2026-06-20T21:00:00Z",
    ...overrides,
  };
}

function likesResponse(
  likes: LikeFixture[],
  totalLikes: number,
  playlist: { url: string; trackCount: number; updatedAt: string } | null = null,
) {
  return { clientId: "client-1", totalLikes, limit: 100, offset: 0, likes, playlist };
}

/** Beacon calls to /api/telemetry/events whose body contains `needle`. */
function beacons(fetchMock: ReturnType<typeof mockFetch>, needle: string) {
  return fetchMock.mock.calls.filter(
    ([url, init]) =>
      String(url).includes("/telemetry/events") &&
      String((init as RequestInit | undefined)?.body ?? "").includes(needle),
  );
}

describe("MyLikesPage", () => {
  it("shows the empty state when there is no client id", async () => {
    vi.stubGlobal("fetch", mockFetch({ "/telemetry/events": { status: 204, body: null } }));
    render(<MyLikesPage />);
    expect(await screen.findByText(/the pages are blank/i)).toBeInTheDocument();
  });

  it("shows the empty state when the client has zero likes", async () => {
    localStorage.setItem("pika_client_id", "client-1");
    vi.stubGlobal(
      "fetch",
      mockFetch({
        "/telemetry/events": { status: 204, body: null },
        "/likes": likesResponse([], 0),
      }),
    );
    render(<MyLikesPage />);
    expect(await screen.findByText(/the pages are blank/i)).toBeInTheDocument();
  });

  it("renders liked tracks grouped under their DJ/session with the real total", async () => {
    localStorage.setItem("pika_client_id", "client-1");
    vi.stubGlobal(
      "fetch",
      mockFetch({
        "/telemetry/events": { status: 204, body: null },
        "/likes": likesResponse(
          [
            like(1, "s1", { artist: "Daft Punk", title: "Get Lucky" }),
            like(2, "s1", { artist: "Chic", title: "Le Freak" }),
          ],
          2,
        ),
      }),
    );
    render(<MyLikesPage />);
    expect(await screen.findByText("Get Lucky")).toBeInTheDocument();
    expect(screen.getByText("Le Freak")).toBeInTheDocument();
    expect(screen.getByText("DJ Nova")).toBeInTheDocument();
    expect(screen.getByText(/2 moments captured/i)).toBeInTheDocument();
  });

  it("fires journal_opened exactly once, even without a client id", async () => {
    const fetchMock = mockFetch({ "/telemetry/events": { status: 204, body: null } });
    vi.stubGlobal("fetch", fetchMock);
    render(<MyLikesPage />);
    await screen.findByText(/the pages are blank/i);
    expect(beacons(fetchMock, "journal_opened").length).toBe(1);
  });

  it("paginates: shows the real total, Load more fetches the next offset and merges", async () => {
    localStorage.setItem("pika_client_id", "client-1");
    const page1 = Array.from({ length: 100 }, (_, i) => like(i));
    const page2 = Array.from({ length: 50 }, (_, i) => like(100 + i));
    const fetchMock = mockFetch({
      "/telemetry/events": { status: 204, body: null },
      "offset=100": { ...likesResponse(page2, 150), offset: 100 },
      "/likes?": likesResponse(page1, 150),
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<MyLikesPage />);

    expect(await screen.findByText(/150 moments captured/i)).toBeInTheDocument();
    const loadMore = screen.getByRole("button", { name: /load more/i });
    await userEvent.click(loadMore);

    expect(await screen.findByText("Track 149")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /load more/i })).toBeNull();
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("offset=100"))).toBe(true);
    expect(beacons(fetchMock, "journal_load_more").length).toBe(1);
  });

  it("export: creates the playlist, shows the link, fires journal_export_created", async () => {
    localStorage.setItem("pika_client_id", "client-1");
    const fetchMock = mockFetch({
      "/telemetry/events": { status: 204, body: null },
      "/likes/playlist": {
        playlistUrl: "https://open.spotify.com/playlist/pl9",
        trackCount: 2,
        matchedCount: 2,
        totalLiked: 3,
        updated: false,
      },
      "/likes?": likesResponse([like(1), like(2)], 2),
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<MyLikesPage />);

    await userEvent.click(
      await screen.findByRole("button", { name: /create my spotify playlist/i }),
    );

    const link = await screen.findByRole("link", { name: /open my playlist/i });
    expect(link).toHaveAttribute("href", "https://open.spotify.com/playlist/pl9");
    expect(screen.getByText(/playlist created/i)).toBeInTheDocument();
    expect(beacons(fetchMock, "journal_export_created").length).toBe(1);
  });

  it("export 409: shows the not-set-up copy and fires journal_export_failed", async () => {
    localStorage.setItem("pika_client_id", "client-1");
    const fetchMock = mockFetch({
      "/telemetry/events": { status: 204, body: null },
      "/likes/playlist": {
        status: 409,
        body: { error: "Playlist service not connected", needsService: true },
      },
      "/likes?": likesResponse([like(1)], 1),
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<MyLikesPage />);

    await userEvent.click(
      await screen.findByRole("button", { name: /create my spotify playlist/i }),
    );
    expect(await screen.findByText(/isn't set up yet/i)).toBeInTheDocument();
    expect(beacons(fetchMock, "journal_export_failed").length).toBe(1);
  });

  it("export 429: surfaces retryAfterSec in the cooldown copy", async () => {
    localStorage.setItem("pika_client_id", "client-1");
    const fetchMock = mockFetch({
      "/telemetry/events": { status: 204, body: null },
      "/likes/playlist": {
        status: 429,
        body: { error: "Please wait before updating again", retryAfterSec: 42 },
      },
      "/likes?": likesResponse([like(1)], 1),
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<MyLikesPage />);

    await userEvent.click(
      await screen.findByRole("button", { name: /create my spotify playlist/i }),
    );
    expect(await screen.findByText(/try again in 42s/i)).toBeInTheDocument();
  });

  it("export 422: explains that no likes matched Spotify", async () => {
    localStorage.setItem("pika_client_id", "client-1");
    const fetchMock = mockFetch({
      "/telemetry/events": { status: 204, body: null },
      "/likes/playlist": {
        status: 422,
        body: { error: "None of your liked tracks matched Spotify yet", totalLiked: 1 },
      },
      "/likes?": likesResponse([like(1)], 1),
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<MyLikesPage />);

    await userEvent.click(
      await screen.findByRole("button", { name: /create my spotify playlist/i }),
    );
    expect(await screen.findByText(/none of your likes have a spotify match/i)).toBeInTheDocument();
  });

  it("existing playlist: offers Open + Update; update fires journal_export_updated", async () => {
    localStorage.setItem("pika_client_id", "client-1");
    const fetchMock = mockFetch({
      "/telemetry/events": { status: 204, body: null },
      "/likes/playlist": {
        playlistUrl: "https://open.spotify.com/playlist/pl9",
        trackCount: 6,
        matchedCount: 6,
        totalLiked: 7,
        updated: true,
      },
      "/likes?": likesResponse([like(1)], 1, {
        url: "https://open.spotify.com/playlist/pl9",
        trackCount: 5,
        updatedAt: "2026-07-01T20:00:00Z",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<MyLikesPage />);

    const open = await screen.findByRole("link", { name: /open my playlist/i });
    expect(open).toHaveAttribute("href", "https://open.spotify.com/playlist/pl9");
    expect(screen.getByText(/5 tracks on your spotify playlist/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /update playlist/i }));
    expect(await screen.findByText(/playlist updated/i)).toBeInTheDocument();
    expect(screen.getByText(/6 tracks on your spotify playlist/i)).toBeInTheDocument();
    expect(beacons(fetchMock, "journal_export_updated").length).toBe(1);
  });

  it("shows the keep-it-safe nudge in a browser and fires install_nudge_shown once", async () => {
    localStorage.setItem("pika_client_id", "client-1");
    const fetchMock = mockFetch({
      "/telemetry/events": { status: 204, body: null },
      "/likes": likesResponse([like(1)], 1),
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<MyLikesPage />);

    expect(await screen.findByText(/keep your journal safe/i)).toBeInTheDocument();
    expect(beacons(fetchMock, "install_nudge_shown").length).toBe(1);
  });

  it("remove: arm then confirm deletes the like, updates the pill, fires the beacon", async () => {
    localStorage.setItem("pika_client_id", "client-1");
    const fetchMock = mockFetch({
      "/telemetry/events": { status: 204, body: null },
      "/likes/1": { success: true, totalLikes: 1 },
      "/likes?": likesResponse(
        [like(1, "s1", { title: "Doomed Song" }), like(2, "s1", { title: "Keeper" })],
        2,
      ),
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<MyLikesPage />);

    const deleteCalls = () =>
      fetchMock.mock.calls.filter(
        ([url, init]) =>
          String(url).includes("/likes/1") &&
          (init as RequestInit | undefined)?.method === "DELETE",
      );

    // First tap only ARMS the row — nothing is deleted yet.
    await userEvent.click(
      await screen.findByRole("button", { name: /remove doomed song from journal/i }),
    );
    expect(deleteCalls().length).toBe(0);

    await userEvent.click(
      screen.getByRole("button", { name: /confirm removing doomed song from journal/i }),
    );

    expect(await screen.findByText(/1 moments captured/i)).toBeInTheDocument();
    expect(screen.queryByText("Doomed Song")).toBeNull();
    expect(screen.getByText("Keeper")).toBeInTheDocument();
    expect(deleteCalls().length).toBe(1);
    expect(beacons(fetchMock, "journal_removed_like").length).toBe(1);
  });

  it("remove failure keeps the row", async () => {
    localStorage.setItem("pika_client_id", "client-1");
    const fetchMock = mockFetch({
      "/telemetry/events": { status: 204, body: null },
      "/likes/1": { status: 500, body: { error: "boom" } },
      "/likes?": likesResponse([like(1, "s1", { title: "Doomed Song" })], 1),
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<MyLikesPage />);

    await userEvent.click(
      await screen.findByRole("button", { name: /remove doomed song from journal/i }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: /confirm removing doomed song from journal/i }),
    );

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) =>
            String(url).includes("/likes/1") &&
            (init as RequestInit | undefined)?.method === "DELETE",
        ),
      ).toBe(true),
    );
    expect(screen.getByText("Doomed Song")).toBeInTheDocument();
    expect(screen.getByText(/1 moments captured/i)).toBeInTheDocument();
  });

  it("hides the nudge when running as an installed app (standalone)", async () => {
    localStorage.setItem("pika_client_id", "client-1");
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true } as MediaQueryList);
    vi.stubGlobal(
      "fetch",
      mockFetch({
        "/telemetry/events": { status: 204, body: null },
        "/likes": likesResponse([like(1)], 1),
      }),
    );
    render(<MyLikesPage />);

    expect(await screen.findByText("Track 1")).toBeInTheDocument();
    expect(screen.queryByText(/keep your journal safe/i)).toBeNull();
  });
});
