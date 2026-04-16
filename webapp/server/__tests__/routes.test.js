// Tests for the 13 SoT routes. pg.Pool is mocked so no RDS access is needed.
//
// Pattern:
//   1. jest.mock('pg') replaces Pool with a constructor whose instances
//      share a single jest.fn() `query`.
//   2. Require server.js AFTER the mock so its `new Pool()` call picks
//      up the mocked class.
//   3. Drive the app with supertest — no network, no port.

jest.mock('pg', () => {
  const mockQuery = jest.fn();
  const Pool = jest.fn(() => ({ query: mockQuery }));
  return { Pool, __mockQuery: mockQuery };
});

const { __mockQuery: mockQuery } = require('pg');
const request = require('supertest');
const app = require('../server');

// All data routes live under /api/v1. Keep the prefix in one place so a
// future /api/v2 is a one-line change.
const API = '/api/v1';

beforeEach(() => {
  mockQuery.mockReset();
});

// ---------- Route 1 ----------

describe('GET /companies/search', () => {
  test('200 with rows', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { ticker: 'AAPL', company_name: 'Apple Inc.', industry_name: 'Consumer Electronics', sector_name: 'Technology' },
      ],
    });
    const res = await request(app).get(`${API}/companies/search?q=AA`);
    expect(res.status).toBe(200);
    expect(res.body[0].ticker).toBe('AAPL');
    expect(mockQuery.mock.calls[0][1]).toEqual(['AA', 20]);
  });

  test('204 when empty', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get(`${API}/companies/search?q=ZZ`);
    expect(res.status).toBe(204);
  });

  test('400 when q missing', async () => {
    const res = await request(app).get(`${API}/companies/search`);
    expect(res.status).toBe(400);
  });

  test('422 on bad limit', async () => {
    const res = await request(app).get(`${API}/companies/search?q=A&limit=0`);
    expect(res.status).toBe(422);
  });
});

// ---------- Route 2 ----------

describe('GET /companies/:ticker', () => {
  test('200 with profile row', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ company_id: 1, ticker: 'AAPL', company_name: 'Apple Inc.' }],
    });
    const res = await request(app).get(`${API}/companies/AAPL`);
    expect(res.status).toBe(200);
    expect(res.body.ticker).toBe('AAPL');
    expect(mockQuery.mock.calls[0][1]).toEqual(['AAPL']);
  });

  test('404 when no rows', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get(`${API}/companies/NOPE`);
    expect(res.status).toBe(404);
  });
});

// ---------- Route 3 ----------

describe('GET /companies/:ticker/prices', () => {
  test('200 with series', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ trading_date: '2022-12-12', close: '1', ticker: 'AAPL' }],
    });
    const res = await request(app).get(`${API}/companies/AAPL/prices`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(mockQuery.mock.calls[0][1]).toEqual(['AAPL', null, null]);
  });

  test('respects date range', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await request(app).get(`${API}/companies/AAPL/prices?start_date=2022-01-01&end_date=2022-12-12`);
    expect(mockQuery.mock.calls[0][1]).toEqual(['AAPL', '2022-01-01', '2022-12-12']);
  });

  test('400 when dates are malformed', async () => {
    const res = await request(app).get(`${API}/companies/AAPL/prices?start_date=2022/01/01`);
    expect(res.status).toBe(400);
  });
});

// ---------- Route 4 ----------

describe('GET /stocks/top-gainers', () => {
  test('200 with rows', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ ticker: 'NVDA', pct_change: '6.9', sector_rank: 1 }],
    });
    const res = await request(app).get(`${API}/stocks/top-gainers?trading_date=2022-12-12`);
    expect(res.status).toBe(200);
    expect(mockQuery.mock.calls[0][1]).toEqual(['2022-12-12', 10]);
  });

  test('400 when trading_date missing', async () => {
    const res = await request(app).get(`${API}/stocks/top-gainers`);
    expect(res.status).toBe(400);
  });
});

// ---------- Route 5 ----------

describe('GET /stocks/top-average-returns', () => {
  test('200 with rows', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ ticker: 'NVDA', avg_daily_return: '0.003', return_rank: 1 }],
    });
    const res = await request(app).get(`${API}/stocks/top-average-returns?end_date=2022-12-12&limit=5`);
    expect(res.status).toBe(200);
    expect(mockQuery.mock.calls[0][1]).toEqual(['2022-12-12', 10, 5]);
  });
});

// ---------- Route 6 ----------

describe('GET /sectors/momentum', () => {
  test('200 with rows', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ ticker: 'NVDA', return_7d: '10.0', sector_rank: 1 }],
    });
    const res = await request(app).get(`${API}/sectors/momentum?as_of_date=2022-12-12`);
    expect(res.status).toBe(200);
    expect(mockQuery.mock.calls[0][1]).toEqual(['2022-12-12', null, 200]);
  });

  test('forwards sector_name filter', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await request(app).get(`${API}/sectors/momentum?sector_name=Technology`);
    expect(mockQuery.mock.calls[0][1][1]).toBe('Technology');
  });
});

// ---------- Route 7 ----------

describe('GET /companies/:ticker/news', () => {
  test('200 with rows', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ title: 'Hi', published_at: '2022-12-12T00:00:00Z', recency_rank: 1 }],
    });
    const res = await request(app).get(`${API}/companies/AAPL/news`);
    expect(res.status).toBe(200);
    expect(mockQuery.mock.calls[0][1]).toEqual(['AAPL', 30, 10]);
  });
});

// ---------- Route 8 ----------

describe('GET /news/trending', () => {
  test('200 with rows', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ ticker: 'TSLA', article_count: 22, sector_rank: 1 }],
    });
    const res = await request(app).get(`${API}/news/trending`);
    expect(res.status).toBe(200);
    expect(mockQuery.mock.calls[0][1]).toEqual([30, 5, 10]);
  });
});

// ---------- Route 9 ----------

describe('GET /prices/source-disagreement', () => {
  test('200 with rows', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ ticker: 'TSLA', trading_date: '2022-11-04', n_sources: 2, pct_spread: '0.3' }],
    });
    const res = await request(app).get(
      `${API}/prices/source-disagreement?start_date=2022-01-01&end_date=2022-12-12`,
    );
    expect(res.status).toBe(200);
    expect(mockQuery.mock.calls[0][1]).toEqual(['2022-01-01', '2022-12-12', 2, 50]);
  });

  test('400 when dates missing', async () => {
    const res = await request(app).get(`${API}/prices/source-disagreement`);
    expect(res.status).toBe(400);
  });
});

// ---------- Route 10 ----------

describe('GET /industries/rotations', () => {
  test('200 with rows', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ sector_name: 'Tech', industry_name: 'Semi', month: '2022-11-01', rnk: 1, rank_improvement: 5, industry_month_ret: '0.08' }],
    });
    const res = await request(app).get(
      `${API}/industries/rotations?start_date=2022-01-01&end_date=2022-12-12`,
    );
    expect(res.status).toBe(200);
    expect(mockQuery.mock.calls[0][1]).toEqual(['2022-01-01', '2022-12-12', 50]);
  });
});

// ---------- Helpers ----------

describe('GET /sectors', () => {
  test('200 with rows', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ sector_id: 1, sector_name: 'Technology' }],
    });
    const res = await request(app).get(`${API}/sectors`);
    expect(res.status).toBe(200);
    expect(res.body[0].sector_name).toBe('Technology');
  });
});

describe('GET /sectors/:sector/companies', () => {
  test('200 with rows', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ company_id: 1, ticker: 'AAPL' }],
    });
    const res = await request(app).get(`${API}/sectors/Technology/companies`);
    expect(res.status).toBe(200);
    expect(mockQuery.mock.calls[0][1]).toEqual(['Technology', 500]);
  });
});

describe('GET /companies', () => {
  test('200 with rows', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ company_id: 1, ticker: 'AAPL' }],
    });
    const res = await request(app).get(`${API}/companies`);
    expect(res.status).toBe(200);
    expect(mockQuery.mock.calls[0][1]).toEqual([200]);
  });
});

// ---------- DB-error path ----------

describe('error handling', () => {
  test('500 when the db throws on any handler', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockQuery.mockRejectedValueOnce(new Error('boom'));
    const res = await request(app).get(`${API}/companies/search?q=A`);
    expect(res.status).toBe(500);
    errSpy.mockRestore();
  });
});
