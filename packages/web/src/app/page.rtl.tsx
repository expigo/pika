import { afterEach, describe, expect, it, vi } from "vitest";
import { mockFetch, render, screen, within } from "../test/rtl";
import LandingPage from "./page";

vi.mock("@/hooks/ui/useVisibility", () => ({ useVisibility: () => true }));

afterEach(() => vi.unstubAllGlobals());

function liveResponse(sessions: Record<string, unknown>[]) {
  return { "/api/sessions/active": { live: sessions.length > 0, sessions } };
}

// The live banner is the only `position: sticky` region; scope link queries to it
// (the marketing body has its own /live links).
function banner(statusText: RegExp) {
  return screen.getByText(statusText).closest("div.sticky") as HTMLElement;
}

describe("LandingPage live banner routing", () => {
  it("routes a staged single session to /stage/:id", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(
        liveResponse([
          {
            sessionId: "s1",
            djName: "DJ Nova",
            startedAt: "x",
            stageId: "stage-1",
            stageName: "Ballroom",
            eventName: "Open Champs",
            currentTrack: null,
            listenerCount: 3,
          },
        ]),
      ),
    );
    render(<LandingPage />);
    await screen.findByText(/ballroom live/i);
    const cta = within(banner(/ballroom live/i)).getByRole("link");
    expect(cta).toHaveAttribute("href", "/stage/stage-1");
    expect(cta).toHaveTextContent(/join stage/i);
  });

  it("routes a non-staged single session to /live/:sessionId", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(
        liveResponse([
          {
            sessionId: "s2",
            djName: "DJ Solo",
            startedAt: "x",
            stageId: null,
            currentTrack: null,
            listenerCount: 1,
          },
        ]),
      ),
    );
    render(<LandingPage />);
    await screen.findByText(/dj solo is live/i);
    const cta = within(banner(/dj solo is live/i)).getByRole("link");
    expect(cta).toHaveAttribute("href", "/live/s2");
    expect(cta).toHaveTextContent(/join floor/i);
  });

  it("routes multiple live DJs to the hub", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(
        liveResponse([
          {
            sessionId: "s1",
            djName: "A",
            startedAt: "x",
            stageId: null,
            currentTrack: null,
            listenerCount: 1,
          },
          {
            sessionId: "s2",
            djName: "B",
            startedAt: "x",
            stageId: null,
            currentTrack: null,
            listenerCount: 2,
          },
        ]),
      ),
    );
    render(<LandingPage />);
    await screen.findByText(/2 djs live now/i);
    const cta = within(banner(/2 djs live now/i)).getByRole("link");
    expect(cta).toHaveAttribute("href", "/live");
    expect(cta).toHaveTextContent(/enter hub/i);
  });

  it("shows no live banner when nothing is live", async () => {
    vi.stubGlobal("fetch", mockFetch(liveResponse([])));
    render(<LandingPage />);
    await screen.findByRole("heading", { name: /the connective tissue/i });
    expect(screen.queryByText(/is live/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/djs live now/i)).not.toBeInTheDocument();
  });
});
