/**
 * Recap-sweep unit tests — the pure parts only (send window). The stateful pipeline
 * (zombie-close, claim-once, recipient assembly, digest gating) runs against real Postgres in
 * the integration suite with an injected fake mailer.
 */

import { describe, expect, test } from "bun:test";
import { isInSendWindow, RECAP_SWEEP_INTERVAL_MS } from "./recap";

describe("isInSendWindow", () => {
  test("morning/noon window is [09:00, 13:00) server-local", () => {
    const at = (h: number, m = 0) => new Date(2026, 6, 5, h, m);
    expect(isInSendWindow(at(8, 59))).toBe(false);
    expect(isInSendWindow(at(9, 0))).toBe(true);
    expect(isInSendWindow(at(11, 30))).toBe(true);
    expect(isInSendWindow(at(12, 59))).toBe(true);
    expect(isInSendWindow(at(13, 0))).toBe(false);
    expect(isInSendWindow(at(2, 0))).toBe(false);
  });
});

describe("sweep cadence", () => {
  test("15-minute tick — frequent enough to hit the window, cheap enough to not matter", () => {
    expect(RECAP_SWEEP_INTERVAL_MS).toBe(15 * 60 * 1000);
  });
});
