// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, userEvent } from "../test/rtl";
import { AnalyzerStatus } from "./AnalyzerStatus";

const useAnalyzer = vi.fn();
vi.mock("../hooks/useAnalyzer", () => ({ useAnalyzer: () => useAnalyzer() }));
vi.mock("../hooks/useLibraryRefresh", () => ({
  useLibraryRefresh: () => ({ triggerRefresh: vi.fn() }),
}));
vi.mock("../db/repositories/trackRepository", () => ({
  trackRepository: { resetAnalysis: vi.fn() },
}));

/** Full useAnalyzer() return-shape stub; override per test. */
function analyzer(overrides: Record<string, unknown> = {}) {
  return {
    isAnalyzing: false,
    isPaused: false,
    currentTrack: null,
    progress: 0,
    totalToAnalyze: 0,
    error: null,
    startAnalysis: vi.fn(),
    stopAnalysis: vi.fn(),
    pauseAnalysis: vi.fn(),
    resumeAnalysis: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  useAnalyzer.mockReset();
});

describe("AnalyzerStatus", () => {
  it("shows Engine Offline when there is no sidecar and nothing is analyzing", () => {
    useAnalyzer.mockReturnValue(analyzer());
    render(<AnalyzerStatus baseUrl={null} />);
    expect(screen.getByText(/engine offline/i)).toBeInTheDocument();
  });

  it("shows the idle pill and a Start Full Scan CTA in the details popover", async () => {
    useAnalyzer.mockReturnValue(analyzer());
    render(<AnalyzerStatus baseUrl="http://localhost:8765" />);
    expect(screen.getByText(/audio analysis/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /audio analysis/i }));
    expect(screen.getByText(/start full scan/i)).toBeInTheDocument();
  });

  it("shows the analyzing pill with progress and Pause/Stop controls", async () => {
    useAnalyzer.mockReturnValue(analyzer({ isAnalyzing: true, progress: 3, totalToAnalyze: 10 }));
    render(<AnalyzerStatus baseUrl="http://localhost:8765" />);
    expect(screen.getByText(/analyzing crate/i)).toBeInTheDocument();
    expect(screen.getByText(/3 \/ 10 \(30%\)/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /analyzing crate/i }));
    expect(screen.getByRole("button", { name: /pause/i })).toBeInTheDocument();
  });

  it("shows the paused label and a Resume control when analysis is paused", async () => {
    useAnalyzer.mockReturnValue(
      analyzer({ isAnalyzing: true, isPaused: true, progress: 5, totalToAnalyze: 10 }),
    );
    render(<AnalyzerStatus baseUrl="http://localhost:8765" />);
    expect(screen.getByText(/analysis paused/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /analysis paused/i }));
    expect(screen.getByRole("button", { name: /resume/i })).toBeInTheDocument();
  });

  it("surfaces an analyzer error inside the details popover", async () => {
    useAnalyzer.mockReturnValue(analyzer({ error: "sidecar crashed" }));
    render(<AnalyzerStatus baseUrl="http://localhost:8765" />);
    await userEvent.click(screen.getByRole("button", { name: /audio analysis/i }));
    expect(screen.getByText(/error: sidecar crashed/i)).toBeInTheDocument();
  });
});
