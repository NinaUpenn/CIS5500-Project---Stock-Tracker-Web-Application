// industry rotations. month-over-month rank shifts of industries
// within their sector

import { useEffect, useState } from 'react';
import {
  Container,
  Typography,
  Box,
  Paper,
  Alert,
  CircularProgress,
  TextField,
} from '@mui/material';

import { api } from '../services/api';
import LazyTable from '../components/LazyTable';
import { formatPercent, formatDate, signedColor } from '../helpers/formatter';

function Signed({ value, children }) {
  return (
    <Box component="span" sx={{ color: signedColor(value), fontWeight: 500 }}>
      {children}
    </Box>
  );
}

const DEFAULT_START = '2022-01-01';
const DEFAULT_END = '2022-12-12';

const COLUMNS = [
  {
    field: 'month',
    header: 'Month',
    render: (row) => formatDate(row.month),
  },
  { field: 'sector_name', header: 'Sector' },
  { field: 'industry_name', header: 'Industry' },
  {
    field: 'prev_rnk',
    header: 'Prev rank',
    align: 'right',
    render: (row) => row.prev_rnk ?? '—',
  },
  {
    field: 'rnk',
    header: 'Rank',
    align: 'right',
    render: (row) => row.rnk,
  },
  {
    field: 'rank_improvement',
    header: 'Δ rank',
    align: 'right',
    render: (row) => (
      <Signed value={row.rank_improvement}>
        {row.rank_improvement > 0 ? `+${row.rank_improvement}` : row.rank_improvement}
      </Signed>
    ),
  },
  {
    field: 'industry_month_ret',
    header: 'Monthly return',
    align: 'right',
    render: (row) => (
      <Signed value={row.industry_month_ret}>
        {formatPercent(row.industry_month_ret, 2)}
      </Signed>
    ),
  },
];

export default function IndustryRotationsPage() {
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState('loading');
  const [startDate, setStartDate] = useState(DEFAULT_START);
  const [endDate, setEndDate] = useState(DEFAULT_END);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    api
      .getIndustryRotations(startDate, endDate, 50)
      .then((res) => {
        if (cancelled) return;
        if (res.status === 204) {
          setStatus('empty');
          return;
        }
        // stable per-row key; sector+industry+month is unique
        const keyed = res.data.map((row) => ({
          ...row,
          key: `${row.sector_name}::${row.industry_name}::${row.month}`,
        }));
        setRows(keyed);
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
  }, [startDate, endDate]);

  return (
    <Container component="main" sx={{ py: 4 }}>
      <Typography variant="h1" gutterBottom>Industry rotations</Typography>
      <Paper elevation={0} variant="outlined" sx={{ p: 2, mb: 3 }}>
        <Typography variant="body2" sx={{ mb: 1 }}>
          Monthly rank shifts of industries within their sector. A large
          positive Δ rank means an industry jumped from the bottom of its
          sector to the top in a single month.
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Monthly return is the geometric mean of constituent tickers'
          compounded daily returns for the month, then averaged across
          the industry. Ranks are 1 = highest return within the sector.
        </Typography>
      </Paper>

      <Box sx={{ mb: 2, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <TextField
          label="Start date"
          type="date"
          size="small"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          InputLabelProps={{ shrink: true }}
        />
        <TextField
          label="End date"
          type="date"
          size="small"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          InputLabelProps={{ shrink: true }}
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
    return <Alert severity="error">Couldn't load industry rotations.</Alert>;
  }
  if (status === 'empty') {
    return <Typography color="text.secondary">No rotations detected in this window.</Typography>;
  }
  return (
    <LazyTable
      columns={COLUMNS}
      rows={rows}
      pageSize={15}
      keyField="key"
      // no single-column pk, so compose one. sector+industry+month is
      // unique per row in this result set
    />
  );
}
