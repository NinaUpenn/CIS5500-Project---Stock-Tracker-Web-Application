-- Phase 1 recommended indexes for combined_stock_data_staging (14.6M rows).
--
-- Without these, every Phase 1 endpoint does a full-table scan:
--   * (symbol, trade_date) accelerates per-ticker range scans used by
--     /companies/:ticker, /stocks/:ticker/history, and /companies/:ticker/similar.
--   * (trade_date) accelerates global date-range scans used by
--     /stocks/risk-adjusted and /stocks/volume-spikes.
--
-- Run once against the RDS instance:
--   psql "<conn>" -f webapp/db/indexes.sql
-- CREATE INDEX IF NOT EXISTS is idempotent — safe to re-run.

CREATE INDEX IF NOT EXISTS idx_csds_symbol_date
  ON combined_stock_data_staging (symbol, trade_date);

CREATE INDEX IF NOT EXISTS idx_csds_date
  ON combined_stock_data_staging (trade_date);
