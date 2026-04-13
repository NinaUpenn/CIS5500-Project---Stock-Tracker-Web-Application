#!/usr/bin/env bash
# db/load.sh — one-time bulk load of combined_stock_data.csv into the
# Docker postgres container. Safe to re-run: it TRUNCATEs the table
# first, so repeated runs end in the same state.
#
# Usage:
#   ./db/load.sh                              # default CSV location
#   ./db/load.sh /path/to/combined_stock_data.csv
#
# Steps:
#   1. Wait for the db container healthcheck.
#   2. docker cp the CSV into the container (avoids docker exec stdin
#      streaming, which is noticeably slower than a server-side COPY).
#   3. TRUNCATE the staging table, COPY the CSV in, delete the temp file.
#   4. Apply the Phase-1 indexes.
#   5. Print row count + sanity-check queries.

set -euo pipefail

CSV_DEFAULT="/c/Users/gavin/Downloads/combined_stock_data.csv"
CSV="${1:-$CSV_DEFAULT}"
CONTAINER="stock-db"
DB="stock"
USER_="stock"

if [ ! -f "$CSV" ]; then
  echo "ERROR: CSV not found at $CSV" >&2
  exit 1
fi

echo "==> Waiting for $CONTAINER to be healthy..."
for i in $(seq 1 60); do
  status=$(docker inspect -f '{{.State.Health.Status}}' "$CONTAINER" 2>/dev/null || echo "starting")
  if [ "$status" = "healthy" ]; then
    break
  fi
  sleep 2
done

if [ "$status" != "healthy" ]; then
  echo "ERROR: $CONTAINER never became healthy (last status: $status)" >&2
  exit 1
fi

echo "==> Copying CSV into container..."
docker cp "$CSV" "$CONTAINER:/tmp/load.csv"

echo "==> Truncating staging table..."
docker exec "$CONTAINER" psql -U "$USER_" -d "$DB" -v ON_ERROR_STOP=1 \
  -c "TRUNCATE combined_stock_data_staging"

echo "==> Bulk loading (this takes a few minutes for 14.6M rows)..."
time docker exec "$CONTAINER" psql -U "$USER_" -d "$DB" -v ON_ERROR_STOP=1 \
  -c "COPY combined_stock_data_staging FROM '/tmp/load.csv' WITH (FORMAT csv, HEADER true)"

echo "==> Removing temp CSV from container..."
docker exec "$CONTAINER" rm -f /tmp/load.csv

echo "==> Creating indexes..."
docker exec "$CONTAINER" psql -U "$USER_" -d "$DB" -v ON_ERROR_STOP=1 <<'SQL'
CREATE INDEX IF NOT EXISTS idx_csds_symbol_date
  ON combined_stock_data_staging (symbol, trade_date);
CREATE INDEX IF NOT EXISTS idx_csds_date
  ON combined_stock_data_staging (trade_date);
ANALYZE combined_stock_data_staging;
SQL

echo "==> Sanity checks:"
docker exec "$CONTAINER" psql -U "$USER_" -d "$DB" -c \
  "SELECT COUNT(*) AS rows, COUNT(DISTINCT symbol) AS symbols,
          MIN(trade_date) AS first_date, MAX(trade_date) AS last_date
   FROM combined_stock_data_staging"

echo "==> Done."
