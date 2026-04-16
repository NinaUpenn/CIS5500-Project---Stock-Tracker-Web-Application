// routes.js
//
// One exported handler per endpoint. Each handler receives the Express
// (req, res) pair. The shared `pg.Pool` is injected at module load via
// `initRoutes(pool)` — that keeps handlers easy to unit-test (tests call
// `initRoutes(fakePool)` and then `request(app)`).
//
// All SQL matches the source-of-truth document:
//   personal-notes/SQL for the final core API routes_queries.md
//
// 10 core routes + 3 helper routes, normalized against:
//   company, industry, sector, company_profile, company_financial_snapshot,
//   news_article, article_mention, price_daily, primary_price_daily view.
//
// All SQL MUST be parameterized ($1, $2, ...). Never interpolate user
// input into a query string.

let pool = null;

function initRoutes(injectedPool) {
  pool = injectedPool;
}

const SERVER_STARTED_AT = Date.now();
const API_VERSION = 'v1';

/**
 * @openapi
 * /health:
 *   get:
 *     summary: Liveness + database readiness probe
 *     description: >
 *       Returns 200 when the server is up and can reach Postgres. Returns
 *       503 when the DB probe fails (server is serving traffic but data
 *       routes will error).
 *     tags: [Meta]
 *     responses:
 *       200:
 *         description: Server and database both healthy
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/HealthReport' }
 *       503:
 *         description: Server up, database unreachable
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/HealthReport' }
 */
async function health(_req, res) {
  const base = {
    status: 'ok',
    time: new Date().toISOString(),
    api_version: API_VERSION,
    uptime_s: Math.round((Date.now() - SERVER_STARTED_AT) / 1000),
  };

  // Quick round-trip to Postgres: proves the pool is live and returns a
  // useful server_version string. `version()` is cheap (no table access).
  const t0 = Date.now();
  try {
    const { rows } = await pool.query('SELECT version() AS server_version');
    return res.status(200).json({
      ...base,
      database: {
        reachable: true,
        latency_ms: Date.now() - t0,
        server_version: rows[0].server_version,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(503).json({
      ...base,
      status: 'degraded',
      database: {
        reachable: false,
        latency_ms: Date.now() - t0,
        error: err.message,
      },
    });
  }
}

function dbError(res, err) {
  console.error(err);
  res.status(500).json({ error: 'database error' });
}

// ---------- param parsing helpers ----------

function parsePositiveInt(raw, fallback) {
  if (raw === undefined || raw === null || raw === '') return { value: fallback, ok: true };
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) return { ok: false };
  return { value: n, ok: true };
}

function parseDate(raw) {
  if (raw === undefined || raw === null || raw === '') return { ok: true, value: null };
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return { ok: false };
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? { ok: false } : { ok: true, value: raw };
}

function parseRequiredDate(raw) {
  if (!raw) return { ok: false };
  return parseDate(raw);
}

// ---------- Route 1 — GET /api/companies/search ----------

/**
 * @openapi
 * /companies/search:
 *   get:
 *     summary: Prefix search companies by ticker or name
 *     tags: [Companies]
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema: { type: string }
 *         description: Search text. Matches ticker prefix or company-name prefix.
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20, minimum: 1 }
 *     responses:
 *       200:
 *         description: Matching companies ranked by prefix specificity then ticker
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/CompanyListing' }
 *       204: { description: No matches }
 *       400:
 *         description: q missing
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       422: { description: limit is not a positive integer }
 *       500: { description: Database error }
 */
async function searchCompanies(req, res) {
  const { q } = req.query;
  if (!q || typeof q !== 'string' || q.trim() === '') {
    return res.status(400).json({ error: 'q is required' });
  }
  const limit = parsePositiveInt(req.query.limit, 20);
  if (!limit.ok) {
    return res.status(422).json({ error: 'limit must be a positive integer' });
  }

  try {
    const { rows } = await pool.query(
      `select
         c.company_id,
         c.ticker,
         c.company_name,
         i.industry_name,
         s.sector_name
       from company c
       left join industry i on i.industry_id = c.industry_id
       left join sector s on s.sector_id = i.sector_id
       where nullif(trim($1), '') is not null
         and (
           c.ticker ilike upper(trim($1)) || '%'
           or c.company_name ilike trim($1) || '%'
         )
       order by
         case
           when c.ticker = upper(trim($1)) then 0
           when c.ticker ilike upper(trim($1)) || '%' then 1
           when c.company_name ilike trim($1) || '%' then 2
           else 3
         end,
         c.ticker
       limit coalesce($2::int, 20)`,
      [q, limit.value],
    );
    if (rows.length === 0) return res.status(204).send();
    return res.status(200).json(rows);
  } catch (err) {
    return dbError(res, err);
  }
}

// ---------- Route 2 — GET /api/companies/:ticker ----------

/**
 * @openapi
 * /companies/{ticker}:
 *   get:
 *     summary: Full company profile
 *     description: >
 *       Joins company, industry, sector, company_profile,
 *       company_financial_snapshot, and the most recent row from
 *       primary_price_daily.
 *     tags: [Companies]
 *     parameters:
 *       - in: path
 *         name: ticker
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Rich company row with profile + snapshot + latest trade
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/CompanyProfile' }
 *       404: { description: Ticker not found }
 *       500: { description: Database error }
 */
async function getCompany(req, res) {
  const ticker = String(req.params.ticker || '').trim();
  if (!ticker) return res.status(400).json({ error: 'ticker required' });

  try {
    const { rows } = await pool.query(
      `select
         c.company_id,
         c.ticker,
         c.company_name,
         c.exchange,
         c.cik,
         i.industry_name,
         s.sector_name,

         cp.short_name,
         cp.long_name,
         cp.city,
         cp.state,
         cp.country,
         cp.long_business_summary,
         cp.current_price as profile_current_price,
         cp.market_cap as profile_market_cap,
         cp.ebitda as profile_ebitda,
         cp.revenue_growth as profile_revenue_growth,
         cp.weight as sp500_weight,

         cfs.price as snapshot_price,
         cfs.price_earnings,
         cfs.dividend_yield,
         cfs.earnings_share,
         cfs.week_52_low,
         cfs.week_52_high,
         cfs.market_cap as snapshot_market_cap,
         cfs.ebitda as snapshot_ebitda,
         cfs.price_sales,
         cfs.price_book,
         cfs.sec_filings,

         lp.trading_date as latest_trading_date,
         lp.close as latest_close,
         lp.volume as latest_volume
       from company c
       left join industry i on i.industry_id = c.industry_id
       left join sector s on s.sector_id = i.sector_id
       left join company_profile cp on cp.company_id = c.company_id
       left join company_financial_snapshot cfs on cfs.company_id = c.company_id
       left join lateral (
         select pp.trading_date, pp.close, pp.volume
         from primary_price_daily pp
         where pp.company_id = c.company_id
         order by pp.trading_date desc
         limit 1
       ) lp on true
       where c.ticker = upper(trim($1))`,
      [ticker],
    );
    const row = rows[0];
    if (!row) return res.status(404).json({ error: 'ticker not found' });
    return res.status(200).json(row);
  } catch (err) {
    return dbError(res, err);
  }
}

// ---------- Route 3 — GET /api/companies/:ticker/prices ----------

/**
 * @openapi
 * /companies/{ticker}/prices:
 *   get:
 *     summary: OHLCV price series with sector benchmark + moving averages
 *     description: >
 *       Returns daily OHLCV for the ticker plus per-day sector-average close,
 *       sector-relative close rank, 7- and 30-day moving averages, and daily
 *       return percent.
 *     tags: [Companies]
 *     parameters:
 *       - in: path
 *         name: ticker
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: start_date
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: end_date
 *         schema: { type: string, format: date }
 *     responses:
 *       200:
 *         description: Daily price rows in ascending date order
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/CompanyPriceRow' }
 *       204: { description: No prices in range }
 *       400: { description: Malformed dates }
 *       500: { description: Database error }
 */
async function getCompanyPrices(req, res) {
  const ticker = String(req.params.ticker || '').trim();
  if (!ticker) return res.status(400).json({ error: 'ticker required' });
  const start = parseDate(req.query.start_date);
  const end = parseDate(req.query.end_date);
  if (!start.ok || !end.ok) {
    return res.status(400).json({ error: 'start_date / end_date must be YYYY-MM-DD' });
  }

  try {
    const { rows } = await pool.query(
      `with target as (
         select c.company_id, c.ticker, c.company_name,
                i.industry_id, i.industry_name,
                s.sector_id, s.sector_name
         from company c
         join industry i on i.industry_id = c.industry_id
         join sector s on s.sector_id = i.sector_id
         where c.ticker = upper(trim($1))
       ),
       company_prices as (
         select pp.company_id, pp.trading_date, pp.open, pp.high, pp.low,
                pp.close, pp.adj_close, pp.volume
         from primary_price_daily pp
         join target t on t.company_id = pp.company_id
         where ($2::date is null or pp.trading_date >= $2::date)
           and ($3::date is null or pp.trading_date <= $3::date)
       ),
       sector_prices as (
         select pp.company_id, pp.trading_date, pp.close
         from primary_price_daily pp
         join company c on c.company_id = pp.company_id
         join industry i on i.industry_id = c.industry_id
         join target t on t.sector_id = i.sector_id
         where ($2::date is null or pp.trading_date >= $2::date)
           and ($3::date is null or pp.trading_date <= $3::date)
       ),
       sector_benchmark as (
         select trading_date, avg(close) as sector_avg_close
         from sector_prices
         group by trading_date
       ),
       sector_ranks as (
         select trading_date, company_id,
                rank() over (partition by trading_date order by close desc nulls last) as sector_price_rank
         from sector_prices
       )
       select
         t.company_name,
         t.ticker,
         t.sector_name,
         t.industry_name,
         cp.trading_date,
         cp.open, cp.high, cp.low, cp.close, cp.adj_close, cp.volume,
         (cp.close / nullif(lag(cp.close) over (order by cp.trading_date), 0) - 1) * 100 as daily_return_pct,
         avg(cp.close) over (order by cp.trading_date rows between 6 preceding and current row) as ma_7_day,
         avg(cp.close) over (order by cp.trading_date rows between 29 preceding and current row) as ma_30_day,
         sb.sector_avg_close,
         sr.sector_price_rank
       from company_prices cp
       cross join target t
       left join sector_benchmark sb on sb.trading_date = cp.trading_date
       left join sector_ranks sr on sr.company_id = cp.company_id
                                 and sr.trading_date = cp.trading_date
       order by cp.trading_date`,
      [ticker, start.value, end.value],
    );
    if (rows.length === 0) return res.status(204).send();
    return res.status(200).json(rows);
  } catch (err) {
    return dbError(res, err);
  }
}

// ---------- Route 4 — GET /api/stocks/top-gainers ----------

/**
 * @openapi
 * /stocks/top-gainers:
 *   get:
 *     summary: Daily top gainers vs sector average
 *     description: >
 *       Stocks whose day-over-day return beat their own sector average on the
 *       given trading day. Previous trading day is found per-company via
 *       LATERAL so weekends/holidays stay aligned.
 *     tags: [Stocks]
 *     parameters:
 *       - in: query
 *         name: trading_date
 *         required: true
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10, minimum: 1 }
 *     responses:
 *       200:
 *         description: Gainer rows ordered by pct_change desc
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/TopGainerRow' }
 *       204: { description: No gainers for that date }
 *       400: { description: trading_date missing or malformed }
 *       500: { description: Database error }
 */
async function getTopGainers(req, res) {
  const tradingDate = parseRequiredDate(req.query.trading_date);
  if (!tradingDate.ok) {
    return res.status(400).json({ error: 'trading_date (YYYY-MM-DD) is required' });
  }
  const limit = parsePositiveInt(req.query.limit, 10);
  if (!limit.ok) return res.status(422).json({ error: 'limit must be a positive integer' });

  try {
    const { rows } = await pool.query(
      `with latest as (
         select pp.company_id, pp.trading_date, pp.close
         from primary_price_daily pp
         where pp.trading_date = $1::date
       ),
       with_prev as (
         select l.company_id, l.trading_date, l.close,
                p.prev_trading_date, p.prev_close,
                (l.close / nullif(p.prev_close, 0) - 1) * 100 as pct_change
         from latest l
         join lateral (
           select pp2.trading_date as prev_trading_date, pp2.close as prev_close
           from primary_price_daily pp2
           where pp2.company_id = l.company_id and pp2.trading_date < l.trading_date
           order by pp2.trading_date desc
           limit 1
         ) p on true
       ),
       sector_avg as (
         select i.sector_id, avg(wp.pct_change) as avg_sector_change
         from with_prev wp
         join company c on c.company_id = wp.company_id
         join industry i on i.industry_id = c.industry_id
         group by i.sector_id
       )
       select
         c.ticker, c.company_name,
         s.sector_name, i.industry_name,
         wp.trading_date, wp.prev_trading_date,
         wp.close, wp.prev_close, wp.pct_change,
         sa.avg_sector_change,
         rank() over (partition by s.sector_id order by wp.pct_change desc) as sector_rank
       from with_prev wp
       join company c on c.company_id = wp.company_id
       join industry i on i.industry_id = c.industry_id
       join sector s on s.sector_id = i.sector_id
       join sector_avg sa on sa.sector_id = s.sector_id
       where wp.pct_change > sa.avg_sector_change
       order by wp.pct_change desc
       limit coalesce($2::int, 10)`,
      [tradingDate.value, limit.value],
    );
    if (rows.length === 0) return res.status(204).send();
    return res.status(200).json(rows);
  } catch (err) {
    return dbError(res, err);
  }
}

// ---------- Route 5 — GET /api/stocks/top-average-returns ----------
// Window is ~30 calendar days (~21 trading days); the min_observations
// floor (default 10) guards against short-history tickers.

/**
 * @openapi
 * /stocks/top-average-returns:
 *   get:
 *     summary: Ranked average daily return leaderboard (~30d window)
 *     description: >
 *       Ranks tickers by mean daily return over the 30-calendar-day window
 *       ending on `end_date` (or the latest trading day if omitted).
 *       Tickers with fewer than `min_observations` valid days are excluded.
 *     tags: [Stocks]
 *     parameters:
 *       - in: query
 *         name: end_date
 *         schema: { type: string, format: date }
 *         description: Anchor date; defaults to latest trading day in the dataset.
 *       - in: query
 *         name: min_observations
 *         schema: { type: integer, default: 10, minimum: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 5, minimum: 1 }
 *     responses:
 *       200:
 *         description: Ranked tickers
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/TopReturnRow' }
 *       204: { description: No qualifying tickers }
 *       500: { description: Database error }
 */
async function getTopAverageReturns(req, res) {
  const endDate = parseDate(req.query.end_date);
  if (!endDate.ok) return res.status(400).json({ error: 'end_date must be YYYY-MM-DD' });
  const minObs = parsePositiveInt(req.query.min_observations, 10);
  if (!minObs.ok) return res.status(422).json({ error: 'min_observations must be a positive integer' });
  const limit = parsePositiveInt(req.query.limit, 5);
  if (!limit.ok) return res.status(422).json({ error: 'limit must be a positive integer' });

  try {
    const { rows } = await pool.query(
      `with anchor as (
         select coalesce(
           (select max(trading_date) from primary_price_daily
            where trading_date <= coalesce($1::date, current_date)),
           (select max(trading_date) from primary_price_daily)
         ) as end_date
       ),
       daily_returns as (
         select pp.company_id, pp.trading_date,
                (pp.close / nullif(lag(pp.close) over (
                  partition by pp.company_id order by pp.trading_date
                ), 0) - 1) as daily_return
         from primary_price_daily pp
         cross join anchor a
         where pp.trading_date between a.end_date - interval '30 days' and a.end_date
       ),
       return_stats as (
         select company_id,
                avg(daily_return) as avg_daily_return,
                stddev_samp(daily_return) as return_volatility,
                count(daily_return) as n_obs
         from daily_returns
         where daily_return is not null
         group by company_id
         having count(daily_return) >= coalesce($2::int, 10)
       )
       select
         c.ticker, c.company_name,
         i.industry_name, s.sector_name,
         rs.avg_daily_return, rs.return_volatility, rs.n_obs,
         rank() over (order by rs.avg_daily_return desc) as return_rank
       from return_stats rs
       join company c on c.company_id = rs.company_id
       join industry i on i.industry_id = c.industry_id
       join sector s on s.sector_id = i.sector_id
       order by return_rank
       limit coalesce($3::int, 5)`,
      [endDate.value, minObs.value, limit.value],
    );
    if (rows.length === 0) return res.status(204).send();
    return res.status(200).json(rows);
  } catch (err) {
    return dbError(res, err);
  }
}

// ---------- Route 6 — GET /api/sectors/momentum ----------
// return_7d is a 7 trading-day lag (~9 calendar).

/**
 * @openapi
 * /sectors/momentum:
 *   get:
 *     summary: 7-trading-day momentum within each sector
 *     description: >
 *       Surfaces stocks whose 7-trading-day return beats their own sector
 *       average. Ranked within each sector. Anchor defaults to the latest
 *       trading day in the dataset.
 *     tags: [Sectors]
 *     parameters:
 *       - in: query
 *         name: as_of_date
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: sector_name
 *         schema: { type: string }
 *         description: Optional filter to a single sector.
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 200, minimum: 1 }
 *     responses:
 *       200:
 *         description: Momentum leaders
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/SectorMomentumRow' }
 *       204: { description: No rows meet the filter }
 *       400: { description: Malformed as_of_date }
 *       500: { description: Database error }
 */
async function getSectorMomentum(req, res) {
  const asOf = parseDate(req.query.as_of_date);
  if (!asOf.ok) return res.status(400).json({ error: 'as_of_date must be YYYY-MM-DD' });
  const sectorName = req.query.sector_name && String(req.query.sector_name).trim() !== ''
    ? String(req.query.sector_name)
    : null;
  const limit = parsePositiveInt(req.query.limit, 200);
  if (!limit.ok) return res.status(422).json({ error: 'limit must be a positive integer' });

  try {
    const { rows } = await pool.query(
      `with anchor as (
         select coalesce(
           (select max(trading_date) from primary_price_daily
            where trading_date <= coalesce($1::date, current_date)),
           (select max(trading_date) from primary_price_daily)
         ) as as_of_date
       ),
       all_series as (
         select pp.company_id, pp.trading_date, pp.close,
                lag(pp.close, 7) over (partition by pp.company_id order by pp.trading_date) as close_7d_ago
         from primary_price_daily pp
       ),
       asof_returns as (
         select s.company_id, a.as_of_date,
                (s.close / nullif(s.close_7d_ago, 0) - 1) * 100 as return_7d
         from all_series s
         join anchor a on s.trading_date = a.as_of_date
         where s.close_7d_ago is not null
       ),
       sector_avg as (
         select i.sector_id, avg(ar.return_7d) as avg_sector_return
         from asof_returns ar
         join company c on c.company_id = ar.company_id
         join industry i on i.industry_id = c.industry_id
         group by i.sector_id
       ),
       ranked as (
         select
           c.ticker, c.company_name,
           i.industry_name, se.sector_name,
           ar.as_of_date, ar.return_7d,
           sa.avg_sector_return,
           rank() over (partition by se.sector_id order by ar.return_7d desc) as sector_rank
         from asof_returns ar
         join company c on c.company_id = ar.company_id
         join industry i on i.industry_id = c.industry_id
         join sector se on se.sector_id = i.sector_id
         join sector_avg sa on sa.sector_id = se.sector_id
         where ($2::text is null or se.sector_name = $2)
       )
       select ticker, company_name, industry_name, sector_name,
              as_of_date, return_7d, avg_sector_return, sector_rank
       from ranked
       where return_7d > avg_sector_return
       order by sector_name, sector_rank
       limit coalesce($3::int, 200)`,
      [asOf.value, sectorName, limit.value],
    );
    if (rows.length === 0) return res.status(204).send();
    return res.status(200).json(rows);
  } catch (err) {
    return dbError(res, err);
  }
}

// ---------- Route 7 — GET /api/companies/:ticker/news ----------

/**
 * @openapi
 * /companies/{ticker}/news:
 *   get:
 *     summary: Recent news articles mentioning the ticker
 *     tags: [Companies]
 *     parameters:
 *       - in: path
 *         name: ticker
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: lookback_days
 *         schema: { type: integer, default: 30, minimum: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10, minimum: 1 }
 *     responses:
 *       200:
 *         description: Article rows, newest first
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/CompanyNewsRow' }
 *       204: { description: No news in window }
 *       500: { description: Database error }
 */
async function getCompanyNews(req, res) {
  const ticker = String(req.params.ticker || '').trim();
  if (!ticker) return res.status(400).json({ error: 'ticker required' });
  const lookback = parsePositiveInt(req.query.lookback_days, 30);
  if (!lookback.ok) return res.status(422).json({ error: 'lookback_days must be a positive integer' });
  const limit = parsePositiveInt(req.query.limit, 10);
  if (!limit.ok) return res.status(422).json({ error: 'limit must be a positive integer' });

  try {
    const { rows } = await pool.query(
      `with target as (
         select c.company_id, c.ticker, c.company_name,
                i.industry_name, s.sector_name
         from company c
         left join industry i on i.industry_id = c.industry_id
         left join sector s on s.sector_id = i.sector_id
         where c.ticker = upper(trim($1))
       ),
       mention_stats as (
         select am.company_id,
                count(distinct na.article_id) filter (
                  where na.published_at >= current_timestamp
                        - (coalesce($2::int, 30) * interval '1 day')
                ) as articles_in_window
         from article_mention am
         join news_article na on na.article_id = am.article_id
         group by am.company_id
       )
       select
         t.company_name, t.ticker, t.sector_name, t.industry_name,
         na.source, na.published_at, na.title, na.summary, na.url,
         na.lm_level, na.lm_score1, na.lm_score2, na.lm_sentiment,
         am.mention_confidence,
         ms.articles_in_window,
         rank() over (
           partition by t.company_id
           order by na.published_at desc, na.article_id desc
         ) as recency_rank
       from target t
       join article_mention am on am.company_id = t.company_id
       join news_article na on na.article_id = am.article_id
       left join mention_stats ms on ms.company_id = t.company_id
       where na.published_at >= current_timestamp
             - (coalesce($2::int, 30) * interval '1 day')
       order by na.published_at desc, na.article_id desc
       limit coalesce($3::int, 10)`,
      [ticker, lookback.value, limit.value],
    );
    if (rows.length === 0) return res.status(204).send();
    return res.status(200).json(rows);
  } catch (err) {
    return dbError(res, err);
  }
}

// ---------- Route 8 — GET /api/news/trending ----------

/**
 * @openapi
 * /news/trending:
 *   get:
 *     summary: Tickers with unusually high news-mention counts vs sector avg
 *     tags: [News]
 *     parameters:
 *       - in: query
 *         name: lookback_days
 *         schema: { type: integer, default: 30, minimum: 1 }
 *       - in: query
 *         name: min_articles
 *         schema: { type: integer, default: 5, minimum: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10, minimum: 1 }
 *     responses:
 *       200:
 *         description: Trending tickers ordered by article_count desc
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/TrendingNewsRow' }
 *       204: { description: No trending rows }
 *       500: { description: Database error }
 */
async function getTrendingNews(req, res) {
  const lookback = parsePositiveInt(req.query.lookback_days, 30);
  if (!lookback.ok) return res.status(422).json({ error: 'lookback_days must be a positive integer' });
  const minArticles = parsePositiveInt(req.query.min_articles, 5);
  if (!minArticles.ok) return res.status(422).json({ error: 'min_articles must be a positive integer' });
  const limit = parsePositiveInt(req.query.limit, 10);
  if (!limit.ok) return res.status(422).json({ error: 'limit must be a positive integer' });

  try {
    const { rows } = await pool.query(
      `with windowed_mentions as (
         select am.company_id, na.article_id
         from article_mention am
         join news_article na on na.article_id = am.article_id
         where na.published_at >= current_timestamp
               - (coalesce($1::int, 30) * interval '1 day')
       ),
       mention_counts as (
         select company_id, count(distinct article_id) as article_count
         from windowed_mentions
         group by company_id
       ),
       sector_avg as (
         select i.sector_id, avg(mc.article_count) as avg_sector_mentions
         from mention_counts mc
         join company c on c.company_id = mc.company_id
         join industry i on i.industry_id = c.industry_id
         group by i.sector_id
       )
       select
         c.ticker, c.company_name,
         s.sector_name, i.industry_name,
         mc.article_count,
         sa.avg_sector_mentions,
         rank() over (partition by s.sector_id order by mc.article_count desc) as sector_rank
       from mention_counts mc
       join company c on c.company_id = mc.company_id
       join industry i on i.industry_id = c.industry_id
       join sector s on s.sector_id = i.sector_id
       join sector_avg sa on sa.sector_id = s.sector_id
       where mc.article_count >= coalesce($2::int, 5)
         and mc.article_count > sa.avg_sector_mentions
       order by mc.article_count desc
       limit coalesce($3::int, 10)`,
      [lookback.value, minArticles.value, limit.value],
    );
    if (rows.length === 0) return res.status(204).send();
    return res.status(200).json(rows);
  } catch (err) {
    return dbError(res, err);
  }
}

// ---------- Route 9 — GET /api/prices/source-disagreement ----------
// Uses raw price_daily (not primary_price_daily) on purpose — we want to
// compare sources, and primary_price_daily picks only the highest-priority
// source per (company, date).

/**
 * @openapi
 * /prices/source-disagreement:
 *   get:
 *     summary: Days where different price feeds reported different closes
 *     description: Intentionally uses raw price_daily so multiple sources per day are preserved.
 *     tags: [Prices]
 *     parameters:
 *       - in: query
 *         name: start_date
 *         required: true
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: end_date
 *         required: true
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: min_sources
 *         schema: { type: integer, default: 2, minimum: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50, minimum: 1 }
 *     responses:
 *       200:
 *         description: Worst disagreement day per ticker in the window
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/SourceDisagreementRow' }
 *       204: { description: No disagreements in window }
 *       400: { description: Dates missing or malformed }
 *       500: { description: Database error }
 */
async function getSourceDisagreement(req, res) {
  const start = parseRequiredDate(req.query.start_date);
  const end = parseRequiredDate(req.query.end_date);
  if (!start.ok || !end.ok) {
    return res.status(400).json({ error: 'start_date and end_date (YYYY-MM-DD) required' });
  }
  const minSources = parsePositiveInt(req.query.min_sources, 2);
  if (!minSources.ok) return res.status(422).json({ error: 'min_sources must be a positive integer' });
  const limit = parsePositiveInt(req.query.limit, 50);
  if (!limit.ok) return res.status(422).json({ error: 'limit must be a positive integer' });

  try {
    const { rows } = await pool.query(
      `with spans as (
         select pd.company_id, pd.trading_date,
                count(*) as n_sources,
                min(pd.close) as min_close,
                max(pd.close) as max_close,
                max(pd.close) - min(pd.close) as close_spread,
                ((max(pd.close) - min(pd.close)) / nullif(avg(pd.close), 0)) * 100 as pct_spread
         from price_daily pd
         where pd.trading_date between $1::date and $2::date
           and pd.close is not null
         group by pd.company_id, pd.trading_date
         having count(*) >= coalesce($3::int, 2)
       ),
       ranked as (
         select c.ticker, c.company_name,
                s.trading_date, s.n_sources,
                s.min_close, s.max_close, s.close_spread, s.pct_spread,
                row_number() over (
                  partition by s.company_id
                  order by s.pct_spread desc nulls last,
                           s.close_spread desc nulls last,
                           s.trading_date desc
                ) as rn
         from spans s
         join company c on c.company_id = s.company_id
       )
       select ticker, company_name, trading_date,
              n_sources, min_close, max_close, close_spread, pct_spread
       from ranked
       where rn = 1
       order by pct_spread desc nulls last, close_spread desc nulls last
       limit coalesce($4::int, 50)`,
      [start.value, end.value, minSources.value, limit.value],
    );
    if (rows.length === 0) return res.status(204).send();
    return res.status(200).json(rows);
  } catch (err) {
    return dbError(res, err);
  }
}

// ---------- Route 10 — GET /api/industries/rotations ----------
// Guards `ln(1 + ret)` against ret <= -1 (stock drops ≥100% in a day).

/**
 * @openapi
 * /industries/rotations:
 *   get:
 *     summary: Month-over-month rank shifts of industries within their sector
 *     description: >
 *       Per-industry monthly return = geometric mean of constituent tickers'
 *       compounded daily returns. Ranked within each sector, then compared
 *       against the previous month to surface the largest rotations.
 *     tags: [Industries]
 *     parameters:
 *       - in: query
 *         name: start_date
 *         required: true
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: end_date
 *         required: true
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50, minimum: 1 }
 *     responses:
 *       200:
 *         description: Top rotations ordered by |Δ rank| desc
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/IndustryRotationRow' }
 *       204: { description: No rotations detected }
 *       400: { description: Dates missing or malformed }
 *       500: { description: Database error }
 */
async function getIndustryRotations(req, res) {
  const start = parseRequiredDate(req.query.start_date);
  const end = parseRequiredDate(req.query.end_date);
  if (!start.ok || !end.ok) {
    return res.status(400).json({ error: 'start_date and end_date (YYYY-MM-DD) required' });
  }
  const limit = parsePositiveInt(req.query.limit, 50);
  if (!limit.ok) return res.status(422).json({ error: 'limit must be a positive integer' });

  try {
    const { rows } = await pool.query(
      `with daily_returns as (
         select pp.company_id, pp.trading_date,
                (pp.close / nullif(lag(pp.close) over (
                  partition by pp.company_id order by pp.trading_date
                ), 0) - 1) as ret
         from primary_price_daily pp
         where pp.trading_date between $1::date and $2::date
       ),
       company_month as (
         select dr.company_id,
                date_trunc('month', dr.trading_date)::date as month,
                exp(sum(ln(greatest(1 + dr.ret, 1e-9)))) - 1 as month_ret
         from daily_returns dr
         where dr.ret is not null and dr.ret > -0.999
         group by dr.company_id, date_trunc('month', dr.trading_date)::date
       ),
       industry_month as (
         select s.sector_name, i.industry_name, cm.month,
                avg(cm.month_ret) as industry_month_ret
         from company_month cm
         join company c on c.company_id = cm.company_id
         join industry i on i.industry_id = c.industry_id
         join sector s on s.sector_id = i.sector_id
         group by s.sector_name, i.industry_name, cm.month
       ),
       ranked as (
         select *,
                rank() over (partition by sector_name, month order by industry_month_ret desc) as rnk
         from industry_month
       ),
       deltas as (
         select sector_name, industry_name, month,
                industry_month_ret, rnk,
                lag(rnk) over (partition by sector_name, industry_name order by month) as prev_rnk
         from ranked
       )
       select sector_name, industry_name, month,
              prev_rnk, rnk, (prev_rnk - rnk) as rank_improvement,
              industry_month_ret
       from deltas
       where prev_rnk is not null
       order by abs(prev_rnk - rnk) desc, month desc
       limit coalesce($3::int, 50)`,
      [start.value, end.value, limit.value],
    );
    if (rows.length === 0) return res.status(204).send();
    return res.status(200).json(rows);
  } catch (err) {
    return dbError(res, err);
  }
}

// ---------- Helper — GET /api/sectors ----------

/**
 * @openapi
 * /sectors:
 *   get:
 *     summary: List all sectors
 *     tags: [Sectors]
 *     responses:
 *       200:
 *         description: Sectors sorted by name
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/Sector' }
 *       204: { description: No sectors }
 *       500: { description: Database error }
 */
async function listSectors(_req, res) {
  try {
    const { rows } = await pool.query(
      `select sector_id, sector_name from sector order by sector_name`,
    );
    if (rows.length === 0) return res.status(204).send();
    return res.status(200).json(rows);
  } catch (err) {
    return dbError(res, err);
  }
}

// ---------- Helper — GET /api/sectors/:sector/companies ----------

/**
 * @openapi
 * /sectors/{sector}/companies:
 *   get:
 *     summary: Companies in a sector
 *     tags: [Sectors]
 *     parameters:
 *       - in: path
 *         name: sector
 *         required: true
 *         schema: { type: string }
 *         description: Sector name, matched exactly (trimmed).
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 500, minimum: 1 }
 *     responses:
 *       200:
 *         description: Company rows ordered by ticker
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/CompanyListing' }
 *       204: { description: No companies in that sector }
 *       500: { description: Database error }
 */
async function listSectorCompanies(req, res) {
  const sectorName = String(req.params.sector || '').trim();
  if (!sectorName) return res.status(400).json({ error: 'sector required' });
  const limit = parsePositiveInt(req.query.limit, 500);
  if (!limit.ok) return res.status(422).json({ error: 'limit must be a positive integer' });

  try {
    const { rows } = await pool.query(
      `select c.company_id, c.ticker, c.company_name,
              i.industry_name, s.sector_name
       from company c
       join industry i on i.industry_id = c.industry_id
       join sector s on s.sector_id = i.sector_id
       where s.sector_name = trim($1)
       order by c.ticker
       limit coalesce($2::int, 500)`,
      [sectorName, limit.value],
    );
    if (rows.length === 0) return res.status(204).send();
    return res.status(200).json(rows);
  } catch (err) {
    return dbError(res, err);
  }
}

// ---------- Helper — GET /api/companies ----------

/**
 * @openapi
 * /companies:
 *   get:
 *     summary: List all companies
 *     tags: [Companies]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 200, minimum: 1 }
 *     responses:
 *       200:
 *         description: Companies ordered by ticker
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/CompanyListing' }
 *       204: { description: No companies }
 *       500: { description: Database error }
 */
async function listCompanies(req, res) {
  const limit = parsePositiveInt(req.query.limit, 200);
  if (!limit.ok) return res.status(422).json({ error: 'limit must be a positive integer' });

  try {
    const { rows } = await pool.query(
      `select c.company_id, c.ticker, c.company_name,
              i.industry_name, s.sector_name
       from company c
       left join industry i on i.industry_id = c.industry_id
       left join sector s on s.sector_id = i.sector_id
       order by c.ticker
       limit coalesce($1::int, 200)`,
      [limit.value],
    );
    if (rows.length === 0) return res.status(204).send();
    return res.status(200).json(rows);
  } catch (err) {
    return dbError(res, err);
  }
}

module.exports = {
  initRoutes,
  health,
  // 10 core routes
  searchCompanies,
  getCompany,
  getCompanyPrices,
  getTopGainers,
  getTopAverageReturns,
  getSectorMomentum,
  getCompanyNews,
  getTrendingNews,
  getSourceDisagreement,
  getIndustryRotations,
  // 3 helpers
  listSectors,
  listSectorCompanies,
  listCompanies,
};
