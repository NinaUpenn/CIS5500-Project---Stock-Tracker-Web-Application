-- Auto-run by the postgres image on first container start.
--
-- Columns are declared in the SAME order as the source CSV header —
-- `Date,Low,Open,Volume,High,Close,Adjusted Close,Symbol` — so the
-- bulk-load step can use a plain `COPY ... FROM ... CSV HEADER` with
-- no per-column remapping.
--
-- Indexes are intentionally NOT created here; creating them before the
-- 14.6M-row load makes the load dramatically slower. `db/load.sh`
-- creates them after the data lands.

-- `volume` is `numeric`, not `bigint`, because the CSV sometimes
-- formats it as e.g. "36340400.0". The Phase 1 queries only use it
-- in AVG / STDDEV contexts where numeric behaves identically.
CREATE TABLE IF NOT EXISTS combined_stock_data_staging (
  trade_date     date,
  low            numeric,
  open           numeric,
  volume         numeric,
  high           numeric,
  close          numeric,
  adjusted_close numeric,
  symbol         text
);
