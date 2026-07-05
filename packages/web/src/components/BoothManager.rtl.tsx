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
    followerCount: 3,
    gigs: [
      { id: 1, date: "2001-01-01", title: "Ancient", city: null, url: null },
      { id: 2, date: "2099-01-15", title: "Budafest", city: "Budapest", url: null },
    ],
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
});
