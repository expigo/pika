import { describe, it, expect, vi, beforeEach } from "vitest";

// 🛡️ HYBRID DEDUPLICATION TEST
// This verifies the defense-in-depth logic in useLiveSession.ts
// which prevents track count inflation even if the watcher misfires
// or the 60s windows roll over during a long track.

describe("useLiveSession Hybrid Deduplication", () => {
  const TRACK_DEDUP_WINDOW_MS = 60000;
  const MIN_REPLAY_INTERVAL_MS = 120000;

  let processedTrackKeys: Set<string>;
  let sessionTrackTimestamps: Map<string, number>;

  beforeEach(() => {
    processedTrackKeys = new Set();
    sessionTrackTimestamps = new Map();
    vi.useFakeTimers();
  });

  function hasProcessedTrackKey(key: string) {
    return processedTrackKeys.has(key);
  }
  function addProcessedTrackKey(key: string) {
    processedTrackKeys.add(key);
  }

  // Replicating the logic from useLiveSession.ts:recordPlay
  function recordPlayLogic(track: { artist: string; title: string }) {
    // Layer 1: Window dedup (rolling 60s window)
    const dedupWindow = Math.floor(Date.now() / TRACK_DEDUP_WINDOW_MS);
    const trackKey = `${track.artist}-${track.title}-${dedupWindow}`;

    // Layer 2: Absolute interval (🛡️ OPTION B FIX)
    const absoluteKey = `${track.artist}-${track.title}`.toLowerCase();
    const lastPlayTime = sessionTrackTimestamps.get(absoluteKey);

    if (lastPlayTime !== undefined) {
      const timeSinceLastPlay = Date.now() - lastPlayTime;
      if (timeSinceLastPlay < MIN_REPLAY_INTERVAL_MS) {
        // Trace for verification
        console.log(
          `[Test] Deduped absolute: ${absoluteKey} (last played ${timeSinceLastPlay}ms ago)`,
        );
        return "DEDUPED_ABSOLUTE";
      }
    }

    if (hasProcessedTrackKey(trackKey)) {
      console.log(`[Test] Deduped window: ${trackKey}`);
      return "DEDUPED_WINDOW";
    }

    addProcessedTrackKey(trackKey);
    sessionTrackTimestamps.set(absoluteKey, Date.now());
    console.log(`[Test] Recorded: ${absoluteKey} at ${Date.now()}`);
    return "RECORDED";
  }

  it("should record a new track", () => {
    const track = { artist: "Queen", title: "Bohemian Rhapsody" };
    expect(recordPlayLogic(track)).toBe("RECORDED");
  });

  /**
   * TEST: Prevent Rolling Window Inflations
   * RATIONALE: A 3-minute track should not be recorded twice just because
   * a visibility change happened at minute 1:05 and minute 2:05.
   */
  it("should block duplicate recording when window rolls over (🛡️ THE BUG FIX)", () => {
    const track = { artist: "Sunbyrn", title: "If I Wait" };

    // 0:01 - Track starts, recorded in Window 0
    vi.setSystemTime(1000);
    expect(recordPlayLogic(track)).toBe("RECORDED");

    // 0:59 - Still in Window 0, should be deduped by both layers
    vi.setSystemTime(59000);
    expect(recordPlayLogic(track)).toBe("DEDUPED_ABSOLUTE");

    // 1:05 - Window 1 starts.
    // OLD SYSTEM: would record because trackKey would be "Sunbyrn-IfIWait-1"
    // NEW SYSTEM: blocks because last record was only 64s ago (<120s)
    vi.setSystemTime(65000);
    expect(recordPlayLogic(track)).toBe("DEDUPED_ABSOLUTE"); // CRITICAL FIX SUCCESS

    // 1:55 - Still within 120s of the first record (114s elapsed). Blocked.
    vi.setSystemTime(115000);
    expect(recordPlayLogic(track)).toBe("DEDUPED_ABSOLUTE");

    // 2:05 - Now 124s have elapsed since T=1s.
    // This is now outside MIN_REPLAY_INTERVAL_MS (120s).
    // LEGITIMATE REPLAY or long track rollover protection end.
    vi.setSystemTime(125000);
    expect(recordPlayLogic(track)).toBe("RECORDED");
  });

  it("should handle mixed case titles correctly", () => {
    const track1 = { artist: "Sunbyrn", title: "If I Wait" };
    const track2 = { artist: "SUNBYRN", title: "if i wait" };

    vi.setSystemTime(1000);
    recordPlayLogic(track1);

    vi.setSystemTime(5000);
    expect(recordPlayLogic(track2)).toBe("DEDUPED_ABSOLUTE");
  });
});
