# Pika! Cloud Server

The backend hub powered by **Bun** and **Hono**.

## Features
*   **WebSocket Server:** Real-time bi-directional communication (DJ <-> Dancers).
*   **REST API:** Auth, session management, and HTTP fallback.
*   **Database:** PostgreSQL (via Drizzle ORM).

## 🗄️ Database

We use **PostgreSQL** (local Docker for dev, Turso/Neon/VPS for prod).

**Commands:**
```bash
# Generate migrations
bun run db:generate

# Apply migrations
bun run db:migrate

# Open Drizzle Studio (DB UI)
bun run db:studio
```

## 🚀 API Overview

### WebSocket (`/ws`)
*   **DJ Messages:** `REGISTER_SESSION`, `NOW_PLAYING`, `POLL_CREATE`.
*   **Client Messages:** `SUBSCRIBE`, `SEND_LIKE`, `SEND_VOTE`.

### Auth
*   **Session-based:** DJs authenticate via Tokens headers.
*   **Anonymous:** Dancers are identified by a generated `clientId`.

## 📦 Deployment
See `docs/architecture/deployment.md` for full details on the VPS + Cloudflare Tunnel setup.
