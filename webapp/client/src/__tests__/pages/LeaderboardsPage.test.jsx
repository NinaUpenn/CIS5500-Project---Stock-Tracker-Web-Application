import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

jest.mock('../../services/api', () => ({
  __esModule: true,
  api: {
    getTopGainers: jest.fn(),
    getTopAverageReturns: jest.fn(),
    getSectorMomentum: jest.fn(),
    getTrendingNews: jest.fn(),
    getSourceDisagreement: jest.fn(),
    getSectors: jest.fn(),
  },
}));

import { api } from '../../services/api';
import LeaderboardsPage from '../../pages/LeaderboardsPage';

beforeEach(() => {
  api.getTopGainers.mockReset();
  api.getTopAverageReturns.mockReset();
  api.getSectorMomentum.mockReset();
  api.getTrendingNews.mockReset();
  api.getSourceDisagreement.mockReset();
  api.getSectors.mockReset();
  api.getSectors.mockResolvedValue({ data: [], status: 204 });
});

function renderPage() {
  return render(
    <MemoryRouter>
      <LeaderboardsPage />
    </MemoryRouter>
  );
}

test('default tab loads top average returns', async () => {
  api.getTopAverageReturns.mockResolvedValueOnce({
    data: [
      {
        ticker: 'NVDA',
        company_name: 'NVIDIA Corporation',
        sector_name: 'Technology',
        industry_name: 'Semiconductors',
        avg_daily_return: 0.003,
        return_volatility: 0.029,
        n_obs: 21,
        return_rank: 1,
      },
    ],
    status: 200,
  });

  renderPage();

  expect(await screen.findByRole('link', { name: '$NVDA' })).toBeInTheDocument();
});

test('switching tabs triggers the right fetcher', async () => {
  api.getTopAverageReturns.mockResolvedValueOnce({
    data: [
      {
        ticker: 'NVDA',
        company_name: 'NVIDIA',
        sector_name: 'Technology',
        industry_name: 'Semi',
        avg_daily_return: 0.003,
        return_volatility: 0.029,
        n_obs: 21,
        return_rank: 1,
      },
    ],
    status: 200,
  });
  api.getTrendingNews.mockResolvedValueOnce({
    data: [
      {
        ticker: 'TSLA',
        company_name: 'Tesla, Inc.',
        sector_name: 'Consumer Discretionary',
        industry_name: 'Auto',
        article_count: 22,
        avg_sector_mentions: 6.4,
        sector_rank: 1,
      },
    ],
    status: 200,
  });

  renderPage();

  await screen.findByRole('link', { name: '$NVDA' });
  await userEvent.click(screen.getByRole('tab', { name: /trending news/i }));

  expect(await screen.findByRole('link', { name: '$TSLA' })).toBeInTheDocument();
  expect(api.getTrendingNews).toHaveBeenCalled();
});
