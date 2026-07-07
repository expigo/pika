/**
 * Recap-sweep unit tests — the pure parts only (send window). The stateful pipeline
 * (zombie-close, claim-once, recipient assembly, digest gating) runs against real Postgres in
 * the integration suite with an injected fake mailer.
 */

import { describe, expect, test } from "bun:test";
import { isInSendWindow, RECAP_SWEEP_INTERVAL_MS, resolveSendWindow } from "./recap";

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

describe("resolveSendWindow", () => {
  test("valid pair wins; garbage / out-of-range hours fall back per-hour", () => {
    expect(resolveSendWindow("10", "14")).toEqual({ start: 10, end: 14 });
    expect(resolveSendWindow(undefined, undefined)).toEqual({ start: 9, end: 13 });
    expect(resolveSendWindow("banana", "14")).toEqual({ start: 9, end: 14 });
    expect(resolveSendWindow("25", "14")).toEqual({ start: 9, end: 14 });
    expect(resolveSendWindow("-1", undefined)).toEqual({ start: 9, end: 13 });
  });

  test("an inverted or empty pair falls back to 9–13 — the window must never silently close", () => {
    expect(resolveSendWindow("13", "9")).toEqual({ start: 9, end: 13 });
    expect(resolveSendWindow("11", "11")).toEqual({ start: 9, end: 13 });
    // The per-hour fallback can itself produce an inverted pair — cross-validated AFTER clamping.
    expect(resolveSendWindow("15", "oops")).toEqual({ start: 9, end: 13 });
  });
});
