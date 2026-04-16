// mocks/index.js
//
// In-memory implementation matching the contract in services/api.real.js.
// Every method returns a Promise resolving after a small artificial delay
// so `useEffect` loading states render realistically in the browser.
//
// Shapes here MUST match the real API's response. Drift is caught by the
// contract test in `__tests__/services/api.contract.test.js`.

import companiesSearch from './fixtures/companies.search.json';
import companiesProfile from './fixtures/companies.profile.json';
import companiesPrices from './fixtures/companies.prices.json';
import companiesNews from './fixtures/companies.news.json';
import topGainers from './fixtures/stocks.top-gainers.json';
import topAverageReturns from './fixtures/stocks.top-average-returns.json';
import sectorsMomentum from './fixtures/sectors.momentum.json';
import newsTrending from './fixtures/news.trending.json';
import pricesSourceDisagreement from './fixtures/prices.source-disagreement.json';
import industriesRotations from './fixtures/industries.rotations.json';
import sectorsList from './fixtures/sectors.list.json';

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
  // Route 1
  searchCompanies: (q, limit = 20) => {
    if (!q) return empty();
    const prefix = String(q).toUpperCase().trim();
    const byName = String(q).toLowerCase().trim();
    const matches = companiesSearch
      .filter(
        (row) =>
          row.ticker.startsWith(prefix) ||
          (row.company_name && row.company_name.toLowerCase().startsWith(byName)),
      )
      .slice(0, limit);
    return matches.length ? ok(matches) : empty();
  },

  // Route 2
  getCompany: (ticker) => {
    const profile = companiesProfile[String(ticker).toUpperCase()];
    return profile ? ok(profile) : notFound();
  },

  // Route 3
  getCompanyPrices: (ticker /* , startDate, endDate */) => {
    const series = companiesPrices[String(ticker).toUpperCase()];
    if (!series) return notFound();
    return series.length ? ok(series) : empty();
  },

  // Route 4
  getTopGainers: (_tradingDate, limit = 10) =>
    ok(topGainers.slice(0, limit)),

  // Route 5
  getTopAverageReturns: (_endDate, _minObservations = 10, limit = 5) =>
    ok(topAverageReturns.slice(0, limit)),

  // Route 6
  getSectorMomentum: (_asOfDate, sectorName, limit = 200) => {
    const filtered = sectorName
      ? sectorsMomentum.filter((r) => r.sector_name === sectorName)
      : sectorsMomentum;
    return ok(filtered.slice(0, limit));
  },

  // Route 7
  getCompanyNews: (ticker /* , lookbackDays, limit */) => {
    const rows = companiesNews[String(ticker).toUpperCase()];
    if (!rows) return notFound();
    return rows.length ? ok(rows) : empty();
  },

  // Route 8
  getTrendingNews: (_lookbackDays = 30, _minArticles = 5, limit = 10) =>
    ok(newsTrending.slice(0, limit)),

  // Route 9
  getSourceDisagreement: (_startDate, _endDate, _minSources = 2, limit = 50) =>
    ok(pricesSourceDisagreement.slice(0, limit)),

  // Route 10
  getIndustryRotations: (_startDate, _endDate, limit = 50) =>
    ok(industriesRotations.slice(0, limit)),

  // Helpers
  getSectors: () => ok(sectorsList),

  getSectorCompanies: (sectorName, limit = 500) => {
    const matches = companiesSearch
      .filter((row) => row.sector_name === sectorName)
      .slice(0, limit);
    return matches.length ? ok(matches) : empty();
  },

  listCompanies: (limit = 200) =>
    ok(companiesSearch.slice(0, limit)),
};

export default api;
