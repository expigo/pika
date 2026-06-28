# Runbook — Production promotion (Better Auth era)

One-shot checklist to promote the verified staging build to **production**. This is the **first**
deploy of Better Auth + the admin panel + Track D to prod — `main` is far behind and still runs the
*old custom auth*, and the prod DB still has the *pre-squash* schema. So this promotion includes a
**greenfield DB reset**, which is only acceptable **while data is disposable (pre-launch)**.

> Already verified on staging (don't re-litigate): cross-subdomain cookie flow on real HTTPS, the
> full admin approval cycle, the SW first-login fix, and logout. `crossSubDomainCookies` is **not**
> needed (`pika.stream` ↔ `api.pika.stream` are same-site).

**Prod facts:** dir `/opt/pika/pika` · compose `docker-compose.prod.yml` · project `pika` · db
`pika_prod` (user `pika`) · cloud `:3001`, web `:3000` · domains `pika.stream` / `api.pika.stream`.

---

## 0. Pre-flight

- [ ] Staging is green and verified (it is).
- [ ] **Confirm prod data is disposable.** Step 4 DROPS the prod DB. Only proceed pre-launch.
- [ ] Decide whether Spotify/Track D is in scope for this promotion (Step 2 is optional — skip if
      you're not enabling Spotify connect on prod yet; the rest of the app works without it).

## 1. Prod VPS secrets — set BEFORE the push

`docker compose up` fails fast without `BETTER_AUTH_SECRET`, so it must exist before the new image
boots. The `.env` persists across deploys (it's not in git). Use a **fresh** secret — different from
staging — so a staging leak can't forge prod sessions.

```bash
ssh root@<your-vps-host> -p <ssh-port>
cd /opt/pika/pika

# REQUIRED — signs/verifies prod sessions (unique per env):
printf 'BETTER_AUTH_SECRET=%s\n' "$(openssl rand -base64 32)" >> .env

# Spotify/Track D (Step 2) — only if enabling Spotify on prod now:
# cat >> .env <<'EOF'
# SPOTIFY_CLIENT_ID=<from dashboard>
# SPOTIFY_CLIENT_SECRET=<from dashboard>
# EOF
# printf 'TOKEN_ENCRYPTION_KEY=%s\n' "$(openssl rand -base64 32)" >> .env   # stable per env, never rotate

# Confirm the required runtime secrets are present:
grep -E '^(BETTER_AUTH_SECRET|POSTGRES_PASSWORD|VAPID_PRIVATE_KEY)=' .env
exit
```
`BETTER_AUTH_URL` defaults in compose to `https://api.pika.stream` — no need to set it.

## 2. Spotify prod dashboard (optional — only if enabling Track D on prod)

1. **Redirect URIs** → add exactly `https://api.pika.stream/api/spotify/callback`.
2. **User Management** → allowlist each pilot DJ's Spotify account (Feb-2026 5-user dev-mode wall).

## 3. Promote — fast-forward `main` and push

Clean fast-forward (`main` is 0 ahead of `HEAD`). The push triggers `deploy.yml`.

```bash
# from the worktree branch (HEAD = the verified staging commit):
git push origin HEAD:main
# watch it:
gh run watch "$(gh run list --workflow=deploy.yml -L1 --json databaseId --jq '.[0].databaseId')" --exit-status
```

## 4. Greenfield DB reset (EXPECTED — the prod DB is pre-squash)

Like staging, the first migrate will collide (`relation "dj_tokens" already exists`) → the deploy
**goes red**. That's expected. Once the new image is on the box, reset:

```bash
ssh root@<your-vps-host> -p <ssh-port>
cd /opt/pika/pika
DC="docker compose -f docker-compose.prod.yml -p pika"

# (optional) confirm it's pre-squash:
$DC exec -T db psql -U pika -d pika_prod -c '\dt' | grep -i dj_users && echo "→ pre-squash, reset needed"

# ⚠️ DROPS ALL PROD DATA — pre-launch only. Re-applies the clean baseline on cloud boot:
bash scripts/reset-db.sh prod        # type 'prod' to confirm; follows cloud logs
```
Success = `migrations applied successfully!` → `Pika! Cloud server starting`. Then:
```bash
$DC ps                  # cloud + web should be (healthy)
exit
```
> Why red-then-recover: `reset-db.sh` must run **after** the new image is pulled, or it'd re-apply
> the *old* migrations. So let the deploy red on migrate, then reset. (The CI run will read
> "failure" for this one-time jump — that's the migration collision, recovered manually. Code-only
> redeploys after this stay green.)

## 5. Seed the first prod admin

No API grants admin (by design). Sign up, then promote via SQL:
```bash
# 1. Browser: sign up at https://pika.stream/dj/register
# 2. Promote ("user" is a reserved word → double-quote it):
ssh root@<your-vps-host> -p <ssh-port>
cd /opt/pika/pika
docker compose -f docker-compose.prod.yml -p pika exec -T db \
  psql -U pika -d pika_prod \
  -c "UPDATE \"user\" SET role='admin', status='approved' WHERE email='you@example.com';"
exit
```

## 6. Smoke-test prod (the gate)

On `https://pika.stream`:
1. **Log in** → `/dj/live` shows the **dashboard** (cookie flows `api.pika.stream` → `pika.stream`).
   First-login should work on the **first try** (SW fix).
2. **`/admin`** → renders for the admin; non-admin redirected home.
3. **Register a 2nd account** → pending → approve from `/admin/djs` → it can then go live.
4. **Log out** → returns to a logged-out view; `get-session` no longer returns the user.
5. **Desktop:** set server env = prod, paste the token → validates.
6. **Spotify connect** (if Step 2 done) → redirects to Spotify consent (not 500).

*(Can be driven with the same Playwright cycle used on staging — ask if you want a recorded pass.)*

## Rollback

If prod is wedged: retag the last known-good image SHA as `:prod` and recreate (see
`docs/ops-manual.md` → emergency rollback). Since this is a greenfield reset, "rollback" of data
isn't meaningful pre-launch — the safe path is forward-fix.

## Caveats

- **Destructive:** Step 4 wipes prod. Never run `reset-db.sh` post-launch — schema changes become
  append-only migrations then.
- **Old sessions die:** anyone "logged in" on the old prod auth is logged out (no real users → fine).
- **Per-env secrets:** prod `BETTER_AUTH_SECRET` and `TOKEN_ENCRYPTION_KEY` are distinct from staging
  and must stay stable once set.
