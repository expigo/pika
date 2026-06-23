#!/usr/bin/env bash
#
# reset-db.sh — drop a Pika! environment's database back to the clean migration
# baseline, then let the cloud container re-create the schema from scratch.
#
#   Usage (on the VPS):  bash scripts/reset-db.sh <staging|prod> [--yes]
#
# The cloud image's entrypoint is `start:prod` = `drizzle-kit migrate` then start,
# so after the drop the next `up -d cloud` applies the single baseline migration
# (`drizzle/0000_*.sql`) onto an empty DB and boots normally.
#
# ============================================================================
#  ⚠️  DESTRUCTIVE — THIS DROPS ALL DATA.
#
#  ONLY valid while the schema is still being refined PRE-LAUNCH (data disposable).
#  After go-live you must NEVER run this — evolve the schema with append-only
#  migrations instead (db:generate -> commit -> deploy). See docs/ops-manual.md
#  → "Database migrations (pre-launch vs post-launch)".
# ============================================================================
set -euo pipefail

ENV="${1:-}"
case "$ENV" in
  staging) DIR=/opt/pika/pika-staging; FILE=docker-compose.staging.yml; PROJECT=pika-staging; DEFAULT_DB=pika_staging ;;
  prod)    DIR=/opt/pika/pika;         FILE=docker-compose.prod.yml;    PROJECT=pika;         DEFAULT_DB=pika_prod ;;
  *) echo "usage: $(basename "$0") <staging|prod> [--yes]"; exit 1 ;;
esac

cd "$DIR"

# Pull DB_USER / DB_PASSWORD / DB_NAME from the compose .env if present.
set -a; [ -f .env ] && . ./.env; set +a
DB_USER="${DB_USER:-pika}"
DB="${DB_NAME:-$DEFAULT_DB}"
DC="docker compose -f $FILE -p $PROJECT"

echo "⚠️  This DROPS ALL DATA in the '$ENV' database ($DB) and re-creates the"
echo "    schema from the clean migration baseline on the next cloud boot."
if [ "${2:-}" != "--yes" ]; then
  read -r -p "    Type '$ENV' to confirm: " ans
  [ "$ans" = "$ENV" ] || { echo "aborted."; exit 1; }
fi

echo "→ stopping app containers (db stays up)…"
$DC stop cloud web || true

echo "→ dropping schema on '$DB'…"
# staging .env uses DB_PASSWORD; prod .env uses POSTGRES_PASSWORD. (Local socket auth is
# usually `trust` in the postgres image, so this is belt-and-suspenders.)
$DC exec -T -e PGPASSWORD="${DB_PASSWORD:-${POSTGRES_PASSWORD:-}}" db \
  psql -U "$DB_USER" -d "$DB" \
  -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; DROP SCHEMA IF EXISTS drizzle CASCADE;"

echo "→ starting app — cloud runs db:migrate (clean baseline) on boot…"
$DC up -d cloud web

echo "→ following cloud logs (expect 'migrations applied successfully!' then the"
echo "  server boots; Ctrl-C to stop following)…"
$DC logs -f cloud
