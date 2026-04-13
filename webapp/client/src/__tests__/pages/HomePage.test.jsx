import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

jest.mock('../../services/api', () => ({
  __esModule: true,
  api: { getRiskAdjusted: jest.fn() },
}));

import { api } from '../../services/api';
import HomePage from '../../pages/HomePage';

beforeEach(() => {
  api.getRiskAdjusted.mockReset();
});

test('renders featured rows from /stocks/risk-adjusted', async () => {
  api.getRiskAdjusted.mockResolvedValueOnce({
    data: [
      { ticker: 'NVDA', avg_daily_ret: 0.003, vol_daily_ret: 0.029, n_days: 250, risk_adj_score: 0.098, rn: 1 },
      { ticker: 'MSFT', avg_daily_ret: 0.001, vol_daily_ret: 0.017, n_days: 250, risk_adj_score: 0.068, rn: 2 },
    ],
    status: 200,
  });

  render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>
  );

  expect(await screen.findByRole('link', { name: '$NVDA' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '$MSFT' })).toBeInTheDocument();
  expect(api.getRiskAdjusted).toHaveBeenCalledWith('2022-01-01', '2022-12-12', 5);
});

test('shows error alert when the seam throws', async () => {
  const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  api.getRiskAdjusted.mockRejectedValueOnce(new Error('nope'));

  render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>
  );

  expect(await screen.findByText(/couldn't load the leaderboard/i)).toBeInTheDocument();
  errSpy.mockRestore();
});
