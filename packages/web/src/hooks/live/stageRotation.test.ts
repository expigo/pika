import { describe, expect, test } from "bun:test";
import {
  applyStageNowPlaying,
  applyStageSessionEnded,
  applyStageSessionStarted,
  type StageRotationActions,
} from "./stageRotation";

/** Recording fake of the actions interface — captures (name, ...args) per call. */
function makeActions() {
  const calls: Array<[string, ...unknown[]]> = [];
  const rec =
    (name: string) =>
    (...args: unknown[]) => {
      calls.push([name, ...args]);
    };
  const actions: StageRotationActions = {
    setSessionId: rec("setSessionId"),
    setDjName: rec("setDjName"),
    clearCurrentTrack: rec("clearCurrentTrack"),
    clearHistory: rec("clearHistory"),
    resetPoll: rec("resetPoll"),
    resetTempoVote: rec("resetTempoVote"),
    resetLikes: rec("resetLikes"),
    setSessionEnded: rec("setSessionEnded"),
    fetchHistory: rec("fetchHistory"),
  };
  return {
    actions,
    names: () => calls.map((c) => c[0]),
    argsOf: (name: string) => calls.find((c) => c[0] === name)?.slice(1),
  };
}

describe("applyStageNowPlaying", () => {
  test("sets DJ + session and fetches history on first sight; clears ended", () => {
    const m = makeActions();
    const next = applyStageNowPlaying({ sessionId: "s1", djName: "DJ A" }, null, m.actions);
    expect(next).toBe("s1");
    expect(m.argsOf("setDjName")).toEqual(["DJ A"]);
    expect(m.argsOf("setSessionId")).toEqual(["s1"]);
    expect(m.argsOf("fetchHistory")).toEqual(["s1"]);
    expect(m.argsOf("setSessionEnded")).toEqual([false]);
  });

  test("dedups history fetch when the session is unchanged", () => {
    const m = makeActions();
    const next = applyStageNowPlaying({ sessionId: "s1", djName: "DJ A" }, "s1", m.actions);
    expect(next).toBe("s1");
    expect(m.names()).not.toContain("fetchHistory"); // already synced
    expect(m.argsOf("setSessionId")).toEqual(["s1"]); // still mirrors current DJ
  });

  test("re-fetches history when the live session changes (rotation via NOW_PLAYING)", () => {
    const m = makeActions();
    const next = applyStageNowPlaying({ sessionId: "s2", djName: "DJ B" }, "s1", m.actions);
    expect(next).toBe("s2");
    expect(m.argsOf("fetchHistory")).toEqual(["s2"]);
  });

  test("tolerates a NOW_PLAYING missing djName/sessionId", () => {
    const m = makeActions();
    const next = applyStageNowPlaying({}, "s1", m.actions);
    expect(next).toBe("s1");
    expect(m.names()).not.toContain("setDjName");
    expect(m.names()).not.toContain("setSessionId");
    expect(m.argsOf("setSessionEnded")).toEqual([false]);
  });
});

describe("applyStageSessionStarted", () => {
  test("a SESSION_STARTED for OUR stage swaps the DJ and resets per-set state", () => {
    const m = makeActions();
    const handled = applyStageSessionStarted(
      { sessionId: "s2", djName: "DJ B", stageId: "floor" },
      "floor",
      m.actions,
    );
    expect(handled).toBe(true);
    expect(m.argsOf("setSessionId")).toEqual(["s2"]);
    expect(m.argsOf("setDjName")).toEqual(["DJ B"]);
    expect(m.names()).toEqual(
      expect.arrayContaining([
        "clearCurrentTrack",
        "clearHistory",
        "resetPoll",
        "resetTempoVote",
        "fetchHistory",
      ]),
    );
    expect(m.argsOf("setSessionEnded")).toEqual([false]);
  });

  test("a SESSION_STARTED for ANOTHER stage is ignored (no state touched)", () => {
    const m = makeActions();
    const handled = applyStageSessionStarted(
      { sessionId: "s9", djName: "Other", stageId: "other-floor" },
      "floor",
      m.actions,
    );
    expect(handled).toBe(false);
    expect(m.names()).toHaveLength(0);
  });
});

describe("applyStageSessionEnded", () => {
  test("our stage's end → waiting state, and crucially NOT setSessionEnded(true)", () => {
    const m = makeActions();
    const handled = applyStageSessionEnded(
      { sessionId: "s2", stageId: "floor" },
      "floor",
      m.actions,
    );
    expect(handled).toBe(true);
    expect(m.argsOf("setSessionId")).toEqual([null]);
    expect(m.argsOf("setDjName")).toEqual([null]);
    expect(m.names()).toEqual(
      expect.arrayContaining([
        "clearCurrentTrack",
        "clearHistory",
        "resetLikes",
        "resetTempoVote",
        "resetPoll",
      ]),
    );
    // The stage persists — must never flip to the terminal "session over" state.
    expect(m.names()).not.toContain("setSessionEnded");
  });

  test("another stage's end is ignored", () => {
    const m = makeActions();
    const handled = applyStageSessionEnded(
      { sessionId: "s9", stageId: "other-floor" },
      "floor",
      m.actions,
    );
    expect(handled).toBe(false);
    expect(m.names()).toHaveLength(0);
  });
});
