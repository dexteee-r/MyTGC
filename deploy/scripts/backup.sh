#!/usr/bin/env bash
# Nightly database backup.
#
# Uses sqlite3's own .backup rather than cp. The database runs in WAL mode, so a
# file copy taken while the API is writing can capture a torn state — .backup takes
# a consistent snapshot of a live database, which is the whole point of running it
# without stopping the service.
#
# The image cache is deliberately not backed up: 2.5 GB that download_images.py can
# rebuild from the official card list in about ten minutes.

set -euo pipefail

DATA_DIR="${MYTCG_DATA_DIR:-/var/lib/mytcg}"
DB="${MYTCG_DB_PATH:-$DATA_DIR/mytcg.db}"
DEST="${MYTCG_BACKUP_DIR:-/var/backups/mytcg}"
KEEP_DAYS="${MYTCG_BACKUP_KEEP_DAYS:-30}"

mkdir -p "$DEST"
stamp=$(date +%Y%m%d-%H%M%S)
target="$DEST/mytcg-$stamp.db"

sqlite3 "$DB" ".backup '$target'"
gzip -9 "$target"

# Verify rather than assume: a backup nobody has opened is a hope, not a backup.
if ! gzip -t "$target.gz"; then
    echo "backup failed integrity check: $target.gz" >&2
    exit 1
fi

find "$DEST" -name 'mytcg-*.db.gz' -mtime "+$KEEP_DAYS" -delete

echo "backed up to $target.gz ($(du -h "$target.gz" | cut -f1)), keeping $KEEP_DAYS days"
