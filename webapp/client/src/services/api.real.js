// fetch wrapper for the express api. every method resolves to
// { data, status } so callers don't branch on mock vs real

const API_VERSION_PATH = '/api/v1';
const origin = process.env.REACT_APP_API_ORIGIN || '';
const base = origin + API_VERSION_PATH;

async function get(path, params = {}) {
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
  searchCompanies: (q, limit = 20) =>
    get('/companies/search', { q, limit }),

  getCompany: (ticker) =>
    get(`/companies/${encodeURIComponent(ticker)}`),

  getCompanyPrices: (ticker, startDate, endDate) =>
    get(`/companies/${encodeURIComponent(ticker)}/prices`, {
      start_date: startDate,
      end_date: endDate,
    }),

  getTopGainers: (tradingDate, limit = 10) =>
    get('/stocks/top-gainers', {
      trading_date: tradingDate,
      limit,
    }),

  getTopAverageReturns: (endDate, minObservations = 10, limit = 5) =>
    get('/stocks/top-average-returns', {
      end_date: endDate,
      min_observations: minObservations,
      limit,
    }),

  getSectorMomentum: (asOfDate, sectorName, limit = 200) =>
    get('/sectors/momentum', {
      as_of_date: asOfDate,
      sector_name: sectorName,
      limit,
    }),

  getCompanyNews: (ticker, lookbackDays = 30, limit = 10) =>
    get(`/companies/${encodeURIComponent(ticker)}/news`, {
      lookback_days: lookbackDays,
      limit,
    }),

  getTrendingNews: (lookbackDays = 30, minArticles = 5, limit = 10) =>
    get('/news/trending', {
      lookback_days: lookbackDays,
      min_articles: minArticles,
      limit,
    }),

  getSourceDisagreement: (startDate, endDate, minSources = 2, limit = 50) =>
    get('/prices/source-disagreement', {
      start_date: startDate,
      end_date: endDate,
      min_sources: minSources,
      limit,
    }),

  getIndustryRotations: (startDate, endDate, limit = 50) =>
    get('/industries/rotations', {
      start_date: startDate,
      end_date: endDate,
      limit,
    }),

  getSectors: () =>
    get('/sectors'),

  getSectorCompanies: (sectorName, limit = 500) =>
    get(`/sectors/${encodeURIComponent(sectorName)}/companies`, { limit }),

  listCompanies: (limit = 200) =>
    get('/companies', { limit }),
};

export default api;
