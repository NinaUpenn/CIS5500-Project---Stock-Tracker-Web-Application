// Smoke test for the server skeleton.
// Proves three things in one check:
//   1. server.js can be required without throwing.
//   2. Express is wired up and responds to requests.
//   3. The /health route is registered and returns the documented body.
//
// No pg mock needed here because /health does not touch the database.

const request = require('supertest');
const app = require('../server');

describe('GET /health', () => {
  test('returns 200 with { status: "ok" }', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
