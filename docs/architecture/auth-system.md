# Architecture: Authentication System

This document describes the *current* implementation of the Authentication System in Pika!, which handles DJ identity and API security.

## 1. Overview

The authentication system is currently focused solely on **DJ Accounts**.
*   **Purpose:** To verify DJ identity, prevent session spoofing, and allow DJs to manage their "Slug" (URL).
*   **Listeners:** Listeners (Dancers) remain **anonymous** (identified by a persistent `clientId` stored in localStorage).

## 2. Technical Stack

*   **Location:** `packages/cloud/src/index.ts` (API Endpoints) and `packages/cloud/src/db/schema.ts` (Data Model).
*   **Hashing:**
    *   **Passwords:** `bcrypt` (Cost 10) via `Bun.password`.
    *   **API Tokens:** `SHA-256` (Fast hashing for high-entropy tokens).
*   **Transport:** Tokens are sent in the WebSocket `REGISTER_SESSION` payload.

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
  djUserId: integer("dj_user_id"),
  token: text("token").notNull().unique(), // Hashed (SHA-256)
  name: text("name").default("Default"),
  lastUsed: timestamp("last_used"),
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
    *   Returns `{ user, token }` (Generates new token if needed, or returns existing?). *Note: Code review needed to confirm if it returns a stored token or generates a session token.*
3.  **Session Start:**
    *   Desktop Client allows user to input API Token.
    *   WebSocket `REGISTER_SESSION` message includes `{ token: "pk_dj_..." }`.
    *   Server validates token hash.
    *   If valid: Session is marked `authenticated: true`, `djUserId` is linked.
    *   If invalid: Session falls back to **Anonymous Mode** (warns in logs).

## 5. Security Measures

### ✅ Implemented (Verified Jan 2026 Audit)

| Measure | Status | Details |
| :--- | :---: | :--- |
| **Token Entropy** | ✅ Pass | `pk_dj_<uuid>` format provides 122 bits of entropy via `crypto.randomUUID()`. |
| **Password Hashing** | ✅ Pass | bcrypt cost 10 via `Bun.password.hash()`. Industry standard. |
| **Token Storage** | ✅ Pass | SHA-256 hashed before DB storage. Raw token returned only once. |
| **SQL Injection** | ✅ Pass | All queries use Drizzle ORM with parameterized statements. |
| **Slug Validation** | ✅ Pass | Reserved slugs blocked (`admin`, `api`, `live`, etc.). |

### 🚨 Required Fixes (Pre-Launch)

| Issue | Severity | Fix | Location |
| :--- | :---: | :--- | :--- |
| **No Rate Limiting** | 🟠 HIGH | Add `hono-rate-limiter` (5 req/15min per IP). | `/api/auth/*` |
| **Permissive CORS** | 🟠 HIGH | Restrict origins to `pika.stream` only. | `app.use("*", cors())` line 24 |
| **Basic Email Check** | 🟡 MED | Only checks for `@`. Use Zod `.email()`. | `index.ts` line 612 |
| **No CSRF on REST** | 🟡 MED | Add custom header check or SameSite cookies. | Auth endpoints |

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

### Implementation: CORS Restriction

```typescript
// packages/cloud/src/index.ts (replace line 24)
app.use("*", cors({
  origin: [
    "https://pika.stream",
    "https://api.pika.stream",
    ...(process.env.NODE_ENV === "development" ? ["http://localhost:3000", "http://localhost:3002"] : []),
  ],
  credentials: true,
}));
```

## 6. Known Limitations & Vulnerabilities

### Functional Limitations
*   **No Email Verification:** Users can register with fake emails.
*   **No Password Reset:** If a DJ forgets their password, they are locked out (needs manual DB intervention).
*   **Single Role:** Only "DJ" role exists. No Admins or Organizers yet.
*   **Password Complexity:** Only minimum length (8) enforced. No max length or blocklist.

### Security Vulnerabilities (Jan 2026 Audit)

| Vulnerability | Risk | Status | Remediation |
| :--- | :---: | :---: | :--- |
| **Brute Force Login** | 🟠 High | Open | Add rate limiting (5 req/15min). |
| **Cross-Origin Requests** | 🟠 High | Open | Restrict CORS origins. |
| **WebSocket Session Spoofing** | 🟡 Med | Open | Track connection ownership. |
| **Secrets in Version Control** | 🟡 Med | Open | Move DB password to env vars. |

## 7. Audit History

| Date | Auditor | Scope | Findings |
| :--- | :--- | :--- | :--- |
| **2026-01-13** | Security Lead | Full codebase | 0 Critical, 2 High, 4 Medium, 3 Low |

---

*Last Updated: January 13, 2026*
