// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import type { LiveStatus } from "../hooks/useLiveSession";
import { render, screen, userEvent } from "../test/rtl";
import { LiveHUD } from "./LiveHUD";

// NetworkHealthIndicator pings /health on a timer; stub it out.
vi.mock("./NetworkHealthIndicator", () => ({ NetworkHealthIndicator: () => null }));

const base = {
  playCount: 12,
  listenerCount: 5,
  liveStatus: "live" as LiveStatus,
  baseUrl: null,
  onExit: vi.fn(),
  onShowQr: vi.fn(),
};

describe("LiveHUD", () => {
  it("renders play count, listeners, likes and the stage badge", () => {
    render(<LiveHUD {...base} liveLikes={8} stageName="Main Floor" />);
    expect(screen.getByText(/12 played/i)).toBeInTheDocument();
    expect(screen.getByTitle(/broadcasting to stage: main floor/i)).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument(); // listeners
    expect(screen.getByText("8")).toBeInTheDocument(); // likes
  });

  it("omits the stage badge when broadcasting standalone", () => {
    render(<LiveHUD {...base} />);
    expect(screen.queryByTitle(/broadcasting to stage/i)).not.toBeInTheDocument();
  });

  it("wires the QR, exit and panic-sync controls", async () => {
    const onExit = vi.fn();
    const onShowQr = vi.fn();
    const onForceSync = vi.fn();
    render(<LiveHUD {...base} onExit={onExit} onShowQr={onShowQr} onForceSync={onForceSync} />);
    await userEvent.click(screen.getByRole("button", { name: /qr/i }));
    await userEvent.click(screen.getByRole("button", { name: /exit live mode/i }));
    await userEvent.click(screen.getByRole("button", { name: /panic sync/i }));
    expect(onShowQr).toHaveBeenCalled();
    expect(onExit).toHaveBeenCalled();
    expect(onForceSync).toHaveBeenCalled();
  });
});
