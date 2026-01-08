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
The local environment uses a Postgres instance (often via Docker) or a local file depending on setup.

**Inspect DB (Drizzle Studio):**
```bash
# Opens a web UI to view/edit local DB data
cd packages/cloud
bun run db:studio
```

**Run Migrations:**
```bash
cd packages/cloud
bun run db:push
```

---

## 🌍 Production Environment (VPS)

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

## 🔍 Database Operations (Production)

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
