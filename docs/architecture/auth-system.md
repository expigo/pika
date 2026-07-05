# Architecture: Authentication System

Describes the *current* authentication/authorization in Pika!. The cloud's auth authority is
**[Better Auth](https://better-auth.com)** (adopted June 2026, replacing the former custom bcrypt/
SHA-256-token system). Design rationale: `docs/blueprints/auth-foundation.md`.

## 1. Overview
- **DJs / admins** authenticate with **email + password** → a Better Auth **session**. The web uses a
  **cookie** session; the **Tauri desktop** uses a **bearer token** (Better Auth `bearer` plugin).
- **Dancers stay anonymous by default** — identified by a persistent `clientId` in localStorage.
  **Optionally** (Slice B, July 2026) a dancer saves their Journal with a **magic-link account**
  (email, no password): the HttpOnly session cookie is the ITP-exempt durable anchor, and each
  device's `clientId` is lazily **claimed** into `client_identities` (first-claim-wins; the losing
  device rotates — kiosk rule). Deliberately NOT the Better Auth anonymous plugin: liking never
  requires an account and the live like pipeline is untouched.
- **Approval gate:** new accounts are `status: 'pending'`; protected DJ routes require `'approved'`.
- **Roles:** `dj` (default), `admin`, and `dancer` (magic-link-born, auto-`approved`, zero DJ
  permissions). RBAC, not a policy engine.

## 2. Technical stack
- **Server instance:** `packages/cloud/src/lib/auth/server.ts` — `betterAuth({...})` with the
  **Drizzle/Postgres** adapter, `emailAndPassword`, plugins
  `[bearer(), admin({ ac, roles:{dj,admin,dancer} }), magicLink({ expiresIn: 600 }), emailOTP]`
  (OTP sends **sign-in codes only** — the plugin's email-verification/password-reset types are
  never sent, keeping those routes dead; codes exist because an installed PWA's cookie jar is
  unreachable by mailed links),
  `trustedOrigins` (web origins; bearer is origin-exempt), a `databaseHook` that derives `slug` from
  the display name on signup (null-safe — magic-link users have no name), a `hooks.after` on
  `/magic-link/verify` that patches magic-link-born users to `role='dancer', status='approved'`
  (predicate: **no credential account row** — a DJ who magic-links is never demoted), and
  `user.deleteUser` (GDPR — email-confirmed).
- **Transactional email:** `lib/services/mail.ts` (Resend; keyless dev logs the link —
  `📧 [mail-fallback]`; keyless prod throws) behind `lib/services/email-throttle.ts`:
  per-address 3/h per kind (silent skip — anti-enumeration) + a process-wide daily fuse
  (`MAIL_DAILY_CAP`, default 200; trips loudly).
- **Handler mount:** `app.on(["POST","GET"], "/api/auth/*", (c) => auth.handler(c.req.raw))` in `index.ts`
  — Better Auth owns sign-up/in/out/session/admin/magic-link endpoints + its own origin-based CSRF and
  per-IP rate limiter (prod; `customRules` tighten `/sign-in/magic-link` + `/delete-user` to 10/10 min,
  keyed on `cf-connecting-ip` first to match the app convention behind the Cloudflare tunnel).
- **Guards:** `packages/cloud/src/lib/auth.ts` — `hasDjAccess` (pure: `approved` **AND** role ∈
  {dj, admin}) behind `requireDjAuth` (401 / 403); `requireAuth` (401-only, any role — the `/api/me`
  account surface); `requireRole(role,{hideExistence})` / `requireAdmin` (admin → 404 on mismatch so the
  panel's existence isn't leaked); `getUserFromToken` (WS `REGISTER_SESSION` — non-DJ tokens fall back to
  anonymous). `resolveUser` accepts a cookie session OR an `Authorization: Bearer` token.
- **Permissions:** `packages/cloud/src/lib/auth/permissions.ts` — access-control roles for the admin
  plugin (`dancer` is an empty role).
- **Identity seam:** `lib/services/identity.ts` — `claimClientId` (INSERT … ON CONFLICT DO NOTHING →
  `claimed | already_yours | conflict`), `getClaimedClientIds` (adopt-first ordering), `maskClientId`
  (logs never carry the full bearer id). Claim endpoint: `POST /api/me/journal/claim`.

## 3. Data model
Better Auth owns `user` / `session` / `account` / `verification` (`packages/cloud/src/db/auth-schema.ts`,
CLI-generated). Pika specifics on `user`: `status` (`pending`|`approved`|`rejected`), `role`
(`dj`|`admin`|`dancer`), `slug` (`/dj/[slug]`, null for dancers). FK columns across the schema
(`sessions.djUserId`, `spotify_connections`, `curated_tracks`, …) reference `user.id` (text). The former
`dj_users`/`dj_tokens` tables are gone.

Slice B adds (migration `0012`): **`client_identities`** (`client_id` PK → `user_id` FK **cascade**,
`claimed_at`, + `label` from `0013` — UA-derived "iPhone · Safari", refreshed on claim touch) — the
lazy device↔account claim map; account deletion cascades it and likes revert to anonymous per-device
rows. Per-device **unlink** (`DELETE /api/me/journal/devices/:clientId`, owner-scoped) drops one
device from the union non-destructively. **`journal_playlists.user_id`** (nullable FK **set null** +
partial unique) — one account playlist, adopt-first from the earliest-claimed device row.

## 4. Auth flow
1. **Sign up** — `POST /api/auth/sign-up/email` → creates a `user` (`status='pending'`, `role='dj'`,
   `slug` from name) + session; returns a session token (also usable as a bearer token).
2. **Sign in** — `POST /api/auth/sign-in/email` → sets the cookie session (web) / returns the bearer token
   (`set-auth-token`, desktop).
3. **Protected REST** — guards call `auth.api.getSession({ headers })`; `requireDjAuth` 401s no-session,
   403s a non-`approved` user; `requireAdmin` 404s a non-admin.
4. **WebSocket** — `REGISTER_SESSION` carries the bearer token → `getUserFromToken` resolves the user and
   links `djUserId` (else the session falls back to anonymous).
5. **Admin/approval** — admins approve/reject DJs in-app via `/api/admin/djs/:id/{approve,reject}` (audited;
   dancers are excluded from the queue); first admin is a bootstrap DB update.
6. **Dancer magic link** (Slice B) — `POST /api/auth/sign-in/magic-link` (web `/my-likes/save`) → email via
   Resend → `GET /api/auth/magic-link/verify?token=…` on the target device → session cookie + role patch →
   redirect to `/my-likes?claimed=1` → the page claims the device's `clientId`
   (`POST /api/me/journal/claim`; 409 → rotate id + re-claim + push re-subscribe). Sign-out rotates the
   device id (kiosk rule). Deletion: `authClient.deleteUser` → confirm email → `client_identities` cascade.
7. **Dancer email OTP** (B.5 — the installed-PWA path) — `/my-likes/save` defaults to the code flow under
   standalone display-mode: `POST /api/auth/email-otp/send-verification-otp` → 6-digit code typed in the
   app → `POST /api/auth/sign-in/email-otp` → same role-patch hook + claim flow as the link. Link and OTP
   share ONE per-address send budget.

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
| Role gate on DJ surfaces | ✅ | `hasDjAccess` — an approved **dancer** is still 403'd everywhere a DJ
  token is required (REST + WS `REGISTER_SESSION` + sync-fingerprints). |
| Rate limiting | ✅ | Better Auth built-in (prod, `customRules` on email-sending paths) +
  `hono-rate-limiter` on admin/playlist/me routers. |
| Email abuse (M1) | ✅ | Per-address throttle (silent skip) + daily fuse (loud) + per-IP rules — see §2;
  config-pinned by `lib/auth/server.test.ts`. |
| Bearer ids in logs | ✅ | `maskClientId` — the 122-bit journal credential never lands in logs verbatim. |

## 6. Known limitations (deferred to pilot-prep — auth-foundation §7)
- **DJ password reset / email verification** still unwired — the transport now exists (Resend, Slice B);
  wiring the DJ-side flows is a small follow-up.
- **No organization plugin** (organizer + event/stage ownership/invites) — events carry `ownerUserId` but
  org membership/roles aren't modeled yet.
- **Anonymous plugin** — RESOLVED differently (Slice B): dancer accounts use magic link + the lazy
  `client_identities` claim map instead; the plugin path is retired. Revisit the role-patch
  credential-absence predicate if a social login provider is ever added.

## 7. CSRF coverage note (open follow-up)
`csrfCheck` (the `X-Pika-Client` requirement on non-GET) guards `/api/{live,playlist,admin}` but **not**
`/api/stages` or `/api/push/send`. Those are `requireDjAuth`-gated and Better Auth origin-validates cookie
sessions, so it's a defense-in-depth gap, not an open hole. Adding it needs per-caller verification first —
notably `POST /api/push/subscribe` is the **public** dancer endpoint (no auth) and must keep working.
`/api/email` (Slice C) is **deliberately** CSRF-exempt: the one-click POST comes from the recipient's
mail provider (RFC 8058) and the HMAC token itself is the authorization.

## 8. Marketing-email consent (Slice C)
Distinct from the transactional flows above — recap/digest emails are **marketing** under EU rules:
- **Consent** lives in `email_preferences` (one row per account; `recap_opt_in_at` /
  `digest_opt_in_at` **timestamps are the consent proof**, null = off). Deliberately NOT Better Auth
  additionalFields: those don't apply on magic-link signups, so consent is always an explicit authed
  write (`PUT /api/me/preferences`) — never a signup side effect, never pre-ticked. The digest key is
  `hasDjAccess`-gated (403 for dancers).
- **Throttle isolation:** marketing sends run on their OWN `createEmailThrottle` instance
  (`MARKETING_MAIL_DAILY_CAP`, default 500; per-address 2/24h). Budgets are per-instance, so recap
  volume can never trip the transactional fuse — its alert keeps meaning "sign-ins are failing".
- **Unsubscribe tokens:** `base64url(userId|type)` + HMAC-SHA256 (`BETTER_AUTH_SECRET`, context
  prefix `pika-unsub-v1`), no expiry — the token's only power is turning one email type off. Every
  marketing send carries `List-Unsubscribe` + `List-Unsubscribe-Post: List-Unsubscribe=One-Click`
  (message headers) and a Resend `Idempotency-Key` (HTTP request header — API-level dedup).
- **GDPR:** `email_preferences` and `dj_follows` FK-cascade on user deletion, so the Slice B
  deletion flow needs no changes.

---
*Last updated: July 5, 2026 — Slice C: dancer→DJ follows, marketing-email consent + one-click
unsubscribe, recap sweep. Previously: Slice B (magic-link accounts, `client_identities` claims,
GDPR deletion, email-abuse hardening). See `docs/blueprints/auth-foundation.md` for the rationale.*
