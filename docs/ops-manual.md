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

## 📊 System Monitoring (Beszel)

We use **Beszel** for lightweight tracking of CPU, RAM, Disk, and Docker stats.

### Setup (One-time)
1.  Navigate to monitoring folder:
    ```bash
    cd docker/monitoring
    ```
2.  Start the stack:
    ```bash
    docker compose up -d
    ```
3.  Access Dashboard: `http://anna179.mikrus.xyz:8090`
    *   Creates account on first login.

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

## 📂 Key File Locations (VPS)

*   **Project Root:** `/opt/pika/pika`
*   **Env Config:** `/opt/pika/pika/.env` (Ensure this is not committed to Git!)
*   **Logs (Docker):** `/var/lib/docker/containers/...` (Managed by Docker)
*   **DB Data:** `postgres_data` volume (Persists across restarts)
