// in-memory mock matching services/api.real.js. shapes must match
// the real api; drift is caught by the contract test

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

  getCompany: (ticker) => {
    const profile = companiesProfile[String(ticker).toUpperCase()];
    return profile ? ok(profile) : notFound();
  },

  getCompanyPrices: (ticker /* , startDate, endDate */) => {
    const series = companiesPrices[String(ticker).toUpperCase()];
    if (!series) return notFound();
    return series.length ? ok(series) : empty();
  },

  getTopGainers: (_tradingDate, limit = 10) =>
    ok(topGainers.slice(0, limit)),

  getTopAverageReturns: (_endDate, _minObservations = 10, limit = 5) =>
    ok(topAverageReturns.slice(0, limit)),

  getSectorMomentum: (_asOfDate, sectorName, limit = 200) => {
    const filtered = sectorName
      ? sectorsMomentum.filter((r) => r.sector_name === sectorName)
      : sectorsMomentum;
    return ok(filtered.slice(0, limit));
  },

  getCompanyNews: (ticker /* , lookbackDays, limit */) => {
    const rows = companiesNews[String(ticker).toUpperCase()];
    if (!rows) return notFound();
    return rows.length ? ok(rows) : empty();
  },

  getTrendingNews: (_lookbackDays = 30, _minArticles = 5, limit = 10) =>
    ok(newsTrending.slice(0, limit)),

  getSourceDisagreement: (_startDate, _endDate, _minSources = 2, limit = 50) =>
    ok(pricesSourceDisagreement.slice(0, limit)),

  getIndustryRotations: (_startDate, _endDate, limit = 50) =>
    ok(industriesRotations.slice(0, limit)),

  // helpers
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
