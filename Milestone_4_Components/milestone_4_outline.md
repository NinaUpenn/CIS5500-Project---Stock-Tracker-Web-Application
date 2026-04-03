# Milestone 4 – API Specification
**Project:** Stock News Trader
**Team:** Philip Lee, Kartheek Gavini, Na Ni
**Due:** April 3

---

## Submission Instructions

- Export this document as a **single PDF** and upload to **Gradescope**
- One member submits — **add all teammates** to the submission
- The spec may evolve; include the **final version** in the Milestone 5 report

---

## Routes Overview

| # | Method | Path | Query | Type |
|---|---|---|---|---|
| 1 | GET | `/companies/search` | Company search by ticker/name prefix | Simple |
| 2 | GET | `/companies/:ticker` | Company profile + latest price + 30-day return | Simple/Moderate |
| 3 | GET | `/stocks/risk-adjusted` | Top N stocks per industry by risk-adjusted return | **Complex** |
| 4 | GET | `/industries/leaderboard` | Sector/industry avg return + volatility leaderboard | **Complex** |
| 5 | GET | `/industries/volume-spikes` | Volume spike leaderboard by industry (z-score) | **Complex** |
| 6 | GET | `/companies/:ticker/similar` | Similar stocks via daily return correlation | **Complex** |
| 7 | GET | `/news/source-impact` | Next-trading-day return impact by news source | **Complex** |
| 8 | GET | `/companies/news-return-correlation` | News volume vs. absolute return correlation per ticker | **Complex** |
| 9 | GET | `/stocks/source-disagreement` | Biggest cross-source close price spread per ticker | **Complex** |
| 10 | GET | `/industries/rotation` | Month-over-month industry rank changes within sector | **Complex** |
| A1 | POST | `/users` | Create a new user account (auxiliary) | — |
| A2 | POST | `/users/login` | Authenticate a user (auxiliary) | — |

---

## Route Definitions

---

### Route 1 — Company Search
**`GET /companies/search`**
**Description:** Search companies by ticker symbol or company name prefix. Returns basic metadata including sector and industry. Intended for autocomplete and navigation.

**Request Parameters:**

| Name | Param Type | Data Type | Required? | Description |
|---|---|---|---|---|
| `q` | query | string | Required | Ticker or company name prefix to search (e.g., `AAPL` or `Apple`) |
| `limit` | query | integer | Optional | Max results to return. Defaults to `50` |

**SQL Query Mapping:**
- `q` → `WHERE c.ticker ILIKE ($1 || '%') OR c.company_name ILIKE ($1 || '%')`
- `limit` → `LIMIT` clause (default 50)

**Response Schema:**

| Field | Data Type | Description |
|---|---|---|
| `company_id` | integer | Internal company identifier |
| `ticker` | string | Stock ticker symbol |
| `company_name` | string | Full company name |
| `sector_name` | string | Sector the company belongs to |
| `industry_name` | string | Industry within that sector |
| `exchange` | string | Exchange the stock is listed on |

**HTTP Status Codes:**
- `200 OK` — query executed successfully; returns array of matched companies (non-empty)
- `204 No Content` — query ran successfully but no companies matched the given prefix
- `400 Bad Request` — `q` param is missing or is an empty string
- `422 Unprocessable Entity` — `limit` param provided but is not a positive integer
- `500 Internal Server Error` — unexpected database error during search

---

### Route 2 — Company Profile
**`GET /companies/:ticker`**
**Description:** Fetch a company's full profile, latest closing price and volume, and approximate 30-trading-day return. Powers the stock detail page header.

**Request Parameters:**

| Name | Param Type | Data Type | Required? | Description |
|---|---|---|---|---|
| `ticker` | path | string | Required | Stock ticker symbol (e.g., `AAPL`) |

**SQL Query Mapping:**
- `ticker` → `WHERE c.ticker = $1` in the `co` CTE
- Latest price resolved via `DISTINCT ON (company_id, trading_date)` ordered by `priority_rank`
- 30-day lookback via `OFFSET 29 LIMIT 1` on descending date order

**Response Schema:**

| Field | Data Type | Description |
|---|---|---|
| `company_id` | integer | Internal company identifier |
| `ticker` | string | Stock ticker symbol |
| `company_name` | string | Full company name |
| `exchange` | string | Listing exchange |
| `cik` | string | SEC CIK identifier |
| `industry_name` | string | Industry name |
| `sector_name` | string | Sector name |
| `latest_date` | date | Most recent trading date with price data |
| `latest_close` | float | Closing price on the latest trading date |
| `latest_volume` | integer | Volume on the latest trading date |
| `return_30_trading_days` | float | Approximate 30-trading-day return (null if insufficient data) |

**HTTP Status Codes:**
- `200 OK` — ticker found; profile and latest price returned (note: `return_30_trading_days` may be `null` if fewer than 30 trading days of price data exist)
- `404 Not Found` — ticker does not exist in the `company` table
- `400 Bad Request` — ticker path param is empty or contains invalid characters
- `500 Internal Server Error` — unexpected database error fetching profile or price data

---

### Route 3 — Top Stocks by Risk-Adjusted Return ⚡ Complex
**`GET /stocks/risk-adjusted`**
**Description:** For each industry, rank the top N stocks by a Sharpe-like risk-adjusted score (mean daily return ÷ return volatility) over a specified date range. Uses multi-join, window functions, and aggregation.

**Request Parameters:**

| Name | Param Type | Data Type | Required? | Description |
|---|---|---|---|---|
| `start_date` | query | date (YYYY-MM-DD) | Required | Start of the evaluation window |
| `end_date` | query | date (YYYY-MM-DD) | Required | End of the evaluation window |
| `top_n` | query | integer | Optional | Number of top stocks to return per industry. Defaults to `5` |

**SQL Query Mapping:**
- `start_date`, `end_date` → `WHERE pd.trading_date BETWEEN $1 AND $2`
- `top_n` → `WHERE rn <= $3` in the `ranked` CTE
- Minimum 20 trading days enforced: `WHERE n_days >= 20`

**Response Schema:**

| Field | Data Type | Description |
|---|---|---|
| `company_id` | integer | Internal company identifier |
| `ticker` | string | Stock ticker symbol |
| `company_name` | string | Full company name |
| `industry_name` | string | Industry name |
| `sector_name` | string | Sector name |
| `avg_daily_ret` | float | Mean daily return over the date range |
| `vol_daily_ret` | float | Daily return standard deviation (sample) |
| `n_days` | integer | Number of trading days with return data |
| `risk_adj_score` | float | avg_daily_ret / vol_daily_ret (Sharpe-like) |
| `rn` | integer | Rank within industry (1 = best) |

**HTTP Status Codes:**
- `200 OK` — ranked results returned across at least one industry
- `204 No Content` — query ran but no stocks met the minimum 20-trading-day threshold in the given date range
- `400 Bad Request` — `start_date` or `end_date` is missing, or `end_date` is before `start_date`
- `422 Unprocessable Entity` — date values are not valid `YYYY-MM-DD` format, or `top_n` is not a positive integer
- `500 Internal Server Error` — unexpected database error during window/aggregation computation

---

### Route 4 — Industry Leaderboard ⚡ Complex
**`GET /industries/leaderboard`**
**Description:** Compute industry-level performance rollups (average return and volatility across all companies in the industry) and rank industries. Powers the sector/industry leaderboard page.

**Request Parameters:**

| Name | Param Type | Data Type | Required? | Description |
|---|---|---|---|---|
| `start_date` | query | date (YYYY-MM-DD) | Required | Start of the evaluation window |
| `end_date` | query | date (YYYY-MM-DD) | Required | End of the evaluation window |
| `min_companies` | query | integer | Optional | Minimum number of companies required for an industry to appear. Defaults to `3` |

**SQL Query Mapping:**
- `start_date`, `end_date` → `WHERE pd.trading_date BETWEEN $1 AND $2`
- `min_companies` → `WHERE n_companies >= $3` in the `industry_rollup` CTE

**Response Schema:**

| Field | Data Type | Description |
|---|---|---|
| `sector_name` | string | Sector name |
| `industry_name` | string | Industry name |
| `industry_avg_daily_ret` | float | Average of per-company mean daily returns |
| `industry_avg_vol` | float | Average of per-company daily return volatilities |
| `n_companies` | integer | Number of companies included in the rollup |

**HTTP Status Codes:**
- `200 OK` — leaderboard returned with at least one qualifying industry
- `204 No Content` — query ran but no industries had enough companies to meet `min_companies` in the date range
- `400 Bad Request` — `start_date` or `end_date` is missing, or `end_date` is before `start_date`
- `422 Unprocessable Entity` — date values are not valid `YYYY-MM-DD` format, or `min_companies` is not a positive integer
- `500 Internal Server Error` — unexpected database error during multi-stage aggregation

---

### Route 5 — Volume Spike Leaderboard ⚡ Complex
**`GET /industries/volume-spikes`**
**Description:** Detect volume spike days per ticker using a rolling 60-day z-score, then aggregate spike frequency and intensity by industry/sector. Surfaces where unusual trading activity is concentrated.

**Request Parameters:**

| Name | Param Type | Data Type | Required? | Description |
|---|---|---|---|---|
| `start_date` | query | date (YYYY-MM-DD) | Required | Start of the evaluation window |
| `end_date` | query | date (YYYY-MM-DD) | Required | End of the evaluation window |
| `z_threshold` | query | float | Optional | Z-score threshold to classify a day as a spike. Defaults to `2.0` |

**SQL Query Mapping:**
- `start_date`, `end_date` → `WHERE pd.trading_date BETWEEN $1 AND $2`
- `z_threshold` → `WHERE sp.zscore >= $3`
- Rolling window: `ROWS BETWEEN 60 PRECEDING AND 1 PRECEDING`

**Response Schema:**

| Field | Data Type | Description |
|---|---|---|
| `sector_name` | string | Sector name |
| `industry_name` | string | Industry name |
| `spike_days` | integer | Total number of spike days across all companies in the industry |
| `avg_zscore` | float | Average z-score across all detected spike days |

**HTTP Status Codes:**
- `200 OK` — spike leaderboard returned with at least one qualifying industry
- `204 No Content` — query ran but no volume spikes exceeded `z_threshold` in the given date range
- `400 Bad Request` — `start_date` or `end_date` is missing, or `end_date` is before `start_date`
- `422 Unprocessable Entity` — date values are not valid `YYYY-MM-DD` format, or `z_threshold` is not a valid number; must be positive
- `500 Internal Server Error` — unexpected database error during rolling window computation

---

### Route 6 — Similar Stocks ⚡ Complex
**`GET /companies/:ticker/similar`**
**Description:** Find stocks most similar to a target ticker by computing the Pearson correlation of overlapping daily return series across the date range. Powers a "related stocks" feature on the stock detail page.

**Request Parameters:**

| Name | Param Type | Data Type | Required? | Description |
|---|---|---|---|---|
| `ticker` | path | string | Required | Target stock ticker to compare against (e.g., `AAPL`) |
| `start_date` | query | date (YYYY-MM-DD) | Required | Start of the comparison window |
| `end_date` | query | date (YYYY-MM-DD) | Required | End of the comparison window |
| `min_overlap_days` | query | integer | Optional | Minimum overlapping trading days required. Defaults to `30` |

**SQL Query Mapping:**
- `ticker` → `WHERE ticker = $1` in the `target` CTE
- `start_date`, `end_date` → `WHERE pd.trading_date BETWEEN $2 AND $3`
- `min_overlap_days` → `WHERE n_overlap >= $4`
- Self-join on `trading_date` to pair target and candidate returns

**Response Schema:**

| Field | Data Type | Description |
|---|---|---|
| `company_id` | integer | Internal identifier of the similar company |
| `ticker` | string | Ticker symbol of the similar company |
| `n_overlap` | integer | Number of overlapping trading days used in the correlation |
| `corr_ret` | float | Pearson correlation of daily returns with the target ticker |

**HTTP Status Codes:**
- `200 OK` — similar stocks found and returned
- `204 No Content` — target ticker exists but no other stocks had sufficient overlapping days (`n_overlap >= min_overlap_days`) in the date range
- `404 Not Found` — target ticker does not exist in the `company` table
- `400 Bad Request` — `start_date` or `end_date` is missing, or `end_date` is before `start_date`
- `422 Unprocessable Entity` — date values are not valid `YYYY-MM-DD` format, or `min_overlap_days` is not a positive integer
- `500 Internal Server Error` — unexpected database error during self-join correlation computation

---

### Route 7 — News Source Impact ⚡ Complex
**`GET /news/source-impact`**
**Description:** Estimate "news impact" by computing the average next-trading-day return following a news mention, grouped by news source. Uses a lateral subquery to find the next trading day after each article's publish date.

**Request Parameters:**

| Name | Param Type | Data Type | Required? | Description |
|---|---|---|---|---|
| `start_ts` | query | timestamptz (ISO 8601) | Required | Start of the news publish window |
| `end_ts` | query | timestamptz (ISO 8601) | Required | End of the news publish window |
| `min_mentions` | query | integer | Optional | Minimum article mentions required for a source to appear. Defaults to `10` |

**SQL Query Mapping:**
- `start_ts`, `end_ts` → `WHERE na.published_at BETWEEN $1 AND $2`
- `min_mentions` → `HAVING COUNT(*) >= $3`
- Next trading day resolved via `JOIN LATERAL` on `rets` ordered by `trading_date ASC LIMIT 1`

**Response Schema:**

| Field | Data Type | Description |
|---|---|---|
| `source` | string | News source name |
| `n_mentions` | integer | Total article mentions within the window |
| `avg_next_day_ret` | float | Average next-trading-day return following a mention from this source |

**HTTP Status Codes:**
- `200 OK` — source impact data returned with at least one qualifying news source
- `204 No Content` — query ran but no sources met the `min_mentions` threshold in the given time window
- `400 Bad Request` — `start_ts` or `end_ts` is missing, or `end_ts` is before `start_ts`
- `422 Unprocessable Entity` — timestamps are not valid ISO 8601 format, or `min_mentions` is not a positive integer
- `500 Internal Server Error` — unexpected database error during lateral subquery or aggregation
**`GET /companies/news-return-correlation`**
**Description:** For each ticker, compute the correlation between daily news article volume and absolute daily returns. Identifies companies whose price volatility is most associated with news intensity.

**Request Parameters:**

| Name | Param Type | Data Type | Required? | Description |
|---|---|---|---|---|
| `start_ts` | query | timestamptz (ISO 8601) | Required | Start of the evaluation window |
| `end_ts` | query | timestamptz (ISO 8601) | Required | End of the evaluation window |
| `min_days` | query | integer | Optional | Minimum number of joined days required per ticker. Defaults to `20` |

**SQL Query Mapping:**
- `start_ts`, `end_ts` → `WHERE na.published_at BETWEEN $1 AND $2`
- `min_days` → `WHERE n_days >= $3` in the `corrs` CTE
- `LEFT JOIN` on `trading_date = pub_date` to fill zero-news days with `COALESCE(n_articles, 0)`

**Response Schema:**

| Field | Data Type | Description |
|---|---|---|
| `ticker` | string | Stock ticker symbol |
| `n_days` | integer | Number of trading days included in the correlation |
| `corr_absret_news` | float | Pearson correlation between absolute daily return and daily news volume |

**HTTP Status Codes:**
- `200 OK` — correlation data returned for at least one qualifying ticker
- `204 No Content` — query ran but no tickers had enough joined news+price days to meet `min_days`
- `400 Bad Request` — `start_ts` or `end_ts` is missing, or `end_ts` is before `start_ts`
- `422 Unprocessable Entity` — timestamps are not valid ISO 8601 format, or `min_days` is not a positive integer
- `500 Internal Server Error` — unexpected database error during correlation aggregation or LEFT JOIN

---

### Route 9 — Cross-Source Price Disagreement ⚡ Complex
**`GET /stocks/source-disagreement`**
**Description:** Quantify disagreement across multiple price data sources by computing the per-day close spread (max close − min close) and returning the single worst-disagreement day per ticker. Useful for data quality auditing.

**Request Parameters:**

| Name | Param Type | Data Type | Required? | Description |
|---|---|---|---|---|
| `start_date` | query | date (YYYY-MM-DD) | Required | Start of the evaluation window |
| `end_date` | query | date (YYYY-MM-DD) | Required | End of the evaluation window |
| `min_sources` | query | integer | Optional | Minimum number of sources required on a given day to be included. Defaults to `2` |

**SQL Query Mapping:**
- `start_date`, `end_date` → `WHERE pd.trading_date BETWEEN $1 AND $2`
- `min_sources` → `WHERE s.n_sources >= $3`
- Spread computed as `MAX(close) - MIN(close)` grouped by `(company_id, trading_date)`
- `ROW_NUMBER() OVER (PARTITION BY ticker ORDER BY close_spread DESC)` to get worst day per ticker

**Response Schema:**

| Field | Data Type | Description |
|---|---|---|
| `ticker` | string | Stock ticker symbol |
| `trading_date` | date | Date of worst cross-source disagreement |
| `n_sources` | integer | Number of sources reporting on that day |
| `close_spread` | float | Max close minus min close across sources |
| `rn` | integer | Rank within ticker (always 1 — worst day only) |

**HTTP Status Codes:**
- `200 OK` — worst-disagreement day per ticker returned for at least one qualifying ticker
- `204 No Content` — query ran but no ticker-day combinations had `n_sources >= min_sources` in the date range
- `400 Bad Request` — `start_date` or `end_date` is missing, or `end_date` is before `start_date`
- `422 Unprocessable Entity` — date values are not valid `YYYY-MM-DD` format, or `min_sources` is less than 2 (need at least 2 sources to compute a spread)
- `500 Internal Server Error` — unexpected database error during spread aggregation or window ranking
**`GET /industries/rotation`**
**Description:** Track monthly industry performance within each sector and compute month-over-month rank changes. Identifies "rotation" — industries rapidly climbing or falling in relative performance.

**Request Parameters:**

| Name | Param Type | Data Type | Required? | Description |
|---|---|---|---|---|
| `start_date` | query | date (YYYY-MM-DD) | Required | Start of the evaluation window |
| `end_date` | query | date (YYYY-MM-DD) | Required | End of the evaluation window |

**SQL Query Mapping:**
- `start_date`, `end_date` → `WHERE pd.trading_date BETWEEN $1 AND $2`
- Monthly compounding via `EXP(SUM(LN(1 + ret))) - 1` grouped by `date_trunc('month', trading_date)`
- Rank computed with `RANK() OVER (PARTITION BY sector_name, month ORDER BY industry_month_ret DESC)`
- `LAG(rnk)` over `(sector_name, industry_name)` ordered by `month` to get prior month rank

**Response Schema:**

| Field | Data Type | Description |
|---|---|---|
| `sector_name` | string | Sector name |
| `industry_name` | string | Industry name |
| `month` | date | Month (first day of month) |
| `prev_rnk` | integer | Industry rank within sector in the prior month |
| `rnk` | integer | Industry rank within sector in this month |
| `rank_improvement` | integer | prev_rnk − rnk (positive = climbed, negative = fell) |
| `industry_month_ret` | float | Compound monthly return for the industry |

**HTTP Status Codes:**
- `200 OK` — rotation data returned with at least one industry having a prior-month rank to compare
- `204 No Content` — query ran but the date range spans fewer than 2 months, so no `LAG(rnk)` deltas can be computed
- `400 Bad Request` — `start_date` or `end_date` is missing, or `end_date` is before `start_date`
- `422 Unprocessable Entity` — date values are not valid `YYYY-MM-DD` format
- `500 Internal Server Error` — unexpected database error during monthly compounding, ranking, or lag computation
**`POST /users`**
**Description:** Create a new user account. No SQL query required beyond an INSERT. Supports saving watchlists and preferences.

**Request Parameters:**

| Name | Param Type | Data Type | Required? | Description |
|---|---|---|---|---|
| `username` | body | string | Required | Desired username |
| `email` | body | string | Required | User email address |
| `password` | body | string | Required | Plaintext password (hashed server-side before storage) |

**SQL Query Mapping:**
- `INSERT INTO users (username, email, password_hash) VALUES (...)` — no SELECT query

**Response Schema:**

| Field | Data Type | Description |
|---|---|---|
| `user_id` | integer | Newly created user's ID |
| `username` | string | Confirmed username |

**HTTP Status Codes:**
- `201 Created` — user account successfully created; returns new `user_id` and `username`
- `400 Bad Request` — one or more required body fields (`username`, `email`, `password`) are missing
- `409 Conflict` — `username` is already taken, or `email` is already registered to another account
- `422 Unprocessable Entity` — `email` is not a valid email format, or `password` does not meet minimum length requirements
- `500 Internal Server Error` — unexpected database error during INSERT

---

### Route A2 — User Login (Auxiliary)
**`POST /users/login`**
**Description:** Authenticate an existing user by username and password. Returns a session token on success.

**Request Parameters:**

| Name | Param Type | Data Type | Required? | Description |
|---|---|---|---|---|
| `username` | body | string | Required | Existing username |
| `password` | body | string | Required | Plaintext password to verify against stored hash |

**SQL Query Mapping:**
- `SELECT password_hash FROM users WHERE username = $1`

**Response Schema:**

| Field | Data Type | Description |
|---|---|---|
| `token` | string | Session token for authenticated requests |
| `user_id` | integer | Authenticated user's ID |

**HTTP Status Codes:**
- `200 OK` — credentials verified; session token returned
- `400 Bad Request` — `username` or `password` body field is missing
- `401 Unauthorized` — username exists but password does not match the stored hash
- `404 Not Found` — username does not exist in the `users` table
- `429 Too Many Requests` — too many failed login attempts from this client; rate limit exceeded
- `500 Internal Server Error` — unexpected database error during credential lookup

---


