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

*   **Token Format:** `pk_dj_<uuid_no_dashes>` (High entropy).
*   **Rate Limiting:** Use of `SHA-256` ensures token validation is fast (<1ms) compared to bcrypt (>100ms), preventing DoS on the WebSocket handshake.

## 6. Known Limitations

*   **No Email Verification:** Users can register with fake emails.
*   **No Password Reset:** If a DJ forgets their password, they are locked out (needs manual DB intervention).
*   **Single Role:** Only "DJ" role exists. No Admins or Organizers yet.
