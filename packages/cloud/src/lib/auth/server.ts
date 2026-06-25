/**
 * Better Auth server instance (Pika's auth authority).
 *
 * Runs in-process in the Hono/Bun cloud with the Drizzle/Postgres adapter. Provides credential
 * auth + sessions for DJ + admin (dancers stay anonymous on `clientId` — deferred). The desktop
 * authenticates with a session token via the `bearer` plugin. `status` (approval gate) is a custom
 * user field; `role` is managed by the `admin` plugin.
 */

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin as adminPlugin, bearer } from "better-auth/plugins";
import { db } from "../../db";
import { ac, admin, dj } from "./permissions";

function trustedOrigins(): string[] {
  // biome-ignore lint/complexity/useLiteralKeys: process.env requires brackets in strict TS
  const node = process.env["NODE_ENV"];
  if (node === "production") return ["https://pika.stream"];
  if (node === "staging") return ["https://staging.pika.stream"];
  return [
    "http://localhost:3000",
    "http://localhost:3002",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3002",
  ];
}

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  // biome-ignore lint/complexity/useLiteralKeys: process.env requires brackets in strict TS
  secret: process.env["BETTER_AUTH_SECRET"],
  // biome-ignore lint/complexity/useLiteralKeys: process.env requires brackets in strict TS
  baseURL: process.env["BETTER_AUTH_URL"],
  emailAndPassword: { enabled: true },
  user: {
    additionalFields: {
      // Approval gate (Pika): new accounts are 'pending'; route guards require 'approved'.
      status: { type: "string", required: false, defaultValue: "pending", input: false },
      // URL-friendly DJ profile path (/dj/[slug]); populated from `name` on create (databaseHook).
      slug: { type: "string", required: false, input: false },
    },
  },
  session: { expiresIn: 60 * 60 * 24 * 30 }, // 30d — supports the desktop paste-token flow
  trustedOrigins: trustedOrigins(),
  plugins: [
    bearer(),
    adminPlugin({ ac, roles: { dj, admin }, defaultRole: "dj", adminRoles: ["admin"] }),
  ],
});
