import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockFetch, render, screen, userEvent } from "../../test/rtl";
import UnsubscribePage from "./page";

beforeEach(() => {
  window.history.replaceState(null, "", "/unsubscribe?token=tok123");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("UnsubscribePage", () => {
  it("requires a HUMAN TAP (never auto-fires — scanners prefetch), then POSTs the token", async () => {
    const fetchMock = mockFetch({ "/api/email/unsubscribe": { status: 204, body: null } });
    vi.stubGlobal("fetch", fetchMock);
    render(<UnsubscribePage />);

    // Nothing sent on load.
    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).includes("/unsubscribe")).length,
    ).toBe(0);

    await userEvent.click(await screen.findByRole("button", { name: /unsubscribe/i }));
    expect(await screen.findByText(/you're unsubscribed/i)).toBeInTheDocument();

    const post = fetchMock.mock.calls.find(([url]) =>
      String(url).includes("/api/email/unsubscribe"),
    );
    expect((post?.[1] as RequestInit).method).toBe("POST");
    expect(String((post?.[1] as RequestInit).body)).toContain("tok123");
  });

  it("shows the fallback message when the endpoint rejects the token", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({ "/api/email/unsubscribe": { status: 400, body: { error: "bad" } } }),
    );
    render(<UnsubscribePage />);
    await userEvent.click(await screen.findByRole("button", { name: /unsubscribe/i }));
    expect(await screen.findByText(/that link didn't work/i)).toBeInTheDocument();
  });

  it("disables the action when no token is present", async () => {
    window.history.replaceState(null, "", "/unsubscribe");
    vi.stubGlobal("fetch", mockFetch({}));
    render(<UnsubscribePage />);
    expect(await screen.findByRole("button", { name: /unsubscribe/i })).toBeDisabled();
  });
});
