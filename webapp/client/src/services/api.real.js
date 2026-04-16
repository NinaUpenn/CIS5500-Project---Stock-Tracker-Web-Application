// services/api.real.js
//
// Thin fetch() wrapper that hits the Express API. Every method returns
// the same envelope { data, status } regardless of success, so the page
// code never has to care whether it's talking to the mock layer or the
// real server.
//
// Surface matches the 13 SoT routes:
//   personal-notes/SQL for the final core API routes_queries.md
//
// Base URL resolution:
//   * The `/api/v1` path is part of the API contract — it never changes
//     across environments, so it lives here in code.
//   * Only the ORIGIN (scheme + host + port) is environment-specific,
//     so that's what REACT_APP_API_ORIGIN carries. Empty / unset means
//     "same origin as the page" which is the right default when the
//     frontend and API are served behind one reverse proxy.
//
// CRA inlines REACT_APP_* at build time, so the production bundle picks
// up whatever the CI/hosting environment exports.

const API_VERSION_PATH = '/api/v1';
const origin = process.env.REACT_APP_API_ORIGIN || '';
const base = origin + API_VERSION_PATH;

async function get(path, params = {}) {
  // `base` can be absolute (`http://host:port/api/v1`) or relative (`/api/v1`).
  // Passing window.location.origin as the second arg handles both — an
  // absolute base ignores the origin argument.
  const url = new URL(base + path, window.location.origin);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, value);
    }
  }

  const response = await fetch(url.toString());

  if (response.status === 204) {
    return { data: [], status: 204 };
  }
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status} on ${path}: ${text}`);
  }
  const data = await response.json();
  return { data, status: response.status };
}

const api = {
  // Route 1
  searchCompanies: (q, limit = 20) =>
    get('/companies/search', { q, limit }),

  // Route 2
  getCompany: (ticker) =>
    get(`/companies/${encodeURIComponent(ticker)}`),

  // Route 3
  getCompanyPrices: (ticker, startDate, endDate) =>
    get(`/companies/${encodeURIComponent(ticker)}/prices`, {
      start_date: startDate,
      end_date: endDate,
    }),

  // Route 4
  getTopGainers: (tradingDate, limit = 10) =>
    get('/stocks/top-gainers', {
      trading_date: tradingDate,
      limit,
    }),

  // Route 5
  getTopAverageReturns: (endDate, minObservations = 10, limit = 5) =>
    get('/stocks/top-average-returns', {
      end_date: endDate,
      min_observations: minObservations,
      limit,
    }),

  // Route 6
  getSectorMomentum: (asOfDate, sectorName, limit = 200) =>
    get('/sectors/momentum', {
      as_of_date: asOfDate,
      sector_name: sectorName,
      limit,
    }),

  // Route 7
  getCompanyNews: (ticker, lookbackDays = 30, limit = 10) =>
    get(`/companies/${encodeURIComponent(ticker)}/news`, {
      lookback_days: lookbackDays,
      limit,
    }),

  // Route 8
  getTrendingNews: (lookbackDays = 30, minArticles = 5, limit = 10) =>
    get('/news/trending', {
      lookback_days: lookbackDays,
      min_articles: minArticles,
      limit,
    }),

  // Route 9
  getSourceDisagreement: (startDate, endDate, minSources = 2, limit = 50) =>
    get('/prices/source-disagreement', {
      start_date: startDate,
      end_date: endDate,
      min_sources: minSources,
      limit,
    }),

  // Route 10
  getIndustryRotations: (startDate, endDate, limit = 50) =>
    get('/industries/rotations', {
      start_date: startDate,
      end_date: endDate,
      limit,
    }),

  // Helpers
  getSectors: () =>
    get('/sectors'),

  getSectorCompanies: (sectorName, limit = 500) =>
    get(`/sectors/${encodeURIComponent(sectorName)}/companies`, { limit }),

  listCompanies: (limit = 200) =>
    get('/companies', { limit }),
};

export default api;
