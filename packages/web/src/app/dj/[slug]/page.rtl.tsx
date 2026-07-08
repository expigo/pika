import { Suspense } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockFetch, render, screen } from "../../../test/rtl";

vi.mock("@/lib/authClient", () => ({
  authClient: { useSession: vi.fn(() => ({ data: null, isPending: false })) },
}));
vi.mock("@/lib/djLive", () => ({
  getMe: vi.fn(async () => null),
}));

import { getMe } from "@/lib/djLive";
import DjProfilePage from "./page";

const PROFILE = {
  slug: "dj-nova",
  djName: "DJ Nova",
  bio: "Bluesy after midnight.",
  gigs: [{ id: 1, date: "2099-01-15", title: "Budafest", city: "Budapest", url: "https://x.y" }],
  followerCount: 12,
  // Slice D — the Signature + promoted native playlists (both provenance badges covered).
  signature: {
    contexts: { live: 2, imported: 1, liveTracks: 12, importedTracks: 20 },
    distinctTracks: 40,
    featuredTracks: 32,
    coverage: 0.8,
    tempo: { min: 80, p25: 92, median: 101, p75: 112, max: 124 },
    energy: { p25: 0.4, median: 0.55, p75: 0.7 },
    danceability: { p25: 0.5, median: 0.6, p75: 0.7 },
    valence: { p25: 0.3, median: 0.45, p75: 0.6 },
    acousticness: { p25: 0.15, median: 0.25, p75: 0.4 },
    eras: [{ decade: "2010s", share: 0.7 }],
  },
  boothPlaylists: [
    {
      id: 1,
      name: "Budafest Crate",
      label: "party set",
      kind: "set",
      source: "csv",
      spotifyUrl: "https://open.spotify.com/playlist/abc",
      trackCount: 7,
      tracks: [
        {
          title: "Track One",
          artist: "Artist A",
          albumArtUrl: null, // pure-import playlists are art-less — fallback tile, no crash
          spotifyUrl: "https://open.spotify.com/track/one",
        },
      ],
    },
    {
      id: 2,
      name: "Saturday Live Set",
      label: null,
      kind: null,
      source: "profile",
      spotifyUrl: null,
      trackCount: 1,
      tracks: [
        {
          title: "Live Hit",
          artist: "Artist B",
          albumArtUrl: null,
          spotifyUrl: "https://open.spotify.com/track/two",
        },
      ],
    },
  ],
  sessions: [],
  totalSessions: 0,
  totalTracks: 0,
  // D.1 — external embeds now render INSIDE "Crates & Sets." as named collapsed rows;
  // one with an oEmbed title, one falling back to the generic label.
  playlists: [
    {
      id: 11,
      url: "https://open.spotify.com/playlist/deep1",
      spotifyPlaylistId: "deep1",
      title: "Deep Cuts",
    },
    {
      id: 12,
      url: "https://open.spotify.com/playlist/anon2",
      spotifyPlaylistId: "anon2",
      title: null,
    },
  ],
};

/**
 * React's `use()` reads .status/.value off an instrumented thenable synchronously — a plain
 * Promise.resolve suspends and never settles under the test renderer.
 */
function slugParams(): Promise<{ slug: string }> {
  const p = Promise.resolve({ slug: "dj-nova" }) as Promise<{ slug: string }> & {
    status?: string;
    value?: { slug: string };
  };
  p.status = "fulfilled";
  p.value = { slug: "dj-nova" };
  return p;
}

function renderBooth() {
  return render(
    <Suspense fallback={null}>
      <DjProfilePage params={slugParams()} />
    </Suspense>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getMe).mockResolvedValue(null);
  window.history.replaceState(null, "", "/dj/dj-nova?ref=recap");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Booth page (/dj/[slug])", () => {
  it("renders bio, upcoming gigs, the gated follower count, a Follow button — and beacons the visit", async () => {
    const fetchMock = mockFetch({
      "/telemetry/events": { status: 204, body: null },
      "/api/me/follows": { follows: [] },
      "/api/dj/dj-nova": PROFILE,
    });
    vi.stubGlobal("fetch", fetchMock);
    renderBooth();

    expect(await screen.findByText(/bluesy after midnight/i)).toBeInTheDocument();
    expect(screen.getByText("Budafest")).toBeInTheDocument();
    expect(screen.getByText(/budapest/i)).toBeInTheDocument();
    expect(screen.getByText(/12 followers/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /follow dj nova/i })).toBeInTheDocument();
    // No owner affordance for a stranger.
    expect(screen.queryByText(/manage your booth/i)).toBeNull();

    const beacon = fetchMock.mock.calls.find(
      ([url, init]) =>
        String(url).includes("/telemetry/events") &&
        String((init as RequestInit | undefined)?.body ?? "").includes("booth_viewed"),
    );
    expect(beacon).toBeDefined();
    expect(String((beacon?.[1] as RequestInit).body)).toContain('"ref":"recap"');
  });

  it("renders the Signature card (denominator + radar) and native playlists with both provenance badges", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({
        "/telemetry/events": { status: 204, body: null },
        "/api/me/follows": { follows: [] },
        "/api/dj/dj-nova": PROFILE,
      }),
    );
    renderBooth();

    // The Signature's LOAD-BEARING denominator — now with per-context track counts (D.1).
    expect(
      await screen.findByText(
        /based on 2 live sets \(12 tracks\) · 1 imported playlist \(20 tracks\) · 80% feature coverage/i,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/92–112 BPM core/i)).toBeInTheDocument();
    expect(screen.getByTestId("signature-radar")).toBeInTheDocument();

    // Native playlist section: provenance badges, preview rows, +N more, Spotify link.
    expect(screen.getByText(/dj's pick/i)).toBeInTheDocument();
    expect(screen.getByText(/played live on pika/i)).toBeInTheDocument();
    expect(screen.getByText("Track One")).toBeInTheDocument();
    expect(screen.getByText(/\+6 more tracks/i)).toBeInTheDocument();
  });

  it("merges external embeds into Crates & Sets as NAMED collapsed rows (no standalone section)", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({
        "/telemetry/events": { status: 204, body: null },
        "/api/me/follows": { follows: [] },
        "/api/dj/dj-nova": PROFILE,
      }),
    );
    renderBooth();

    // oEmbed-titled row + the generic fallback for a titleless one.
    expect(await screen.findByText("Deep Cuts")).toBeInTheDocument();
    expect(screen.getByText("DJ Nova playlist")).toBeInTheDocument();
    // Players stay behind a tap, and the collapsed control announces the real name.
    expect(
      screen.getByRole("button", { name: /show spotify player for deep cuts/i }),
    ).toBeInTheDocument();
    // The pre-D.1 standalone "Playlists." section is gone — one music section only.
    expect(screen.queryByRole("heading", { name: /^playlists\.$/i })).toBeNull();
    expect(screen.getByRole("heading", { name: /crates & sets\./i })).toBeInTheDocument();
  });

  it("shows the compatibility card for a signed-in dancer above the overlap floor", async () => {
    const { authClient } = await import("@/lib/authClient");
    vi.mocked(authClient.useSession).mockReturnValue({
      data: { user: { id: "u1" } },
      isPending: false,
    } as unknown as ReturnType<typeof authClient.useSession>);
    vi.stubGlobal(
      "fetch",
      mockFetch({
        "/telemetry/events": { status: 204, body: null },
        "/api/me/compat/dj-nova": {
          sharedCount: 5,
          viewerTrackCount: 20,
          topShared: [
            {
              title: "Shared Song",
              artist: "Artist S",
              albumArtUrl: null,
              spotifyUrl: "https://open.spotify.com/track/s",
            },
          ],
        },
        "/api/me/follows": { follows: [] },
        "/api/dj/dj-nova": PROFILE,
      }),
    );
    renderBooth();

    expect(await screen.findByText(/your match/i)).toBeInTheDocument();
    expect(screen.getByText("Shared Song")).toBeInTheDocument();
  });

  it("omits the count when the payload doesn't carry it and shows the owner link for the owner", async () => {
    vi.mocked(getMe).mockResolvedValue({
      id: "u1",
      email: "dj@x.y",
      displayName: "DJ Nova",
      slug: "dj-nova",
      status: "approved",
    });
    vi.stubGlobal(
      "fetch",
      mockFetch({
        "/telemetry/events": { status: 204, body: null },
        "/api/me/follows": { follows: [] },
        "/api/dj/dj-nova": { ...PROFILE, followerCount: undefined },
      }),
    );
    renderBooth();

    const manage = await screen.findByRole("link", { name: /manage your booth/i });
    expect(manage).toHaveAttribute("href", "/dj/booth"); // D.1: management moved off /dj/live
    expect(screen.queryByText(/followers/i)).toBeNull();
  });
});
