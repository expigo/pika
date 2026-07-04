/**
 * Config-pin tests for the Better Auth instance. These don't exercise BA's limiter (it's
 * BA-internal and prod-only) — they pin OUR wiring of it so a refactor can't silently drop the
 * email-abuse rules or the tunnel-aware IP keying (without cf-connecting-ip, all of production
 * would share one rate-limit bucket behind the Cloudflare tunnel).
 */

import { describe, expect, test } from "bun:test";
import { LIMITS } from "@pika/shared";
import { auth } from "./server";

describe("Better Auth rate-limit wiring", () => {
  test("email-sending endpoints carry the tight per-IP rules", () => {
    const rules = auth.options.rateLimit?.customRules as
      | Record<string, { window: number; max: number }>
      | undefined;
    expect(rules?.["/sign-in/magic-link"]).toEqual({
      window: LIMITS.AUTH_EMAIL_IP_WINDOW_SEC,
      max: LIMITS.AUTH_EMAIL_IP_MAX,
    });
    expect(rules?.["/delete-user"]).toEqual({
      window: LIMITS.AUTH_EMAIL_IP_WINDOW_SEC,
      max: LIMITS.AUTH_EMAIL_IP_MAX,
    });
  });

  test("limiter enablement is pinned to NODE_ENV=production (off in this test env)", () => {
    expect(auth.options.rateLimit?.enabled).toBe(false);
    expect(process.env["NODE_ENV"]).not.toBe("production");
  });

  test("IP derivation matches the app convention (CF tunnel first)", () => {
    expect(auth.options.advanced?.ipAddress?.ipAddressHeaders).toEqual([
      "cf-connecting-ip",
      "x-forwarded-for",
    ]);
  });
});
