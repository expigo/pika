import { describe, expect, test } from "bun:test";
import { MESSAGE_TYPES } from "@pika/shared";
import { selectJoinMessage } from "./joinMessage";

describe("selectJoinMessage", () => {
  const clientId = "client-123";

  test("a stage target → SUBSCRIBE_STAGE (wins over everything)", () => {
    const msg = selectJoinMessage({
      targetStageId: "main-floor",
      targetSessionId: "sess-1", // should be ignored in favor of the stage
      discoveredSessionId: "sess-2",
      clientId,
    });
    expect(msg).toEqual({
      type: MESSAGE_TYPES.SUBSCRIBE_STAGE,
      clientId,
      stageId: "main-floor",
    });
  });

  test("an explicit session target → SUBSCRIBE", () => {
    const msg = selectJoinMessage({ targetSessionId: "sess-1", clientId });
    expect(msg).toEqual({ type: MESSAGE_TYPES.SUBSCRIBE, clientId, sessionId: "sess-1" });
  });

  test("no explicit target but a discovered session → SUBSCRIBE that session", () => {
    const msg = selectJoinMessage({ discoveredSessionId: "sess-discovered", clientId });
    expect(msg).toEqual({
      type: MESSAGE_TYPES.SUBSCRIBE,
      clientId,
      sessionId: "sess-discovered",
    });
  });

  test("explicit session target takes precedence over a discovered one", () => {
    const msg = selectJoinMessage({
      targetSessionId: "explicit",
      discoveredSessionId: "discovered",
      clientId,
    });
    expect(msg).toMatchObject({ type: MESSAGE_TYPES.SUBSCRIBE, sessionId: "explicit" });
  });

  test("no target and nothing discovered → GET_SESSIONS (lobby)", () => {
    const msg = selectJoinMessage({ discoveredSessionId: null, clientId });
    expect(msg).toEqual({ type: MESSAGE_TYPES.GET_SESSIONS, clientId });
  });
});
