// /health now probes the DB, so we mock pg.Pool the same way the other
// route tests do. The health handler should:
//   * 200 with { status: 'ok', database.reachable: true } on a happy query
//   * 503 with { status: 'degraded', database.reachable: false } on error

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

describe('GET /api/v1/health', () => {
  test('200 with database.reachable=true when pg responds', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ server_version: 'PostgreSQL 16.1 on test' }],
    });

    const res = await request(app).get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(expect.objectContaining({
      status: 'ok',
      api_version: 'v1',
      time: expect.any(String),
      uptime_s: expect.any(Number),
      database: expect.objectContaining({
        reachable: true,
        latency_ms: expect.any(Number),
        server_version: 'PostgreSQL 16.1 on test',
      }),
    }));
  });

  test('503 with database.reachable=false when pg throws', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockQuery.mockRejectedValueOnce(new Error('connection refused'));

    const res = await request(app).get('/api/v1/health');

    expect(res.status).toBe(503);
    expect(res.body).toEqual(expect.objectContaining({
      status: 'degraded',
      database: expect.objectContaining({
        reachable: false,
        error: 'connection refused',
      }),
    }));
    errSpy.mockRestore();
  });
});
