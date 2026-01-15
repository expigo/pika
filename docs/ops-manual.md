# Pika! Operations Manual & Cheatsheet

This document serves as the primary reference for operating, deploying, and debugging Pika! in both Development and Production environments.

---

## 🛠️ Development Environment (Local)

### 🚀 Starting the App
Run the entire stack (Desktop, Web, Cloud, DB) generally from the request of the `dev` script, but here are the specifics:

```bash
# Start the backend services (Cloud + DB + Web)
npm run dev

# Start the Desktop App (Tauri)
npm run tauri dev
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

**Important:** Migration files in `drizzle/*.sql` MUST be committed to git. These are the source of truth for database schema.

---

## � Git Strategy & Workflow

**Recommended Branching:**
*   `main` — **Production Code.** Always deployable.
*   `dev` — **Integration.** Where features are merged before release.
*   `feat/xyz` — **Feature Branches.** For specific tasks (e.g., `feat/auth-system`).

**Typical Workflow:**
1.  **Local Dev:** `git checkout -b feat/dj-auth` → Code → Test `npm run dev`.
2.  **Save:** `git push origin feat/dj-auth`.
3.  **Merge:** Open PR on GitHub → Merge to `main`.
4.  **Deploy:** SSH to VPS → `git pull` → `docker compose ... restart`.

---

## �🌍 Production Environment (VPS)

### 🚀 Deployment Workflow (Git-based)

Since source code is synced via GitHub:

1.  **Local Machine:** Commit and push changes.
    ```bash
    git add .
    git commit -m "Fix: Update API URLs"
    git push origin main
    ```

2.  **VPS (SSH):** Pull changes and restart services.
    ```bash
    ssh root@anna179.mikrus.xyz -p 10223
    cd /opt/pika/pika
    
    # Get latest code
    git pull origin main
    
    # Restart Services (rebuilds if necessary)
    # Note: 'web' rebuilds on start due to the command in docker-compose
    docker compose -f docker-compose.prod.yml restart cloud web
    
    # IF you changed dependencies (package.json), force a rebuild:
    docker compose -f docker-compose.prod.yml up -d --build
    ```

### 🐳 Docker Management

**Force Rebuild & Restart Everything (The "Fix It" Button):**
```bash
# Rebuilds images and recreates containers
docker compose -f docker-compose.prod.yml up -d --build --force-recreate
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
# PRODUCTION: After deploying code with schema changes
# ═══════════════════════════════════════════════════════════════

ssh root@anna179.mikrus.xyz -p 10223
cd /opt/pika/pika
git pull origin main

# Rebuild containers (gets new migration files)
docker compose -f docker-compose.prod.yml up -d --build

# Run migrations
docker compose -f docker-compose.prod.yml exec cloud \
  sh -c "cd /app/packages/cloud && bun run db:migrate"
```

**Key Rules:**
| Do ✅ | Don't ❌ |
|-------|---------|
| `db:generate` then `db:migrate` | Use `db:push` in production |
| Commit migration files to git | Edit migration files after they've run |
| Review generated SQL before applying | Skip the review step |
| Run migrations after every deploy | Assume schema is up to date |

### 🚨 Production Warning: The Race Condition
**Problem:** If you deploy new code (expecting new columns) *before* running migrations, the app will crash on startup.
**Solution:** Use the **Entrypoint Migration** pattern.
1.  Update `package.json` to run migrations before start:
    ```json
    "scripts": {
      "start:prod": "bun run db:migrate && bun run src/index.ts"
    }
    ```
2.  Or use a `run_once` container in `docker-compose.prod.yml` that runs `bun run db:migrate` before the main app starts.

3. Or add CI Pipeline Step (Deploy Phase) Add a step in deploy.yml after the pull but before the restart.
    ```
    # In deploy.yml ssh script:
    git pull origin main
    # Run migration using a temporary container or exec if container is up
    docker compose -f docker-compose.prod.yml run --rm cloud bun run db:migrate
    docker compose -f docker-compose.prod.yml up -d --build --force-recreate
    ```

### 🆘 Troubleshooting Migrations

**"Relation already exists" Error:**
```
PostgresError: relation "sessions" already exists
```
This means migration files are trying to create tables that already exist (usually because `db:push` was used before migrations).

**Fix: Run Baseline Script (One-time)**
```bash
docker compose -f docker-compose.prod.yml exec cloud bun run db:baseline
```
This marks existing migrations as "already applied" in the migrations journal.

Then retry:
```bash
docker compose -f docker-compose.prod.yml exec cloud bun run db:migrate
```

**"Migration file not found" Error:**
```bash
# Someone used db:push instead of db:generate. Fix by:
# 1. Create the missing SQL file locally
# 2. Or: Mark migration as applied manually:
docker compose -f docker-compose.prod.yml exec db psql -U pika -d pika_prod -c \
  "INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('0000_name', EXTRACT(EPOCH FROM NOW())::BIGINT * 1000);"
```

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

### 🧪 Testing Critical Migrations (Integration Test)

When modifying existing tables with data (e.g., adding `NOT NULL` columns), run this Integration Test to prove the migration logic works without data loss.

**1. Start Ephemeral DB:**
```bash
docker run --name pika-test-db -e POSTGRES_PASSWORD=test -p 5434:5432 -d postgres:17-alpine
```

**2. Seed Data (Pre-Migration State):**
```bash
# Apply only base migrations (0000-0002) - Temporarily hide new files
mkdir -p packages/cloud/drizzle_hold
mv packages/cloud/drizzle/0003*.sql packages/cloud/drizzle_hold/
# Note: You might need to temporarily edit meta/_journal.json too

DATABASE_URL=postgres://postgres:test@localhost:5434/postgres bun run db:migrate

# Insert mock data (Old Schema)
docker exec pika-test-db psql -U postgres -d postgres -c "INSERT INTO sessions (id, dj_name, started_at) VALUES ('s1', 'DJ', NOW()); INSERT INTO played_tracks (id, session_id, artist, title, played_at) VALUES (1, 's1', 'A', 'T', NOW()); INSERT INTO likes (session_id, track_artist, track_title) VALUES ('s1', 'A', 'T');"
```

**3. Apply New Migration:**
```bash
# Restore files
mv packages/cloud/drizzle_hold/*.sql packages/cloud/drizzle/

# Run migration
DATABASE_URL=postgres://postgres:test@localhost:5434/postgres bun run db:migrate
```

**4. Verify Data (Post-Migration State):**
```bash
# Check if data survived and transformed correctly
docker exec pika-test-db psql -U postgres -d postgres -c "SELECT * FROM likes;"
# Expect: played_track_id to be populated
```

**5. Cleanup:**
```bash
docker rm -f pika-test-db
rmdir packages/cloud/drizzle_hold
```

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

---

## 📊 Session Telemetry (v0.1.9)

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

*Last Updated: January 15, 2026*

