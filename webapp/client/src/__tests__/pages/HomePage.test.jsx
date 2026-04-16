import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

jest.mock('../../services/api', () => ({
  __esModule: true,
  api: { getTopAverageReturns: jest.fn() },
}));

import { api } from '../../services/api';
import HomePage from '../../pages/HomePage';

beforeEach(() => {
  api.getTopAverageReturns.mockReset();
});

test('renders featured rows from /stocks/top-average-returns', async () => {
  api.getTopAverageReturns.mockResolvedValueOnce({
    data: [
      {
        ticker: 'NVDA',
        company_name: 'NVIDIA Corporation',
        industry_name: 'Semiconductors',
        sector_name: 'Technology',
        avg_daily_return: 0.003,
        return_volatility: 0.029,
        n_obs: 21,
        return_rank: 1,
      },
      {
        ticker: 'MSFT',
        company_name: 'Microsoft Corporation',
        industry_name: 'Software',
        sector_name: 'Technology',
        avg_daily_return: 0.001,
        return_volatility: 0.017,
        n_obs: 21,
        return_rank: 2,
      },
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
  expect(screen.getByText('NVIDIA Corporation')).toBeInTheDocument();
  expect(api.getTopAverageReturns).toHaveBeenCalledWith('2022-12-12', 10, 5);
});

test('shows error alert when the seam throws', async () => {
  const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  api.getTopAverageReturns.mockRejectedValueOnce(new Error('nope'));

  render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>
  );

  expect(await screen.findByText(/couldn't load the leaderboard/i)).toBeInTheDocument();
  errSpy.mockRestore();
});
