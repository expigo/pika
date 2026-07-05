import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
  // Slice C — the BoothManager section reads these.
  getMyBooth: vi
    .fn()
    .mockResolvedValue({ bio: null, showFollowerCount: false, followerCount: 0, gigs: [] }),
  getEmailPreferences: vi
    .fn()
    .mockResolvedValue({ recapEmails: false, djDigest: false, djDigestAvailable: true }),
  updateBooth: vi.fn(),
  updateEmailPreferences: vi.fn(),
  addGig: vi.fn(),
  removeGig: vi.fn(),
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
afterEach(() => {
  // The OAuth-result effect reads window.location.search; reset it between tests.
  window.history.replaceState({}, "", "/dj/live");
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
    // Not paused, not between songs → the Pause-sharing control is offered.
    expect(screen.getByRole("button", { name: /pause sharing/i })).toBeInTheDocument();
  });

  it("shows the PAUSED indicator and a Resume-sharing control when paused", async () => {
    vi.mocked(djLive.getMe).mockResolvedValue(approved);
    vi.mocked(djLive.getLiveStatus).mockResolvedValue({
      live: true,
      sessionId: "s1",
      paused: true,
      spotify: conn(),
    });
    render(<DjLivePage />);
    expect(await screen.findByText("PAUSED")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /resume sharing/i })).toBeInTheDocument();
  });

  it("shows the between-songs hint while live and mid-transition", async () => {
    vi.mocked(djLive.getMe).mockResolvedValue(approved);
    vi.mocked(djLive.getLiveStatus).mockResolvedValue({
      live: true,
      sessionId: "s1",
      paused: false,
      betweenSongs: true,
      spotify: conn(),
    });
    render(<DjLivePage />);
    expect(await screen.findByText(/between songs/i)).toBeInTheDocument();
  });

  it("shows the Reconnect Spotify variant when the token needs reauth", async () => {
    vi.mocked(djLive.getMe).mockResolvedValue(approved);
    vi.mocked(djLive.getLiveStatus).mockResolvedValue({
      live: false,
      spotify: conn({ status: "needs_reauth" }),
    });
    render(<DjLivePage />);
    expect(await screen.findByRole("button", { name: /reconnect spotify/i })).toBeInTheDocument();
  });

  it("surfaces the OAuth error banner from ?spotify=denied", async () => {
    window.history.replaceState({}, "", "/dj/live?spotify=denied");
    vi.mocked(djLive.getMe).mockResolvedValue(approved);
    vi.mocked(djLive.getLiveStatus).mockResolvedValue({ live: false, spotify: conn() });
    render(<DjLivePage />);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/cancelled/i);
  });
});
