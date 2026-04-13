// routes.js
//
// One exported handler per endpoint. Each handler receives the Express
// (req, res) pair. The shared `pg.Pool` is injected at module load via
// `initRoutes(pool)` — that keeps handlers easy to unit-test (tests call
// `initRoutes(fakePool)` and then `request(app)`).
//
// All SQL MUST be parameterized ($1, $2, ...). Never interpolate user
// input into a query string.

let pool = null;

function initRoutes(injectedPool) {
  pool = injectedPool;
}

// Simple liveness check — used by tests and manual smoke checks.
async function health(_req, res) {
  res.status(200).json({ status: 'ok' });
}

// Helper: log once, return 500. Kept inline so every route handles
// unexpected DB errors the same way without extra plumbing.
function dbError(res, err) {
  console.error(err);
  res.status(500).json({ error: 'database error' });
}

// Helper: parse+validate a positive integer query param with default.
function parsePositiveInt(raw, fallback) {
  if (raw === undefined) return { value: fallback, ok: true };
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) return { ok: false };
  return { value: n, ok: true };
}

/**
 * GET /companies/search?q=<prefix>&limit=<int>
 * Distinct-symbol prefix search against combined_stock_data_staging.
 * 200 with [{ ticker }], 204 when no match, 400 when `q` missing,
 * 422 when `limit` is not a positive integer.
 */
async function searchCompanies(req, res) {
  const { q } = req.query;
  if (!q || typeof q !== 'string' || q.trim() === '') {
    return res.status(400).json({ error: 'q is required' });
  }

  const limit = parsePositiveInt(req.query.limit, 50);
  if (!limit.ok) {
    return res.status(422).json({ error: 'limit must be a positive integer' });
  }

  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT symbol AS ticker
       FROM combined_stock_data_staging
       WHERE symbol ILIKE $1 || '%'
       ORDER BY symbol
       LIMIT $2`,
      [q.trim(), limit.value],
    );

    if (rows.length === 0) return res.status(204).send();
    return res.status(200).json(rows);
  } catch (err) {
    return dbError(res, err);
  }
}

// Helper: strict ISO date validation so a malformed `start_date` never
// reaches the DB. Anything that can't be parsed as YYYY-MM-DD is 400.
function parseDate(raw) {
  if (!raw || typeof raw !== 'string') return { ok: false };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return { ok: false };
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? { ok: false } : { ok: true, value: raw };
}

/**
 * GET /companies/:ticker
 * Ticker + latest OHLCV + ~30-trading-day return.
 * 200 when found, 404 when no rows exist for the ticker.
 */
async function getCompany(req, res) {
  const ticker = String(req.params.ticker || '').toUpperCase();
  if (!ticker) return res.status(400).json({ error: 'ticker required' });

  try {
    const { rows } = await pool.query(
      `WITH recent AS (
         SELECT trade_date, close, volume,
                ROW_NUMBER() OVER (ORDER BY trade_date DESC) AS rn
         FROM combined_stock_data_staging
         WHERE symbol = $1
       )
       SELECT
         $1 AS ticker,
         MAX(CASE WHEN rn = 1  THEN trade_date END) AS latest_date,
         MAX(CASE WHEN rn = 1  THEN close      END) AS latest_close,
         MAX(CASE WHEN rn = 1  THEN volume     END) AS latest_volume,
         CASE
           WHEN MAX(CASE WHEN rn = 30 THEN close END) IS NULL THEN NULL
           ELSE (MAX(CASE WHEN rn = 1 THEN close END) - MAX(CASE WHEN rn = 30 THEN close END))
                / MAX(CASE WHEN rn = 30 THEN close END)
         END AS return_30_trading_days
       FROM recent
       WHERE rn <= 30`,
      [ticker],
    );

    const row = rows[0];
    if (!row || row.latest_date === null) {
      return res.status(404).json({ error: 'ticker not found' });
    }
    return res.status(200).json(row);
  } catch (err) {
    return dbError(res, err);
  }
}

/**
 * GET /stocks/:ticker/history?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
 * OHLCV series for charting.
 * 200 with [{ trade_date, open, high, low, close, volume }],
 * 204 when range is empty, 400 when dates are missing/malformed.
 */
async function getStockHistory(req, res) {
  const ticker = String(req.params.ticker || '').toUpperCase();
  const start = parseDate(req.query.start_date);
  const end = parseDate(req.query.end_date);

  if (!ticker) return res.status(400).json({ error: 'ticker required' });
  if (!start.ok || !end.ok) {
    return res.status(400).json({ error: 'start_date and end_date (YYYY-MM-DD) required' });
  }

  try {
    const { rows } = await pool.query(
      `SELECT trade_date, open, high, low, close, volume
       FROM combined_stock_data_staging
       WHERE symbol = $1 AND trade_date BETWEEN $2 AND $3
       ORDER BY trade_date ASC`,
      [ticker, start.value, end.value],
    );

    if (rows.length === 0) return res.status(204).send();
    return res.status(200).json(rows);
  } catch (err) {
    return dbError(res, err);
  }
}

/**
 * GET /companies/:ticker/similar?start_date&end_date&min_overlap_days
 *
 * Peers ranked by Pearson correlation of daily simple returns against
 * the target ticker over the same window. Pearson's r is the standard
 * co-movement metric for equity returns (see e.g. Elton-Gruber-Brown
 * "Modern Portfolio Theory", Ch. 5).
 *
 * The same |ret| <= 0.5 outlier clip as /stocks/risk-adjusted is applied
 * to BOTH sides of the correlation. Without it, an unadjusted split on
 * either the target or a peer drags the correlation toward ±1 spuriously.
 *
 * 200 with [{ ticker, n_overlap, corr_ret }], 204 when no peers clear
 * the overlap threshold, 404 when the target ticker has no data in
 * range.
 */
async function getSimilarCompanies(req, res) {
  const ticker = String(req.params.ticker || '').toUpperCase();
  const start = parseDate(req.query.start_date);
  const end = parseDate(req.query.end_date);
  const overlap = parsePositiveInt(req.query.min_overlap_days, 30);

  if (!ticker) return res.status(400).json({ error: 'ticker required' });
  if (!start.ok || !end.ok) {
    return res.status(400).json({ error: 'start_date and end_date (YYYY-MM-DD) required' });
  }
  if (!overlap.ok) {
    return res.status(422).json({ error: 'min_overlap_days must be a positive integer' });
  }

  try {
    // Quick existence check so we can return 404 distinctly from "no
    // peers with enough overlap" (204).
    const existence = await pool.query(
      `SELECT 1
       FROM combined_stock_data_staging
       WHERE symbol = $1 AND trade_date BETWEEN $2 AND $3
       LIMIT 1`,
      [ticker, start.value, end.value],
    );
    if (existence.rows.length === 0) {
      return res.status(404).json({ error: 'ticker has no data in range' });
    }

    const { rows } = await pool.query(
      `WITH rets AS (
         SELECT symbol, trade_date,
                close / NULLIF(LAG(close) OVER (PARTITION BY symbol ORDER BY trade_date), 0) - 1 AS ret
         FROM combined_stock_data_staging
         WHERE trade_date BETWEEN $2 AND $3
       ),
       clean AS (
         -- Outlier clip on both sides (see /stocks/risk-adjusted note).
         SELECT symbol, trade_date, ret
         FROM rets
         WHERE ret IS NOT NULL AND ABS(ret) <= $5
       ),
       target AS (SELECT trade_date, ret FROM clean WHERE symbol = $1),
       others AS (SELECT symbol, trade_date, ret FROM clean WHERE symbol <> $1)
       SELECT o.symbol AS ticker,
              COUNT(*)           AS n_overlap,
              CORR(t.ret, o.ret) AS corr_ret
       FROM target t JOIN others o USING (trade_date)
       GROUP BY o.symbol
       HAVING COUNT(*) >= $4
       ORDER BY corr_ret DESC NULLS LAST
       LIMIT 20`,
      [ticker, start.value, end.value, overlap.value, RET_OUTLIER_CLIP],
    );

    if (rows.length === 0) return res.status(204).send();
    return res.status(200).json(rows);
  } catch (err) {
    return dbError(res, err);
  }
}

// --- Investable-universe constants (same ones used by /similar) ---
//
// PENNY_MIN_AVG_CLOSE ($5): standard CRSP / Fama-French (1993) screen —
//   exclude stocks whose average close in the window is under $5. On
//   sub-penny tickers, the tick-size quantization ($0.0001) dominates
//   real price movement, producing spurious 100%+ daily returns that
//   aren't tradable. The Phase 1 dataset has thousands of these.
//
// RET_OUTLIER_CLIP (0.5 = 50%): drop days where |daily return| > 50%.
//   Real equities almost never move 50% in a day except on unadjusted
//   stock splits, reverse splits, or data errors. This is the standard
//   "drop > X%" filter used in e.g. Ivković-Sialm-Weisbenner (2008) and
//   most retail-grade equity screens. We clip rather than winsorize
//   because this is a Sharpe-style ranking, not a distribution fit.
//
// MIN_DAYS_FLOOR (20): absolute minimum samples for stddev to mean
//   anything — no matter how short the window.
//
// MIN_COVERAGE (0.5 = 50%): the ticker must have clean returns on at
//   least half the business days in the window. The raw CSV has
//   tickers whose series "resets" monthly (big gaps with spurious
//   in-range moves between them) — without a coverage requirement,
//   those tickers dominate the ranking. ~252 trading days/year means
//   a full-year query demands ~130 clean days of data.
const PENNY_MIN_AVG_CLOSE = 5;
const RET_OUTLIER_CLIP = 0.5;
const MIN_DAYS_FLOOR = 20;
const MIN_COVERAGE = 0.5;

/**
 * GET /stocks/risk-adjusted?start_date&end_date&top_n
 *
 * Ranks tickers by a Sharpe-style score with risk-free rate = 0:
 *   score = E[r_t] / σ(r_t)
 * where r_t is the simple daily return close_t / close_{t-1} - 1.
 *
 * This is an Information-Ratio / Sharpe (r_f = 0) style metric; see
 * Sharpe (1966, 1994). Annualization (×√252) is a pure constant and
 * doesn't change the ordering so we skip it.
 *
 * Filters applied before the stats CTE:
 *   * Investable universe (avg close >= $5) — drops sub-penny tickers.
 *   * Outlier clip (|ret| <= 0.5) — drops unadjusted splits/delistings.
 */
async function getRiskAdjusted(req, res) {
  const start = parseDate(req.query.start_date);
  const end = parseDate(req.query.end_date);
  const topN = parsePositiveInt(req.query.top_n, 5);

  if (!start.ok || !end.ok) {
    return res.status(400).json({ error: 'start_date and end_date (YYYY-MM-DD) required' });
  }
  if (!topN.ok) {
    return res.status(422).json({ error: 'top_n must be a positive integer' });
  }

  // Coverage floor scales with window length: 50% of business days
  // in the window, with an absolute floor of MIN_DAYS_FLOOR so short
  // windows don't set an impossibly-low bar.
  const windowDays = (new Date(end.value) - new Date(start.value)) / 86400000;
  const coverageFloor = Math.max(
    MIN_DAYS_FLOOR,
    Math.floor(MIN_COVERAGE * windowDays * (5 / 7)),
  );

  try {
    const { rows } = await pool.query(
      `WITH prices AS (
         SELECT symbol, trade_date, close
         FROM combined_stock_data_staging
         WHERE trade_date BETWEEN $1 AND $2
       ),
       universe AS (
         SELECT symbol
         FROM prices
         GROUP BY symbol
         HAVING AVG(close) >= $4
       ),
       rets AS (
         SELECT p.symbol,
                p.close / NULLIF(LAG(p.close) OVER (PARTITION BY p.symbol ORDER BY p.trade_date), 0) - 1 AS ret
         FROM prices p
         JOIN universe u USING (symbol)
       ),
       stats AS (
         SELECT symbol,
                AVG(ret)         AS avg_daily_ret,
                STDDEV_SAMP(ret) AS vol_daily_ret,
                COUNT(ret)       AS n_days
         FROM rets
         WHERE ret IS NOT NULL AND ABS(ret) <= $5
         GROUP BY symbol
         HAVING COUNT(ret) >= $6 AND STDDEV_SAMP(ret) > 0
       )
       SELECT symbol AS ticker,
              avg_daily_ret, vol_daily_ret, n_days,
              avg_daily_ret / vol_daily_ret AS risk_adj_score,
              ROW_NUMBER() OVER (ORDER BY avg_daily_ret / vol_daily_ret DESC) AS rn
       FROM stats
       ORDER BY risk_adj_score DESC
       LIMIT $3`,
      [start.value, end.value, topN.value, PENNY_MIN_AVG_CLOSE, RET_OUTLIER_CLIP, coverageFloor],
    );

    if (rows.length === 0) return res.status(204).send();
    return res.status(200).json(rows);
  } catch (err) {
    return dbError(res, err);
  }
}

// parsePositiveFloat — like parsePositiveInt but permits decimals,
// used for z_threshold on the volume-spikes endpoint.
function parsePositiveFloat(raw, fallback) {
  if (raw === undefined) return { ok: true, value: fallback };
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return { ok: false };
  return { ok: true, value: n };
}

// --- Volume spike constants ---
//
// LIQUIDITY_MIN_ROLLING_AVG_VOL (100k shares): rolling 60-day average
//   volume must reach this bar for a day to be eligible. Anomaly-
//   detection on thinly-traded tickers (e.g. 60 shares/day rolling
//   average, then one day with 5,000) produces z-scores in the hundreds
//   that aren't meaningful. 100k is a common investable-universe floor
//   (Fleming & Remolona, 1999; standard quant screens).
//
// Z_SCORE_CAP (10): cap per-day z-scores before averaging. Without the
//   cap, a day where rolling stddev happens to be near-zero can produce
//   z > 1000 and dominate the per-ticker average. 10 is far beyond any
//   meaningful "unusual volume" signal (4 stdevs is already ~0.003% of
//   a normal distribution).
const LIQUIDITY_MIN_ROLLING_AVG_VOL = 100000;
const Z_SCORE_CAP = 10;

/**
 * GET /stocks/volume-spikes?start_date&end_date&z_threshold
 *
 * Per-ticker count of trading days where volume's rolling 60-day
 * z-score >= threshold. Standard volume-anomaly z-score:
 *   z_t = (v_t - μ_60(v)) / σ_60(v)
 * over a trailing 60-trading-day window that excludes the current day
 * (so "today's" volume can't pollute its own baseline).
 *
 * Filters:
 *   * μ_60 >= 100k shares — liquidity floor; see above.
 *   * Per-day z capped at 10 before averaging; see above.
 */
async function getVolumeSpikes(req, res) {
  const start = parseDate(req.query.start_date);
  const end = parseDate(req.query.end_date);
  const z = parsePositiveFloat(req.query.z_threshold, 2.0);

  if (!start.ok || !end.ok) {
    return res.status(400).json({ error: 'start_date and end_date (YYYY-MM-DD) required' });
  }
  if (!z.ok) {
    return res.status(422).json({ error: 'z_threshold must be a positive number' });
  }

  try {
    const { rows } = await pool.query(
      `WITH rolling AS (
         SELECT symbol, trade_date, volume,
                AVG(volume) OVER w         AS avg60,
                STDDEV_SAMP(volume) OVER w AS std60
         FROM combined_stock_data_staging
         WHERE trade_date BETWEEN ($1::date - INTERVAL '120 days') AND $2::date
         WINDOW w AS (PARTITION BY symbol ORDER BY trade_date
                      ROWS BETWEEN 60 PRECEDING AND 1 PRECEDING)
       ),
       z AS (
         SELECT symbol, trade_date,
                (volume - avg60) / NULLIF(std60, 0) AS zscore
         FROM rolling
         WHERE avg60 >= $4  -- liquidity floor
       )
       SELECT symbol AS ticker,
              COUNT(*)                     AS spike_days,
              AVG(LEAST(zscore, $5::numeric)) AS avg_zscore
       FROM z
       WHERE trade_date BETWEEN $1 AND $2 AND zscore >= $3
       GROUP BY symbol
       -- Spike COUNT is the primary signal ("how unusual was this ticker's
       -- volume activity?"). Without this, the cap flattens the top and
       -- the ordering becomes alphabetical-ish noise.
       ORDER BY spike_days DESC, avg_zscore DESC
       LIMIT 50`,
      [start.value, end.value, z.value, LIQUIDITY_MIN_ROLLING_AVG_VOL, Z_SCORE_CAP],
    );

    if (rows.length === 0) return res.status(204).send();
    return res.status(200).json(rows);
  } catch (err) {
    return dbError(res, err);
  }
}

// Factory: builds a handler that always responds 501 with the
// { phase, reason } envelope the UI's ComingSoonCard expects.
// Two kinds of stubs:
//   * phase 2 — unlocks once `news_article` lands.
//   * phase "later" — needs industry/sector/multi-source tables from
//     the broader Chen diagram, out of scope for this doc.
function makeStub(phase, reason) {
  return (_req, res) => res.status(501).json({ phase, reason });
}

const stubs = {
  industriesLeaderboard: makeStub(
    'later',
    'Requires tables not yet populated: company, industry, sector',
  ),
  industriesRotation: makeStub(
    'later',
    'Requires tables not yet populated: company, industry, sector',
  ),
  stocksSourceDisagreement: makeStub(
    'later',
    'Requires multi-source price tables not yet populated',
  ),
  newsSourceImpact: makeStub(
    2,
    'Requires tables not yet populated: news_article, article_mention',
  ),
  newsReturnCorrelation: makeStub(
    2,
    'Requires tables not yet populated: news_article, article_mention',
  ),
};

module.exports = {
  initRoutes,
  health,
  searchCompanies,
  getCompany,
  getStockHistory,
  getSimilarCompanies,
  getRiskAdjusted,
  getVolumeSpikes,
  stubs,
};
