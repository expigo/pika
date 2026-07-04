import { describe, expect, it, vi } from "vitest";
import { render, screen } from "../../test/rtl";

// Push wiring is unit-tested elsewhere; keep this render hermetic.
vi.mock("@/components/pwa/NotificationToggle", () => ({ NotificationToggle: () => null }));

import MenuPage from "./page";

describe("MenuPage", () => {
  it("offers the dancer account entry point (Slice B)", () => {
    render(<MenuPage />);
    const entry = screen.getByText("My Journal Account");
    expect(entry).toBeInTheDocument();
    expect(entry.closest("a")).toHaveAttribute("href", "/my-likes/save");
  });
});
