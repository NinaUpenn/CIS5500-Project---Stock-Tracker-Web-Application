// SearchPage uses a debounced effect and the api seam. Tests mock the
// seam directly so the real mocks/fixtures aren't exercised — this
// keeps page tests focused on rendering & interaction.

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

jest.mock('../../services/api', () => ({
  __esModule: true,
  api: { searchCompanies: jest.fn() },
}));

import { api } from '../../services/api';
import SearchPage from '../../pages/SearchPage';

function renderPage() {
  return render(
    <MemoryRouter>
      <SearchPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  api.searchCompanies.mockReset();
});

test('idle message shows before typing', () => {
  renderPage();
  expect(screen.getByText(/start typing/i)).toBeInTheDocument();
});

test('typing a prefix renders matching tickers', async () => {
  api.searchCompanies.mockResolvedValueOnce({
    data: [{ ticker: 'AAPL' }, { ticker: 'AAL' }],
    status: 200,
  });

  renderPage();
  const user = userEvent.setup();
  await user.type(screen.getByRole('searchbox'), 'AA');

  expect(await screen.findByText('AAPL')).toBeInTheDocument();
  expect(screen.getByText('AAL')).toBeInTheDocument();
  expect(api.searchCompanies).toHaveBeenCalledWith('AA');
});

test('shows empty state on 204', async () => {
  api.searchCompanies.mockResolvedValueOnce({ data: [], status: 204 });

  renderPage();
  const user = userEvent.setup();
  await user.type(screen.getByRole('searchbox'), 'ZZ');

  expect(await screen.findByText(/no tickers match/i)).toBeInTheDocument();
});

test('shows error state when the seam throws', async () => {
  const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  api.searchCompanies.mockRejectedValueOnce(new Error('boom'));

  renderPage();
  const user = userEvent.setup();
  await user.type(screen.getByRole('searchbox'), 'AA');

  await waitFor(() =>
    expect(screen.getByText(/couldn't reach/i)).toBeInTheDocument()
  );
  errSpy.mockRestore();
});
