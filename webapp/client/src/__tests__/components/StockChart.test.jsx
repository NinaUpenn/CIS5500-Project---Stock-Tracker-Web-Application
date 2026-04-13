// MUI X Charts renders SVG which jsdom handles but size calc is flaky
// without an explicit width. We're not snapshotting the SVG — just
// proving that empty/non-empty paths render the right UI state.

import { render, screen } from '@testing-library/react';
import StockChart from '../../components/StockChart';

test('renders empty-state when no data', () => {
  render(<StockChart data={[]} />);
  expect(screen.getByRole('status')).toHaveTextContent(/no price history/i);
});

test('renders the chart container when data is provided', () => {
  const data = [
    { trade_date: '2022-11-01', open: 1, high: 2, low: 1, close: 2, volume: 100 },
    { trade_date: '2022-11-02', open: 2, high: 3, low: 2, close: 3, volume: 150 },
  ];
  render(<StockChart data={data} />);
  expect(screen.getByLabelText(/closing price chart/i)).toBeInTheDocument();
});
