# Pika! Operations Manual & Cheatsheet

This document serves as the primary reference for operating, deploying, and debugging Pika! in both Development and Production environments.

---

## 🛠️ Development Environment (Local)

### 🚀 Starting the App
Run the entire stack (Desktop, Web, Cloud, DB) from the root using Bun:

```bash
# Start the backend services (Cloud + DB + Web + Shared)
bun run dev

# Start the Desktop App (Tauri)
bun run --filter @pika/desktop tauri dev
```

### 🗄️ Database (Local)
The local environment uses a Postgres instance via Docker (port 5433).

**Inspect DB (Drizzle Studio):**
```bash
# Opens a web UI to view/edit local DB data
cd packages/cloud
bun run db:studio
```

**Database Migration Workflow:**
```bash
cd packages/cloud

# 1. GENERATE migration from schema changes (creates SQL file in drizzle/)
bun run db:generate

# 2. APPLY migrations to database
bun run db:migrate

# 3. (Dev only) PUSH schema directly (bypasses migration files - NOT for production!)
# bun run db:push  # ⚠️ Use only for rapid prototyping
```

**Important:** Migration files in `drizzle/*.sql` MUST be committed to git — they are the source of truth for the schema.

> ⚠️ **The migration history was squashed (June 2026, pre-launch).** The old `0000–0008` files
> (a drifted `db:push`→`db:baseline`→`migrate` hybrid) were collapsed into **one clean baseline**
> `drizzle/0000_*.sql`, generated from `schema.ts`. It is a plain `CREATE TABLE …` (**not**
> `IF NOT EXISTS`), so it **assumes a fresh database** — applying it onto a DB that still holds the
> old schema fails with `relation "…" already exists`. Evolve the schema **append-only** from here
> (`db:generate`, never `db:push`). Read **[Database migrations: pre-launch vs post-launch](#database-migrations-pre-launch-vs-post-launch)** before touching any deployed DB.

**Local Desynchronization (The "Fix" for Migration Conflicts):**
If you ever encounter an `ECONNRESET` or a `relation already exists` error during local startup, it means your local Docker volume is out of sync with the Git history.
```bash
# Nuclear Reset (SAFE for local dev, data will be lost)
docker compose down -v  # Wipes the VOLUME
docker compose up -d postgres
bun run --filter @pika/cloud dev # Re-runs all migrations from scratch
```

## � Git Strategy & Workflow

**Branches → Environments (push-to-deploy):**
*   `main` — **Production.** Push triggers `deploy.yml` → prod.
*   `staging` — **Staging.** Push triggers `deploy-staging.yml` → staging.
*   `feat/xyz` — **Feature branches** for specific tasks.

**Typical Workflow (solo, no PRs required):**
1.  **Local Dev:** work on `staging` (or a feature branch) → `bun run dev`.
2.  **Deploy to staging:** `git push origin staging` → CI builds images → VPS pulls → health-gated.
3.  **Verify:** wait for the green Actions run + check `https://staging.pika.stream`.
4.  **Promote to prod:** fast-forward `main` to the verified `staging` commit, then `git push origin main`.

> Deployment is **automated** — you do **not** SSH in to deploy. See
> [`architecture/deployment.md`](./architecture/deployment.md) for the full pipeline.

---

## �🌍 Production Environment (VPS)

### 🚀 Deployment (Automated — push to deploy)

Deployment is handled by GitHub Actions. **You do not build or pull by hand.**

```bash
# Just push to the environment branch:
git push origin main       # → deploy.yml: builds images in CI → GHCR → VPS pulls → health-gated
# git push origin staging  # → deploy-staging.yml: same flow for staging
```

Watch the run in the GitHub **Actions** tab. The deploy goes **red** if the health check fails.

**Manual override (emergency only)** — re-pull the latest images on the VPS without a push:
```bash
ssh root@anna179.mikrus.xyz -p <port>
cd /opt/pika/pika
docker login ghcr.io -u expigo            # if not already logged in
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```
> ⚠️ The VPS no longer builds images. **Never** run `docker compose ... up --build` on it — it's a
> 1-vCPU/4 GB box where a Next build takes ~18 min and risks OOM. Builds happen in CI only.

#### 🔑 First deploy after the Better Auth migration (one-time per env)

The auth migration adds a **required** secret and resets the auth schema. Before deploying
`harden/audit-fixes` to an env:

1. **Set `BETTER_AUTH_SECRET`** in that env's VPS `.env` (`openssl rand -base64 32`). The cloud
   **won't start** without it (compose fails fast). See `.env.prod.example` for the full var list.
   `BETTER_AUTH_URL` defaults to the env's API origin in compose — override only if needed.
2. **Greenfield reset if the DB predates the squash:** the schema was squashed to a fresh `0000`
   baseline and replaced `dj_users`/`dj_tokens` with Better Auth's `user`/`session`/`account`. A DB
   carrying old migration hashes will crash on boot with `relation "…" already exists`. Check +
   reset (pre-launch data is disposable):
   ```bash
   docker exec <db-container> psql -U pika -d <db> -c 'SELECT * FROM __drizzle_migrations;'
   bash scripts/reset-db.sh <staging|prod>   # if pre-squash
   ```
3. **Seed the first admin** after the cloud is healthy — see *Admin Panel & DJ Approval* below.
4. **Verify cross-origin auth (the gate):** on `staging.pika.stream`, sign in → confirm `/dj/live`
   shows the dashboard (the `api.pika.stream` session cookie reaches the web — same-site
   subdomains), `/admin` gates correctly, and the register→pending→approve cycle works. Only
   promote to prod after staging is green.

### 🐳 Docker Management

**Re-pull & Recreate Everything (The "Fix It" Button):**
```bash
# Pull the latest images from GHCR and recreate containers (NO on-box build)
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d --force-recreate
```

**View Status:**
```bash
docker compose -f docker-compose.prod.yml ps
```

**View Logs (Real-time):**
```bash
# Watch all logs
docker compose -f docker-compose.prod.yml logs -f

# Watch specific service (e.g., cloud)
docker compose -f docker-compose.prod.yml logs -f cloud
```

**Restart Specific Service:**
```bash
docker compose -f docker-compose.prod.yml restart cloud
```

**Stop Everything:**
```bash
docker compose -f docker-compose.prod.yml down
```

---

## 📊 Monitoring & Status Stack

We run a dedicated stack for internal metrics and public status.

### 1. The Stack
*   **Beszel (Internal):** CPU/RAM/Docker metrics.
*   **Uptime Kuma (Public):** Status page (e.g., "API is Operational").

### 2. Setup (One-time)
1.  Navigate and start:
    ```bash
    cd docker/monitoring
    docker compose up -d
    ```

### 3. Cloudflare Tunnel Configuration (Domain Map)
Since ports are bound to `127.0.0.1` for security, you MUST connect them via Cloudflare Tunnel.

**In Cloudflare Dashboard (Zero Trust > Access > Tunnels):**

| Public Hostname | Service | Local URL (Target) | Access Policy |
| :--- | :--- | :--- | :--- |
| `monitor.pika.stream` | **Beszel** | `http://localhost:8090` | **Protected** (Require Email Login) |
| `status.pika.stream` | **Uptime Kuma** | `http://localhost:3002` | **Public** (No Auth) |

**Notes:**
*   **monitor:** Use this to see if the VPS is healthy.
*   **status:** Go here, click "Status Page" (top right), and configure it to show your Pika! API status.

---

## 🚨 Monitoring & Error Tracking (Sentry)

Pika! utilizes **Sentry** for full-stack observability. 

### 1. Dashboard Access
- **URL:** [sentry.io](https://sentry.io)
- **Organization:** `expigo` (or your private org)
- **Projects:** `pika-cloud`, `pika-web`, `pika-desktop`

### 2. Common Operations
- **Filtering Noise:** Use the "Inbound Filters" in Sentry settings to ignore browser extension errors (already configured in code via `ignoreErrors`).
- **Performance Baseline:** Check the "Performance" tab to see transaction durations for WebSocket `ON_MESSAGE` and REST API endpoints.
- **Environment Scoping:** Use the `environment` tag to distinguish between `staging` and `production` errors.
- **Tauri Builds (Desktop):** The `SENTRY_DSN` is injected at build time via GitHub Secrets. To update it for production `.dmg` builds, update the secret in GitHub Settings (Actions > Secrets).


## 🔍 Database Operations (Production)

### 🚀 Drizzle Studio (The "Admin Panel")

You can connect your **local** Drizzle Studio to the **production** database securely via SSH Tunnel.

1.  **Open Tunnel (Terminal 1):**
    ```bash
    ./scripts/connect-db-prod.sh
    # Leave this running!
    ```

2.  **Start Studio (Terminal 2):**
    ```bash
    cd packages/cloud
    
    # ⚠️ Important: Overwrite DB URL to localhost for the session
    DATABASE_URL="postgres://pika:pika_password@127.0.0.1:5432/pika_prod" bun run db:studio
    ```

3.  **Browse:** Open `https://local.drizzle.studio` in your browser. You now have full read/write access to production data.

### 🎭 Stage/Event Provisioning

Stages/events are created **in-app** by DJs (desktop **StageSelector** → owner-scoped
`POST /api/events`, `POST /api/stages`; the "Join code" mode lets a guest DJ broadcast onto a
stage they don't own). For first-time / bulk seeding, use `packages/cloud/scripts/seed-stages.ts`
(set the owner email at the top). Stages are soft-deleted via `archived_at` — they outlive any
single DJ set. See `docs/architecture/stage-event-model.md`.

### 🛡️ Admin Panel & DJ Approval

The admin panel (`/admin` on the web) gates DJ approval + a read-only live overview behind the
`admin` **role** (Better Auth's `"user".role`; `requireAdmin` → 404 to non-admins; actions audited
in `admin_audit`). Auth runs on **Better Auth** (table `"user"`, columns `role` + `status`). New
registrations are `status='pending'`: they CAN sign in, but the approval gate blocks them at
protected routes (going live, `/admin`) with **403** until approved — the gate is route-level, not
login-level.

**Bootstrap the first admin** (chicken-and-egg — the only step that needs DB access; there is **no
API** to grant admin, by design):
```bash
# Local  (note: "user" is a reserved word → must be double-quoted)
docker exec pika-postgres psql -U pika -d pika_cloud \
  -c "UPDATE \"user\" SET role='admin', status='approved' WHERE email='you@example.com';"
# Staging/Prod: same UPDATE on that environment's DB (SSH tunnel + psql, or Drizzle Studio).
# Sign up on the web first so the row exists, then run the UPDATE.
```
After that, approve DJs **in-app** (`/admin/djs` → Approve/Reject) — no SQL needed.

**Per-environment Spotify/admin checklist** is in `docs/blueprints/music-provider-integration.md`
§10–§11 (Track D). Admin design + scope: the admin-panel plan.

**Verify:**
1. Promote your account (SQL above) → log in → `/admin` shows the live overview.
2. A non-admin DJ hitting `/admin` is redirected home (`GET /api/admin/me` → 404).
3. A `pending` DJ can sign in but is blocked from going live / `/admin` (403); approve them → they
   can now go live.

### 🚀 Migration Workflow (Best Practices)

**How Drizzle Migrations Work:**
```
Migration Files (git)     Migration Table (DB)      Database
─────────────────────     ────────────────────      ────────
0000_init.sql        ┐    __drizzle_migrations     sessions
0001_auth.sql        ├──▶ tracks which are done ◀──▶ dj_users
0002_future.sql      ┘    (skip applied ones)       likes...
```

**Complete Workflow:**

```bash
# ═══════════════════════════════════════════════════════════════
# LOCAL: When you modify schema.ts
# ═══════════════════════════════════════════════════════════════

cd packages/cloud

# 1. Generate migration file from schema changes
bun run db:generate
# Creates: drizzle/0002_some_name.sql

# 2. Review the generated SQL
cat drizzle/0002_some_name.sql

# 3. Apply locally to test
bun run db:migrate

# 4. Commit the migration file
git add drizzle/
git commit -m "feat(db): add xyz table"
git push origin main

# ═══════════════════════════════════════════════════════════════
# PRODUCTION: migrations run AUTOMATICALLY on deploy
# ═══════════════════════════════════════════════════════════════
# The cloud image entrypoint is `bun run start:prod` (= drizzle-kit migrate, then start),
# so committing your migration files and pushing is all that's needed:
git push origin main      # CI builds + VPS pulls; cloud migrates on boot.
# A failed migration aborts startup and the deploy health-gate goes RED.
```

**Key Rules:**
| Do ✅ | Don't ❌ |
|-------|---------|
| `db:generate` then `db:migrate` | Use `db:push` in production |
| Commit migration files to git | Edit migration files after they've run |
| Review generated SQL before applying | Skip the review step |
| Run migrations after every deploy | Assume schema is up to date |

### Database migrations: pre-launch vs post-launch

The migration history was **squashed to a single baseline** in June 2026 (`drizzle/0000_*.sql`,
generated from `schema.ts`). It is a plain `CREATE TABLE …` and assumes an **empty** database — so
the rules differ sharply depending on where we are in the product lifecycle.

**🟢 PRE-LAUNCH — now (schema still being refined; all data disposable):**
- To pick up the squashed/changed baseline on an environment that still has an older schema,
  **reset it** (drops all data; the cloud container re-applies the baseline on next boot):
  ```bash
  bash scripts/reset-db.sh staging   # on the VPS, from /opt/pika/pika-staging
  bash scripts/reset-db.sh prod      # before / at the first prod promotion
  ```
- Locally: `docker compose down -v && docker compose up -d postgres`, then `bun run --filter @pika/cloud dev`.
- **Every environment is an independent DB and must be reset once** after a squash, or
  `migrate-on-boot` crash-loops with `relation "…" already exists`. Resetting staging does **not**
  reset prod — do both.

**🔴 POST-LAUNCH — after the first real event (data must survive):**
- **You can no longer drop the database.** No more squashes, no `reset-db.sh`, no `db:push` — ever.
- Evolve the schema **append-only**: `db:generate` a new migration → review the SQL → commit → push.
  `start:prod` applies it on the next deploy; a failed migration aborts startup and reds the deploy.
- Migrations must be **safe against existing data**. For a new `UNIQUE` / `NOT NULL` / `CHECK`,
  write the migration to clean or backfill first (e.g. de-duplicate rows **before** `ADD CONSTRAINT`) —
  a bare constraint add fails if live data violates it.
- Never edit a migration that has already run anywhere; always fix-forward with a new one.
- Take a backup before a risky migration (see *Backup & Restore* below).

> The single most important rule: **the disposable-data window closes at go-live.** Treat the first
> real event as the point of no return for the database.

### ✅ Schema/Code Race Condition — Solved (Entrypoint Migration)
**Problem (historical):** deploying new code that expects new columns *before* migrations ran
would crash the app on startup.

**Solution (in place):** the cloud image runs `start:prod` = `drizzle-kit migrate` **then** start,
so the schema is always migrated before the server serves. A failed migration aborts startup and is
caught by the deploy health-gate (deploy goes red).

> **One-time caveat (the June-2026 squash):** the single baseline assumes a **fresh** DB. Any
> environment whose Postgres still holds the **pre-squash** schema (the old `0000–0008` hashes in
> `drizzle.__drizzle_migrations`) fails migrate-on-boot with `relation "…" already exists` and
> crash-loops the cloud container. While pre-launch (data disposable), reset that environment once
> with `bash scripts/reset-db.sh <staging|prod>` — see
> [pre-launch vs post-launch](#database-migrations-pre-launch-vs-post-launch).

### 🆘 Troubleshooting Migrations

**`relation "…" already exists` (cloud crash-loops on deploy):**
```
PostgresError: relation "dj_users" already exists
```
The baseline is being applied onto a DB that already holds the (pre-squash) schema — its
`__drizzle_migrations` lacks the new baseline hash, so `drizzle-kit migrate` re-runs the
`CREATE TABLE`s and aborts (which fails `start:prod` → container restart-loop → red deploy).

- **Pre-launch (data disposable) — reset the environment:**
  ```bash
  bash scripts/reset-db.sh staging      # or: prod
  ```
  (drops the schema; the cloud container re-applies the clean baseline on its next boot.)
- **Post-launch (data must survive) — do NOT reset.** Mark the baseline as applied so migrate skips
  the `CREATE`s, then apply only the genuine delta by hand. See
  [pre-launch vs post-launch](#database-migrations-pre-launch-vs-post-launch).

> The old `db:baseline` script (and the `db:push`→baseline→migrate hybrid) was **removed** in the
> June-2026 squash; don't look for it.

**Check Migration Status:**
```bash
docker compose -f docker-compose.prod.yml exec cloud bun -e "
  import postgres from 'postgres';
  const sql = postgres(process.env.DATABASE_URL);
  const result = await sql\`SELECT * FROM drizzle.__drizzle_migrations ORDER BY id\`;
  console.table(result);
  process.exit(0);
"
```

### 🧪 Testing migrations & schema (automated)

The schema + constraints are covered by a **real-Postgres integration test** —
`packages/cloud/src/__tests__/db.integration.test.ts` — which runs in CI (the
**DB Integration (Postgres)** job) and asserts the baseline enforces `unique_like_idempotency`,
the `chk_*` ranges, and FK cascades. The desktop SQLite stack has an equivalent
(`packages/desktop/src/db/offlineQueue.integration.test.ts`).

Run the cloud one locally against the dev DB:
```bash
cd packages/cloud
bun run db:migrate
bun run test:integration   # = RUN_DB_TESTS=1 bun test src/__tests__/db.integration.test.ts
```
For a data-preserving migration (e.g. adding a `NOT NULL` column to a populated table), add a case
that seeds the old shape, migrates, and asserts the data transformed correctly — far more reliable
than the old manual "hide the SQL files / edit `_journal.json`" dance.

### 🔌 Connecting to Prod DB

**Interactive SQL Shell (psql):**
```bash
docker compose -f docker-compose.prod.yml exec db psql -U pika -d pika_prod
```
*(Type `\q` to exit)*

### 📊 Common Queries

**Check Track Counts per Session:**
```sql
SELECT session_id, count(*) 
FROM played_tracks 
GROUP BY session_id 
ORDER BY count(*) DESC;
```

**View Most Recent Tracks:**
```sql
SELECT artist, title, played_at 
FROM played_tracks 
ORDER BY played_at DESC 
LIMIT 10;
```

**View Active Polls:**
```sql
SELECT id, question, status, created_at 
FROM polls 
WHERE status = 'active';
```

### 💾 Backup & Restore

**Backup Database (Dump):**
```bash
# Creates a SQL dump file
docker compose -f docker-compose.prod.yml exec db pg_dump -U pika pika_prod > pika_backup_$(date +%F).sql
```

**Restore Database:**
```bash
# WARNING: This overwrites data
cat backup.sql | docker compose -f docker-compose.prod.yml exec -T db psql -U pika -d pika_prod
```

---

## 🐛 Troubleshooting

### ❌ "Session Not Found" / 404 Errors
*   **Cause:** Client cannot reach API or Session empty.
*   **Fix:**
    1.  Check if `cloud` service is running: `docker compose ... ps`
    2.  Check logs for errors: `docker compose ... logs cloud`
    3.  Verify API URL in browser console: `window.env.NEXT_PUBLIC_CLOUD_API_URL` (if exposed) or Network tab.

### 🐢 Timeout Errors / "Negative Timeout"
*   **Cause:** Database connection pool exhausted or VPS CPU spike.
*   **Fix:**
    1.  Restart cloud service: `docker compose ... restart cloud`
    2.  Check DB connections:
        ```sql
        SELECT count(*) FROM pg_stat_activity;
        ```

### 🔒 Permission Denied (Scripts)
*   **Fix:** Ensure scripts are executable.
    ```bash
    chmod +x packages/cloud/src/index.ts
    ```

### 🧠 Memory Leaks (v0.5.0)
*   **Symptoms:** Server RAM climbs continuously, eventually crashing (OOM).
*   **Cause:** Stale sessions not being cleaned up, or pending promises accumulating.
*   **Fix:**
    1.  **Check Logs:** Look for "Cleanup removed... stale sessions" message every 5 minutes.
    2.  **Force Cleanup:** Restart the cloud container to clear Node.js heap.
    3.  **Monitor Queue Depth:** If queues are backing up (from logs), clients might be too slow.

### ⚠️ Backpressure Warning
*   **Log:** `⚠️ Backpressure: Dropping message for client_xyz`
*   **Meaning:** A connected client (Dancer) is on a very slow connection and cannot keep up with broadcast volume.
*   **Action:** None required. The system is protecting itself. If this happens for *all* clients, check server uplink.

---

## 📊 Session Telemetry (v0.5.0)

Telemetry tracks DJ session stability for operational insights. Events are stored in the `session_events` table.

### Event Types

| Event | When Logged | Metadata |
| :--- | :--- | :--- |
| `connect` | DJ establishes WebSocket connection | `clientVersion` |
| `disconnect` | DJ connection unexpectedly closed | `reason` |
| `reconnect` | DJ reconnected after disconnect | `reconnectMs` (planned) |
| `end` | DJ explicitly ended session | - |

### Query Commands

**View Recent Events (Staging):**
```bash
docker compose -f docker-compose.staging.yml -p pika-staging exec db \
  psql -U pika -d pika_staging -c "SELECT * FROM session_events ORDER BY timestamp DESC LIMIT 10;"
```

**View Recent Events (Production):**
```bash
docker compose -f docker-compose.prod.yml exec db \
  psql -U pika -d pika_prod -c "SELECT * FROM session_events ORDER BY timestamp DESC LIMIT 10;"
```

### Analysis Queries

**Session Stability Report (Disconnect Rate):**
```sql
SELECT 
  event_type, 
  COUNT(*) as count,
  COUNT(*) * 100.0 / SUM(COUNT(*)) OVER () as percentage
FROM session_events
WHERE timestamp > NOW() - INTERVAL '7 days'
GROUP BY event_type;
```

**Busiest DJ Sessions:**
```sql
SELECT 
  session_id,
  COUNT(*) as event_count,
  MIN(timestamp) as first_event,
  MAX(timestamp) as last_event
FROM session_events
GROUP BY session_id
ORDER BY event_count DESC
LIMIT 10;
```

**Client Version Distribution:**
```sql
SELECT 
  metadata->>'clientVersion' as version,
  COUNT(*) as count
FROM session_events
WHERE event_type = 'connect'
GROUP BY metadata->>'clientVersion'
ORDER BY count DESC;
```

### Design Notes

*   **Privacy-first:** No PII stored (no IP addresses, user agents).
*   **Fire-and-forget:** Telemetry inserts are async and non-blocking.
*   **Silent on success:** Only logs errors to console.

### Future Improvements (Post-MVP)

| Enhancement | Value | Effort |
| :--- | :---: | :---: |
| Log `reconnect` with duration | High | 2h |
| Add `end` event for graceful close | Medium | 1h |
| Dashboard visualization | High | 8h |
| Retention policy (30-day delete) | Medium | 1h |
| Prometheus/Grafana integration | High | 4h |

---

## 🔐 Security Operations

### Pre-Launch Security Checklist

Before launching to production, verify these items:

| Item | Command / Location | Expected |
| :--- | :--- | :--- |
| CORS Restricted | `grep -n "cors()" packages/cloud/src/index.ts` | Should specify origin array |
| Rate Limiting Active | `grep -n "rateLimiter" packages/cloud/src/index.ts` | Should find import and usage |
| No Hardcoded Secrets | `grep -n "pika_password" docker-compose.prod.yml` | Should find `${POSTGRES_PASSWORD}` |
| Tokens Hashed | `grep -n "hashToken" packages/cloud/src/index.ts` | Should find SHA-256 hashing |

### Security Verification Commands

**Check CORS Configuration:**
```bash
curl -H "Origin: https://evil.com" -I https://api.pika.stream/health
# Should NOT see Access-Control-Allow-Origin: *
```

**Check Rate Limiting (Auth):**
```bash
# Try 6 failed logins, 6th should be blocked
for i in {1..6}; do 
  curl -X POST https://api.pika.stream/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"test@test.com","password":"wrong"}' 
done
# Last request should return 429 Too Many Requests
```

**Check Token Security:**
```bash
# Tokens should be hashed in DB
docker compose -f docker-compose.prod.yml exec db psql -U pika -d pika_prod -c \
  "SELECT id, LEFT(token, 10) || '...' as token_preview, last_used FROM dj_tokens LIMIT 5;"
# token_preview should show hashed value (hex), not pk_dj_
```

### Incident Response

**If Credentials Compromised:**
1. Rotate affected DJ tokens:
   ```sql
   DELETE FROM dj_tokens WHERE dj_user_id = <affected_user_id>;
   ```
2. Force password reset (manual DB update required).
3. Check for suspicious session activity in logs.

**If Rate Limiting Not Working:**
1. Verify Cloudflare is forwarding IP correctly:
   ```bash
   # Check for CF-Connecting-IP header in logs
   docker compose -f docker-compose.prod.yml logs cloud | grep "CF-Connecting-IP"
   ```
2. Restart cloud service to reload rate limiter config.

### Security Audit References

| Audit | Date | Score | Document |
| :--- | :--- | :--- | :--- |
| Full Security Audit | 2026-01-13 | 7.5/10 | `docs/architecture/security.md` |
| Engineering Assessment | 2026-01-13 | 8.4/10 | `DEVELOPER_HANDOVER.md` |
| Load Test (300 VUs) | 2026-01-15 | ✅ Pass | `docs/testing/load-testing.md` |

---

## 📊 Verified Capacity (Jan 2026)

**Tested:** 300 concurrent WebSocket connections on 4GB VPS.

| Event Type | Dancers | Status |
|------------|---------|--------|
| Local social | 50-100 | ✅ Easy |
| Regional workshop | 200-300 | ✅ Tested |
| Major weekend | 500-800 | ✅ Safe |
| Grand Nationals | ~1,500 | ⚠️ Monitor |
| US Open | 2,000+ | 🔶 Upgrade |

**Bottleneck:** RAM (4GB). For 1,500+ dancers, upgrade to 8GB VPS.

**See:** [Load Testing Guide](./testing/load-testing.md) for full details.

---

## 📂 Key File Locations (VPS)

*   **Project Root:** `/opt/pika/pika`
*   **Env Config:** `/opt/pika/pika/.env` (Ensure this is not committed to Git!)
*   **Logs (Docker):** `/var/lib/docker/containers/...` (Managed by Docker)
*   **DB Data:** `postgres_data` volume (Persists across restarts)
*   **Security Docs:** `/opt/pika/pika/docs/architecture/security.md`

---

*Last Updated: June 25, 2026 (v0.5.0) — Stage/Event provisioning + deployment via CI → GHCR → VPS pull (see `architecture/deployment.md`).*

