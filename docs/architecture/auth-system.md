# Architecture: Authentication System

Describes the *current* authentication/authorization in Pika!. The cloud's auth authority is
**[Better Auth](https://better-auth.com)** (adopted June 2026, replacing the former custom bcrypt/
SHA-256-token system). Design rationale: `docs/blueprints/auth-foundation.md`.

## 1. Overview
- **DJs / admins** authenticate with **email + password** → a Better Auth **session**. The web uses a
  **cookie** session; the **Tauri desktop** uses a **bearer token** (Better Auth `bearer` plugin).
- **Dancers stay anonymous** — identified by a persistent `clientId` in localStorage (no account).
  (The Better Auth *anonymous plugin* — optional account-upgrade carrying a dancer's likes/history —
  is deferred; see auth-foundation §7.)
- **Approval gate:** new accounts are `status: 'pending'`; protected DJ routes require `'approved'`.
- **Roles:** `dj` (default) and `admin` (Better Auth admin plugin). RBAC, not a policy engine.

## 2. Technical stack
- **Server instance:** `packages/cloud/src/lib/auth/server.ts` — `betterAuth({...})` with the
  **Drizzle/Postgres** adapter, `emailAndPassword`, plugins `[bearer(), admin({ ac, roles:{dj,admin} })]`,
  `trustedOrigins` (web origins; bearer is origin-exempt), and a `databaseHook` that derives `slug` from
  the display name on signup.
- **Handler mount:** `app.on(["POST","GET"], "/api/auth/*", (c) => auth.handler(c.req.raw))` in `index.ts`
  — Better Auth owns sign-up/in/out/session/admin endpoints + its own origin-based CSRF.
- **Guards:** `packages/cloud/src/lib/auth.ts` — `requireDjAuth` (authenticated **and** `approved`),
  `requireRole(role,{hideExistence})` / `requireAdmin` (admin → 404 on mismatch so the panel's existence
  isn't leaked), `getUserFromToken` (WS `REGISTER_SESSION`). `resolveUser` accepts a cookie session OR an
  `Authorization: Bearer` token.
- **Permissions:** `packages/cloud/src/lib/auth/permissions.ts` — access-control roles for the admin plugin.

## 3. Data model
Better Auth owns `user` / `session` / `account` / `verification` (`packages/cloud/src/db/auth-schema.ts`,
CLI-generated). Pika specifics on `user`: `status` (`pending`|`approved`|`rejected`), `role` (`dj`|`admin`),
`slug` (`/dj/[slug]`). FK columns across the schema (`sessions.djUserId`, `spotify_connections`,
`curated_tracks`, …) reference `user.id` (text). The former `dj_users`/`dj_tokens` tables are gone.

## 4. Auth flow
1. **Sign up** — `POST /api/auth/sign-up/email` → creates a `user` (`status='pending'`, `role='dj'`,
   `slug` from name) + session; returns a session token (also usable as a bearer token).
2. **Sign in** — `POST /api/auth/sign-in/email` → sets the cookie session (web) / returns the bearer token
   (`set-auth-token`, desktop).
3. **Protected REST** — guards call `auth.api.getSession({ headers })`; `requireDjAuth` 401s no-session,
   403s a non-`approved` user; `requireAdmin` 404s a non-admin.
4. **WebSocket** — `REGISTER_SESSION` carries the bearer token → `getUserFromToken` resolves the user and
   links `djUserId` (else the session falls back to anonymous).
5. **Admin/approval** — admins approve/reject DJs in-app via `/api/admin/djs/:id/{approve,reject}` (audited);
   first admin is a bootstrap DB update.

## 5. Security measures
| Measure | Status | Detail |
|---|:--:|---|
| Password hashing | ✅ | Better Auth (scrypt) — maintained, not our own crypto. |
| Sessions | ✅ | 30-day expiry; httpOnly cookie (web) + bearer token (desktop). |
| CSRF | ✅ | Better Auth origin checks on `/api/auth/*`; `X-Pika-Client` header required on non-GET for
  `/api/{live,playlist,admin}` (`csrfCheck`, `index.ts`). |
| CORS / trusted origins | ✅ | `trustedOrigins` (Better Auth) + the CORS allow-list mirror prod/staging web. |
| Role gating | ✅ | `requireAdmin` hides existence (404). Covered by `lib/auth.test.ts` + the gated
  `db.integration.test.ts` (pending→403, dj→404, admin→200, bearer resolution). |
| Approval gate | ✅ | `status !== 'approved'` → 403 on all DJ routes. |
| Rate limiting | ✅ | Better Auth built-in (prod) + `hono-rate-limiter` on admin/playlist routers. |

## 6. Known limitations (deferred to pilot-prep — auth-foundation §7)
- **No email verification / password reset** wired (needs an email transport) — deliberately deferred
  while functional testing wipes the DB often.
- **No organization plugin** (organizer + event/stage ownership/invites) — events carry `ownerUserId` but
  org membership/roles aren't modeled yet.
- **Anonymous plugin** not adopted — dancer participation works via `clientId`; the plugin only adds the
  optional account-**upgrade** path (do it just before real dancer data accumulates).

## 7. CSRF coverage note (open follow-up)
`csrfCheck` (the `X-Pika-Client` requirement on non-GET) guards `/api/{live,playlist,admin}` but **not**
`/api/stages` or `/api/push/send`. Those are `requireDjAuth`-gated and Better Auth origin-validates cookie
sessions, so it's a defense-in-depth gap, not an open hole. Adding it needs per-caller verification first —
notably `POST /api/push/subscribe` is the **public** dancer endpoint (no auth) and must keep working.

---
*Last updated: June 30, 2026 — Better Auth adoption + harden pass. See `docs/blueprints/auth-foundation.md`.*
