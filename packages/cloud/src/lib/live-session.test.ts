import { afterEach, describe, expect, test } from "bun:test";
import { applyNowPlaying } from "./live-session";
import { deleteSession, setSession } from "./sessions";

const SID = "session_test_apply";

function makePublishSpy() {
  const calls: Array<{ topic: string; type: string }> = [];
  const publish = (topic: string, data: string) => {
    calls.push({ topic, type: (JSON.parse(data) as { type: string }).type });
  };
  return { calls, publish };
}

afterEach(() => deleteSession(SID));

describe("applyNowPlaying", () => {
  test("returns false and publishes nothing when the session is gone", () => {
    const { calls, publish } = makePublishSpy();
    expect(applyNowPlaying("nope", { title: "T", artist: "A" }, publish)).toBe(false);
    expect(calls).toHaveLength(0);
  });

  test("first track publishes NOW_PLAYING only (no TEMPO_RESET)", () => {
    setSession(SID, {
      sessionId: SID,
      djName: "DJ Test",
      startedAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
    });
    const { calls, publish } = makePublishSpy();

    expect(applyNowPlaying(SID, { title: "Song A", artist: "Artist A" }, publish)).toBe(true);
    expect(calls.map((c) => c.type)).toEqual(["NOW_PLAYING"]);
  });

  test("changing track emits TEMPO_RESET then NOW_PLAYING", () => {
    setSession(SID, {
      sessionId: SID,
      djName: "DJ Test",
      startedAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
    });
    const { calls, publish } = makePublishSpy();

    applyNowPlaying(SID, { title: "Song A", artist: "Artist A" }, publish);
    applyNowPlaying(SID, { title: "Song B", artist: "Artist B" }, publish);

    expect(calls.map((c) => c.type)).toEqual(["NOW_PLAYING", "TEMPO_RESET", "NOW_PLAYING"]);
  });
});
