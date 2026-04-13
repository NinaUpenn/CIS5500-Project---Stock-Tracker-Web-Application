import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

jest.mock('../../services/api', () => ({
  __esModule: true,
  api: {
    getCompany: jest.fn(),
    getStockHistory: jest.fn(),
    getSimilarCompanies: jest.fn(),
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
  api.getStockHistory.mockReset();
  api.getSimilarCompanies.mockReset();
});

test('renders profile + chart + similar for a known ticker', async () => {
  api.getCompany.mockResolvedValueOnce({
    data: {
      ticker: 'AAPL',
      latest_date: '2022-12-12',
      latest_close: 144.49,
      latest_volume: 69246000,
      return_30_trading_days: -0.0425,
    },
    status: 200,
  });
  api.getStockHistory.mockResolvedValueOnce({
    data: [
      { trade_date: '2022-12-01', open: 1, high: 2, low: 1, close: 2, volume: 1 },
      { trade_date: '2022-12-02', open: 2, high: 3, low: 2, close: 3, volume: 1 },
    ],
    status: 200,
  });
  api.getSimilarCompanies.mockResolvedValueOnce({
    data: [{ ticker: 'MSFT', n_overlap: 250, corr_ret: 0.78 }],
    status: 200,
  });

  renderAt('/stocks/AAPL');

  expect(await screen.findByText('Latest close')).toBeInTheDocument();
  expect(screen.getByText('2022-12-12')).toBeInTheDocument();
  expect(screen.getByText('-4.25%')).toBeInTheDocument();
  expect(screen.getByLabelText(/closing price chart/i)).toBeInTheDocument();
  expect(screen.getByText('Similar tickers')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '$MSFT' })).toBeInTheDocument();
});

test('shows not_found state on 404', async () => {
  api.getCompany.mockResolvedValueOnce({ data: null, status: 404 });
  api.getStockHistory.mockResolvedValueOnce({ data: [], status: 204 });
  api.getSimilarCompanies.mockResolvedValueOnce({ data: null, status: 404 });

  renderAt('/stocks/NOPE');

  await waitFor(() =>
    expect(screen.getByText(/ticker not found/i)).toBeInTheDocument()
  );
});

test('shows error state when the seam throws', async () => {
  const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  api.getCompany.mockRejectedValueOnce(new Error('boom'));
  api.getStockHistory.mockResolvedValueOnce({ data: [], status: 204 });
  api.getSimilarCompanies.mockResolvedValueOnce({ data: [], status: 204 });

  renderAt('/stocks/AAPL');

  await waitFor(() =>
    expect(screen.getByText(/couldn't load stock detail/i)).toBeInTheDocument()
  );
  errSpy.mockRestore();
});
