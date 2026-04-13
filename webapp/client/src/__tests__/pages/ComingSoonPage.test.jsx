import { render, screen } from '@testing-library/react';

jest.mock('../../services/api', () => ({
  __esModule: true,
  api: {
    getNewsSourceImpact: jest.fn(),
    getNewsReturnCorrelation: jest.fn(),
  },
}));

import { api } from '../../services/api';
import ComingSoonPage from '../../pages/ComingSoonPage';

beforeEach(() => {
  api.getNewsSourceImpact.mockReset();
  api.getNewsReturnCorrelation.mockReset();
});

test('news page renders both phase-2 cards from stub responses', async () => {
  api.getNewsSourceImpact.mockResolvedValueOnce({
    data: null,
    status: 501,
    stub: { phase: 2, reason: 'news_article not yet populated' },
  });
  api.getNewsReturnCorrelation.mockResolvedValueOnce({
    data: null,
    status: 501,
    stub: { phase: 2, reason: 'news_article not yet populated' },
  });

  render(<ComingSoonPage pageKey="news" />);

  expect(await screen.findByText('Source Impact')).toBeInTheDocument();
  expect(screen.getByText('News Sensitivity')).toBeInTheDocument();
  expect(screen.getAllByText(/coming in phase 2/i).length).toBe(2);
});

test('industries page renders static later-phase cards', () => {
  render(<ComingSoonPage pageKey="industries" />);
  expect(screen.getByText('Industry Leaderboard')).toBeInTheDocument();
  expect(screen.getByText('Industry Rotation')).toBeInTheDocument();
  expect(screen.getAllByText(/later phase/i).length).toBe(2);
});
