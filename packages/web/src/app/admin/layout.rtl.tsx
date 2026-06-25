import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "../../test/rtl";
import AdminLayout from "./layout";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/admin",
}));
vi.mock("@/lib/admin", () => ({ getAdminMe: vi.fn() }));

import * as admin from "@/lib/admin";

beforeEach(() => vi.clearAllMocks());

describe("AdminLayout gate", () => {
  it("redirects a non-admin home and renders nothing", async () => {
    vi.mocked(admin.getAdminMe).mockResolvedValue(null);
    render(
      <AdminLayout>
        <div>secret</div>
      </AdminLayout>,
    );
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
    expect(screen.queryByText("secret")).not.toBeInTheDocument();
  });

  it("renders the admin chrome + children for an admin", async () => {
    vi.mocked(admin.getAdminMe).mockResolvedValue({ id: 1, displayName: "Boss", role: "admin" });
    render(
      <AdminLayout>
        <div>secret</div>
      </AdminLayout>,
    );
    expect(await screen.findByText("secret")).toBeInTheDocument();
    expect(screen.getByText("Boss")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});
