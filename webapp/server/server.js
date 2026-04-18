// Express app wiring and entry point

const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const routes = require('./routes');

const API_PREFIX = '/api/v1';

// OpenAPI 3 spec, 
// built once at startup from @openapi JSDoc blocks in routes.js. 
// Served as JSON at /api-docs.json and rendered as an interactive Swagger UI at /api-docs.
const openapiSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Stock Tracker API',
      version: '1.0.0',
      description:
        'Normalized S&P 500 stock tracker prices, sector/industry rollups, and news.',
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

        // --- /companies/:ticker ---
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

        // --- /companies/:ticker/prices ---
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

        // --- /stocks/top-gainers ---
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

        // --- /stocks/top-average-returns ---
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

        // --- /sectors/momentum ---
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

        // --- /companies/:ticker/news ---
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

        // --- /news/trending ---
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

        // --- /prices/source-disagreement ---
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

        // --- /industries/rotations ---
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
  return new Pool({
    host: config.rds_host,
    port: config.rds_port,
    database: config.rds_db,
    user: config.rds_user,
    password: config.rds_password,
    ssl: { rejectUnauthorized: false },
  });
}

function createApp(pool) {
  routes.initRoutes(pool);

  const app = express();
  app.use(cors());
  app.use(express.json());

  //swagger and open-api
  app.get('/api-docs.json', (_req, res) => res.json(openapiSpec));
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openapiSpec));

  // keep this versioned sub-router. everything data-facing lives under /api/v1/*
  // so we can cut /api/v2 later without breaking existing clients
  const v1 = express.Router();

  v1.get('/health', routes.health);

  // companies
  v1.get('/companies/search', routes.searchCompanies);
  v1.get('/companies', routes.listCompanies);
  v1.get('/companies/:ticker/prices', routes.getCompanyPrices);
  v1.get('/companies/:ticker/news', routes.getCompanyNews);
  v1.get('/companies/:ticker', routes.getCompany);

  // stocks
  v1.get('/stocks/top-gainers', routes.getTopGainers);
  v1.get('/stocks/top-average-returns', routes.getTopAverageReturns);

  // sectors
  v1.get('/sectors/momentum', routes.getSectorMomentum);
  v1.get('/sectors/:sector/companies', routes.listSectorCompanies);
  v1.get('/sectors', routes.listSectors);

  // news
  v1.get('/news/trending', routes.getTrendingNews);

  // prices
  v1.get('/prices/source-disagreement', routes.getSourceDisagreement);

  // industries
  v1.get('/industries/rotations', routes.getIndustryRotations);

  app.use(API_PREFIX, v1);

  return app;
}

const config = loadConfig();
const pool = buildPool(config);
const app = createApp(pool);


if (require.main === module) {
  app.listen(config.server_port, () => {
    const origin = `http://localhost:${config.server_port}`;
    //clickable server info links
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
