// Every deferred endpoint must respond 501 with { phase, reason } so
// the UI's ComingSoonCard has a uniform contract to render against.
// No pg mock needed because stub handlers never touch the DB.

jest.mock('pg', () => {
  const mockQuery = jest.fn();
  const Pool = jest.fn(() => ({ query: mockQuery }));
  return { Pool, __mockQuery: mockQuery };
});

const request = require('supertest');
const app = require('../server');

const STUBBED_ROUTES = [
  { path: '/industries/leaderboard', phase: 'later' },
  { path: '/industries/rotation', phase: 'later' },
  { path: '/stocks/source-disagreement', phase: 'later' },
  { path: '/news/source-impact', phase: 2 },
  { path: '/companies/news-return-correlation', phase: 2 },
];

describe.each(STUBBED_ROUTES)('stub %s', ({ path, phase }) => {
  test('responds 501 with { phase, reason }', async () => {
    const res = await request(app).get(path);
    expect(res.status).toBe(501);
    expect(res.body).toHaveProperty('phase', phase);
    expect(res.body).toHaveProperty('reason');
    expect(typeof res.body.reason).toBe('string');
    expect(res.body.reason.length).toBeGreaterThan(0);
  });
});
