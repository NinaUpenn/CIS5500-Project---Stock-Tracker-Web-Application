// Tests for /stocks/* routes (other than history, which lives with
// /companies since it's part of the same feature PR).

jest.mock('pg', () => {
  const mockQuery = jest.fn();
  const Pool = jest.fn(() => ({ query: mockQuery }));
  return { Pool, __mockQuery: mockQuery };
});

const { __mockQuery: mockQuery } = require('pg');
const request = require('supertest');
const app = require('../server');

beforeEach(() => {
  mockQuery.mockReset();
});

describe('GET /stocks/risk-adjusted', () => {
  const url = '/stocks/risk-adjusted?start_date=2022-01-01&end_date=2022-12-12';

  test('returns 200 with ranked rows', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { ticker: 'NVDA', avg_daily_ret: '0.003', vol_daily_ret: '0.02', n_days: 250, risk_adj_score: '0.15', rn: 1 },
        { ticker: 'MSFT', avg_daily_ret: '0.001', vol_daily_ret: '0.017', n_days: 250, risk_adj_score: '0.06', rn: 2 },
      ],
    });

    const res = await request(app).get(url);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].ticker).toBe('NVDA');
    // First three params are user-facing (start, end, top_n); the
    // remaining slots are the investable-universe filter constants.
    const params = mockQuery.mock.calls[0][1];
    expect(params.slice(0, 3)).toEqual(['2022-01-01', '2022-12-12', 5]);
    expect(params.length).toBeGreaterThanOrEqual(6);
  });

  test('respects top_n', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ ticker: 'A', risk_adj_score: '0.1', rn: 1 }] });
    await request(app).get(`${url}&top_n=10`);
    expect(mockQuery.mock.calls[0][1][2]).toBe(10);
  });

  test('400 on missing dates', async () => {
    const res = await request(app).get('/stocks/risk-adjusted');
    expect(res.status).toBe(400);
  });

  test('422 on bad top_n', async () => {
    const res = await request(app).get(`${url}&top_n=abc`);
    expect(res.status).toBe(422);
  });

  test('204 when no rows come back', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get(url);
    expect(res.status).toBe(204);
  });
});

describe('GET /stocks/volume-spikes', () => {
  const url = '/stocks/volume-spikes?start_date=2022-01-01&end_date=2022-12-12';

  test('returns 200 with ranked rows', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { ticker: 'TSLA', spike_days: 18, avg_zscore: '3.42' },
        { ticker: 'NVDA', spike_days: 14, avg_zscore: '3.10' },
      ],
    });

    const res = await request(app).get(url);

    expect(res.status).toBe(200);
    expect(res.body[0].ticker).toBe('TSLA');
    // First three params user-facing; last two are liquidity filter + z-cap.
    const params = mockQuery.mock.calls[0][1];
    expect(params.slice(0, 3)).toEqual(['2022-01-01', '2022-12-12', 2.0]);
    expect(params.length).toBeGreaterThanOrEqual(5);
  });

  test('respects custom z_threshold', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await request(app).get(`${url}&z_threshold=2.5`);
    expect(mockQuery.mock.calls[0][1][2]).toBe(2.5);
  });

  test('422 when z_threshold <= 0', async () => {
    const res = await request(app).get(`${url}&z_threshold=0`);
    expect(res.status).toBe(422);
  });

  test('400 on missing dates', async () => {
    const res = await request(app).get('/stocks/volume-spikes');
    expect(res.status).toBe(400);
  });
});
