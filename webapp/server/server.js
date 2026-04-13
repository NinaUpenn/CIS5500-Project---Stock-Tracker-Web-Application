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

const routes = require('./routes');

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

  // Express matches routes in declaration order, so every static path
  // under /companies/* must be registered BEFORE the :ticker param route.
  // Same for /stocks/*.
  app.get('/health', routes.health);

  app.get('/companies/search', routes.searchCompanies);
  app.get('/companies/news-return-correlation', routes.stubs.newsReturnCorrelation);
  app.get('/companies/:ticker', routes.getCompany);
  app.get('/companies/:ticker/similar', routes.getSimilarCompanies);

  app.get('/stocks/risk-adjusted', routes.getRiskAdjusted);
  app.get('/stocks/volume-spikes', routes.getVolumeSpikes);
  app.get('/stocks/source-disagreement', routes.stubs.stocksSourceDisagreement);
  app.get('/stocks/:ticker/history', routes.getStockHistory);

  app.get('/industries/leaderboard', routes.stubs.industriesLeaderboard);
  app.get('/industries/rotation', routes.stubs.industriesRotation);
  app.get('/news/source-impact', routes.stubs.newsSourceImpact);

  return app;
}

const config = loadConfig();
const pool = buildPool(config);
const app = createApp(pool);

// Only start the listener when this file is the program entry point.
// Tests import `app` directly via supertest and must not bind a port.
if (require.main === module) {
  app.listen(config.server_port, () => {
    console.log(`API listening on http://localhost:${config.server_port}`);
  });
}

module.exports = app;
module.exports.createApp = createApp;
