// mocks/index.js
//
// In-memory implementation of the same contract `services/api.real.js`
// exposes. Every method returns a Promise that resolves after a small
// artificial delay so `useEffect` loading states render realistically
// in the browser.
//
// Shapes here MUST match the real API's response. Drift is caught by
// the contract test in `__tests__/services/api.contract.test.js`.

import companiesSearch from './fixtures/companies.search.json';
import companiesProfile from './fixtures/companies.profile.json';
import stocksHistory from './fixtures/stocks.history.json';
import stocksRiskAdjusted from './fixtures/stocks.risk-adjusted.json';
import stocksVolumeSpikes from './fixtures/stocks.volume-spikes.json';
import companiesSimilar from './fixtures/companies.similar.json';
import { stub501 } from './stubs';

const DELAY_MS = 150;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const ok = async (data, status = 200) => {
  await delay(DELAY_MS);
  return { data, status };
};
const empty = async () => {
  await delay(DELAY_MS);
  return { data: [], status: 204 };
};
const notFound = async () => {
  await delay(DELAY_MS);
  return { data: null, status: 404 };
};

const api = {
  searchCompanies: (q, limit = 50) => {
    if (!q) return ok([], 200);
    const prefix = String(q).toUpperCase();
    const matches = companiesSearch
      .filter((row) => row.ticker.startsWith(prefix))
      .slice(0, limit);
    return matches.length ? ok(matches) : empty();
  },

  getCompany: (ticker) => {
    const profile = companiesProfile[String(ticker).toUpperCase()];
    return profile ? ok(profile) : notFound();
  },

  getStockHistory: (ticker /* , startDate, endDate */) => {
    const series = stocksHistory[String(ticker).toUpperCase()];
    if (!series) return notFound();
    return series.length ? ok(series) : empty();
  },

  getSimilarCompanies: (ticker /* , startDate, endDate, minOverlapDays */) => {
    const rows = companiesSimilar[String(ticker).toUpperCase()];
    if (!rows) return notFound();
    return rows.length ? ok(rows) : empty();
  },

  getRiskAdjusted: (_startDate, _endDate, topN = 5) =>
    ok(stocksRiskAdjusted.slice(0, topN)),

  getVolumeSpikes: (_startDate, _endDate /* , zThreshold */) =>
    ok(stocksVolumeSpikes),

  getNewsSourceImpact: () =>
    stub501(2, 'Requires tables not yet populated: news_article, article_mention'),

  getNewsReturnCorrelation: () =>
    stub501(2, 'Requires tables not yet populated: news_article, article_mention'),
};

export default api;
