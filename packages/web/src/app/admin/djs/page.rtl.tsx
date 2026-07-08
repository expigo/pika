import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, userEvent } from "../../../test/rtl";
import AdminDjsPage from "./page";

vi.mock("@/lib/admin", () => ({
  getDjs: vi.fn(),
  approveDj: vi.fn(),
  rejectDj: vi.fn(),
  createDj: vi.fn(),
  AdminApiError: class AdminApiError extends Error {},
}));

import * as admin from "@/lib/admin";

const pendingDj = {
  id: "dj_7",
  email: "dj@x.co",
  displayName: "DJ Pending",
  slug: "dj-pending",
  status: "pending",
  role: "dj",
  createdAt: new Date().toISOString(),
  lastSeen: null,
  spotifyStatus: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(admin.approveDj).mockResolvedValue({ success: true });
  vi.mocked(admin.rejectDj).mockResolvedValue({ success: true });
});

describe("AdminDjsPage", () => {
  it("lists a pending DJ with its status badge", async () => {
    vi.mocked(admin.getDjs).mockResolvedValue([pendingDj]);
    render(<AdminDjsPage />);
    expect(await screen.findByText("DJ Pending")).toBeInTheDocument();
    expect(screen.getByText("pending")).toBeInTheDocument();
  });

  it("links each DJ name to their public booth", async () => {
    vi.mocked(admin.getDjs).mockResolvedValue([pendingDj]);
    render(<AdminDjsPage />);
    const link = await screen.findByRole("link", { name: /open dj pending's booth/i });
    expect(link).toHaveAttribute("href", "/dj/dj-pending");
  });

  it("approves a DJ and reloads the list", async () => {
    vi.mocked(admin.getDjs).mockResolvedValue([pendingDj]);
    render(<AdminDjsPage />);
    await userEvent.click(await screen.findByRole("button", { name: /approve/i }));
    expect(admin.approveDj).toHaveBeenCalledWith("dj_7");
    expect(admin.getDjs).toHaveBeenCalledTimes(2); // initial + reload
  });

  it("hides the Approve button for an already-approved DJ", async () => {
    vi.mocked(admin.getDjs).mockResolvedValue([{ ...pendingDj, status: "approved" }]);
    render(<AdminDjsPage />);
    expect(await screen.findByText("DJ Pending")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /approve/i })).not.toBeInTheDocument();
  });

  it("adds a DJ via the admin path (no logout) and reloads the list", async () => {
    vi.mocked(admin.getDjs).mockResolvedValue([pendingDj]);
    vi.mocked(admin.createDj).mockResolvedValue({ success: true, id: "new_1" });
    render(<AdminDjsPage />);
    await screen.findByText("DJ Pending");

    await userEvent.type(screen.getByLabelText("Display name"), "New DJ");
    await userEvent.type(screen.getByLabelText("Email"), "new@x.co");
    await userEvent.type(screen.getByLabelText("Password"), "supersecret");
    await userEvent.click(screen.getByRole("button", { name: /^add dj$/i }));

    expect(admin.createDj).toHaveBeenCalledWith({
      email: "new@x.co",
      displayName: "New DJ",
      password: "supersecret",
    });
    expect(await screen.findByText(/still signed in as admin/i)).toBeInTheDocument();
    expect(admin.getDjs).toHaveBeenCalledTimes(2); // initial + reload
  });
});
