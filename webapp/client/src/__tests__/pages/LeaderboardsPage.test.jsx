import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

jest.mock('../../services/api', () => ({
  __esModule: true,
  api: {
    getRiskAdjusted: jest.fn(),
    getVolumeSpikes: jest.fn(),
  },
}));

import { api } from '../../services/api';
import LeaderboardsPage from '../../pages/LeaderboardsPage';

beforeEach(() => {
  api.getRiskAdjusted.mockReset();
  api.getVolumeSpikes.mockReset();
});

function renderPage() {
  return render(
    <MemoryRouter>
      <LeaderboardsPage />
    </MemoryRouter>
  );
}

test('risk-adjusted tab loads on mount', async () => {
  api.getRiskAdjusted.mockResolvedValueOnce({
    data: [{ ticker: 'NVDA', avg_daily_ret: 0.003, vol_daily_ret: 0.029, n_days: 250, risk_adj_score: 0.098, rn: 1 }],
    status: 200,
  });

  renderPage();

  expect(await screen.findByRole('link', { name: '$NVDA' })).toBeInTheDocument();
});

test('switching tabs triggers the spikes fetcher', async () => {
  api.getRiskAdjusted.mockResolvedValueOnce({
    data: [{ ticker: 'NVDA', rn: 1, avg_daily_ret: 0.003, vol_daily_ret: 0.029, n_days: 250, risk_adj_score: 0.098 }],
    status: 200,
  });
  api.getVolumeSpikes.mockResolvedValueOnce({
    data: [{ ticker: 'TSLA', spike_days: 18, avg_zscore: 3.42 }],
    status: 200,
  });

  renderPage();

  await screen.findByRole('link', { name: '$NVDA' });
  await userEvent.click(screen.getByRole('tab', { name: /volume spikes/i }));

  expect(await screen.findByRole('link', { name: '$TSLA' })).toBeInTheDocument();
  expect(api.getVolumeSpikes).toHaveBeenCalled();
});
