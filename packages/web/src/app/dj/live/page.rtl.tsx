import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "../../../test/rtl";
import DjLivePage from "./page";

vi.mock("@/lib/djLive", () => ({
  DjApiError: class DjApiError extends Error {},
  getMe: vi.fn(),
  getLiveStatus: vi.fn(),
  startLive: vi.fn(),
  stopLive: vi.fn(),
  setShare: vi.fn(),
  spotifyAuthorizeUrl: () => "http://cloud/api/spotify/authorize",
  // Slice 5 — the ProfileManager section on the ready dashboard reads these.
  getMySessions: vi.fn().mockResolvedValue({ sessions: [] }),
  getMyPlaylists: vi.fn().mockResolvedValue({ playlists: [] }),
  setSessionPublished: vi.fn(),
  addPlaylist: vi.fn(),
  removePlaylist: vi.fn(),
}));
// The mirror reuses LivePlayer (WS-driven) — stub it out for the dashboard test.
vi.mock("@/components/LivePlayer", () => ({
  LivePlayer: () => <div data-testid="mirror">mirror</div>,
}));

import * as djLive from "@/lib/djLive";

const approved = { id: "1", email: "a@b.c", displayName: "DJ X", slug: "dj-x", status: "approved" };
const conn = (over = {}) => ({ connected: true, status: "active", ...over });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DjLivePage", () => {
  it("prompts to sign in when not authenticated", async () => {
    vi.mocked(djLive.getMe).mockResolvedValue(null);
    render(<DjLivePage />);
    expect(await screen.findByText(/sign in to go live/i)).toBeInTheDocument();
  });

  it("shows awaiting-approval for a pending account", async () => {
    vi.mocked(djLive.getMe).mockResolvedValue({ ...approved, status: "pending" });
    render(<DjLivePage />);
    expect(await screen.findByText(/awaiting approval/i)).toBeInTheDocument();
  });

  it("offers Connect Spotify when not connected", async () => {
    vi.mocked(djLive.getMe).mockResolvedValue(approved);
    vi.mocked(djLive.getLiveStatus).mockResolvedValue({
      live: false,
      spotify: { connected: false, status: null },
    });
    render(<DjLivePage />);
    expect(await screen.findByRole("button", { name: /connect spotify/i })).toBeInTheDocument();
    // Profile management is available across the whole ready phase — even before Spotify is connected.
    expect(await screen.findByRole("heading", { name: /my profile/i })).toBeInTheDocument();
  });

  it("offers Go Live when connected but not live", async () => {
    vi.mocked(djLive.getMe).mockResolvedValue(approved);
    vi.mocked(djLive.getLiveStatus).mockResolvedValue({ live: false, spotify: conn() });
    render(<DjLivePage />);
    expect(await screen.findByRole("button", { name: /go live/i })).toBeInTheDocument();
    // Regression guard: the ProfileManager must render in the connected-not-live dashboard, not
    // only while broadcasting (it was previously nested in the live-only branch).
    expect(await screen.findByRole("heading", { name: /my profile/i })).toBeInTheDocument();
  });

  it("shows LIVE controls + mirror when live", async () => {
    vi.mocked(djLive.getMe).mockResolvedValue(approved);
    vi.mocked(djLive.getLiveStatus).mockResolvedValue({
      live: true,
      sessionId: "s1",
      paused: false,
      spotify: conn(),
    });
    render(<DjLivePage />);
    expect(await screen.findByText("LIVE")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /stop/i })).toBeInTheDocument();
    expect(screen.getByTestId("mirror")).toBeInTheDocument();
  });
});
