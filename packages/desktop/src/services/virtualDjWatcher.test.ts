import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type NowPlayingTrack, toTrackInfo, virtualDjWatcher } from "./virtualDjWatcher";

// Mock Tauri APIs
const mockInvoke = vi.fn();
const mockListen = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: any[]) => mockInvoke(...args),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: (...args: any[]) => mockListen(...args),
}));

// Mock settings repository
vi.mock("../db/repositories/settingsRepository", () => ({
  settingsRepository: {
    get: vi.fn().mockResolvedValue("auto"),
  },
}));

describe("VirtualDJWatcher", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockInvoke.mockReset();
    mockListen.mockReset();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    virtualDjWatcher.stopWatching();
  });

  it("should start native watcher and listen for events", async () => {
    // Setup mocks
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "start_vdj_watcher") return Promise.resolve("Watching");
      if (cmd === "read_virtualdj_history") return Promise.resolve(null);
      return Promise.resolve(null);
    });

    let eventCallback: (event: any) => void = () => {};
    mockListen.mockImplementation((_, cb) => {
      eventCallback = cb;
      return Promise.resolve(() => {});
    });

    // Action
    await virtualDjWatcher.startWatching();

    // Verify native watcher started
    expect(mockInvoke).toHaveBeenCalledWith("start_vdj_watcher", { customPath: "auto" });
    expect(mockListen).toHaveBeenCalledWith("vdj-history-update", expect.any(Function));

    // Verify event handling
    const mockTrack = {
      artist: "Test Artist",
      title: "Test Title",
      file_path: "/path/to/song.mp3",
      timestamp: 1234567890,
    };

    const listener = vi.fn();
    virtualDjWatcher.onTrackChange(listener);

    // Simulate event
    await eventCallback({ payload: mockTrack });

    // Flush promises to allow async handleNativeUpdate to finish.
    // Under fake timers a real setTimeout(0) never fires, so advance + flush
    // microtasks via the timer-aware helper instead.
    await vi.advanceTimersByTimeAsync(0);

    // Verify listener notified
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        artist: "Test Artist",
        title: "Test Title",
      }),
    );
  });

  it("should fallback to polling if native watcher fails", async () => {
    // Setup mocks to fail native watcher
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === "start_vdj_watcher") return Promise.reject("Native watcher failed");
      if (cmd === "read_virtualdj_history")
        return Promise.resolve({
          artist: "Poll Artist",
          title: "Poll Title",
          file_path: "/path/poll.mp3",
          timestamp: 1000,
        });
      return Promise.resolve(null);
    });

    const listener = vi.fn();
    virtualDjWatcher.onTrackChange(listener);

    // Action
    await virtualDjWatcher.startWatching();

    // Verify native failed but caught
    expect(mockInvoke).toHaveBeenCalledWith("start_vdj_watcher", expect.anything());

    // Simulate poll tick AND flush the async interval callback's microtasks.
    // (advanceTimersByTimeAsync fires the timer and awaits pending promises;
    // a plain setTimeout(0) flush would hang under fake timers.)
    await vi.advanceTimersByTimeAsync(1000);

    // Verify polling read occurred and listener notified
    expect(mockInvoke).toHaveBeenCalledWith("read_virtualdj_history", expect.anything());
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        artist: "Poll Artist",
      }),
    );
  }, 10000);

  it("should stop watcher correctly", async () => {
    const unlistenFn = vi.fn();
    mockListen.mockResolvedValue(unlistenFn);
    mockInvoke.mockResolvedValue(null);

    await virtualDjWatcher.startWatching();
    virtualDjWatcher.stopWatching();

    expect(unlistenFn).toHaveBeenCalled();
    expect(mockInvoke).toHaveBeenCalledWith("stop_vdj_watcher");
  });
});

describe("toTrackInfo — outgoing payload normalization", () => {
  const base = (over: Partial<NowPlayingTrack>): NowPlayingTrack => ({
    artist: "A",
    title: "T",
    filePath: "/x.mp3",
    timestamp: new Date(),
    ...over,
  });

  it("passes through valid metrics", () => {
    const r = toTrackInfo(base({ bpm: 96, key: "Am", energy: 70, groove: 55 }));
    expect(r.bpm).toBe(96);
    expect(r.key).toBe("Am");
    expect(r.energy).toBe(70);
    expect(r.groove).toBe(55);
  });

  it("coerces null metrics to undefined (unanalyzed track)", () => {
    const r = toTrackInfo(
      base({
        bpm: null as unknown as number,
        key: null as unknown as string,
        energy: null as unknown as number,
        danceability: null as unknown as number,
      }),
    );
    expect(r.bpm).toBeUndefined();
    expect(r.key).toBeUndefined();
    expect(r.energy).toBeUndefined();
    expect(r.danceability).toBeUndefined();
  });

  it("drops out-of-range bpm to undefined", () => {
    expect(toTrackInfo(base({ bpm: 0 })).bpm).toBeUndefined();
    expect(toTrackInfo(base({ bpm: 999 })).bpm).toBeUndefined();
  });

  it("parses numeric-string bpm", () => {
    expect(toTrackInfo(base({ bpm: "128" as unknown as number })).bpm).toBe(128);
  });
});
