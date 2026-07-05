import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockFetch, render, screen, userEvent, waitFor } from "../test/rtl";

// happy-dom has no real 2D canvas — the render/share pipeline is mocked; this test covers the
// button's wiring: generation → beacons → share-vs-cancel handling.
vi.mock("@/lib/nightCard", () => ({
  renderNightCard: vi.fn(),
  shareCardBlob: vi.fn(),
}));

import { renderNightCard, shareCardBlob } from "@/lib/nightCard";
import { NightCardButton } from "./NightCardButton";

const DATA = {
  djName: "DJ Nova",
  dateLabel: "Friday, Jul 4",
  headline: "42 ❤ from the floor",
  topTrack: null,
  qrLabel: "Scan for the booth",
};

function beacons(fetchMock: ReturnType<typeof mockFetch>, needle: string) {
  return fetchMock.mock.calls.filter(
    ([url, init]) =>
      String(url).includes("/telemetry/events") &&
      String((init as RequestInit | undefined)?.body ?? "").includes(needle),
  );
}

let fetchMock: ReturnType<typeof mockFetch>;
beforeEach(() => {
  vi.clearAllMocks();
  fetchMock = mockFetch({ "/telemetry/events": { status: 204, body: null } });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function subject() {
  return (
    <NightCardButton
      data={DATA}
      qrUrl="https://pika.stream/dj/dj-nova?ref=card"
      shareText="My night with DJ Nova — via Pika!"
      pageUrl="https://pika.stream/recap/s1"
      source="recap"
    />
  );
}

describe("NightCardButton", () => {
  it("renders the card, beacons generation + the share outcome", async () => {
    vi.mocked(renderNightCard).mockResolvedValue(new Blob(["png"], { type: "image/png" }));
    vi.mocked(shareCardBlob).mockResolvedValue("shared");
    render(subject());

    await userEvent.click(screen.getByRole("button", { name: /night card/i }));
    await waitFor(() => {
      expect(renderNightCard).toHaveBeenCalled();
      expect(shareCardBlob).toHaveBeenCalled();
    });
    expect(beacons(fetchMock, "card_generated").length).toBe(1);
    expect(beacons(fetchMock, "card_shared").length).toBe(1);
  });

  it("a cancelled share sheet beacons generation but NOT a share", async () => {
    vi.mocked(renderNightCard).mockResolvedValue(new Blob(["png"], { type: "image/png" }));
    vi.mocked(shareCardBlob).mockResolvedValue("cancelled");
    render(subject());

    await userEvent.click(screen.getByRole("button", { name: /night card/i }));
    await waitFor(() => expect(shareCardBlob).toHaveBeenCalled());
    expect(beacons(fetchMock, "card_generated").length).toBe(1);
    expect(beacons(fetchMock, "card_shared").length).toBe(0);
  });

  it("no canvas available (render returns null) → no beacons, no share, no crash", async () => {
    vi.mocked(renderNightCard).mockResolvedValue(null);
    render(subject());

    await userEvent.click(screen.getByRole("button", { name: /night card/i }));
    await waitFor(() => expect(renderNightCard).toHaveBeenCalled());
    expect(shareCardBlob).not.toHaveBeenCalled();
    expect(beacons(fetchMock, "card_generated").length).toBe(0);
  });
});
