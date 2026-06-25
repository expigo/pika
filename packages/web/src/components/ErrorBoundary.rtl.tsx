import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, userEvent } from "../test/rtl";
import { ErrorBoundary } from "./ErrorBoundary";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

// A child that throws on demand, so we can drive the boundary then "recover".
let crash = false;
function Boom() {
  if (crash) throw new Error("boom-msg");
  return <div>recovered</div>;
}

beforeEach(() => {
  crash = false;
  // React + the boundary both log the caught error; silence it for clean output.
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("ErrorBoundary", () => {
  it("renders its children when nothing throws", () => {
    render(
      <ErrorBoundary>
        <div>safe-child</div>
      </ErrorBoundary>,
    );
    expect(screen.getByText("safe-child")).toBeInTheDocument();
  });

  it("shows the default fallback with the error message on a crash", () => {
    crash = true;
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    expect(screen.getByText("boom-msg")).toBeInTheDocument();
  });

  it("renders a custom fallback when provided", () => {
    crash = true;
    render(
      <ErrorBoundary fallback={<div>custom-fallback</div>}>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByText("custom-fallback")).toBeInTheDocument();
  });

  it("recovers when 'Try again' is pressed and the child stops throwing", async () => {
    crash = true;
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    crash = false;
    await userEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(screen.getByText("recovered")).toBeInTheDocument();
  });
});
