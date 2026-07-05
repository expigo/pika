import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockFetch, render, screen, userEvent, waitFor } from "../test/rtl";

vi.mock("@/lib/authClient", () => ({
  authClient: { useSession: vi.fn(() => ({ data: null, isPending: false })) },
}));

import { useRouter } from "next/navigation";
import { authClient } from "@/lib/authClient";
import { FollowButton } from "./FollowButton";

function signedIn(): void {
  vi.mocked(authClient.useSession).mockReturnValue({
    data: { user: { id: "u1" } },
    isPending: false,
  } as unknown as ReturnType<typeof authClient.useSession>);
}

/** Beacon calls to /api/telemetry/events whose body contains `needle`. */
function beacons(fetchMock: ReturnType<typeof mockFetch>, needle: string) {
  return fetchMock.mock.calls.filter(
    ([url, init]) =>
      String(url).includes("/telemetry/events") &&
      String((init as RequestInit | undefined)?.body ?? "").includes(needle),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authClient.useSession).mockReturnValue({
    data: null,
    isPending: false,
  } as ReturnType<typeof authClient.useSession>);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("FollowButton", () => {
  it("anonymous tap routes to the save page with the intent in the QUERY STRING", async () => {
    const push = vi.fn();
    vi.mocked(useRouter).mockReturnValue({
      push,
      replace: vi.fn(),
      back: vi.fn(),
      prefetch: vi.fn(),
    } as unknown as ReturnType<typeof useRouter>);
    const fetchMock = mockFetch({ "/telemetry/events": { status: 204, body: null } });
    vi.stubGlobal("fetch", fetchMock);

    render(<FollowButton slug="dj-nova" djName="DJ Nova" source="booth" />);
    await userEvent.click(screen.getByRole("button", { name: /follow dj nova/i }));

    expect(push).toHaveBeenCalledWith("/my-likes/save?follow=dj-nova&source=booth");
    expect(beacons(fetchMock, "follow_tapped").length).toBe(1);
  });

  it("signed-in: optimistic follow → PUT with source; second tap unfollows via DELETE", async () => {
    signedIn();
    const fetchMock = mockFetch({
      "/telemetry/events": { status: 204, body: null },
      "/api/me/follows/dj-nova": {},
      "/api/me/follows": { follows: [] },
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<FollowButton slug="dj-nova" djName="DJ Nova" source="live" />);
    await userEvent.click(await screen.findByRole("button", { name: /follow dj nova/i }));

    // Optimistic: the label flips immediately, then the PUT lands.
    expect(await screen.findByRole("button", { name: /unfollow dj nova/i })).toBeInTheDocument();
    await waitFor(() => {
      const put = fetchMock.mock.calls.find(
        ([url, init]) =>
          String(url).includes("/api/me/follows/dj-nova") &&
          (init as RequestInit | undefined)?.method === "PUT",
      );
      expect(put).toBeDefined();
      expect(String((put?.[1] as RequestInit).body)).toContain('"source":"live"');
    });
    expect(beacons(fetchMock, "follow_completed").length).toBe(1);

    await userEvent.click(screen.getByRole("button", { name: /unfollow dj nova/i }));
    expect(await screen.findByRole("button", { name: /follow dj nova/i })).toBeInTheDocument();
    await waitFor(() => {
      const del = fetchMock.mock.calls.find(
        ([url, init]) =>
          String(url).includes("/api/me/follows/dj-nova") &&
          (init as RequestInit | undefined)?.method === "DELETE",
      );
      expect(del).toBeDefined();
    });
    expect(beacons(fetchMock, "unfollowed").length).toBe(1);
  });

  it("signed-in with an existing follow: hydrates the Following state from GET /follows", async () => {
    signedIn();
    const fetchMock = mockFetch({
      "/telemetry/events": { status: 204, body: null },
      "/api/me/follows/dj-nova": {},
      "/api/me/follows": { follows: [{ slug: "dj-nova", djName: "DJ Nova" }] },
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<FollowButton slug="dj-nova" djName="DJ Nova" source="recap" />);
    expect(await screen.findByRole("button", { name: /unfollow dj nova/i })).toBeInTheDocument();
  });
});
