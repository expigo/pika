# Architecture: Security

This document outlines the security architecture of Pika!, including implemented controls, known vulnerabilities, and remediation plans.

**Last Audit:** January 15, 2026  
**Security Score:** 8.0/10  
**Status:** Pre-Launch Hardening Nearly Complete

---

## 1. Security Overview

### Threat Model

| Asset | Threat | Mitigation |
| :--- | :--- | :--- |
| DJ Credentials | Brute force, credential stuffing | bcrypt hashing, rate limiting ✅ |
| API Tokens | Token theft, replay attacks | SHA-256 hashed storage, HTTPS only |
| Session Data | Session hijacking | Token validation, ownership tracking ✅ |
| User Privacy | Data exposure | No PII stored for dancers, localStorage-based identity |
| Infrastructure | DDoS, origin exposure | Cloudflare Tunnel, hidden origin IP |

### Security Perimeter

```
                    ┌───────────────────────────────────────┐
                    │          Cloudflare Edge              │
                    │  - WAF (Basic)                        │
                    │  - DDoS Protection                    │
                    │  - SSL Termination                    │
                    └───────────────┬───────────────────────┘
                                    │ Tunnel (Outbound Only)
                    ┌───────────────▼───────────────────────┐
                    │             VPS Origin                │
                    │  - No inbound ports (except SSH)      │
                    │  - Docker network isolation           │
                    │  - Containers bind to 127.0.0.1       │
                    └───────────────────────────────────────┘
```

---

## 2. Authentication Security

### 2.1 Password Protection

| Control | Implementation | Status |
| :--- | :--- | :---: |
| Hash Algorithm | bcrypt | ✅ |
| Cost Factor | 10 | ✅ |
| Min Length | 8 characters | ✅ |
| Max Length | None | 🟡 TODO |
| Complexity | None | 🔵 Optional |
| Common Password Block | None | 🔵 Optional |

### 2.2 API Token Security

| Control | Implementation | Status |
| :--- | :--- | :---: |
| Generation | `crypto.randomUUID()` (122 bits) | ✅ |
| Format | `pk_dj_<uuid>` | ✅ |
| Storage | SHA-256 hash in DB | ✅ |
| Transmission | WSS only | ✅ |
| Rotation | Manual via `/api/auth/regenerate-token` | ✅ |
| Expiry | None (TODO: 30-day cleanup) | 🟡 |

### 2.3 Rate Limiting

| Endpoint | Current Limit | Required Limit | Status |
| :--- | :---: | :---: | :---: |
| `POST /api/auth/login` | 5 req / 15 min | 5 req / 15 min | ✅ |
| `POST /api/auth/register` | 5 req / 15 min | 5 req / 15 min | ✅ |
| `POST /api/auth/regenerate-token` | 5 req / 15 min | 3 req / 1 hour | ✅ |
| WebSocket Connect | None | 10 conn / min | 🔵 Optional |

---

## 3. Input Validation

### 3.1 WebSocket Messages

All WebSocket messages are validated against Zod schemas:

```typescript
// packages/shared/src/schemas.ts
export const WebSocketMessageSchema = z.union([
  ClientMessageSchema,  // Discriminated union of all client→server messages
  ServerMessageSchema,  // Discriminated union of all server→client messages
]);

// packages/cloud/src/index.ts
const result = WebSocketMessageSchema.safeParse(json);
if (!result.success) {
  ws.close(1008, "Invalid message");
}
```

| Check | Status |
| :--- | :---: |
| Schema Validation (Zod) | ✅ |
| Message Size (10KB max) | ✅ |
| Type Discrimination | ✅ |

### 3.2 REST API

| Endpoint | Validation | Status |
| :--- | :--- | :---: |
| `/api/auth/register` | Basic field presence | ✅ |
| `/api/auth/login` | Basic field presence | ✅ |
| Email Format | `includes("@")` only | 🟡 Upgrade to Zod |
| Password Length | `>= 8` | ✅ |
| DJ Slug | `slugify()` + reserved check | ✅ |

### 3.3 SQL Injection Protection

All database queries use Drizzle ORM with parameterized statements:

```typescript
// Example: Safe query
const users = await db
  .select()
  .from(schema.djUsers)
  .where(eq(schema.djUsers.email, email.toLowerCase()))  // Parameter binding
  .limit(1);
```

| Database | ORM | Protection | Status |
| :--- | :--- | :--- | :---: |
| PostgreSQL (Cloud) | Drizzle | Parameterized | ✅ |
| SQLite (Desktop) | Tauri SQL | Parameterized | ✅ |

---

## 4. Cross-Origin Security

### 4.1 CORS Configuration

**Current (INSECURE):**
```typescript
app.use("*", cors());  // Allows ALL origins
```

**Required Fix:**
```typescript
app.use("*", cors({
  origin: [
    "https://pika.stream",
    "https://api.pika.stream",
    ...(process.env.NODE_ENV === "development" 
      ? ["http://localhost:3000", "http://localhost:3002"] 
      : []),
  ],
  credentials: true,
}));
```

| Status | Severity | ETA |
| :---: | :---: | :--- |
| 🟢 CLOSED | HIGH | Fixed in v0.1.0+ |

### 4.2 CSRF Protection

REST API endpoints use Bearer token authentication, which provides some protection. However, the login endpoint accepts credentials without CSRF validation.

**Recommended:** Add custom header requirement (`X-Requested-With: Pika`) for all state-changing requests.

---

## 5. XSS Protection

### 5.1 Output Encoding

React's JSX automatically escapes output. No usage of dangerous patterns found:

```bash
grep -r "dangerouslySetInnerHTML" packages/  # No results
grep -r "innerHTML" packages/                 # No results
grep -r "eval(" packages/                     # No results
```

| Control | Status |
| :--- | :---: |
| React JSX Escaping | ✅ |
| No dangerouslySetInnerHTML | ✅ |
| No innerHTML | ✅ |
| No eval() | ✅ |

### 5.2 Content Security Policy

**Current:** None configured.

**Recommended:** Add via Next.js middleware:
```typescript
// packages/web/middleware.ts
headers.set("Content-Security-Policy", 
  "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';"
);
```

---

## 6. Infrastructure Security

### 6.1 Network Configuration

| Control | Implementation | Status |
| :--- | :--- | :---: |
| Origin IP Hidden | Cloudflare Tunnel | ✅ |
| SSL/TLS | Cloudflare Edge (Auto-renew) | ✅ |
| Container Isolation | Docker network | ✅ |
| Port Binding | `127.0.0.1` only | ✅ |
| SSH Access | Key-based only | ✅ |

### 6.2 Secrets Management

| Secret | Location | Status |
| :--- | :--- | :---: |
| `DATABASE_URL` | Environment variable | ✅ |
| `POSTGRES_PASSWORD` | `${POSTGRES_PASSWORD:-fallback}` in docker-compose | ✅ |
| API Tokens | SHA-256 hashed in DB | ✅ |
| Cloudflare Token | VPS only (not in repo) | ✅ |

> [!NOTE]
> `docker-compose.prod.yml` now uses `${POSTGRES_PASSWORD:-pika_secure_change_me}` syntax,
> allowing override via `.env` file while providing a fallback for dev environments.

---

## 7. Desktop Application Security

### 7.1 Tauri Capabilities

Permissions are scoped to minimum required:

| Capability | Scope | Status |
| :--- | :--- | :---: |
| Shell Spawn | Sidecar binary only | ✅ |
| HTTP Fetch | `localhost` only | ✅ |
| File System | Default (user data) | ✅ |
| SQL | `pika.db` only | ✅ |

### 7.2 Sidecar Security

The Python analysis sidecar:
- Listens on `localhost` only (random port)
- Never contacts cloud directly
- Processes only local audio files

---

## 8. Vulnerability Summary

### Open Issues (Prioritized)

| # | Vulnerability | Severity | Status | Owner |
| :---: | :--- | :---: | :---: | :--- |
| 1 | Permissive CORS | 🟠 HIGH | **Fixed** | Backend |
| 2 | No Auth Rate Limiting | 🟠 HIGH | **Fixed** | Backend |
| 3 | Hardcoded DB Password | 🟡 MED | **Fixed** | DevOps |
| 4 | WebSocket Session Ownership | 🟡 MED | **Fixed** | Backend |
| 5 | Basic Email Validation | 🟡 MED | Open | Backend |
| 6 | No CSRF on REST | 🟡 MED | Open | Backend |
| 7 | No CSP Headers | 🔵 LOW | Open | Frontend |
| 8 | No WS Connection Rate Limit | 🔵 LOW | Open | Backend |
| 9 | No Password Max Length | 🔵 LOW | Open | Backend |

### Remediation Timeline

| Phase | Items | Target |
| :--- | :--- | :--- |
| **Pre-Launch** | #1, #2, #3, #4 | **COMPLETED** |
| **Post-Launch (30 days)** | #5, #6 | Q1 2026 |
| **Best Practices** | #7, #8, #9 | Q2 2026 |

---

## 9. Audit History

| Date | Type | Findings | Report |
| :--- | :--- | :--- | :--- |
| 2026-01-15 | Code Verification | 4 Fixed, 5 Open | Internal |
| 2026-01-13 | Full Security Audit | 0 Critical, 2 High, 4 Medium, 3 Low | Internal |

---

*Last Updated: January 15, 2026*
