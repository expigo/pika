import { describe, expect, it } from "vitest";
import { render, screen } from "../test/rtl";
import { BottomNav } from "./BottomNav";

describe("BottomNav", () => {
  it("labels the my-likes tab Journal (not Hearts)", () => {
    render(<BottomNav />);
    expect(screen.getByText("Journal")).toBeInTheDocument();
    expect(screen.queryByText("Hearts")).toBeNull();
    expect(screen.getByText("Journal").closest("a")).toHaveAttribute("href", "/my-likes");
  });
});
