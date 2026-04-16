// server.js
//
// Express wiring for the Phase 1 API. Responsibilities:
//   1. Load config (RDS credentials + port) from config.json.
//      Missing file => fall back to config.example.json so `npm test`
//      works without real credentials.
//   2. Create a shared pg.Pool and inject it into routes.js.
//   3. Register one route per endpoint.
//   4. Export the Express `app` so supertest can hit it in-process
//      without opening a real socket.
//
// Running `node server.js` directly (not via require) starts the
// listener. When the file is required by tests, the listen() call is
// skipped — see the `require.main === module` guard at the bottom.

const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const routes = require('./routes');

// OpenAPI 3 spec, built once at startup from @openapi JSDoc blocks in
// routes.js. Served as JSON at /api-docs.json and rendered as an
// interactive Swagger UI at /api-docs.
const API_PREFIX = '/api/v1';

const openapiSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Stock Tracker API',
      version: '1.0.0',
      description:
        'Normalized S&P 500 stock tracker — prices, sector/industry rollups, and news. Routes match the SoT SQL in personal-notes/SQL for the final core API routes_queries.md.',
    },
    servers: [
      { url: API_PREFIX, description: 'Versioned API base (relative to server host)' },
    ],
    components: {
      schemas: {
        Error: {
          type: 'object',
          required: ['error'],
          properties: { error: { type: 'string' } },
        },

        // --- Meta /health ---
        HealthReport: {
          type: 'object',
          required: ['status', 'time', 'api_version', 'database'],
          properties: {
            status: {
              type: 'string',
              enum: ['ok', 'degraded'],
              example: 'ok',
            },
            time: {
              type: 'string',
              format: 'date-time',
              description: 'Server timestamp when the report was generated.',
            },
            api_version: {
              type: 'string',
              example: 'v1',
            },
            uptime_s: {
              type: 'integer',
              description: 'Seconds since process start.',
            },
            database: {
              type: 'object',
              required: ['reachable'],
              properties: {
                reachable: { type: 'boolean' },
                latency_ms: {
                  type: 'integer',
                  description: 'Round-trip of SELECT version() against the pool.',
                },
                server_version: {
                  type: 'string',
                  nullable: true,
                  example: 'PostgreSQL 16.x on x86_64-pc-linux-gnu, ...',
                },
                error: {
                  type: 'string',
                  nullable: true,
                  description: 'Present only when reachable=false.',
                },
              },
            },
          },
        },

        // --- Company listings (shared by search + helpers) ---
        CompanyListing: {
          type: 'object',
          required: ['company_id', 'ticker'],
          properties: {
            company_id: { type: 'integer', example: 1 },
            ticker: { type: 'string', example: 'AAPL' },
            company_name: { type: 'string', nullable: true, example: 'Apple Inc.' },
            industry_name: { type: 'string', nullable: true, example: 'Consumer Electronics' },
            sector_name: { type: 'string', nullable: true, example: 'Technology' },
          },
        },

        // --- Route 2 /companies/:ticker ---
        CompanyProfile: {
          type: 'object',
          required: ['company_id', 'ticker'],
          properties: {
            company_id: { type: 'integer' },
            ticker: { type: 'string' },
            company_name: { type: 'string', nullable: true },
            exchange: { type: 'string', nullable: true },
            cik: { type: 'string', nullable: true },
            industry_name: { type: 'string', nullable: true },
            sector_name: { type: 'string', nullable: true },
            short_name: { type: 'string', nullable: true },
            long_name: { type: 'string', nullable: true },
            city: { type: 'string', nullable: true },
            state: { type: 'string', nullable: true },
            country: { type: 'string', nullable: true },
            long_business_summary: { type: 'string', nullable: true },
            profile_current_price: { type: 'number', nullable: true },
            profile_market_cap: { type: 'number', nullable: true },
            profile_ebitda: { type: 'number', nullable: true },
            profile_revenue_growth: { type: 'number', nullable: true },
            sp500_weight: { type: 'number', nullable: true },
            snapshot_price: { type: 'number', nullable: true },
            price_earnings: { type: 'number', nullable: true },
            dividend_yield: { type: 'number', nullable: true },
            earnings_share: { type: 'number', nullable: true },
            week_52_low: { type: 'number', nullable: true },
            week_52_high: { type: 'number', nullable: true },
            snapshot_market_cap: { type: 'number', nullable: true },
            snapshot_ebitda: { type: 'number', nullable: true },
            price_sales: { type: 'number', nullable: true },
            price_book: { type: 'number', nullable: true },
            sec_filings: { type: 'string', nullable: true },
            latest_trading_date: { type: 'string', format: 'date', nullable: true },
            latest_close: { type: 'number', nullable: true },
            latest_volume: { type: 'integer', nullable: true },
          },
        },

        // --- Route 3 /companies/:ticker/prices ---
        CompanyPriceRow: {
          type: 'object',
          required: ['trading_date', 'ticker'],
          properties: {
            company_name: { type: 'string' },
            ticker: { type: 'string' },
            sector_name: { type: 'string', nullable: true },
            industry_name: { type: 'string', nullable: true },
            trading_date: { type: 'string', format: 'date' },
            open: { type: 'number', nullable: true },
            high: { type: 'number', nullable: true },
            low: { type: 'number', nullable: true },
            close: { type: 'number', nullable: true },
            adj_close: { type: 'number', nullable: true },
            volume: { type: 'integer', nullable: true },
            daily_return_pct: { type: 'number', nullable: true },
            ma_7_day: { type: 'number', nullable: true },
            ma_30_day: { type: 'number', nullable: true },
            sector_avg_close: { type: 'number', nullable: true },
            sector_price_rank: { type: 'integer', nullable: true },
          },
        },

        // --- Route 4 /stocks/top-gainers ---
        TopGainerRow: {
          type: 'object',
          required: ['ticker', 'pct_change'],
          properties: {
            ticker: { type: 'string' },
            company_name: { type: 'string' },
            sector_name: { type: 'string' },
            industry_name: { type: 'string' },
            trading_date: { type: 'string', format: 'date' },
            prev_trading_date: { type: 'string', format: 'date' },
            close: { type: 'number' },
            prev_close: { type: 'number' },
            pct_change: { type: 'number' },
            avg_sector_change: { type: 'number' },
            sector_rank: { type: 'integer' },
          },
        },

        // --- Route 5 /stocks/top-average-returns ---
        TopReturnRow: {
          type: 'object',
          required: ['ticker', 'avg_daily_return'],
          properties: {
            ticker: { type: 'string' },
            company_name: { type: 'string' },
            industry_name: { type: 'string' },
            sector_name: { type: 'string' },
            avg_daily_return: { type: 'number' },
            return_volatility: { type: 'number', nullable: true },
            n_obs: { type: 'integer' },
            return_rank: { type: 'integer' },
          },
        },

        // --- Route 6 /sectors/momentum ---
        SectorMomentumRow: {
          type: 'object',
          required: ['ticker', 'return_7d'],
          properties: {
            ticker: { type: 'string' },
            company_name: { type: 'string' },
            industry_name: { type: 'string' },
            sector_name: { type: 'string' },
            as_of_date: { type: 'string', format: 'date' },
            return_7d: { type: 'number' },
            avg_sector_return: { type: 'number' },
            sector_rank: { type: 'integer' },
          },
        },

        // --- Route 7 /companies/:ticker/news ---
        CompanyNewsRow: {
          type: 'object',
          required: ['ticker', 'title', 'published_at'],
          properties: {
            company_name: { type: 'string' },
            ticker: { type: 'string' },
            sector_name: { type: 'string', nullable: true },
            industry_name: { type: 'string', nullable: true },
            source: { type: 'string', nullable: true },
            published_at: { type: 'string', format: 'date-time' },
            title: { type: 'string' },
            summary: { type: 'string', nullable: true },
            url: { type: 'string', nullable: true },
            lm_level: { type: 'integer', nullable: true },
            lm_score1: { type: 'number', nullable: true },
            lm_score2: { type: 'number', nullable: true },
            lm_sentiment: {
              type: 'string',
              nullable: true,
              enum: ['positive', 'neutral', 'negative', null],
            },
            mention_confidence: { type: 'number', nullable: true },
            articles_in_window: { type: 'integer', nullable: true },
            recency_rank: { type: 'integer' },
          },
        },

        // --- Route 8 /news/trending ---
        TrendingNewsRow: {
          type: 'object',
          required: ['ticker', 'article_count'],
          properties: {
            ticker: { type: 'string' },
            company_name: { type: 'string' },
            sector_name: { type: 'string' },
            industry_name: { type: 'string' },
            article_count: { type: 'integer' },
            avg_sector_mentions: { type: 'number' },
            sector_rank: { type: 'integer' },
          },
        },

        // --- Route 9 /prices/source-disagreement ---
        SourceDisagreementRow: {
          type: 'object',
          required: ['ticker', 'trading_date'],
          properties: {
            ticker: { type: 'string' },
            company_name: { type: 'string' },
            trading_date: { type: 'string', format: 'date' },
            n_sources: { type: 'integer' },
            min_close: { type: 'number' },
            max_close: { type: 'number' },
            close_spread: { type: 'number' },
            pct_spread: { type: 'number' },
          },
        },

        // --- Route 10 /industries/rotations ---
        IndustryRotationRow: {
          type: 'object',
          required: ['sector_name', 'industry_name', 'month'],
          properties: {
            sector_name: { type: 'string' },
            industry_name: { type: 'string' },
            month: { type: 'string', format: 'date' },
            prev_rnk: { type: 'integer', nullable: true },
            rnk: { type: 'integer' },
            rank_improvement: { type: 'integer' },
            industry_month_ret: { type: 'number' },
          },
        },

        // --- Helper /sectors ---
        Sector: {
          type: 'object',
          required: ['sector_id', 'sector_name'],
          properties: {
            sector_id: { type: 'integer' },
            sector_name: { type: 'string' },
          },
        },
      },
    },
    tags: [
      { name: 'Companies', description: 'Company lookup, profile, prices, and news' },
      { name: 'Stocks', description: 'Ranked stock leaderboards' },
      { name: 'Sectors', description: 'Sector listings and momentum' },
      { name: 'News', description: 'Trending news signals' },
      { name: 'Prices', description: 'Cross-source price analytics' },
      { name: 'Industries', description: 'Industry-level rotations' },
      { name: 'Meta', description: 'Health checks and misc' },
    ],
  },
  apis: [path.join(__dirname, 'routes.js')],
});

function loadConfig() {
  const configPath = path.join(__dirname, 'config.json');
  const examplePath = path.join(__dirname, 'config.example.json');
  const chosen = fs.existsSync(configPath) ? configPath : examplePath;
  return JSON.parse(fs.readFileSync(chosen, 'utf8'));
}

function buildPool(config) {
  // Local Docker Postgres isn't configured for SSL; RDS requires it.
  // Opt in via `"ssl": true` in config.json (or anything truthy).
  const ssl = config.ssl ? { rejectUnauthorized: false } : false;
  return new Pool({
    host: config.rds_host,
    port: config.rds_port,
    database: config.rds_db,
    user: config.rds_user,
    password: config.rds_password,
    ssl,
  });
}

function createApp(pool) {
  routes.initRoutes(pool);

  const app = express();
  app.use(cors());
  app.use(express.json());

  // Swagger / OpenAPI docs live at the root so humans can find them.
  // Spec declares `servers: [{ url: '/api/v1' }]` so the "Try it out"
  // button automatically prepends the version prefix.
  app.get('/api-docs.json', (_req, res) => res.json(openapiSpec));
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openapiSpec));

  // Versioned sub-router. Everything data-facing lives under /api/v1/*
  // so we can cut /api/v2 later without breaking existing clients.
  // Express matches declaration order, so every static path under
  // /companies/* must register BEFORE the :ticker param route. Same for
  // /stocks/*, /sectors/*.
  const v1 = express.Router();

  v1.get('/health', routes.health);

  // Companies
  v1.get('/companies/search', routes.searchCompanies);
  v1.get('/companies', routes.listCompanies);
  v1.get('/companies/:ticker/prices', routes.getCompanyPrices);
  v1.get('/companies/:ticker/news', routes.getCompanyNews);
  v1.get('/companies/:ticker', routes.getCompany);

  // Stocks
  v1.get('/stocks/top-gainers', routes.getTopGainers);
  v1.get('/stocks/top-average-returns', routes.getTopAverageReturns);

  // Sectors
  v1.get('/sectors/momentum', routes.getSectorMomentum);
  v1.get('/sectors/:sector/companies', routes.listSectorCompanies);
  v1.get('/sectors', routes.listSectors);

  // News
  v1.get('/news/trending', routes.getTrendingNews);

  // Prices
  v1.get('/prices/source-disagreement', routes.getSourceDisagreement);

  // Industries
  v1.get('/industries/rotations', routes.getIndustryRotations);

  app.use(API_PREFIX, v1);

  return app;
}

const config = loadConfig();
const pool = buildPool(config);
const app = createApp(pool);

// Only start the listener when this file is the program entry point.
// Tests import `app` directly via supertest and must not bind a port.
if (require.main === module) {
  app.listen(config.server_port, () => {
    const origin = `http://localhost:${config.server_port}`;
    // Most terminals (VS Code, Windows Terminal, iTerm2, etc.) auto-link
    // any full http(s):// URL, so printing the whole URL makes each row
    // clickable. Keep the labels in a fixed-width column for readability.
    const links = [
      ['API base',  `${origin}${API_PREFIX}`],
      ['Health',    `${origin}${API_PREFIX}/health`],
      ['Swagger UI',`${origin}/api-docs`],
      ['OpenAPI',   `${origin}/api-docs.json`],
    ];
    const labelWidth = Math.max(...links.map(([label]) => label.length));

    console.log(`API listening on ${origin}`);
    console.log('');
    for (const [label, url] of links) {
      console.log(`  ${label.padEnd(labelWidth)}  ${url}`);
    }
    console.log('');
  });
}

module.exports = app;
module.exports.createApp = createApp;
