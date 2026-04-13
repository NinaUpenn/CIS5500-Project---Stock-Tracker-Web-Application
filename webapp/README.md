# Stock News Trader — Phase 1 webapp

Three-tier stock analytics app wiring the Milestone 4 API over the
course RDS PostgreSQL instance. See
[`../src/spec/Design.md`](../src/spec/Design.md) for the full design.

```
React (browser :3000) --HTTP--> Node/Express (:8080) --SQL--> PostgreSQL (AWS RDS)
```

## Layout

- [`server/`](server) — Express 4 + `pg` Pool. One file per concern:
  - [`server/server.js`](server/server.js) — wiring & route registration.
  - [`server/routes.js`](server/routes.js) — handlers + stubs.
  - [`server/__tests__/`](server/__tests__) — Jest + supertest (pg mocked).
- [`client/`](client) — React 18 SPA (CRA). Every component fetches
  through the single seam in
  [`client/src/services/api.js`](client/src/services/api.js), which
  resolves to either the live API or the mock layer based on
  `REACT_APP_USE_MOCKS`.
- [`db/indexes.sql`](db/indexes.sql) — recommended indexes; run once
  against RDS.

## Running locally

Three modes — pick one:

### A. UI only (mocks)
No database, no server — the React app reads hand-written JSON fixtures.

```bash
cd client
cp .env.development.example .env.development.local   # REACT_APP_USE_MOCKS=true
npm install
npm start                                            # :3000
```

### B. Full stack against a local Postgres (Docker) — recommended

One-time setup: bring up a local Postgres and bulk-load the CSV.

```bash
cd webapp
docker compose up -d                                 # :5432

# Loads C:/Users/gavin/Downloads/combined_stock_data.csv by default;
# pass a different path as the first arg if your CSV lives elsewhere.
bash db/load.sh                                      # ~a few minutes
```

Then run the API + client:

```bash
cd server && npm install && npm start                # :8080

# separate terminal
cd client
echo REACT_APP_USE_MOCKS=false > .env.development.local
npm install && npm start                             # :3000
```

`server/config.example.json` already points at the local Docker DB
(`localhost:5432`, user/db `stock`, password `stock`) — no extra
config needed. The server falls back to this example file when
`server/config.json` is missing, so nothing to copy.

To wipe and reload the DB:

```bash
docker compose down -v                               # drops the volume
docker compose up -d
bash db/load.sh
```

### C. Full stack against live RDS

```bash
cp server/config.rds.json.example server/config.json # fill in creds
cd server && npm install && npm start
# client: same as mode B
```

## Testing

```bash
# server (jest + supertest, pg mocked)
cd server && npm test
cd server && npm run test:coverage

# client (jest + RTL via react-scripts)
cd client && CI=true npm test
cd client && npm run test:coverage
```

Current counts: server 32 tests, client 29 tests.

## Endpoints (Phase 1)

| Method | Path | State |
|---|---|---|
| GET | `/health` | live |
| GET | `/companies/search` | live |
| GET | `/companies/:ticker` | live |
| GET | `/companies/:ticker/similar` | live |
| GET | `/stocks/:ticker/history` | live |
| GET | `/stocks/risk-adjusted` | live (adapted — global) |
| GET | `/stocks/volume-spikes` | live (adapted — per-symbol) |
| GET | `/news/source-impact` | **501** — unlocks in Phase 2 |
| GET | `/companies/news-return-correlation` | **501** — unlocks in Phase 2 |
| GET | `/industries/leaderboard` | **501** — later phase |
| GET | `/industries/rotation` | **501** — later phase |
| GET | `/stocks/source-disagreement` | **501** — later phase |

All stubs respond with `{ phase, reason }` so the UI's
[`ComingSoonCard`](client/src/components/ComingSoonCard.jsx) has a
uniform contract to render against.
