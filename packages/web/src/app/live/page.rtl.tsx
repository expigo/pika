import { afterEach, describe, expect, it, vi } from "vitest";
import { mockFetch, render, screen, userEvent } from "../../test/rtl";
import LivePage from "./page";

// LivePlayer is WS-driven; stub it so selecting a session is observable without a socket.
vi.mock("@/components/LivePlayer", () => ({
  LivePlayer: ({ targetSessionId }: { targetSessionId: string }) => (
    <div data-testid="live-player">{targetSessionId}</div>
  ),
}));

const session = (over: Record<string, unknown> = {}) => ({
  sessionId: "sess-1",
  djName: "DJ One",
  currentTrack: { title: "Billie Jean", artist: "Michael Jackson", bpm: 117 },
  listenerCount: 3,
  ...over,
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("LivePage (LOBBY)", () => {
  it("shows the loading state while the first fetch is pending", () => {
    // fetch never resolves → stays in the initial loading branch.
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    render(<LivePage />);
    expect(screen.getByText(/scanning frequencies/i)).toBeInTheDocument();
  });

  it("shows the error branch when the active-sessions fetch 500s", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 500 })),
    );
    render(<LivePage />);
    expect(await screen.findByText(/pulse interrupted/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reconnect/i })).toBeInTheDocument();
  });

  it("shows the quiet-floor discovery hub (with sub-empties) when no sessions are live", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({
        "sessions/active": { live: false, count: 0, sessions: [] },
        "top-tracks": [],
        "sessions/recent": [],
      }),
    );
    render(<LivePage />);
    expect(await screen.findByText(/the floor is quiet/i)).toBeInTheDocument();
    expect(screen.getByText(/awaiting sync signals/i)).toBeInTheDocument();
    expect(screen.getByText(/no recent uplinks/i)).toBeInTheDocument();
  });

  it("renders the popular-tracks and recent-sets rows on the quiet floor", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({
        "sessions/active": { live: false, count: 0, sessions: [] },
        "top-tracks": [{ artist: "Chic", title: "Le Freak", likeCount: "9" }],
        "sessions/recent": [
          {
            id: "old-1",
            djName: "DJ Retro",
            startedAt: "2026-06-20T20:00:00Z",
            endedAt: "2026-06-20T22:00:00Z",
          },
        ],
      }),
    );
    render(<LivePage />);
    expect(await screen.findByText("Le Freak")).toBeInTheDocument();
    expect(screen.getByText("DJ Retro")).toBeInTheDocument();
  });

  it("lists live sessions and swaps in the player when one is tapped", async () => {
    // Two sessions so the single-session auto-select (page.tsx:76) doesn't fire.
    vi.stubGlobal(
      "fetch",
      mockFetch({
        "sessions/active": {
          live: true,
          count: 2,
          sessions: [session(), session({ sessionId: "sess-2", djName: "DJ Two" })],
        },
        "top-tracks": [],
        "sessions/recent": [],
      }),
    );
    render(<LivePage />);
    // The BROADCASTING NOW list renders both DJ cards, not the player yet.
    expect(await screen.findByText("DJ Two")).toBeInTheDocument();
    expect(screen.queryByTestId("live-player")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /DJ Two/i }));

    const player = await screen.findByTestId("live-player");
    expect(player).toHaveTextContent("sess-2");
  });
});
