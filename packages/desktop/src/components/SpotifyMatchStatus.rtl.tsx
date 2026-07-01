// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UseSpotifyMatcherReturn } from "../hooks/useSpotifyMatcher";
import { render, screen, userEvent } from "../test/rtl";
import { SpotifyMatchStatus } from "./SpotifyMatchStatus";

const start = vi.fn();
const stop = vi.fn();
const pause = vi.fn();
const resume = vi.fn();
let matcher: UseSpotifyMatcherReturn;
vi.mock("../hooks/useSpotifyMatcher", () => ({ useSpotifyMatcher: () => matcher }));
vi.mock("../hooks/useLibraryRefresh", () => ({
  useLibraryRefresh: () => ({ triggerRefresh: vi.fn() }),
}));

const getUnmatchedCount = vi.fn();
vi.mock("../db/repositories/trackRepository", () => ({
  trackRepository: {
    getUnmatchedCount: (...a: unknown[]) => getUnmatchedCount(...a),
    clearUnmatchedAttempts: vi.fn(),
  },
}));

const idle = (): UseSpotifyMatcherReturn => ({
  isMatching: false,
  isPaused: false,
  currentTrack: null,
  progress: 0,
  total: 0,
  matched: 0,
  skipped: 0,
  error: null,
  start,
  stop,
  pause,
  resume,
});

describe("SpotifyMatchStatus", () => {
  beforeEach(() => {
    for (const f of [start, stop, pause, resume, getUnmatchedCount]) f.mockReset();
    getUnmatchedCount.mockResolvedValue(5);
    matcher = idle();
  });

  it("idle + authed: shows the unmatched count and starts a run on click", async () => {
    render(<SpotifyMatchStatus authenticated onComplete={vi.fn()} />);
    await userEvent.click(await screen.findByText(/5 unmatched/i)); // open the popover
    const btn = screen.getByRole("button", { name: /match 5 tracks/i });
    expect(btn).toBeEnabled();
    await userEvent.click(btn);
    expect(start).toHaveBeenCalledTimes(1);
  });

  it("not authed: the action is disabled with a connect hint", async () => {
    render(<SpotifyMatchStatus authenticated={false} />);
    await userEvent.click(await screen.findByText(/5 unmatched/i));
    const btn = screen.getByRole("button", { name: /connect pika to match/i });
    expect(btn).toBeDisabled();
    expect(start).not.toHaveBeenCalled();
  });

  it("fully matched: the action is disabled", async () => {
    getUnmatchedCount.mockResolvedValue(0);
    render(<SpotifyMatchStatus authenticated />);
    await userEvent.click(await screen.findByText(/0 unmatched/i));
    expect(screen.getByRole("button", { name: /library fully matched/i })).toBeDisabled();
  });

  it("running: shows progress + matched/skipped and Stop halts it", async () => {
    matcher = { ...idle(), isMatching: true, progress: 3, total: 10, matched: 2, skipped: 1 };
    render(<SpotifyMatchStatus authenticated />);
    await userEvent.click(screen.getByText(/matching library/i)); // open popover
    expect(screen.getByText(/2 matched · 1 skipped/i)).toBeInTheDocument();
    expect(screen.getByText("30%")).toBeInTheDocument();
    // Stop is the icon-only button next to Pause; there are Pause + Stop controls.
    const controls = screen.getAllByRole("button");
    await userEvent.click(controls[controls.length - 1]!); // Stop (last control)
    expect(stop).toHaveBeenCalledTimes(1);
  });
});
