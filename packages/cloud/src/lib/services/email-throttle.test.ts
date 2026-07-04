/**
 * Email-throttle unit tests — pure factory with an injected clock (no singleton, no env).
 * The two-layer contract under test: per-address sliding window (silent-skip material) and the
 * global daily fuse (loud-failure material), with denied attempts consuming NO budget.
 */

import { describe, expect, test } from "bun:test";
import { createEmailThrottle } from "./email-throttle";

const HOUR = 60 * 60 * 1000;

function makeThrottle(opts: { dailyCap?: number; start?: number } = {}) {
  let t = opts.start ?? Date.parse("2026-07-04T10:00:00Z");
  const throttle = createEmailThrottle(
    { perAddressMax: 3, perAddressWindowMs: HOUR, dailyCap: opts.dailyCap ?? 200 },
    () => t,
  );
  const advance = (ms: number): void => {
    t += ms;
  };
  return { throttle, advance };
}

describe("createEmailThrottle — per-address window", () => {
  test("allows perAddressMax sends, then address_limited", () => {
    const { throttle } = makeThrottle();
    expect(throttle.tryAcquire("magic-link", "a@x.y")).toBe("ok");
    expect(throttle.tryAcquire("magic-link", "a@x.y")).toBe("ok");
    expect(throttle.tryAcquire("magic-link", "a@x.y")).toBe("ok");
    expect(throttle.tryAcquire("magic-link", "a@x.y")).toBe("address_limited");
  });

  test("window slides: an old send expires and frees a slot", () => {
    const { throttle, advance } = makeThrottle();
    throttle.tryAcquire("magic-link", "a@x.y");
    advance(30 * 60 * 1000);
    throttle.tryAcquire("magic-link", "a@x.y");
    throttle.tryAcquire("magic-link", "a@x.y");
    expect(throttle.tryAcquire("magic-link", "a@x.y")).toBe("address_limited");
    advance(31 * 60 * 1000); // first send now > 1h old
    expect(throttle.tryAcquire("magic-link", "a@x.y")).toBe("ok");
  });

  test("kinds are independent buckets for the same address", () => {
    const { throttle } = makeThrottle();
    throttle.tryAcquire("magic-link", "a@x.y");
    throttle.tryAcquire("magic-link", "a@x.y");
    throttle.tryAcquire("magic-link", "a@x.y");
    expect(throttle.tryAcquire("magic-link", "a@x.y")).toBe("address_limited");
    expect(throttle.tryAcquire("account-deletion", "a@x.y")).toBe("ok");
  });

  test("addresses are normalized: case and whitespace variants share one bucket", () => {
    const { throttle } = makeThrottle();
    throttle.tryAcquire("magic-link", "A@X.Y");
    throttle.tryAcquire("magic-link", " a@x.y ");
    throttle.tryAcquire("magic-link", "a@X.y");
    expect(throttle.tryAcquire("magic-link", "a@x.y")).toBe("address_limited");
  });
});

describe("createEmailThrottle — daily fuse", () => {
  test("trips after dailyCap accepted sends across all addresses", () => {
    const { throttle } = makeThrottle({ dailyCap: 5 });
    for (let i = 0; i < 5; i++) {
      expect(throttle.tryAcquire("magic-link", `u${i}@x.y`)).toBe("ok");
    }
    expect(throttle.tryAcquire("magic-link", "fresh@x.y")).toBe("daily_capped");
  });

  test("denied attempts consume no daily budget (hammering one inbox can't starve others)", () => {
    const { throttle } = makeThrottle({ dailyCap: 5 });
    for (let i = 0; i < 50; i++) throttle.tryAcquire("magic-link", "victim@x.y"); // 3 ok, 47 denied
    expect(throttle.tryAcquire("magic-link", "bystander@x.y")).toBe("ok");
    expect(throttle.tryAcquire("magic-link", "bystander2@x.y")).toBe("ok");
  });

  test("resets on UTC day rollover (fuse and address windows)", () => {
    const { throttle, advance } = makeThrottle({ dailyCap: 3 });
    throttle.tryAcquire("magic-link", "a@x.y");
    throttle.tryAcquire("magic-link", "b@x.y");
    throttle.tryAcquire("magic-link", "c@x.y");
    expect(throttle.tryAcquire("magic-link", "d@x.y")).toBe("daily_capped");
    advance(24 * HOUR);
    expect(throttle.tryAcquire("magic-link", "d@x.y")).toBe("ok");
    expect(throttle.tryAcquire("magic-link", "a@x.y")).toBe("ok");
  });
});
