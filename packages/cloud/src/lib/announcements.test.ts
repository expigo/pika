import { afterEach, describe, expect, test } from "bun:test";
import { announceToSession } from "./announcements";
import { deleteSession, getSession, setSession } from "./sessions";

const SID = "session_test_announce";

function makePublishSpy() {
  const calls: Array<{ topic: string; payload: Record<string, unknown> }> = [];
  const publish = (topic: string, data: string) => {
    calls.push({ topic, payload: JSON.parse(data) as Record<string, unknown> });
  };
  return { calls, publish };
}

function seed() {
  setSession(SID, {
    sessionId: SID,
    djName: "DJ Test",
    startedAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
  });
}

afterEach(() => deleteSession(SID));

describe("announceToSession", () => {
  test("returns false and publishes nothing when the session is gone", () => {
    const { calls, publish } = makePublishSpy();
    expect(announceToSession("nope", { message: "hi" }, publish)).toBe(false);
    expect(calls).toHaveLength(0);
  });

  test("stores the announcement and broadcasts ANNOUNCEMENT_RECEIVED", () => {
    seed();
    const { calls, publish } = makePublishSpy();

    expect(announceToSession(SID, { message: "Last song!" }, publish)).toBe(true);

    expect(getSession(SID)?.activeAnnouncement?.message).toBe("Last song!");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.payload).toMatchObject({
      type: "ANNOUNCEMENT_RECEIVED",
      sessionId: SID,
      message: "Last song!",
      djName: "DJ Test",
    });
    expect(calls[0]?.payload.timestamp).toBeString();
    expect(calls[0]?.payload.endsAt).toBeUndefined();
  });

  test("sets endsAt when a duration is given", () => {
    seed();
    const { calls, publish } = makePublishSpy();

    announceToSession(SID, { message: "Break in 5", durationSeconds: 300 }, publish);

    const endsAt = calls[0]?.payload.endsAt as string;
    expect(endsAt).toBeString();
    expect(new Date(endsAt).getTime()).toBeGreaterThan(Date.now());
    expect(getSession(SID)?.activeAnnouncement?.endsAt).toBe(endsAt);
  });
});
