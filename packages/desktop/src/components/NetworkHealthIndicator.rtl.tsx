// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "../test/rtl";
import { NetworkHealthIndicator } from "./NetworkHealthIndicator";

// The ping loop only runs with a pingEndpoint (not passed here); stub apiClient so the
// module's Tauri-flavored import is inert regardless.
vi.mock("../services/apiClient", () => ({
  apiFetch: vi.fn(() => Promise.resolve(new Response("{}"))),
}));

describe("NetworkHealthIndicator", () => {
  it("renders the OFFLINE banner whenever the socket is not connected", () => {
    render(<NetworkHealthIndicator status="disconnected" />);
    expect(screen.getByText("OFFLINE")).toBeInTheDocument();
    // The latency readout belongs to the connected branch and must be absent.
    expect(screen.queryByText(/ms$/)).not.toBeInTheDocument();
  });

  it("shows the good tier (emerald) for low latency", () => {
    render(<NetworkHealthIndicator status="connected" latency={50} />);
    expect(screen.queryByText("OFFLINE")).not.toBeInTheDocument();
    expect(screen.getByText("50ms").closest("div")).toHaveClass("text-emerald-400");
  });

  it("shows the fair tier (amber) for mid latency (>150)", () => {
    render(<NetworkHealthIndicator status="connected" latency={200} />);
    expect(screen.getByText("200ms").closest("div")).toHaveClass("text-amber-400");
  });

  it("shows the poor tier (orange) for high latency (>400)", () => {
    render(<NetworkHealthIndicator status="connected" latency={500} />);
    expect(screen.getByText("500ms").closest("div")).toHaveClass("text-orange-500");
  });
});
