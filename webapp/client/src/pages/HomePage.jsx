// home page. blurb + a featured top-average-returns leaderboard
// so the landing page has real content on first load

import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Container,
  Typography,
  Box,
  Paper,
  Alert,
  CircularProgress,
  Link as MuiLink,
} from '@mui/material';

import { api } from '../services/api';
import LazyTable from '../components/LazyTable';
import { formatPercent, formatInteger, signedColor } from '../helpers/formatter';

// anchors returns to the latest trading day in the dataset.
// no live data after 2022-12-12
const END_DATE = '2022-12-12';

function Signed({ value, children }) {
  return (
    <Box component="span" sx={{ color: signedColor(value), fontWeight: 500 }}>
      {children}
    </Box>
  );
}

const COLUMNS = [
  { field: 'return_rank', header: '#', align: 'right' },
  {
    field: 'ticker',
    header: 'Ticker',
    render: (row) => (
      <MuiLink component={RouterLink} to={`/stocks/${row.ticker}`}>
        ${row.ticker}
      </MuiLink>
    ),
  },
  {
    field: 'company_name',
    header: 'Company',
    render: (row) => row.company_name || '—',
  },
  {
    field: 'sector_name',
    header: 'Sector',
    render: (row) => row.sector_name || '—',
  },
  {
    field: 'avg_daily_return',
    header: 'Avg daily return',
    align: 'right',
    render: (row) => (
      <Signed value={row.avg_daily_return}>
        {formatPercent(row.avg_daily_return, 3)}
      </Signed>
    ),
  },
  {
    field: 'return_volatility',
    header: 'Volatility',
    align: 'right',
    render: (row) => formatPercent(row.return_volatility, 3),
  },
  {
    field: 'n_obs',
    header: 'Obs',
    align: 'right',
    render: (row) => formatInteger(row.n_obs),
  },
];

export default function HomePage() {
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    let cancelled = false;
    api
      .getTopAverageReturns(END_DATE, 10, 5)
      .then((res) => {
        if (cancelled) return;
        if (res.status === 204) {
          setStatus('empty');
          return;
        }
        setRows(res.data);
        setStatus('ok');
      })
      .catch((err) => {
        if (cancelled) return;
        console.error(err);
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Container component="main" sx={{ py: 4 }}>
      <Typography variant="h1" gutterBottom>Stock News Analyzer</Typography>
      <Typography variant="body1" sx={{ mb: 4 }}>
        Explore S&amp;P-500-adjacent tickers. Pick a ticker to see its price
        history, sector context, and recent news — or jump into the
        leaderboards.
      </Typography>

      <Paper sx={{ p: 2 }} elevation={0}>
        <Typography variant="h2" gutterBottom>Featured: top average returns (~30d)</Typography>
        <FeaturedBody status={status} rows={rows} />
      </Paper>
    </Container>
  );
}

function FeaturedBody({ status, rows }) {
  if (status === 'loading') {
    return (
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
        <CircularProgress size={20} />
        <Typography>Loading leaderboard…</Typography>
      </Box>
    );
  }
  if (status === 'error') {
    return <Alert severity="error">Couldn't load the leaderboard.</Alert>;
  }
  if (status === 'empty') {
    return <Typography color="text.secondary">No data yet.</Typography>;
  }
  return <LazyTable columns={COLUMNS} rows={rows} pageSize={5} />;
}
