/**
 * Better Auth server instance (Pika's auth authority).
 *
 * Runs in-process in the Hono/Bun cloud with the Drizzle/Postgres adapter. Provides credential
 * auth + sessions for DJ + admin, and magic-link sessions for dancers (Slice B — the durable
 * anchor behind the anonymous `clientId` journal). The desktop authenticates with a session token
 * via the `bearer` plugin. `status` (approval gate) is a custom user field; `role` is managed by
 * the `admin` plugin.
 */

import { logger, slugify, URLS } from "@pika/shared";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createAuthMiddleware } from "better-auth/api";
import { admin as adminPlugin, bearer, magicLink } from "better-auth/plugins";
import { and, eq, notExists, sql } from "drizzle-orm";
import { db } from "../../db";
import { account, user } from "../../db/auth-schema";
import { sendAccountDeletionEmail, sendMagicLinkEmail } from "../services/mail";
import { ac, admin, dancer, dj } from "./permissions";

function trustedOrigins(): string[] {
  const node = process.env["NODE_ENV"];
  // Both staging and prod run NODE_ENV=production (staging is distinguished by domain /
  // SENTRY_ENVIRONMENT, not NODE_ENV), so trust BOTH web origins in any non-dev build —
  // mirrors the CORS allow-list in index.ts. Better Auth validates the browser's `Origin`
  // header (the web app) against this list; the desktop uses bearer tokens (origin-exempt).
  if (node === "production" || node === "staging") {
    return [URLS.getWebUrl("production"), URLS.getWebUrl("staging")];
  }
  // Dev: LAN-phone testing (magic link opened at http://192.168.x.x:3002) needs its origin
  // trusted by Better Auth too (CORS already reflects LAN — index.ts). Comma-separated extras.
  const extras = (process.env["BETTER_AUTH_TRUSTED_ORIGINS"] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return [
    "http://localhost:3000",
    "http://localhost:3002",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3002",
    ...extras,
  ];
}

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  secret: process.env["BETTER_AUTH_SECRET"],
  baseURL: process.env["BETTER_AUTH_URL"],
  emailAndPassword: { enabled: true },
  user: {
    additionalFields: {
      // Approval gate (Pika): new accounts are 'pending'; DJ route guards require 'approved'.
      status: { type: "string", required: false, defaultValue: "pending", input: false },
      // URL-friendly DJ profile path (/dj/[slug]); populated from `name` on create (databaseHook).
      slug: { type: "string", required: false, input: false },
    },
    // GDPR: dancer-initiated deletion, confirmed via email (dancers have no password, and 30-day
    // rolling sessions are never "fresh"). Unwinds client_identities via FK cascade; likes stay
    // anonymous per-device rows.
    deleteUser: {
      enabled: true,
      sendDeleteAccountVerification: async ({ user: u, url }) => {
        await sendAccountDeletionEmail({ to: u.email, url });
      },
    },
  },
  session: { expiresIn: 60 * 60 * 24 * 30 }, // 30d rolling — the ITP-exempt anchor + desktop paste-token flow
  trustedOrigins: trustedOrigins(),
  databaseHooks: {
    user: {
      // Populate the /dj/[slug] profile path from the display name on signup. Magic-link-born
      // users may have NO name — slugify must not throw, and an empty slug must not be stored.
      create: {
        before: async (u) => {
          const slug = typeof u.name === "string" && u.name.length > 0 ? slugify(u.name) : "";
          return { data: { ...u, slug: slug.length > 0 ? slug : null } };
        },
      },
    },
  },
  hooks: {
    // Dancer role assignment. `additionalFields` don't apply to magic-link signups and
    // databaseHooks can't see the request path (GH better-auth#3382) — so magic-link-created
    // users arrive with the admin plugin's defaults (role "dj", status "pending") and are
    // patched here. "Magic-link-born" = NO credential account row: every /dj/register and
    // admin-created DJ gets one synchronously, so the predicate is idempotent, never demotes an
    // existing DJ who signs in via magic link, and self-heals on the next sign-in if a patch
    // ever fails. NOTE: revisit this predicate if a social provider is ever added.
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/magic-link/verify") return;
      const newUser = ctx.context.newSession?.user;
      if (!newUser) return;
      try {
        await db
          .update(user)
          .set({ role: "dancer", status: "approved" })
          .where(
            and(
              eq(user.id, newUser.id),
              eq(user.role, "dj"),
              eq(user.status, "pending"),
              notExists(
                db
                  .select({ one: sql`1` })
                  .from(account)
                  .where(and(eq(account.userId, user.id), eq(account.providerId, "credential"))),
              ),
            ),
          );
      } catch (e) {
        logger.error(
          "❌ Dancer role patch failed (user stays dj/pending — journal unaffected, DJ surfaces blocked)",
          e as Error,
          undefined,
        );
      }
    }),
  },
  plugins: [
    bearer(),
    adminPlugin({ ac, roles: { dj, admin, dancer }, defaultRole: "dj", adminRoles: ["admin"] }),
    magicLink({
      // 10 min — email delivery on phones routinely beats the 5-min default.
      expiresIn: 60 * 10,
      sendMagicLink: async ({ email, url }) => {
        await sendMagicLinkEmail({ to: email, url });
      },
    }),
  ],
});
