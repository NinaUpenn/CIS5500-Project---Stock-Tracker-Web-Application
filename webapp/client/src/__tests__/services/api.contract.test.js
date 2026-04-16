// Contract test for the mock api layer.
//
// Every method must resolve to the documented { data, status } envelope
// with the right row shape. If feature code or fixtures drift away from
// this contract, this test fails — so the UI never silently renders
// against a shape the real API doesn't return.
//
// Mirrors the 13 SoT routes in:
//   personal-notes/SQL for the final core API routes_queries.md

import mockApi from '../../mocks';

describe('mock api contract', () => {
  test('searchCompanies — Route 1', async () => {
    const { data, status } = await mockApi.searchCompanies('AA');
    expect([200, 204]).toContain(status);
    if (status === 200) {
      expect(data[0]).toEqual(
        expect.objectContaining({
          ticker: expect.any(String),
          company_name: expect.any(String),
          sector_name: expect.any(String),
          industry_name: expect.any(String),
        }),
      );
    }
  });

  test('getCompany — Route 2 (ok)', async () => {
    const { data, status } = await mockApi.getCompany('AAPL');
    expect(status).toBe(200);
    expect(data).toEqual(
      expect.objectContaining({
        ticker: 'AAPL',
        company_name: expect.any(String),
        sector_name: expect.any(String),
        industry_name: expect.any(String),
        latest_trading_date: expect.any(String),
        latest_close: expect.any(Number),
        latest_volume: expect.any(Number),
      }),
    );
  });

  test('getCompany — Route 2 (404)', async () => {
    const { status } = await mockApi.getCompany('DOES_NOT_EXIST_ZZZ');
    expect(status).toBe(404);
  });

  test('getCompanyPrices — Route 3', async () => {
    const { data, status } = await mockApi.getCompanyPrices('AAPL', '2022-01-01', '2022-12-12');
    expect(status).toBe(200);
    expect(data[0]).toEqual(
      expect.objectContaining({
        trading_date: expect.any(String),
        close: expect.any(Number),
        ticker: expect.any(String),
        sector_name: expect.any(String),
      }),
    );
  });

  test('getTopGainers — Route 4', async () => {
    const { data, status } = await mockApi.getTopGainers('2022-12-12', 10);
    expect(status).toBe(200);
    expect(data[0]).toEqual(
      expect.objectContaining({
        ticker: expect.any(String),
        company_name: expect.any(String),
        pct_change: expect.any(Number),
        sector_rank: expect.any(Number),
      }),
    );
  });

  test('getTopAverageReturns — Route 5', async () => {
    const { data, status } = await mockApi.getTopAverageReturns('2022-12-12', 10, 5);
    expect(status).toBe(200);
    expect(data[0]).toEqual(
      expect.objectContaining({
        ticker: expect.any(String),
        company_name: expect.any(String),
        avg_daily_return: expect.any(Number),
        return_volatility: expect.any(Number),
        n_obs: expect.any(Number),
        return_rank: expect.any(Number),
      }),
    );
  });

  test('getSectorMomentum — Route 6', async () => {
    const { data, status } = await mockApi.getSectorMomentum('2022-12-12', null, 200);
    expect(status).toBe(200);
    expect(data[0]).toEqual(
      expect.objectContaining({
        ticker: expect.any(String),
        return_7d: expect.any(Number),
        avg_sector_return: expect.any(Number),
        sector_rank: expect.any(Number),
      }),
    );
  });

  test('getCompanyNews — Route 7', async () => {
    const { data, status } = await mockApi.getCompanyNews('AAPL', 30, 10);
    expect(status).toBe(200);
    expect(data[0]).toEqual(
      expect.objectContaining({
        title: expect.any(String),
        published_at: expect.any(String),
        source: expect.any(String),
        url: expect.any(String),
      }),
    );
  });

  test('getTrendingNews — Route 8', async () => {
    const { data, status } = await mockApi.getTrendingNews(30, 5, 10);
    expect(status).toBe(200);
    expect(data[0]).toEqual(
      expect.objectContaining({
        ticker: expect.any(String),
        article_count: expect.any(Number),
        avg_sector_mentions: expect.any(Number),
        sector_rank: expect.any(Number),
      }),
    );
  });

  test('getSourceDisagreement — Route 9', async () => {
    const { data, status } = await mockApi.getSourceDisagreement('2022-01-01', '2022-12-12', 2, 50);
    expect(status).toBe(200);
    expect(data[0]).toEqual(
      expect.objectContaining({
        ticker: expect.any(String),
        trading_date: expect.any(String),
        n_sources: expect.any(Number),
        pct_spread: expect.any(Number),
      }),
    );
  });

  test('getIndustryRotations — Route 10', async () => {
    const { data, status } = await mockApi.getIndustryRotations('2022-01-01', '2022-12-12', 50);
    expect(status).toBe(200);
    expect(data[0]).toEqual(
      expect.objectContaining({
        sector_name: expect.any(String),
        industry_name: expect.any(String),
        month: expect.any(String),
        rnk: expect.any(Number),
        industry_month_ret: expect.any(Number),
      }),
    );
  });

  test('getSectors — helper', async () => {
    const { data, status } = await mockApi.getSectors();
    expect(status).toBe(200);
    expect(data[0]).toEqual(
      expect.objectContaining({
        sector_id: expect.any(Number),
        sector_name: expect.any(String),
      }),
    );
  });

  test('getSectorCompanies — helper', async () => {
    const { status } = await mockApi.getSectorCompanies('Technology', 500);
    expect([200, 204]).toContain(status);
  });

  test('listCompanies — helper', async () => {
    const { data, status } = await mockApi.listCompanies(200);
    expect(status).toBe(200);
    expect(data[0]).toEqual(
      expect.objectContaining({
        ticker: expect.any(String),
        company_name: expect.any(String),
      }),
    );
  });
});
