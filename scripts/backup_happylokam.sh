#!/usr/bin/env bash
# ==============================================================================
# HAPPY LOKAM - FULL SERVER & DATABASE DISASTER RECOVERY BACKUP SCRIPT
# Runs daily or on-demand to create resilient, compressed, timestamped backups
# ==============================================================================
set -euo pipefail

BACKUP_ROOT="/home/ec2-user/backups"
DB_BACKUP_DIR="${BACKUP_ROOT}/db"
APP_BACKUP_DIR="${BACKUP_ROOT}/app"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
RETENTION_DAYS=14

# Ensure backup directories exist
mkdir -p "${DB_BACKUP_DIR}" "${APP_BACKUP_DIR}"

echo "==========================================================="
echo "  HAPPY LOKAM DISASTER RECOVERY BACKUP: ${TIMESTAMP}"
echo "==========================================================="

# 1. DATABASE BACKUP (PostgreSQL Docker Container)
DB_FILE="${DB_BACKUP_DIR}/happylokam_pg_${TIMESTAMP}.sql.gz"
LATEST_DB_LINK="${DB_BACKUP_DIR}/latest_db_backup.sql.gz"

echo "⏳ [1/3] Dumping PostgreSQL database from docker container (happylokam-db)..."
sudo docker exec -t happylokam-db pg_dump -U happylokam_user happylokam | gzip -9 > "${DB_FILE}"
cp -f "${DB_FILE}" "${LATEST_DB_LINK}"
echo "✅ Database backup complete: ${DB_FILE} ($(du -h "${DB_FILE}" | cut -f1))"

# 2. SERVER CODE & CONFIG BACKUP (Excluding heavy node_modules & build caches)
APP_FILE="${APP_BACKUP_DIR}/happylokam_app_${TIMESTAMP}.tar.gz"
LATEST_APP_LINK="${APP_BACKUP_DIR}/latest_app_backup.tar.gz"

echo "⏳ [2/3] Archiving server application source, env files, and configs..."
tar -czf "${APP_FILE}" \
    --exclude='node_modules' \
    --exclude='.next' \
    --exclude='.git' \
    --exclude='dist' \
    --exclude='build' \
    -C /home/ec2-user happylokam
cp -f "${APP_FILE}" "${LATEST_APP_LINK}"
echo "✅ Server archive complete: ${APP_FILE} ($(du -h "${APP_FILE}" | cut -f1))"

# 3. PRUNE OLD BACKUPS (Keep last 14 days)
echo "⏳ [3/3] Pruning backups older than ${RETENTION_DAYS} days..."
find "${DB_BACKUP_DIR}" -type f -name "happylokam_pg_*.sql.gz" -mtime +${RETENTION_DAYS} -delete || true
find "${APP_BACKUP_DIR}" -type f -name "happylokam_app_*.tar.gz" -mtime +${RETENTION_DAYS} -delete || true

echo "==========================================================="
echo "🎉 BACKUP SUCCESSFUL! All data safely secured."
echo "==========================================================="
