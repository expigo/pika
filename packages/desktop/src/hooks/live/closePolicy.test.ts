import { describe, expect, it } from "vitest";
import { isTerminalClose } from "./closePolicy";

describe("isTerminalClose", () => {
  it("treats normal closure (1000) as transient → reconnect", () => {
    expect(isTerminalClose(1000, false)).toBe(false);
  });

  it("treats abnormal closure (1006) as transient → reconnect", () => {
    expect(isTerminalClose(1006, false)).toBe(false);
  });

  it("treats app-defined fatal codes (4000-4999) as terminal", () => {
    expect(isTerminalClose(4001, false)).toBe(true);
    expect(isTerminalClose(4999, false)).toBe(true);
  });

  it("treats server-busy (1013) as terminal (no hammering)", () => {
    expect(isTerminalClose(1013, false)).toBe(true);
  });

  it("is terminal whenever the close is intentional, regardless of code", () => {
    expect(isTerminalClose(1000, true)).toBe(true);
    expect(isTerminalClose(1006, true)).toBe(true);
    expect(isTerminalClose(3000, true)).toBe(true);
  });
});
