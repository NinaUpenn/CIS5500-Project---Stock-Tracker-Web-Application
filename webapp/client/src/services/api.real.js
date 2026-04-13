// services/api.real.js
//
// Thin fetch() wrapper that hits the Express API. Every method returns
// the same envelope { data, status } regardless of success or 501 stub,
// so the page code never has to care whether it's talking to the mock
// layer or the real server.
//
// Error handling policy:
//   * HTTP 200 / 204 -> resolve with { data: <json|[]>, status }.
//   * HTTP 501       -> resolve with { data: null, status, stub: body }.
//   * Any other 4xx/5xx -> throw so the page can render an error state.
//
// Only the happy path is exercised in tests; error cases are visually
// verified in the live run.

import config from '../config.json';

const base = config.api_base;

async function get(path, params = {}) {
  const url = new URL(base + path);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, value);
    }
  }

  const response = await fetch(url.toString());

  if (response.status === 204) {
    return { data: [], status: 204 };
  }
  if (response.status === 501) {
    const stub = await response.json();
    return { data: null, status: 501, stub };
  }
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status} on ${path}: ${text}`);
  }
  const data = await response.json();
  return { data, status: response.status };
}

const api = {
  searchCompanies: (q, limit = 50) =>
    get('/companies/search', { q, limit }),

  getCompany: (ticker) =>
    get(`/companies/${encodeURIComponent(ticker)}`),

  getStockHistory: (ticker, startDate, endDate) =>
    get(`/stocks/${encodeURIComponent(ticker)}/history`, {
      start_date: startDate,
      end_date: endDate,
    }),

  getSimilarCompanies: (ticker, startDate, endDate, minOverlapDays = 30) =>
    get(`/companies/${encodeURIComponent(ticker)}/similar`, {
      start_date: startDate,
      end_date: endDate,
      min_overlap_days: minOverlapDays,
    }),

  getRiskAdjusted: (startDate, endDate, topN = 5) =>
    get('/stocks/risk-adjusted', {
      start_date: startDate,
      end_date: endDate,
      top_n: topN,
    }),

  getVolumeSpikes: (startDate, endDate, zThreshold = 2.0) =>
    get('/stocks/volume-spikes', {
      start_date: startDate,
      end_date: endDate,
      z_threshold: zThreshold,
    }),

  getNewsSourceImpact: (startTs, endTs, minMentions = 10) =>
    get('/news/source-impact', {
      start_ts: startTs,
      end_ts: endTs,
      min_mentions: minMentions,
    }),

  getNewsReturnCorrelation: (startTs, endTs, minDays = 20) =>
    get('/companies/news-return-correlation', {
      start_ts: startTs,
      end_ts: endTs,
      min_days: minDays,
    }),
};

export default api;
