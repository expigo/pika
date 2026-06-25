import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockFetch, render, screen } from "../../test/rtl";
import MyLikesPage from "./page";

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("MyLikesPage", () => {
  it("shows the empty state when there is no client id", async () => {
    render(<MyLikesPage />);
    expect(await screen.findByText(/the pages are blank/i)).toBeInTheDocument();
  });

  it("shows the empty state when the client has zero likes", async () => {
    localStorage.setItem("pika_client_id", "client-1");
    vi.stubGlobal(
      "fetch",
      mockFetch({ "/likes": { clientId: "client-1", totalLikes: 0, likes: [] } }),
    );
    render(<MyLikesPage />);
    expect(await screen.findByText(/the pages are blank/i)).toBeInTheDocument();
  });

  it("renders liked tracks grouped under their DJ/session", async () => {
    localStorage.setItem("pika_client_id", "client-1");
    vi.stubGlobal(
      "fetch",
      mockFetch({
        "/likes": {
          clientId: "client-1",
          totalLikes: 2,
          likes: [
            {
              id: 1,
              sessionId: "s1",
              djName: "DJ Nova",
              sessionDate: "2026-06-20T20:00:00Z",
              artist: "Daft Punk",
              title: "Get Lucky",
              likedAt: "2026-06-20T21:00:00Z",
            },
            {
              id: 2,
              sessionId: "s1",
              djName: "DJ Nova",
              sessionDate: "2026-06-20T20:00:00Z",
              artist: "Chic",
              title: "Le Freak",
              likedAt: "2026-06-20T21:05:00Z",
            },
          ],
        },
      }),
    );
    render(<MyLikesPage />);
    expect(await screen.findByText("Get Lucky")).toBeInTheDocument();
    expect(screen.getByText("Le Freak")).toBeInTheDocument();
    expect(screen.getByText("DJ Nova")).toBeInTheDocument();
    expect(screen.getByText(/2 moments captured/i)).toBeInTheDocument();
  });
});
