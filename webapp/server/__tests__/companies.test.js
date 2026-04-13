// Tests for /companies routes. pg.Pool is mocked so no RDS access is needed.
//
// Pattern:
//   1. jest.mock('pg') replaces Pool with a constructor whose instances
//      share a single jest.fn() `query`. Tests queue responses per case.
//   2. Require server.js AFTER the mock, so its `new Pool()` call picks
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

beforeEach(() => {
  mockQuery.mockReset();
});

describe('GET /companies/search', () => {
  test('returns 200 with matching tickers', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ ticker: 'AAPL' }, { ticker: 'AAL' }],
    });

    const res = await request(app).get('/companies/search?q=AA');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ ticker: 'AAPL' }, { ticker: 'AAL' }]);

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/ILIKE \$1/);
    expect(params).toEqual(['AA', 50]);
  });

  test('respects custom limit', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ ticker: 'A' }] });

    const res = await request(app).get('/companies/search?q=A&limit=10');

    expect(res.status).toBe(200);
    expect(mockQuery.mock.calls[0][1]).toEqual(['A', 10]);
  });

  test('400 when q is missing', async () => {
    const res = await request(app).get('/companies/search');

    expect(res.status).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test('422 when limit is not a positive integer', async () => {
    const res = await request(app).get('/companies/search?q=A&limit=0');
    expect(res.status).toBe(422);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test('204 when no tickers match', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get('/companies/search?q=ZZZZ');

    expect(res.status).toBe(204);
    expect(res.body).toEqual({});
  });

  test('500 when the database throws', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockQuery.mockRejectedValueOnce(new Error('boom'));

    const res = await request(app).get('/companies/search?q=A');

    expect(res.status).toBe(500);
    errSpy.mockRestore();
  });
});

describe('GET /companies/:ticker', () => {
  test('returns 200 with profile row', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        ticker: 'AAPL',
        latest_date: '2022-12-12',
        latest_close: '144.49',
        latest_volume: '69246000',
        return_30_trading_days: '-0.0425',
      }],
    });

    const res = await request(app).get('/companies/AAPL');

    expect(res.status).toBe(200);
    expect(res.body.ticker).toBe('AAPL');
    expect(res.body.latest_close).toBe('144.49');
    expect(mockQuery.mock.calls[0][1]).toEqual(['AAPL']);
  });

  test('uppercases the ticker before querying', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        ticker: 'AAPL',
        latest_date: '2022-12-12',
        latest_close: '1',
        latest_volume: '1',
        return_30_trading_days: null,
      }],
    });

    const res = await request(app).get('/companies/aapl');

    expect(res.status).toBe(200);
    expect(mockQuery.mock.calls[0][1]).toEqual(['AAPL']);
  });

  test('404 when ticker has no rows', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        ticker: 'NOPE',
        latest_date: null,
        latest_close: null,
        latest_volume: null,
        return_30_trading_days: null,
      }],
    });

    const res = await request(app).get('/companies/NOPE');

    expect(res.status).toBe(404);
  });
});

describe('GET /companies/:ticker/similar', () => {
  const url = '/companies/AAPL/similar?start_date=2022-01-01&end_date=2022-12-12';

  test('returns 200 with correlated peers', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] }) // existence
      .mockResolvedValueOnce({
        rows: [
          { ticker: 'MSFT', n_overlap: 250, corr_ret: '0.78' },
          { ticker: 'GOOGL', n_overlap: 250, corr_ret: '0.75' },
        ],
      });

    const res = await request(app).get(url);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].ticker).toBe('MSFT');
  });

  test('404 when ticker has no rows in range', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get(url);

    expect(res.status).toBe(404);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  test('204 when no peers pass overlap threshold', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get(url);

    expect(res.status).toBe(204);
  });

  test('422 on bad min_overlap_days', async () => {
    const res = await request(app).get(`${url}&min_overlap_days=-5`);
    expect(res.status).toBe(422);
  });
});

describe('GET /stocks/:ticker/history', () => {
  test('returns 200 with OHLCV series', async () => {
    const sample = [{
      trade_date: '2022-12-12', open: '1', high: '2', low: '1', close: '2', volume: '100',
    }];
    mockQuery.mockResolvedValueOnce({ rows: sample });

    const res = await request(app)
      .get('/stocks/AAPL/history?start_date=2022-11-01&end_date=2022-12-12');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(sample);
    expect(mockQuery.mock.calls[0][1]).toEqual(['AAPL', '2022-11-01', '2022-12-12']);
  });

  test('400 when dates are missing', async () => {
    const res = await request(app).get('/stocks/AAPL/history');
    expect(res.status).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test('400 when dates are malformed', async () => {
    const res = await request(app)
      .get('/stocks/AAPL/history?start_date=2022/11/01&end_date=2022-12-12');
    expect(res.status).toBe(400);
  });

  test('204 when the range has no rows', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get('/stocks/AAPL/history?start_date=2022-11-01&end_date=2022-12-12');

    expect(res.status).toBe(204);
  });
});
