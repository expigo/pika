/**
 * Shared harness for the real-Postgres integration files in this directory
 * (split 2026-07-13 from src/__tests__/db.integration.test.ts @ 2d3f846, 4,040 lines).
 *
 * - Gated behind RUN_DB_TESTS: `suite` is describe.skip otherwise, so plain `bun test`
 *   sweeps these files but runs nothing (modules still evaluate — keep this file free of
 *   DB calls and env mutations at top level; the pg client is lazy).
 * - Run ISOLATED via `bun run test:integration` (= RUN_DB_TESTS=1 bun test
 *   src/__tests__/integration/), NEVER bare `RUN_DB_TESTS=1 bun test`: unit files mock
 *   modules process-globally (see root CLAUDE.md → Testing Philosophy).
 * - Every file must be order-independent and self-contained: register hooks only inside
 *   your own suite, and never assume a process-global latch (journal-export guard, recap
 *   cap latch) is clean except immediately after your own reset call. This module must
 *   never call beforeAll/afterAll at import time — they would bind to whichever file bun
 *   happens to be collecting first. Pool teardown (client.end, at-most-once) lives in
 *   ../../../test-preload.ts (bunfig [test].preload), NOT here and NOT in any file.
 * - Local prerequisites: `docker compose up -d postgres` + `bun run db:migrate`.
 */

import { describe } from "bun:test";
import { and, desc, eq, lt } from "drizzle-orm";
import { db, schema } from "../../db";
import { auth } from "../../lib/auth/server";

export const RUN = !!process.env["RUN_DB_TESTS"];
export const suite = RUN ? describe : describe.skip;

/** Unique-suffix helper (was 9 byte-identical per-describe copies pre-split). */
export const uniq = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

// Base sessions row shared by the schema tests (FK target) and Slice B1/B2 (route paths +
// FK inserts). Ids are module constants; the row is seeded once per process via
// ensureBaseSession() and deleted by the preload's global afterAll.
export const baseSessionId = `itest_${Date.now()}_${Math.random().toString(36).substring(7)}`;
export const baseClientId = "itest-client";

/**
 * Env flips each file applies in its OWN suite beforeAll (idempotent; a skipped suite
 * never runs it, so plain `bun test` is unaffected; hooks run after imports, so src
 * modules are imported under the same NODE_ENV as today).
 */
export function setupIntegrationEnv(): void {
  // Exercise the real persist* DB paths instead of their NODE_ENV==="test" short-circuits.
  process.env["NODE_ENV"] = "development";
  // Keep the suite email-free even when .env carries a real RESEND_API_KEY (bun auto-loads
  // it): force the keyless dev fallback, which logs instead of sending.
  delete process.env["RESEND_API_KEY"];
  // Unsubscribe tokens (Slice C) HMAC with this; CI sets it, a bare local env may not.
  process.env["BETTER_AUTH_SECRET"] ??= "itest-better-auth-secret";
}

let baseSeeded: Promise<void> | undefined;
/**
 * Memoized: the first caller seeds the row; later files' beforeAll awaits the same promise.
 * Self-healing: stale open 'ITest DJ' rows from prior runs whose teardown never fired are
 * deleted first — otherwise they accumulate as zombie-sweep candidates and can crowd the
 * asserted row out of closeZombieSessions' unordered LIMIT-50 window on long-lived dev DBs.
 */
export function ensureBaseSession(): Promise<void> {
  baseSeeded ??= (async () => {
    await db
      .delete(schema.sessions)
      .where(
        and(
          eq(schema.sessions.djName, "ITest DJ"),
          lt(schema.sessions.startedAt, new Date(Date.now() - 24 * 60 * 60 * 1000)),
        ),
      );
    await db.insert(schema.sessions).values({ id: baseSessionId, djName: "ITest DJ" });
  })();
  return baseSeeded;
}

/**
 * Create a DJ via Better Auth (real signup → `user` row + a `session`) and return a
 * bearer token usable as `Authorization: Bearer <token>` (the desktop/WS flow). Optionally
 * flips `status`/`role` directly in the DB to mimic admin approval / role assignment.
 */
export async function signUpDj(
  opts: { approved?: boolean; admin?: boolean; email?: string; name?: string } = {},
): Promise<{ userId: string; token: string; email: string }> {
  const rnd = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const email = opts.email ?? `dj_${rnd}@itest.dev`;
  const { headers, response } = await auth.api.signUpEmail({
    body: { email, password: "validpassword123", name: opts.name ?? `ITest DJ ${rnd}` },
    returnHeaders: true,
  });
  const token = headers.get("set-auth-token") ?? "";
  const userId = response.user.id;
  const patch: { status?: string; role?: string } = {};
  if (opts.approved) patch.status = "approved";
  if (opts.admin) patch.role = "admin";
  if (Object.keys(patch).length > 0) {
    await db.update(schema.user).set(patch).where(eq(schema.user.id, userId));
  }
  return { userId, token, email };
}

/**
 * Sign a magic-link token for `email` through the REAL flow (Slice B): request the link (the
 * keyless mail fallback logs it; the token also lands in the `verification` table), read the
 * newest token for that email from `verification`, then verify — which mints the user (on first
 * sign-in), fires the dancer-role hook, and returns a bearer token via the `bearer` plugin.
 */
export async function magicLinkSignIn(
  email: string,
): Promise<{ userId: string; token: string; email: string }> {
  await auth.api.signInMagicLink({ body: { email }, headers: new Headers() });
  const rows = await db
    .select({ identifier: schema.verification.identifier, value: schema.verification.value })
    .from(schema.verification)
    .orderBy(desc(schema.verification.createdAt))
    .limit(10);
  const row = rows.find((r) => r.value.includes(email));
  if (!row) throw new Error(`no magic-link verification row found for ${email}`);
  const { headers, response } = await auth.api.magicLinkVerify({
    query: { token: row.identifier },
    headers: new Headers(),
    returnHeaders: true,
  });
  const token = headers.get("set-auth-token") ?? "";
  const userId = (response as { user?: { id: string } }).user?.id ?? "";
  if (userId) return { userId, token, email };
  const [u] = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.email, email))
    .limit(1);
  if (!u) throw new Error(`magic-link verify did not create a user for ${email}`);
  return { userId: u.id, token, email };
}

export async function signUpDancer(): Promise<{ userId: string; token: string; email: string }> {
  const rnd = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return magicLinkSignIn(`dancer_${rnd}@itest.dev`);
}

/**
 * Sign in via the email-OTP path (Slice B.5 — the PWA-jar mechanism): request the code (keyless
 * fallback logs it; it also lands in `verification` as `sign-in-otp-<email>` → `<otp>:<attempts>`),
 * read it from the table, then verify — same dancer-role hook as magic link.
 */
export async function otpSignIn(email: string): Promise<{ userId: string; token: string }> {
  await auth.api.sendVerificationOTP({ body: { email, type: "sign-in" }, headers: new Headers() });
  const [row] = await db
    .select({ value: schema.verification.value })
    .from(schema.verification)
    .where(eq(schema.verification.identifier, `sign-in-otp-${email}`))
    .orderBy(desc(schema.verification.createdAt))
    .limit(1);
  const otp = row?.value.split(":")[0] ?? "";
  if (!otp) throw new Error(`no sign-in OTP row found for ${email}`);
  const { headers, response } = await auth.api.signInEmailOTP({
    body: { email, otp },
    headers: new Headers(),
    returnHeaders: true,
  });
  const token = headers.get("set-auth-token") ?? "";
  const userId = (response as { user?: { id: string } }).user?.id ?? "";
  if (userId) return { userId, token };
  const [u] = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.email, email))
    .limit(1);
  if (!u) throw new Error(`OTP sign-in did not create a user for ${email}`);
  return { userId: u.id, token };
}
