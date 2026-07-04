import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockFetch, render, screen, userEvent, waitFor } from "../../test/rtl";

// Deterministic session state (default: signed out → device mode, the pre-Slice-B behavior).
vi.mock("@/lib/authClient", () => ({
  authClient: {
    useSession: vi.fn(() => ({ data: null, isPending: false })),
    signOut: vi.fn(async () => ({})),
    deleteUser: vi.fn(async () => ({ data: {}, error: null })),
  },
}));

import { authClient } from "@/lib/authClient";
import MyLikesPage from "./page";

function signedInAs(email: string): void {
  vi.mocked(authClient.useSession).mockReturnValue({
    data: { user: { id: "u1", email } },
    isPending: false,
  } as unknown as ReturnType<typeof authClient.useSession>);
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks(); // factory vi.fn()s (deleteUser/signOut) keep call history across tests otherwise
  vi.mocked(authClient.useSession).mockReturnValue({ data: null, isPending: false } as ReturnType<
    typeof authClient.useSession
  >);
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

  it("signed in: claims the device id, reads the account journal, shows the account card", async () => {
    signedInAs("dancer@x.y");
    localStorage.setItem("pika_client_id", "client-1");
    const fetchMock = mockFetch({
      "/telemetry/events": { status: 204, body: null },
      "/me/journal/claim": { status: "claimed" },
      "/me/journal": {
        totalLikes: 2,
        limit: 100,
        offset: 0,
        claimedCount: 2,
        likes: [like(1, "s1", { title: "From Phone" }), like(2, "s1", { title: "From Laptop" })],
        playlist: null,
      },
      "/likes?": { status: 500, body: { error: "device read must not run in account mode" } },
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<MyLikesPage />);

    expect(await screen.findByText("dancer@x.y")).toBeInTheDocument();
    expect(screen.getByText(/2 devices linked/i)).toBeInTheDocument();
    expect(screen.getByText("From Phone")).toBeInTheDocument();

    // The device id was claimed for the account before the union read.
    const claim = fetchMock.mock.calls.find(
      ([url, init]) =>
        String(url).includes("/me/journal/claim") &&
        (init as RequestInit | undefined)?.method === "POST",
    );
    expect(claim).toBeTruthy();
    expect(String((claim?.[1] as RequestInit).body)).toContain("client-1");
    // The signed-in view never fetched the device read.
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/api/client/"))).toBe(false);
    // Nudge suppressed — the session cookie is the ITP-exempt anchor.
    expect(screen.queryByText(/keep your journal safe/i)).toBeNull();
  });

  it("signed in with zero likes: empty state keeps sign-out and delete-account reachable", async () => {
    signedInAs("dancer@x.y");
    localStorage.setItem("pika_client_id", "client-1");
    vi.stubGlobal(
      "fetch",
      mockFetch({
        "/telemetry/events": { status: 204, body: null },
        "/me/journal/claim": { status: "claimed" },
        "/me/journal": {
          totalLikes: 0,
          limit: 100,
          offset: 0,
          claimedCount: 1,
          likes: [],
          playlist: null,
        },
      }),
    );
    render(<MyLikesPage />);

    expect(await screen.findByText(/the pages are blank/i)).toBeInTheDocument();
    expect(screen.getByText("dancer@x.y")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign out/i })).toBeInTheDocument();

    // GDPR deletion stays two-tap even from the empty state.
    await userEvent.click(screen.getByRole("button", { name: /delete account/i }));
    expect(vi.mocked(authClient.deleteUser)).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: /send confirmation email/i }));
    await waitFor(() => expect(vi.mocked(authClient.deleteUser)).toHaveBeenCalledTimes(1));
  });

  it("signed out with likes: shows the save-journal card and fires account_save_card_shown once", async () => {
    localStorage.setItem("pika_client_id", "client-1");
    const fetchMock = mockFetch({
      "/telemetry/events": { status: 204, body: null },
      "/likes": likesResponse([like(1)], 1),
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<MyLikesPage />);

    expect(await screen.findByText(/never lose this/i)).toBeInTheDocument();
    const cta = screen.getByRole("link", { name: /save my journal/i });
    expect(cta).toHaveAttribute("href", "/my-likes/save");
    await waitFor(() => expect(beacons(fetchMock, "account_save_card_shown").length).toBe(1));
  });

  it("signed in: save-journal card is replaced by the account card", async () => {
    signedInAs("dancer@x.y");
    localStorage.setItem("pika_client_id", "client-1");
    vi.stubGlobal(
      "fetch",
      mockFetch({
        "/telemetry/events": { status: 204, body: null },
        "/me/journal/claim": { status: "claimed" },
        "/me/journal": {
          totalLikes: 1,
          limit: 100,
          offset: 0,
          claimedCount: 1,
          likes: [like(1)],
          playlist: null,
        },
      }),
    );
    render(<MyLikesPage />);

    expect(await screen.findByText("dancer@x.y")).toBeInTheDocument();
    expect(screen.queryByText(/never lose this/i)).toBeNull();
  });

  it("delete account: two-tap confirm calls deleteUser with the ?deleted=1 callback", async () => {
    signedInAs("dancer@x.y");
    localStorage.setItem("pika_client_id", "client-1");
    const fetchMock = mockFetch({
      "/telemetry/events": { status: 204, body: null },
      "/me/journal/claim": { status: "claimed" },
      "/me/journal": {
        totalLikes: 1,
        limit: 100,
        offset: 0,
        claimedCount: 1,
        likes: [like(1)],
        playlist: null,
      },
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<MyLikesPage />);

    // First tap only ARMS — deletion must never be one tap.
    await userEvent.click(await screen.findByRole("button", { name: /delete account/i }));
    expect(vi.mocked(authClient.deleteUser)).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: /send confirmation email/i }));
    await waitFor(() => expect(vi.mocked(authClient.deleteUser)).toHaveBeenCalledTimes(1));
    const arg = vi.mocked(authClient.deleteUser).mock.calls[0]?.[0] as { callbackURL?: string };
    expect(arg?.callbackURL).toContain("/my-likes?deleted=1");
    expect(beacons(fetchMock, "account_deletion_requested").length).toBe(1);
  });

  it("post-export success (signed out) offers the save-journal upsell link", async () => {
    localStorage.setItem("pika_client_id", "client-1");
    vi.stubGlobal(
      "fetch",
      mockFetch({
        "/telemetry/events": { status: 204, body: null },
        "/likes/playlist": {
          playlistUrl: "https://open.spotify.com/playlist/pl9",
          trackCount: 1,
          matchedCount: 1,
          totalLiked: 1,
          updated: false,
        },
        "/likes?": likesResponse([like(1)], 1),
      }),
    );
    render(<MyLikesPage />);

    await userEvent.click(
      await screen.findByRole("button", { name: /create my spotify playlist/i }),
    );
    const upsell = await screen.findByRole("link", {
      name: /save your journal so you never lose it/i,
    });
    expect(upsell).toHaveAttribute("href", "/my-likes/save");
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
