// Smoke test for the React skeleton.
// Proves the app tree mounts end-to-end: index -> App -> ThemeProvider
// -> Router -> NavBar + HomePage. If any of those are miswired, this
// fails loudly before feature tests run.

import { render, screen } from '@testing-library/react';

// Stub the shared api seam so the HomePage's useEffect doesn't hit the
// network in test. The smoke test only cares about the shell rendering.
jest.mock('../services/api', () => ({
  __esModule: true,
  api: {
    getRiskAdjusted: () => Promise.resolve({ data: [], status: 204 }),
  },
}));

import App from '../App';

test('renders the nav and home page', () => {
  render(<App />);

  expect(
    screen.getByRole('heading', { level: 1, name: /stock news trader/i })
  ).toBeInTheDocument();

  expect(screen.getByRole('navigation', { name: /primary/i })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /search/i })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /leaderboards/i })).toBeInTheDocument();
});
