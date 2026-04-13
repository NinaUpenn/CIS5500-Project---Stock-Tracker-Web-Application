import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LazyTable from '../../components/LazyTable';

const columns = [
  { field: 'ticker', header: 'Ticker' },
  { field: 'score', header: 'Score', render: (r) => r.score.toFixed(2) },
];

test('renders header + rows', () => {
  render(<LazyTable
    columns={columns}
    rows={[{ ticker: 'AAPL', score: 0.5 }, { ticker: 'MSFT', score: 0.4 }]}
  />);

  expect(screen.getByText('Ticker')).toBeInTheDocument();
  expect(screen.getByText('AAPL')).toBeInTheDocument();
  expect(screen.getByText('0.50')).toBeInTheDocument();
});

test('renders empty message when no rows', () => {
  render(<LazyTable columns={columns} rows={[]} emptyMessage="Nothing here." />);
  expect(screen.getByText('Nothing here.')).toBeInTheDocument();
});

test('paginates when rows exceed pageSize', async () => {
  const rows = Array.from({ length: 15 }, (_, i) => ({
    ticker: `T${i}`,
    score: i / 10,
  }));

  render(<LazyTable columns={columns} rows={rows} pageSize={5} />);

  expect(screen.getByText('T0')).toBeInTheDocument();
  expect(screen.queryByText('T10')).not.toBeInTheDocument();

  const next = screen.getByRole('button', { name: /next page/i });
  await userEvent.click(next);
  await userEvent.click(next);

  expect(screen.getByText('T10')).toBeInTheDocument();
});
