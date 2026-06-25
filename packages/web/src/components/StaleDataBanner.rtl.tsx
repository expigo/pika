import { describe, expect, it, vi } from "vitest";
import { render, screen } from "../test/rtl";
import { StaleDataBanner } from "./StaleDataBanner";

// Pin visibility to "hidden" so the 8s iOS-wake grace period never suppresses the banner.
vi.mock("@/hooks/ui/useVisibility", () => ({ useVisibility: () => false }));

const STALE = Date.now() - 60_000;

describe("StaleDataBanner", () => {
  it("warns about a lost connection when disconnected past the threshold", () => {
    render(
      <StaleDataBanner
        lastHeartbeat={STALE}
        isConnected={false}
        hasData
        staleThresholdMs={30_000}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/connection lost/i);
  });

  it("warns that the server is unresponsive when connected but stale", () => {
    render(<StaleDataBanner lastHeartbeat={STALE} isConnected hasData staleThresholdMs={30_000} />);
    expect(screen.getByRole("alert")).toHaveTextContent(/server not responding/i);
  });

  it("renders nothing when the heartbeat is fresh", () => {
    render(
      <StaleDataBanner lastHeartbeat={Date.now()} isConnected hasData staleThresholdMs={30_000} />,
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("stays hidden once the session has ended", () => {
    render(
      <StaleDataBanner
        lastHeartbeat={STALE}
        isConnected={false}
        hasData
        sessionEnded
        staleThresholdMs={30_000}
      />,
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
