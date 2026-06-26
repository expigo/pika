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
| Web Client | `3002` | Next.js Dev Server (`next dev --port 3002`) |
| Cloud API | `3001` | Bun Hot Reload |
| PostgreSQL | `5433` | Local Docker (`docker-compose.yml`, host `5433` → container `5432`) |

**Security Note:** Binding to `0.0.0.0` on public WiFi (coffee shops) is risky. Use `localhost` binding in those scenarios.

## 4. Environments & Ports

We follow a strict **Dev → Staging → Prod** promotion flow. Staging and Production
co-exist on the same VPS via distinct Compose project names and ports.

| Environment | Branch (trigger) | Web URL | API URL | Ports (web / cloud / db) | Compose file |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Staging** | `staging` | `https://staging.pika.stream` | `https://staging-api.pika.stream` | 4000 / 4001 / 5433 | `docker-compose.staging.yml` (project `pika-staging`) |
| **Production** | `main` | `https://pika.stream` | `https://api.pika.stream` | 3000 / 3001 / 5432 | `docker-compose.prod.yml` (default project) |

Staging uses a separate database (`pika_staging`) that can be reset freely.

## 5. Deployment Pipeline (GitHub Actions → GHCR → VPS pull)

> **Why pull, not build-on-box:** the VPS is a 1-vCPU / 4 GB Mikr.us host — far too small
> to build Next.js (an ~18-min, OOM-prone compile). So **images are built on GitHub runners
> and the VPS only pulls them.**

`deploy-staging.yml` (push to `staging`) runs **two jobs**:

1.  **`build`** (GitHub runner, multi-core):
    *   Logs in to **GHCR** with the run-scoped `GITHUB_TOKEN`.
    *   Builds the cloud + web images and pushes them as
        `ghcr.io/expigo/pika-{web,cloud}:staging` **and** `:<git-sha>` (immutable, for rollback).
    *   Web uses Next.js **standalone output** (`output: "standalone"`) → ~150 MB image instead
        of ~1.5 GB. `SENTRY_AUTH_TOKEN` is passed as a **BuildKit secret**, never baked into a layer.
2.  **`deploy`** (`needs: build`, via SSH to the VPS):
    *   `git reset --hard origin/<branch>` (to pick up compose/config), `docker login ghcr.io`,
        `docker compose pull`, then `docker compose up -d` (recreates only changed services; db untouched).
    *   **Health gate:** polls each container's healthcheck for ~2 min; if cloud + web don't both
        report `healthy`, it prints logs and **fails the deploy (red)**. A crash-looping container
        can no longer pass as a "successful" deploy.

**Schema migrations run automatically on boot:** the cloud image's entrypoint is
`bun run start:prod` (= `drizzle-kit migrate` then start). A failed migration aborts startup
(caught by the health gate) instead of serving a stale schema.

`deploy.yml` (push to `main`) targets Production with the same structure, prod build-args and
`:prod` image tags.
> ⚠️ **One-time (June-2026 squash):** the migration history was collapsed to a single baseline that
> assumes a **fresh** DB. A staging/prod Postgres still holding the **pre-squash** schema crash-loops
> migrate-on-boot with `relation "…" already exists`. While pre-launch (data disposable), reset it
> once — `bash scripts/reset-db.sh <staging|prod>` — see ops-manual →
> *Database migrations: pre-launch vs post-launch*.

## 6. Configuration Management

Runtime config is per-environment `.env` on the VPS (read by Docker Compose). Build-time config
for the web client is injected as **GitHub Actions secrets / build-args** in `deploy-*.yml`.

**Cloud Server (runtime — VPS `.env`):**
*   `DATABASE_URL` — Postgres connection string.
*   `PORT` — listen port (staging `4001` / prod `3001`).
*   `BETTER_AUTH_SECRET` — **required**; signs/verifies session tokens (`openssl rand -base64 32`).
    The cloud refuses to start without it (compose `:?` guard). `BETTER_AUTH_URL` defaults in
    compose to the env's API origin — override only if needed.
*   `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` / `TOKEN_ENCRYPTION_KEY` — Track D (Spotify web-DJ).
*   `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` — Web Push.
*   `SENTRY_DSN`, `SENTRY_ENVIRONMENT` — error tracking.

**Web Client (build-time — baked into the bundle by CI):**
*   `NEXT_PUBLIC_CLOUD_WS_URL` / `NEXT_PUBLIC_CLOUD_API_URL` — cloud endpoints.
*   `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY` — public client config.
*   `SENTRY_AUTH_TOKEN` — **build-only secret** (source-map upload), passed via BuildKit
    `--mount=type=secret`; never stored in the image or the runtime env.

## 7. Rollback

Every build is tagged `:<git-sha>` (immutable), so there are two paths:

**Clean (preferred)** — revert and let the pipeline redeploy a known-good state:
```bash
git revert <bad-commit> && git push origin staging   # (or main for prod)
```

**Instant (emergency), on the VPS** — retag a previous good SHA as the env tag and recreate:
```bash
cd /opt/pika/pika-staging
echo "$TOKEN" | docker login ghcr.io -u expigo --password-stdin
docker tag ghcr.io/expigo/pika-web:<GOOD_SHA>   ghcr.io/expigo/pika-web:staging
docker tag ghcr.io/expigo/pika-cloud:<GOOD_SHA> ghcr.io/expigo/pika-cloud:staging
docker compose -f docker-compose.staging.yml -p pika-staging up -d
```
Find `<GOOD_SHA>` in GitHub → Packages, or from the last green deploy.

## 8. Known Limitations

*   **Stateful Server:** the Cloud server holds active sessions in-memory (`Map<sessionId, Session>`).
    A redeploy recreates the cloud container, briefly dropping live WebSocket connections (clients
    auto-reconnect; DJ sessions are recoverable from the DB). Deploys are health-gated and
    near-zero-downtime (pull + recreate), but not yet *zero*-downtime.
*   **Single instance / no Redis:** broadcast pub/sub and all state are per-process, so the cloud
    cannot yet scale horizontally. Moving shared state + pub/sub to Redis/Valkey is the planned path
    to multi-instance, zero-downtime deploys.
