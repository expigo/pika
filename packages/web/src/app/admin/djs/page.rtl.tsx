import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, userEvent } from "../../../test/rtl";
import AdminDjsPage from "./page";

vi.mock("@/lib/admin", () => ({
  getDjs: vi.fn(),
  approveDj: vi.fn(),
  rejectDj: vi.fn(),
}));

import * as admin from "@/lib/admin";

const pendingDj = {
  id: 7,
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

  it("approves a DJ and reloads the list", async () => {
    vi.mocked(admin.getDjs).mockResolvedValue([pendingDj]);
    render(<AdminDjsPage />);
    await userEvent.click(await screen.findByRole("button", { name: /approve/i }));
    expect(admin.approveDj).toHaveBeenCalledWith(7);
    expect(admin.getDjs).toHaveBeenCalledTimes(2); // initial + reload
  });

  it("hides the Approve button for an already-approved DJ", async () => {
    vi.mocked(admin.getDjs).mockResolvedValue([{ ...pendingDj, status: "approved" }]);
    render(<AdminDjsPage />);
    expect(await screen.findByText("DJ Pending")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /approve/i })).not.toBeInTheDocument();
  });
});
