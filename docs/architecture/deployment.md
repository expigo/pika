# Architecture: Deployment & Infrastructure

This document describes the *current* and *verified* deployment architecture for Pika!.

## 1. Overview

Pika! is a distributed application with three distinct components:
1.  **Desktop App:** (Client-side) Runs on the DJ's laptop (Tauri). Built via **PyInstaller + Tauri** (Requires GitHub Actions Matrix for Cross-Platform support).
2.  **Web Client:** (Client-side) Runs on dancers' phones (Next.js PWA).
3.  **Cloud Server:** (Server-side) Central hub for WebSockets and API (Bun).

## 2. Production Architecture (VPS + Cloudflare Tunnel)

We use a **VPS** (Virtual Private Server) protected by a **Cloudflare Tunnel**. This avoids opening inbound firewall ports and provides free SSL.

```
┌───────────────────────────────────────────────────────────────┐
│                      mikr.us VPS (IPv6)                       │
│                                                               │
│    ┌─────────────────────────────────────────────────────┐    │
│    │               cloudflared (Daemon)                  │    │
│    │                                                     │    │
│    │   Establishes secure OUTBOUND tunnel to Cloudflare  │    │
│    │   (No incoming open ports required)                 │    │
│    └────────┬──────────────────────┬─────────────────────┘    │
│             │                      │                          │
│             ▼                      ▼                          │
│    ┌────────────────┐      ┌────────────────┐                 │
│    │   pika-cloud   │      │    pika-web    │                 │
│    │   (Docker)     │      │    (Docker)    │                 │
│    │   :3001        │      │    :3000       │                 │
│    └────────┬───────┘      └───────┬────────┘                 │
│             │                      │                          │
│             ▼                      │                          │
│    ┌────────────────┐              │                          │
│    │   PostgreSQL   │              │                          │
│    │   :5432        │              │                          │
│    └────────────────┘              │                          │
│                                    │                          │
└────────────────────────────────────┼──────────────────────────┘
                                     │
                                     │ HTTPS
                          ┌──────────┴──────────┐
                          │    Users / Dancers  │
                          └─────────────────────┘
```

### Key Benefits
*   **Security:** Origin server IP is hidden.
*   **IPv6 Bridge:** VPS is IPv6-only, but Cloudflare makes it accessible to IPv4 clients.
*   **SSL:** Auto-renewing certificates managed by Cloudflare Edge.

## 3. Development Environment

In development, we bind to `0.0.0.0` (All Interfaces) to allow testing on mobile devices on the same LAN.

| Service | Port | Notes |
|---------|------|-------|
| Web Client | `3000` | Next.js Dev Server |
| Cloud API | `3001` | Bun Hot Reload |
| PostgreSQL | `5432` | Local Docker |

**Security Note:** Binding to `0.0.0.0` on public WiFi (coffee shops) is risky. Use `localhost` binding in those scenarios.

## 4. Staging Environment (CI/CD Testing)

We adhere to a strict **Dev -> Staging -> Prod** workflow.

*   **URL:** `https://staging-api.pika.dance` (Example)
*   **Trigger:** Push to `dev` branch.
*   **Database:** Separate Staging Database (reset often).
*   **Purpose:** Integration testing before Production deployment.

## 5. Configuration Management

Configuration is handled via Environment Variables.

**Cloud Server (`packages/cloud/.env`):**
*   `DATABASE_URL`: Connection string for Postgres.
*   `PORT`: Port to listen on (default 3001).
*   `CORS_ORIGIN`: Allowed origins for WebSocket connection.
*   `SENTRY_DSN`: Sentry project DSN for error tracking.

**Web Application (`packages/web/.env`):**
*   `NEXT_PUBLIC_CLOUD_WS_URL`: WebSocket endpoint (e.g. `wss://api.pika.dance/ws`).
*   `NEXT_PUBLIC_CLOUD_API_URL`: REST API endpoint.
*   `NEXT_PUBLIC_SENTRY_DSN`: Public DSN for client-side errors.
*   `SENTRY_AUTH_TOKEN`: (Build time only) For source map upload.

## 6. CI/CD (GitHub Actions)

We have automated workflows in `.github/workflows/`:
*   `deploy.yml`: Deploys to Production on push to `main`.
    *   *Note:* Should include **Entrypoint Migrations** (`bun run db:migrate`) before app startup to avoid race conditions.
*   `deploy-staging.yml`: Deploys to Staging environment.

## 7. Known Limitations

*   **Stateful Server:** The Cloud server currently stores Active Sessions in-memory (`Map<sessionId, Session>`). Re-deploying causes a brief interruption and loss of active session connections (though they auto-reconnect).
*   **Redis Missing:** We plan to move session state to Redis to allow zero-downtime deployments.
