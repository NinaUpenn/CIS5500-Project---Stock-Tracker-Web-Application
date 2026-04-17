// trending news. stocks with the most news mentions in the lookback
// window, filtered to ones beating their sector average

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
  TextField,
} from '@mui/material';

import { api } from '../services/api';
import LazyTable from '../components/LazyTable';
import { formatInteger, formatNumber } from '../helpers/formatter';

const COLUMNS = [
  { field: 'sector_rank', header: 'Sector #', align: 'right' },
  {
    field: 'ticker',
    header: 'Ticker',
    render: (row) => (
      <MuiLink component={RouterLink} to={`/stocks/${row.ticker}`}>
        ${row.ticker}
      </MuiLink>
    ),
  },
  { field: 'company_name', header: 'Company' },
  { field: 'sector_name', header: 'Sector' },
  { field: 'industry_name', header: 'Industry' },
  {
    field: 'article_count',
    header: 'Articles',
    align: 'right',
    render: (row) => formatInteger(row.article_count),
  },
  {
    field: 'avg_sector_mentions',
    header: 'Sector avg',
    align: 'right',
    render: (row) => formatNumber(row.avg_sector_mentions, 1),
  },
];

export default function TrendingNewsPage() {
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState('loading');
  const [lookback, setLookback] = useState(30);
  const [minArticles, setMinArticles] = useState(5);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    api
      .getTrendingNews(lookback, minArticles, 50)
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
  }, [lookback, minArticles]);

  return (
    <Container component="main" sx={{ py: 4 }}>
      <Typography variant="h1" gutterBottom>Trending news</Typography>
      <Paper elevation={0} variant="outlined" sx={{ p: 2, mb: 3 }}>
        <Typography variant="body2" sx={{ mb: 1 }}>
          Stocks with the most news articles in the lookback window,
          filtered to those with more coverage than their own sector
          average.
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Only tickers with ≥ min_articles are included. Sector average
          is computed over tickers that had at least one mention.
        </Typography>
      </Paper>

      <Box sx={{ mb: 2, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <TextField
          label="Lookback days"
          type="number"
          size="small"
          value={lookback}
          onChange={(e) => setLookback(Math.max(1, Number(e.target.value) || 30))}
          inputProps={{ min: 1, max: 365 }}
        />
        <TextField
          label="Min articles"
          type="number"
          size="small"
          value={minArticles}
          onChange={(e) => setMinArticles(Math.max(1, Number(e.target.value) || 5))}
          inputProps={{ min: 1 }}
        />
      </Box>

      <Body status={status} rows={rows} />
    </Container>
  );
}

function Body({ status, rows }) {
  if (status === 'loading') {
    return (
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
        <CircularProgress size={20} />
        <Typography>Loading…</Typography>
      </Box>
    );
  }
  if (status === 'error') {
    return <Alert severity="error">Couldn't load trending news.</Alert>;
  }
  if (status === 'empty') {
    return <Typography color="text.secondary">No data for this window.</Typography>;
  }
  return <LazyTable columns={COLUMNS} rows={rows} pageSize={15} keyField="ticker" />;
}
