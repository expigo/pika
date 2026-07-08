import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockFetch, render, screen } from "../test/rtl";

vi.mock("@/lib/authClient", () => ({
  authClient: { useSession: vi.fn(() => ({ data: null, isPending: false })) },
}));

import { authClient } from "@/lib/authClient";
import { CompatCard } from "./CompatCard";

function signedIn(): void {
  vi.mocked(authClient.useSession).mockReturnValue({
    data: { user: { id: "u1" } },
    isPending: false,
  } as unknown as ReturnType<typeof authClient.useSession>);
}

const SHARED = {
  sharedCount: 4,
  viewerTrackCount: 12,
  topShared: [
    {
      title: "Get Lucky",
      artist: "Daft Punk",
      albumArtUrl: null,
      spotifyUrl: "https://open.spotify.com/track/x",
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authClient.useSession).mockReturnValue({ data: null, isPending: false } as ReturnType<
    typeof authClient.useSession
  >);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("CompatCard", () => {
  it("renders nothing signed out (per-viewer surface)", () => {
    const fetchMock = mockFetch({});
    vi.stubGlobal("fetch", fetchMock);
    const { container } = render(<CompatCard slug="dj-nova" djName="DJ Nova" />);
    expect(container).toBeEmptyDOMElement();
    // Never even fetches — there is no viewer to compute for.
    expect(fetchMock.mock.calls.filter(([u]) => String(u).includes("/compat/")).length).toBe(0);
  });

  it("renders nothing below the overlap floor", async () => {
    signedIn();
    vi.stubGlobal(
      "fetch",
      mockFetch({
        "/telemetry/events": { status: 204, body: null },
        "/api/me/compat/dj-nova": { sharedCount: 2, viewerTrackCount: 9, topShared: [] },
      }),
    );
    const { container } = render(<CompatCard slug="dj-nova" djName="DJ Nova" />);
    await vi.waitFor(() => {
      expect(container).toBeEmptyDOMElement();
    });
  });

  it("renders the overlap + shared tracks at the floor, and beacons once", async () => {
    signedIn();
    const fetchMock = mockFetch({
      "/telemetry/events": { status: 204, body: null },
      "/api/me/compat/dj-nova": SHARED,
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<CompatCard slug="dj-nova" djName="DJ Nova" />);

    expect(await screen.findByText(/your match/i)).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("Get Lucky")).toBeInTheDocument();
    const beacons = fetchMock.mock.calls.filter(
      ([url, init]) =>
        String(url).includes("/telemetry/events") &&
        String((init as RequestInit | undefined)?.body ?? "").includes("compat_viewed"),
    );
    expect(beacons.length).toBe(1);
  });
});
