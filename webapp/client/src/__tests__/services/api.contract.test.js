// Contract test for the mock api layer.
//
// Every method must resolve to the documented { data, status } envelope
// with the right row shape. If Feature code or fixtures drift away
// from this contract, this test fails — which is exactly what we want
// so the UI never silently renders against a shape the real API doesn't
// return.

import mockApi from '../../mocks';

describe('mock api contract', () => {
  test('searchCompanies returns [{ ticker }]', async () => {
    const { data, status } = await mockApi.searchCompanies('AA');
    expect([200, 204]).toContain(status);
    if (status === 200) {
      expect(Array.isArray(data)).toBe(true);
      expect(data[0]).toEqual(expect.objectContaining({ ticker: expect.any(String) }));
    }
  });

  test('getCompany returns a profile row or 404', async () => {
    const { data, status } = await mockApi.getCompany('AAPL');
    expect(status).toBe(200);
    expect(data).toEqual(expect.objectContaining({
      ticker: 'AAPL',
      latest_date: expect.any(String),
      latest_close: expect.any(Number),
      latest_volume: expect.any(Number),
    }));
  });

  test('getCompany returns 404 for unknown ticker', async () => {
    const { status } = await mockApi.getCompany('DOES_NOT_EXIST_ZZZ');
    expect(status).toBe(404);
  });

  test('getStockHistory returns OHLCV series', async () => {
    const { data, status } = await mockApi.getStockHistory('AAPL', '2022-01-01', '2022-12-12');
    expect(status).toBe(200);
    expect(data[0]).toEqual(expect.objectContaining({
      trade_date: expect.any(String),
      open: expect.any(Number),
      high: expect.any(Number),
      low: expect.any(Number),
      close: expect.any(Number),
      volume: expect.any(Number),
    }));
  });

  test('getSimilarCompanies returns correlation rows', async () => {
    const { data, status } = await mockApi.getSimilarCompanies('AAPL', '2022-01-01', '2022-12-12');
    expect(status).toBe(200);
    expect(data[0]).toEqual(expect.objectContaining({
      ticker: expect.any(String),
      n_overlap: expect.any(Number),
      corr_ret: expect.any(Number),
    }));
  });

  test('getRiskAdjusted returns ranked rows', async () => {
    const { data, status } = await mockApi.getRiskAdjusted('2022-01-01', '2022-12-12', 5);
    expect(status).toBe(200);
    expect(data.length).toBe(5);
    expect(data[0]).toEqual(expect.objectContaining({
      ticker: expect.any(String),
      avg_daily_ret: expect.any(Number),
      vol_daily_ret: expect.any(Number),
      n_days: expect.any(Number),
      risk_adj_score: expect.any(Number),
      rn: expect.any(Number),
    }));
  });

  test('getVolumeSpikes returns ranked rows', async () => {
    const { data, status } = await mockApi.getVolumeSpikes('2022-01-01', '2022-12-12');
    expect(status).toBe(200);
    expect(data[0]).toEqual(expect.objectContaining({
      ticker: expect.any(String),
      spike_days: expect.any(Number),
      avg_zscore: expect.any(Number),
    }));
  });

  test('news endpoints return the 501 envelope', async () => {
    for (const method of ['getNewsSourceImpact', 'getNewsReturnCorrelation']) {
      const res = await mockApi[method]();
      expect(res.status).toBe(501);
      expect(res.data).toBeNull();
      expect(res.stub).toEqual(expect.objectContaining({
        phase: expect.anything(),
        reason: expect.any(String),
      }));
    }
  });
});
