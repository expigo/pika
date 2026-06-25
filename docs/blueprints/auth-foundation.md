# Blueprint: Auth Foundation (Authentication & Authorization)

**Status:** Assessment + recommendation. Decision pending owner sign-off; not yet built.
**TL;DR recommendation:** **Adopt Better Auth now** (while there are zero prod users) as the cloud's
auth authority — credential + session + bearer, Drizzle/Postgres. Model **admin / organizer**
roles and **anonymous (optional) dancers** via its plugins. Keep authorization as **RBAC** (no
policy engine yet). Treat it as a focused 2–3-session workstream, NOT a sprawling account system.

---

## 1. Why this came up
Pika has a *custom but reasonable* auth (Bun bcrypt passwords, SHA-256 tokens, httpOnly cookie
session, CSRF, rate-limit) and a just-added `role` column + `requireRole` gate (admin panel).
Question: roll our own RBAC/ABAC further, or adopt an off-the-shelf open-source solution — and,
given **no prod users yet**, should we set up auth/authz *properly now* to avoid shipping security
gaps to clients? Constraint: **dancer sign-up must stay optional** (anonymous-first).

## 2. The deciding argument — cost asymmetry (do it NOW)
Auth is foundational infrastructure you migrate **rarely and painfully**:
- **Later** (real DJs exist): swapping the auth layer means forced password resets, token/session
  invalidation, user disruption, data migration under load — one of the worst migrations there is.
- **Now** (only test accounts): a greenfield swap with **zero user impact** — the cheapest it will
  ever be.
- **Selling to clients (organizers):** maintained auth (password reset, email verification,
  MFA-ready, secure session rotation) is a **security/credibility floor**. Our custom auth lacks
  most of these.
- This does **not** contradict "validate before building features" (see [[next-step-decision-jun2026]]):
  that targets *speculative features* (Charts/etc.). Auth isn't speculative — every version needs
  it — and the build-now cost ≪ build-later cost. Different calculus from a feature.

## 3. Build vs buy — scored (Pika reality: TS/Bun/Hono/Drizzle/Postgres, self-host on a 4 GB VPS, pre-pilot)

| Option | Type | Stack fit | Security | Ops | Now | Future | Verdict |
|---|---|:--:|:--:|:--:|:--:|:--:|---|
| Keep `role`+`requireRole` | RBAC in-code | 10 | 7 | 10 | 9 | 6 | Fine for *today's* single role; doesn't close auth gaps. |
| **Better Auth** | Auth library | **10** | 8 | 9 | 7 | **9** | **Best fit.** In-process (no new service), Drizzle, Bearer+cookie, org/admin/anonymous plugins. Rework cost is the catch. |
| Casbin | Authz lib (Node) | 9 | 7 | 9 | 5 | 8 | Lightest real authz engine; add only if RBAC/ABAC gets complex. |
| Cerbos | Authz PDP (sidecar) | 6 | 8 | 5 | 4 | 8 | Pro ABAC policy-as-code, but a separate service; weak ReBAC. |
| OpenFGA / SpiceDB | ReBAC (Zanzibar) | 6 | 9 | 4 | 3 | 9 | "Correct" for event-scoped perms, but a whole service+store. Premature. |
| Oso | Policy lib (Polar) | 7 | 7 | 7 | 4 | 6 | OSS waning (company → Oso Cloud). Skip for OSS-first. |
| Auth.js / NextAuth | Auth library | 6 | 8 | 8 | 4 | 6 | Next-centric; Pika's auth authority is the Hono **cloud**, not Next. Poor fit. |
| Keycloak / Zitadel / Ory / Logto | Self-hosted IdP | 4–6 | 9 | 3–5 | 2–3 | 8 | Enterprise OIDC/SAML, but operationally disproportionate for this product/host. |
| Lucia | — | — | — | — | — | — | **Dead** (sunset Mar 2025 → points to Better Auth). |

## 4. Why Better Auth fits Pika unusually well (verified Jun 2026)
- **Stack:** TS-native; **Hono** integration (`auth.handler(c.req.raw)` on `/api/auth/*`); Bun;
  **Drizzle/Postgres** adapter → drops into the existing cloud, no separate service.
- **3-client topology:** **Bearer** plugin (Tauri desktop) **+ cookie** sessions (web), one cloud
  authority. Maps onto Pika's desktop-bearer / web-cookie split.
- **Built-in:** credential auth, sessions, **email verification**, **password reset**, MFA/passkeys-ready.
- **Organization** plugin → organizer + event/stage ownership + invites + roles.
- **Admin** plugin → user management / ban / impersonate → the admin panel **and in-app role
  management** (so DB-SQL is bootstrap-only — see §6).
- **Anonymous plugin + `onLinkAccount`** → **the optional-dancer requirement**: dancers stay
  anonymous (an anonymous session replacing the raw `clientId`), and may *optionally* upgrade; the
  callback migrates their likes/tempo/history to the new account. Cleaner + future-proof.

## 5. Authorization stance
RBAC via Better Auth roles/org covers admin/organizer/dancer **now**. **Defer** ReBAC/policy
engines (OpenFGA/Cerbos): event-scoped permissions ("organizer of *this* event") can layer later —
Better Auth org access-control covers org-scoping; only add OpenFGA if relationship-scoping gets
genuinely complex. **Don't add an authz engine *and* Better Auth prematurely.**

## 6. First-admin / role creation (answers "is DB the only way?")
DB `UPDATE` should be **bootstrap-only** (the first admin — unavoidable chicken-and-egg). All
subsequent admin/organizer grants go **in-app, audited** — exactly what Better Auth's **admin
plugin** provides. (Custom-path alternatives if we defer Better Auth: an env-driven
`BOOTSTRAP_ADMIN_EMAIL` seed, or a `grant-admin.ts` script — both auditable, no prod SQL.)

## 7. Scope (focused — NOT a full account system)
**In:** Better Auth as cloud auth authority (credential + session + bearer); migrate
`dj_users`/`dj_tokens`/cookie-session onto its schema; **admin** role + admin plugin (rework the
admin gate); **organization** scaffolding for organizer/events; **anonymous** plugin for optional
dancers (migrate `clientId` → anonymous session + link likes/history); password reset + email
verification.
**Out / defer:** MFA/passkeys (BA-ready — flip on later), social OAuth login, ReBAC engine, full
organizer UI, desktop OAuth beyond bearer parity.

## 8. Migration plan (greenfield — no prod users)
- Drop/remap: `dj_users` → BA `user`/`account`; `dj_tokens` → BA sessions/bearer; cookie session →
  BA session. Re-point Track D (`spotify_connections`, `live_pollers`, `role`) onto the new user id.
- Desktop: swap the copy-token model for BA's Bearer plugin (token parity).
- **Rework honesty:** the auth *substrate* of Track D (`requireDjAuth`, cookie helpers) + the admin
  `requireRole` gate get redone on Better Auth. The **business logic** (poller, approval, overview,
  broadcast) is untouched. Doing this now (zero users) is far cheaper than after launch.

## 9. Cost / risk
A few focused sessions; real integration work across desktop + cloud + web. Main risk is **scope
creep** into a full identity system — discipline: only §7. Coordinate the 3 clients.

## 10. Recommendation
**Do it now, scoped to §7.** The cost-asymmetry + greenfield state + selling-to-clients bar + how
well Better Auth fits (esp. the anonymous plugin for optional dancers) make this the right time.
**Next step:** a dedicated blueprint → plan → 2–3 build sessions for the Auth Foundation workstream.

## Related
- Build-vs-buy detail: this doc §3. Roles/admin already shipped (custom) on branch
  `worktree-music-provider-blueprint` — this would migrate them onto Better Auth.
- [[music-api-integration-constraints]] (Track D — the auth substrate this reworks).
- account-system-vision (`docs/blueprints/account-system-vision.md`) — the broader identity work
  this foundation seeds.
