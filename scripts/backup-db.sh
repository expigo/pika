#!/bin/bash
# Pika! DB Backup Script
# Usage: ./scripts/backup-db.sh [staging|prod]
# Default: prod

ENV=${1:-prod}
VPS_USER="anna179"
VPS_HOST="anna179.mikrus.xyz"
VPS_SSH_PORT="10179"
DATE=$(date +%Y-%m-%d_%H-%M-%S)

if [ "$ENV" == "staging" ]; then
  CONTAINER="pika-staging-db"
  DB_NAME="pika_staging"
  FILENAME="pika_staging_backup_$DATE.sql"
  POSTGRES_USER="pika"
else
  CONTAINER="pika-db"
  DB_NAME="pika_prod"
  FILENAME="pika_prod_backup_$DATE.sql"
  POSTGRES_USER="pika"
fi

echo "📦 Backing up Pika! ($ENV) Database..."
echo "remote: $VPS_HOST ($CONTAINER -> $DB_NAME)"

# SSH and dump
ssh -p $VPS_SSH_PORT $VPS_USER@$VPS_HOST \
  "docker exec $CONTAINER pg_dump -U $POSTGRES_USER $DB_NAME" > $FILENAME

# Verify
if [ -s $FILENAME ]; then
  echo "✅ Backup successful: $FILENAME"
  echo "   Size: $(ls -lh $FILENAME | awk '{print $5}')"
else
  echo "❌ Backup failed (empty file). Check SSH/Docker connection."
  rm $FILENAME
  exit 1
fi
