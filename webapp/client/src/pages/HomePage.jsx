// Home page — marketing blurb + the featured top-5 risk-adjusted
// tickers so the landing page has real content on first load.

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
import { formatPercent, formatNumber, signedColor } from '../helpers/formatter';

function Signed({ value, children }) {
  return (
    <Box component="span" sx={{ color: signedColor(value), fontWeight: 500 }}>
      {children}
    </Box>
  );
}

const WINDOW_START = '2022-01-01';
const WINDOW_END = '2022-12-12';

const COLUMNS = [
  { field: 'rn', header: '#', align: 'right' },
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
    field: 'avg_daily_ret',
    header: 'Avg daily return',
    align: 'right',
    render: (row) => (
      <Signed value={row.avg_daily_ret}>{formatPercent(row.avg_daily_ret, 3)}</Signed>
    ),
  },
  {
    field: 'vol_daily_ret',
    header: 'Daily volatility',
    align: 'right',
    render: (row) => formatPercent(row.vol_daily_ret, 3),
  },
  {
    field: 'risk_adj_score',
    header: 'Risk-adj. score',
    align: 'right',
    render: (row) => (
      <Signed value={row.risk_adj_score}>{formatNumber(row.risk_adj_score, 3)}</Signed>
    ),
  },
];

export default function HomePage() {
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    let cancelled = false;
    api
      .getRiskAdjusted(WINDOW_START, WINDOW_END, 5)
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
      <Typography variant="h1" gutterBottom>Stock News Trader</Typography>
      <Typography variant="body1" sx={{ mb: 4 }}>
        Explore S&amp;P-500-adjacent tickers. Pick a ticker to see its price
        history, or jump into the leaderboards.
      </Typography>

      <Paper sx={{ p: 2 }} elevation={0}>
        <Typography variant="h2" gutterBottom>Featured: top risk-adjusted</Typography>
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
