import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import { virtualDjWatcher, type NowPlayingTrack } from "./virtualDjWatcher";
import { invoke } from "@tauri-apps/api/core";

// Mock Tauri invoke
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

type mockInvoke = Mock<typeof invoke>;

describe("VirtualDJWatcher - Visibility Fix Verification", () => {
  let doc: {
    visibilityState: string;
    addEventListener: Mock;
    removeEventListener: Mock;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();

    // Mock global document with visibilityState support
    doc = {
      visibilityState: "visible",
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal("document", doc);

    // Reset singleton state manually to ensure isolation
    virtualDjWatcher.stopWatching();
    // @ts-ignore - accessing private for test reset
    virtualDjWatcher.lastTrack = null;
    // @ts-ignore
    virtualDjWatcher.lastTimestamp = 0;
    // @ts-ignore
    virtualDjWatcher.listeners = [];
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  /**
   * TEST: Initial read check
   * RATIONALE: App restores from background should NOT notify if track is same
   * PRODUCTION LOCATION: virtualDjWatcher.ts:148-154
   */
  it("should NOT notify listeners on start if track is identical (🛡️ FIX 1)", async () => {
    const mockTrack = {
      artist: "Daft Punk",
      title: "One More Time",
      file_path: "/path/music.mp3",
      timestamp: 1700000000,
    };
    (invoke as any).mockResolvedValue(mockTrack);

    const listener = vi.fn();
    virtualDjWatcher.onTrackChange(listener);

    // 1. Initial start
    await virtualDjWatcher.startWatching();
    expect(listener).toHaveBeenCalledTimes(1);

    // 2. Stop and restart (simulating visibility-triggered restart)
    virtualDjWatcher.stopWatching();
    listener.mockClear();

    await virtualDjWatcher.startWatching();

    // 🛡️ VERIFICATION: Fix 1 prevents notifying when lastTrack matches initial read
    expect(listener).not.toHaveBeenCalled();
  });

  /**
   * TEST: Polling adjustment
   * RATIONALE: Visibility change should only change timer, not read immediately
   * PRODUCTION LOCATION: virtualDjWatcher.ts:176-184
   */
  it("should adjust interval on visibility change without immediate read (🛡️ FIX 2)", async () => {
    const mockTrack = {
      artist: "Daft Punk",
      title: "One More Time",
      file_path: "/path/music.mp3",
      timestamp: 1700000000,
      bpm: 124, // Provide BPM to avoid metadata lookup extra call
      key: "Am",
    };
    (invoke as mockInvoke).mockResolvedValue(mockTrack);

    await virtualDjWatcher.startWatching();
    expect(invoke).toHaveBeenCalledTimes(1);

    // Simulate visibility change to hidden
    doc.visibilityState = "hidden";
    // @ts-ignore - manually trigger private handler for test
    virtualDjWatcher.handleVisibilityChange();

    // 🛡️ VERIFICATION: Fix 2 prevents immediate read on visibility change
    expect(invoke).toHaveBeenCalledTimes(1);

    // Should NOT poll at 1s interval anymore
    await vi.advanceTimersByTimeAsync(1500);
    expect(invoke).toHaveBeenCalledTimes(1);

    // Should poll at hidden interval (3s)
    await vi.advanceTimersByTimeAsync(2000); // 3.5s total
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it("should still notify immediately if track ACTUALLY changed during restart", async () => {
    const track1 = { artist: "A", title: "1", file_path: "f1", timestamp: 100, bpm: 120, key: "C" };
    const track2 = { artist: "B", title: "2", file_path: "f2", timestamp: 200, bpm: 128, key: "G" };

    (invoke as any).mockResolvedValue(track1);
    const listener = vi.fn();
    virtualDjWatcher.onTrackChange(listener);

    await virtualDjWatcher.startWatching();
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ artist: "A" }));

    virtualDjWatcher.stopWatching();
    listener.mockClear();

    // Change mock to new track
    (invoke as any).mockResolvedValue(track2);

    await virtualDjWatcher.startWatching();
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ artist: "B" }));
  });
});
