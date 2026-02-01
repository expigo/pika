# Architecture: Authentication System

This document describes the *current* implementation of the Authentication System in Pika!, which handles DJ identity and API security.

## 1. Overview

The authentication system is currently focused solely on **DJ Accounts**.
*   **Purpose:** To verify DJ identity, prevent session spoofing, and allow DJs to manage their "Slug" (URL).
*   **Listeners:** Listeners (Dancers) remain **anonymous** (identified by a persistent `clientId` stored in localStorage).

## 2. Technical Stack

*   **Location:** `packages/cloud/src/routes/auth.ts` (Auth Logic) and `packages/cloud/src/db/schema.ts` (Data Model).
*   **Hashing:**
    *   **Passwords:** `bcrypt` (Cost 10) via `Bun.password`.
    *   **API Tokens:** `SHA-256` (stored hash) for high-entropy tokens.
*   **Transport:** Tokens are sent in the WebSocket `REGISTER_SESSION` payload or via `Authorization: Bearer <token>` for REST.

## 3. Data Model

```typescript
export const djUsers = pgTable("dj_users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name").notNull(),
  slug: text("slug").notNull().unique(),
});

export const djTokens = pgTable("dj_tokens", {
  id: serial("id").primaryKey(),
  djUserId: integer("dj_user_id").notNull().references(() => djUsers.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(), // Hashed (SHA-256)
  name: text("name").default("Default"),
  lastUsed: timestamp("last_used"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

*   **Note:** We store the *Hash* of the API token, not the token itself. This means if the DB is leaked, API keys cannot be reverse-engineered easily.

## 4. Auth Flow

1.  **Registration:**
    *   `POST /api/auth/register` (Email, Password, Display Name, Slug).
    *   Server creates user + generates initial API Token.
    *   Returns `{ user, token }`.
2.  **Login:**
    *   `POST /api/auth/login` (Email, Password).
    *   Server validates bcrypt hash.
    *   **Always generates a NEW token** and returns `{ user, token }`. Multiple active tokens per DJ account are supported (M7).
3.  **Session Start:**
    *   Desktop Client allows user to input API Token.
    *   WebSocket `REGISTER_SESSION` message includes `{ token: "pk_dj_..." }`.
    *   Server validates token hash.
    *   If valid: Session is marked `authenticated: true`, `djUserId` is linked.
    *   If invalid: Session falls back to **Anonymous Mode** (warns in logs).

## 5. Security Measures

### ✅ Implemented (Verified Feb 2026 Audit - v0.4.0)

| Measure | Status | Details |
| :--- | :---: | :--- |
| **Token Entropy** | ✅ Pass | `pk_dj_<uuid>` format via `crypto.randomUUID()`. |
| **Password Hashing** | ✅ Pass | bcrypt cost 10 via `Bun.password.hash()`. |
| **Token Storage** | ✅ Pass | SHA-256 hashed before DB storage. Raw token never stored. |
| **Rate Limiting** | ✅ Pass | `hono-rate-limiter` active (5 req/15min) on all auth routes. |
| **CORS Restriction** | ✅ Pass | Restricted to `pika.stream` and verified origins in production. |
| **Email Validation** | ✅ Pass | Strict Zod `.email()` validation. |
| **CSRF Protection** | ✅ Pass | Multi-layered: `X-Requested-With: Pika` (Auth) + `X-Pika-Client` (State). |

### Implementation: Rate Limiting

```typescript
// packages/cloud/src/index.ts
import { rateLimiter } from "hono-rate-limiter";

const authLimiter = rateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 5,
  keyGenerator: (c) => c.req.header("CF-Connecting-IP") || c.req.header("X-Forwarded-For") || "unknown",
});

app.post("/api/auth/login", authLimiter, async (c) => { ... });
app.post("/api/auth/register", authLimiter, async (c) => { ... });
```

### Global CSRF Shield
The system uses a unique tiered defense:
1.  **Auth Layer:** Requires `X-Requested-With: Pika` on Login/Register.
2.  **Global Layer:** Requires `X-Pika-Client` (valid values: `pika-web`, `pika-desktop`) for all POST/PUT/DELETE requests in `index.ts`.

## 6. Known Limitations & Vulnerabilities

### Functional Limitations
*   **No Email Verification:** Users can register with fake emails.
*   **No Password Reset:** If a DJ forgets their password, they are locked out (needs manual DB intervention).
*   **Single Role:** Only "DJ" role exists. No Admins or Organizers yet.
*   **Password Complexity:** Only minimum length (8) enforced. No max length or blocklist.

### Security Vulnerabilities (Feb 2026 Audit - v0.4.0)

| Vulnerability | Risk | Status | Remediation |
| :--- | :---: | :---: | :--- |
| **No Email Verification** | � Med | Open | Plan for Magic Link or OTP verification. |
| **No Password Reset** | � Med | Open | Requires DJ management dashboard. |
| **Secrets in Version Control** | 🟡 Med | Open | Auditing `.env.example` vs Production secrets. |
| **Brute Force Login** | ✅ Resolved | Closed | Rate limiting implemented. |
| **Cross-Origin Requests** | ✅ Resolved | Closed | CORS strictly restricted. |

## 7. Audit History

| Date | Auditor | Scope | Findings |
| :--- | :--- | :--- | :--- |
| **2026-02-01** | Antigravity | v0.4.0 Audit | All high-risk auth flags resolved. Modularized auth routes. |
| **2026-01-13** | Security Lead | Full codebase | 0 Critical, 2 High, 4 Medium, 3 Low |

---

*Last Updated: February 1, 2026 (v0.4.0 - Onboarding & Intelligence Release)*
