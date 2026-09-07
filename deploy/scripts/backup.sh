#!/bin/sh
# ════════════════════════════════════════════════════════════════════════
# MySQL backup script
#
# Runs inside a sidecar container. Dumps the database daily, compresses
# with gzip, and removes backups older than BACKUP_RETENTION_DAYS.
#
# Backups are stored in /backups inside the container. Mount a host
# volume or object storage bucket to persist them.
#
# Environment variables:
#   MYSQL_HOST              - MySQL host (default: mysql)
#   MYSQL_PORT              - MySQL port (default: 3306)
#   MYSQL_USER              - MySQL user (default: root)
#   MYSQL_PASSWORD          - MySQL password (required)
#   MYSQL_DATABASE          - Database to dump (default: crypto_arbitrage)
#   BACKUP_RETENTION_DAYS   - Days to keep backups (default: 14)
# ════════════════════════════════════════════════════════════════════════

set -e

BACKUP_DIR="/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DATABASE="${MYSQL_DATABASE:-crypto_arbitrage}"
RETENTION="${BACKUP_RETENTION_DAYS:-14}"
BACKUP_FILE="${BACKUP_DIR}/${DATABASE}_${TIMESTAMP}.sql.gz"

echo "[backup] Starting backup of ${DATABASE} at $(date)"

# Ensure backup directory exists
mkdir -p "${BACKUP_DIR}"

# Wait for MySQL to be ready
echo "[backup] Waiting for MySQL at ${MYSQL_HOST:-mysql}:${MYSQL_PORT:-3306}..."
until mysqladmin ping \
  --host="${MYSQL_HOST:-mysql}" \
  --port="${MYSQL_PORT:-3306}" \
  --user="${MYSQL_USER:-root}" \
  --password="${MYSQL_PASSWORD}" \
  --silent 2>/dev/null; do
  echo "[backup] MySQL not ready, retrying in 5s..."
  sleep 5
done
echo "[backup] MySQL is ready"

# Dump and compress
echo "[backup] Dumping ${DATABASE}..."
mysqldump \
  --host="${MYSQL_HOST:-mysql}" \
  --port="${MYSQL_PORT:-3306}" \
  --user="${MYSQL_USER:-root}" \
  --password="${MYSQL_PASSWORD}" \
  --single-transaction \
  --routines \
  --triggers \
  --events \
  --add-drop-table \
  "${DATABASE}" | gzip > "${BACKUP_FILE}"

# Verify the backup is not empty
FILE_SIZE=$(stat -c%s "${BACKUP_FILE}" 2>/dev/null || stat -f%z "${BACKUP_FILE}" 2>/dev/null)
if [ "${FILE_SIZE}" -lt 100 ]; then
  echo "[backup] ERROR: Backup file is suspiciously small (${FILE_SIZE} bytes)"
  rm -f "${BACKUP_FILE}"
  exit 1
fi

echo "[backup] Backup created: ${BACKUP_FILE} (${FILE_SIZE} bytes)"

# Remove old backups
echo "[backup] Removing backups older than ${RETENTION} days..."
find "${BACKUP_DIR}" -name "${DATABASE}_*.sql.gz" -type f -mtime +${RETENTION} -delete
REMAINING=$(find "${BACKUP_DIR}" -name "${DATABASE}_*.sql.gz" -type f | wc -l)
echo "[backup] ${REMAINING} backup(s) remaining"

# ── Scheduled loop: run backup daily at 02:00 ──────────────────────
echo "[backup] Sleeping until next backup cycle..."
while true; do
  # Calculate seconds until 02:00 tomorrow
  NOW_EPOCH=$(date +%s)
  NEXT_2AM=$(date -d "tomorrow 02:00" +%s 2>/dev/null || date -j -f "%Y-%m-%d %H:%M" "$(date -v+1d +%Y-%m-%d) 02:00" +%s 2>/dev/null || echo $((NOW_EPOCH + 86400)))
  SLEEP_SECONDS=$((NEXT_2AM - NOW_EPOCH))

  if [ "${SLEEP_SECONDS}" -gt 0 ]; then
    echo "[backup] Next backup in $((SLEEP_SECONDS / 3600))h $(( (SLEEP_SECONDS % 3600) / 60 ))m"
    sleep "${SLEEP_SECONDS}"
  fi

  # Run backup
  TIMESTAMP=$(date +%Y%m%d_%H%M%S)
  BACKUP_FILE="${BACKUP_DIR}/${DATABASE}_${TIMESTAMP}.sql.gz"

  echo "[backup] Starting backup at $(date)"

  mysqldump \
    --host="${MYSQL_HOST:-mysql}" \
    --port="${MYSQL_PORT:-3306}" \
    --user="${MYSQL_USER:-root}" \
    --password="${MYSQL_PASSWORD}" \
    --single-transaction \
    --routines \
    --triggers \
    --events \
    --add-drop-table \
    "${DATABASE}" | gzip > "${BACKUP_FILE}"

  FILE_SIZE=$(stat -c%s "${BACKUP_FILE}" 2>/dev/null || stat -f%z "${BACKUP_FILE}" 2>/dev/null)
  if [ "${FILE_SIZE}" -lt 100 ]; then
    echo "[backup] ERROR: Backup file is suspiciously small (${FILE_SIZE} bytes)"
    rm -f "${BACKUP_FILE}"
  else
    echo "[backup] Backup created: ${BACKUP_FILE} (${FILE_SIZE} bytes)"
  fi

  # Cleanup old backups
  find "${BACKUP_DIR}" -name "${DATABASE}_*.sql.gz" -type f -mtime +${RETENTION} -delete
  REMAINING=$(find "${BACKUP_DIR}" -name "${DATABASE}_*.sql.gz" -type f | wc -l)
  echo "[backup] ${REMAINING} backup(s) remaining"
done
