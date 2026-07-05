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
  sessions: [],
  totalSessions: 0,
  totalTracks: 0,
  playlists: [],
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

    expect(await screen.findByText(/manage your booth/i)).toBeInTheDocument();
    expect(screen.queryByText(/followers/i)).toBeNull();
  });
});
