import { describe, expect, it } from "vitest";
import { render, screen } from "../test/rtl";
import { ConnectionStatusIndicator } from "./ConnectionStatus";

describe("ConnectionStatusIndicator", () => {
  it("shows the signal-lost banner when disconnected", () => {
    render(<ConnectionStatusIndicator status="disconnected" />);
    expect(screen.getByText(/signal lost/i)).toBeInTheDocument();
  });

  it("shows the banner while connecting", () => {
    render(<ConnectionStatusIndicator status="connecting" />);
    expect(screen.getByText(/signal lost/i)).toBeInTheDocument();
  });

  it("renders nothing when connected", () => {
    render(<ConnectionStatusIndicator status="connected" />);
    expect(screen.queryByText(/signal lost/i)).not.toBeInTheDocument();
  });
});
