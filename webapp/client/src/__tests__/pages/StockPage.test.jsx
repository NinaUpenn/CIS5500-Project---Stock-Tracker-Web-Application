import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

jest.mock('../../services/api', () => ({
  __esModule: true,
  api: {
    getCompany: jest.fn(),
    getCompanyPrices: jest.fn(),
    getCompanyNews: jest.fn(),
  },
}));

import { api } from '../../services/api';
import StockPage from '../../pages/StockPage';

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/stocks/:ticker" element={<StockPage />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  api.getCompany.mockReset();
  api.getCompanyPrices.mockReset();
  api.getCompanyNews.mockReset();
});

test('renders full profile, chart, and news for a known ticker', async () => {
  api.getCompany.mockResolvedValueOnce({
    data: {
      ticker: 'AAPL',
      company_name: 'Apple Inc.',
      sector_name: 'Technology',
      industry_name: 'Consumer Electronics',
      latest_trading_date: '2022-12-12',
      latest_close: 144.49,
      latest_volume: 69246000,
      snapshot_price: 144.49,
      price_earnings: 24.1,
      dividend_yield: 0.006,
      earnings_share: 6.0,
      week_52_low: 124.17,
      week_52_high: 182.94,
      snapshot_market_cap: 2300000000000,
      snapshot_ebitda: 130000000000,
      price_sales: 6.5,
      price_book: 45.2,
      exchange: 'NMS',
      cik: '0000320193',
      long_business_summary: 'Apple Inc. designs...',
    },
    status: 200,
  });
  api.getCompanyPrices.mockResolvedValueOnce({
    data: [
      { trading_date: '2022-12-01', open: 1, high: 2, low: 1, close: 2, volume: 1 },
      { trading_date: '2022-12-02', open: 2, high: 3, low: 2, close: 3, volume: 1 },
    ],
    status: 200,
  });
  api.getCompanyNews.mockResolvedValueOnce({
    data: [
      {
        title: 'Apple beats expectations',
        source: 'Reuters',
        published_at: '2022-12-12T12:00:00Z',
        url: 'https://example.com/apple',
        summary: 'Services segment grows.',
        lm_sentiment: 'positive',
        mention_confidence: 0.98,
      },
    ],
    status: 200,
  });

  renderAt('/stocks/AAPL');

  expect(await screen.findByText('$AAPL')).toBeInTheDocument();
  // "Apple Inc." shows up in both the subheading and the business summary,
  // so assert on the subheading's sector/industry tail instead.
  expect(screen.getByText(/Technology · Consumer Electronics/i)).toBeInTheDocument();
  expect(screen.getByText(/Latest trade/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/closing price chart/i)).toBeInTheDocument();
  expect(await screen.findByText('Apple beats expectations')).toBeInTheDocument();
});

test('shows not_found state on 404', async () => {
  api.getCompany.mockResolvedValueOnce({ data: null, status: 404 });
  api.getCompanyPrices.mockResolvedValueOnce({ data: [], status: 204 });
  api.getCompanyNews.mockResolvedValueOnce({ data: [], status: 204 });

  renderAt('/stocks/NOPE');

  await waitFor(() =>
    expect(screen.getByText(/ticker not found/i)).toBeInTheDocument()
  );
});

test('shows error state when the seam throws', async () => {
  const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  api.getCompany.mockRejectedValueOnce(new Error('boom'));
  api.getCompanyPrices.mockResolvedValueOnce({ data: [], status: 204 });
  api.getCompanyNews.mockResolvedValueOnce({ data: [], status: 204 });

  renderAt('/stocks/AAPL');

  await waitFor(() =>
    expect(screen.getByText(/couldn't load stock detail/i)).toBeInTheDocument()
  );
  errSpy.mockRestore();
});
