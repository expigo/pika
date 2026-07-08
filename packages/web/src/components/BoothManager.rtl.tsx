import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockFetch, render, screen, userEvent, waitFor } from "../test/rtl";

vi.mock("@/lib/djLive", () => ({
  getMyBooth: vi.fn(),
  updateBooth: vi.fn(async () => ({ success: true })),
  addGig: vi.fn(async () => ({ success: true, id: 9 })),
  removeGig: vi.fn(async () => ({ success: true })),
  getEmailPreferences: vi.fn(),
  updateEmailPreferences: vi.fn(async () => ({ recapEmails: false, djDigest: true })),
}));

import {
  addGig,
  getEmailPreferences,
  getMyBooth,
  updateBooth,
  updateEmailPreferences,
} from "@/lib/djLive";
import { BoothManager } from "./BoothManager";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", mockFetch({ "/telemetry/events": { status: 204, body: null } }));
  vi.mocked(getMyBooth).mockResolvedValue({
    bio: "Old bio",
    showFollowerCount: false,
    showSignature: true,
    followerCount: 3,
    gigs: [
      { id: 1, date: "2001-01-01", title: "Ancient", city: null, url: null },
      { id: 2, date: "2099-01-15", title: "Budafest", city: "Budapest", url: null },
    ],
    signaturePreview: null,
    signatureProgress: { featuredTracks: 0, distinctTracks: 0, contexts: { live: 0, imported: 0 } },
  });
  vi.mocked(getEmailPreferences).mockResolvedValue({
    recapEmails: false,
    djDigest: false,
    djDigestAvailable: true,
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("BoothManager", () => {
  it("loads booth state: bio draft, own follower count, gigs with past greyed", async () => {
    render(<BoothManager />);
    expect(await screen.findByDisplayValue("Old bio")).toBeInTheDocument();
    expect(screen.getByText(/3 followers/i)).toBeInTheDocument();
    expect(screen.getByText("Budafest")).toBeInTheDocument();
    expect(screen.getByText(/past \(hidden publicly\)/i)).toBeInTheDocument();
  });

  it("saves the bio and toggles the digest consent (explicit opt-in)", async () => {
    render(<BoothManager />);
    const bio = await screen.findByLabelText(/booth bio/i);
    await userEvent.clear(bio);
    await userEvent.type(bio, "New bio");
    await userEvent.click(screen.getByRole("button", { name: /save bio/i }));
    await waitFor(() => expect(updateBooth).toHaveBeenCalledWith({ bio: "New bio" }));

    await userEvent.click(screen.getByRole("switch", { name: /set digest emails/i }));
    await waitFor(() => expect(updateEmailPreferences).toHaveBeenCalledWith({ djDigest: true }));
  });

  it("adds a gig from the form (optional fields omitted when blank)", async () => {
    render(<BoothManager />);
    await screen.findByDisplayValue("Old bio");
    await userEvent.type(screen.getByLabelText(/gig date/i), "2099-02-01");
    await userEvent.type(screen.getByLabelText(/gig title/i), "Westie Gala");
    await userEvent.click(screen.getByRole("button", { name: /add gig/i }));
    await waitFor(() =>
      expect(addGig).toHaveBeenCalledWith({ date: "2099-02-01", title: "Westie Gala" }),
    );
  });

  it("explains WHY there's no Signature yet — floors progress + next action (below floors)", async () => {
    vi.mocked(getMyBooth).mockResolvedValue({
      bio: null,
      showFollowerCount: false,
      showSignature: true,
      followerCount: 0,
      gigs: [],
      signaturePreview: null,
      signatureProgress: {
        featuredTracks: 12,
        distinctTracks: 30,
        contexts: { live: 1, imported: 0 },
      },
    });
    render(<BoothManager />);
    expect(await screen.findByText(/signature progress\./i)).toBeInTheDocument();
    expect(screen.getByText("12 of 20")).toBeInTheDocument(); // featured-tracks floor
    expect(screen.getByText("1 of 2")).toBeInTheDocument(); // contexts floor
    expect(screen.getByText(/import a csv in my playlists/i)).toBeInTheDocument();
  });

  it("hides the progress panel once the preview card renders (above floors)", async () => {
    vi.mocked(getMyBooth).mockResolvedValue({
      bio: null,
      showFollowerCount: false,
      showSignature: true,
      followerCount: 0,
      gigs: [],
      signaturePreview: {
        contexts: { live: 2, imported: 1, liveTracks: 5, importedTracks: 20 },
        distinctTracks: 30,
        featuredTracks: 25,
        coverage: 0.83,
        tempo: { min: 80, p25: 90, median: 100, p75: 110, max: 120 },
        energy: { p25: 0.4, median: 0.5, p75: 0.6 },
        danceability: { p25: 0.5, median: 0.6, p75: 0.7 },
        valence: { p25: 0.3, median: 0.4, p75: 0.5 },
        eras: [],
      },
      signatureProgress: {
        featuredTracks: 25,
        distinctTracks: 30,
        contexts: { live: 2, imported: 1 },
      },
    });
    render(<BoothManager />);
    expect(await screen.findByText(/signature \(preview\)\./i)).toBeInTheDocument();
    expect(screen.queryByText(/signature progress\./i)).toBeNull();
  });
});
