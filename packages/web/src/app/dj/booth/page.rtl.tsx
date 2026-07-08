import { usePathname } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "../../../test/rtl";
import DjBoothPage from "./page";

// The management workspace (D.1 split off /dj/live) — mounts all four managers, so the mock
// carries every djLive read they make.
vi.mock("@/lib/djLive", () => ({
  DjApiError: class DjApiError extends Error {},
  getMe: vi.fn(),
  // Slice 5 — ProfileManager.
  getMySessions: vi.fn().mockResolvedValue({ sessions: [] }),
  getMyPlaylists: vi.fn().mockResolvedValue({ playlists: [] }),
  setSessionPublished: vi.fn(),
  addPlaylist: vi.fn(),
  removePlaylist: vi.fn(),
  unshareSessionPlaylist: vi.fn(),
  // Slice C — BoothManager.
  getMyBooth: vi.fn().mockResolvedValue({
    bio: null,
    showFollowerCount: false,
    showSignature: true,
    followerCount: 0,
    gigs: [],
    signaturePreview: null,
    signatureProgress: { featuredTracks: 0, distinctTracks: 0, contexts: { live: 0, imported: 0 } },
  }),
  getEmailPreferences: vi
    .fn()
    .mockResolvedValue({ recapEmails: false, djDigest: false, djDigestAvailable: true }),
  updateBooth: vi.fn(),
  updateEmailPreferences: vi.fn(),
  addGig: vi.fn(),
  removeGig: vi.fn(),
  // Slice D — PlaylistManager + CrowdPleasers.
  getMyCuratedPlaylists: vi.fn().mockResolvedValue({ playlists: [] }),
  importPlaylist: vi.fn(),
  updateCuratedPlaylist: vi.fn(),
  deleteCuratedPlaylist: vi.fn(),
  getMyCrowdPleasers: vi
    .fn()
    .mockResolvedValue({ totals: { sessions: 0, likes: 0, dancers: 0 }, tracks: [] }),
}));

import * as djLive from "@/lib/djLive";

const approved = { id: "1", email: "a@b.c", displayName: "DJ X", slug: "dj-x", status: "approved" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(usePathname).mockReturnValue("/dj/booth");
});

describe("DjBoothPage", () => {
  it("prompts to sign in when not authenticated", async () => {
    vi.mocked(djLive.getMe).mockResolvedValue(null);
    render(<DjBoothPage />);
    expect(await screen.findByText(/sign in to manage your booth/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /go to dj login/i })).toHaveAttribute(
      "href",
      "/dj/login",
    );
  });

  it("shows awaiting-approval for a pending account", async () => {
    vi.mocked(djLive.getMe).mockResolvedValue({ ...approved, status: "pending" });
    render(<DjBoothPage />);
    expect(await screen.findByText(/awaiting approval/i)).toBeInTheDocument();
  });

  it("mounts the full management stack for an approved DJ (the /dj/live regression guard moved here)", async () => {
    vi.mocked(djLive.getMe).mockResolvedValue(approved);
    render(<DjBoothPage />);
    // All four managers — booth ignores live/connection state entirely, which is a stronger
    // guarantee than the old connected-not-live check on /dj/live.
    expect(await screen.findByRole("heading", { name: /my profile/i })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: /my booth/i })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: /my playlists/i })).toBeInTheDocument();
  });

  it("marks Booth active in the workspace nav and links Broadcast + the public page", async () => {
    vi.mocked(djLive.getMe).mockResolvedValue(approved);
    render(<DjBoothPage />);
    const booth = await screen.findByRole("link", { name: /^booth$/i });
    expect(booth).toHaveAttribute("aria-current", "page");
    expect(booth).toHaveAttribute("href", "/dj/booth");
    expect(screen.getByRole("link", { name: /^broadcast$/i })).toHaveAttribute("href", "/dj/live");
    // Scoped to the nav — ProfileManager renders its own "View public →" link.
    const nav = screen.getByRole("navigation", { name: /dj workspace/i });
    expect(within(nav).getByRole("link", { name: /view public/i })).toHaveAttribute(
      "href",
      "/dj/dj-x",
    );
  });
});
