import { MESSAGE_TYPES } from "@pika/shared";
import { describe, expect, it } from "vitest";
import { buildRegisterSessionMessage } from "./registerMessage";

describe("buildRegisterSessionMessage", () => {
  it("includes type, sessionId and djName", () => {
    const msg = buildRegisterSessionMessage({ sessionId: "s1", djName: "DJ A" });
    expect(msg).toEqual({
      type: MESSAGE_TYPES.REGISTER_SESSION,
      sessionId: "s1",
      djName: "DJ A",
    });
  });

  it("includes stageId only when provided", () => {
    expect(
      buildRegisterSessionMessage({ sessionId: "s1", djName: "A", stageId: "floor" }),
    ).toMatchObject({ stageId: "floor" });
    expect(buildRegisterSessionMessage({ sessionId: "s1", djName: "A" })).not.toHaveProperty(
      "stageId",
    );
  });

  it("includes token only when truthy (anonymous mode omits it)", () => {
    expect(
      buildRegisterSessionMessage({ sessionId: "s1", djName: "A", token: "pk_dj_x" }),
    ).toMatchObject({ token: "pk_dj_x" });
    expect(
      buildRegisterSessionMessage({ sessionId: "s1", djName: "A", token: null }),
    ).not.toHaveProperty("token");
    expect(
      buildRegisterSessionMessage({ sessionId: "s1", djName: "A", token: "" }),
    ).not.toHaveProperty("token");
  });

  it("carries both token and stageId together (staged + authenticated)", () => {
    const msg = buildRegisterSessionMessage({
      sessionId: "s1",
      djName: "A",
      token: "pk_dj_x",
      stageId: "floor",
    });
    expect(msg).toMatchObject({ token: "pk_dj_x", stageId: "floor" });
  });
});
