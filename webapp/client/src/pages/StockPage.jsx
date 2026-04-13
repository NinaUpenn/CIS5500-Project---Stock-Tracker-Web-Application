// Stock detail page. Composes three API calls and renders:
//   * Header card with latest close, volume, 30d return.
//   * Closing-price line chart with a Yahoo-style range selector.
//   * Similar-tickers table (correlation peers in a fixed 1Y window).

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Container,
  Typography,
  Grid,
  Paper,
  Box,
  Alert,
  CircularProgress,
  Link as MuiLink,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';

function Signed({ value, children }) {
  return (
    <Box component="span" sx={{ color: signedColor(value), fontWeight: 500 }}>
      {children}
    </Box>
  );
}

import { Link as RouterLink } from 'react-router-dom';

import { api } from '../services/api';
import StockChart from '../components/StockChart';
import LazyTable from '../components/LazyTable';
import {
  formatPercent,
  formatNumber,
  formatInteger,
  formatDate,
  formatPrice,
  signedColor,
} from '../helpers/formatter';

// Dataset ends 2022-12-12. Range presets anchor to this "last trading
// day" rather than today, since there is no post-2022 data.
const DATA_END = '2022-12-12';
const SIMILAR_WINDOW_START = '2022-01-01';
const SIMILAR_WINDOW_END = DATA_END;

const RANGES = [
  { key: '1W', label: '1W', days: 7 },
  { key: '2W', label: '2W', days: 14 },
  { key: '1M', label: '1M', days: 30 },
  { key: '3M', label: '3M', days: 90 },
  { key: '6M', label: '6M', days: 180 },
  { key: 'YTD', label: 'YTD' },
  { key: '1Y', label: '1Y', days: 365 },
  { key: '5Y', label: '5Y', days: 365 * 5 },
  { key: 'MAX', label: 'Max' },
];

function rangeToWindow(key) {
  const end = DATA_END;
  if (key === 'MAX') return { start: '1970-01-04', end };
  if (key === 'YTD') return { start: `${DATA_END.slice(0, 4)}-01-01`, end };
  const preset = RANGES.find((r) => r.key === key) || RANGES.find((r) => r.key === '1Y');
  const d = new Date(end);
  d.setUTCDate(d.getUTCDate() - preset.days);
  return { start: d.toISOString().slice(0, 10), end };
}

export default function StockPage() {
  const { ticker } = useParams();
  const upper = String(ticker).toUpperCase();

  const [profile, setProfile] = useState(null);
  const [history, setHistory] = useState([]);
  const [similar, setSimilar] = useState([]);
  const [status, setStatus] = useState('loading'); // loading | ok | not_found | error
  const [historyLoading, setHistoryLoading] = useState(false);
  const [range, setRange] = useState('1W');

  const window = useMemo(() => rangeToWindow(range), [range]);

  // Profile + similar only depend on ticker. Similar uses a fixed 1Y
  // window so correlation peers stay stable across range switches.
  useEffect(() => {
    let cancelled = false;
    setStatus('loading');

    Promise.all([
      api.getCompany(upper),
      api.getSimilarCompanies(upper, SIMILAR_WINDOW_START, SIMILAR_WINDOW_END),
    ])
      .then(([profileRes, similarRes]) => {
        if (cancelled) return;
        if (profileRes.status === 404) {
          setStatus('not_found');
          return;
        }
        setProfile(profileRes.data);
        setSimilar(
          similarRes.status === 204 || similarRes.status === 404
            ? []
            : similarRes.data,
        );
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
  }, [upper]);

  // History refetches whenever the selected range changes.
  useEffect(() => {
    let cancelled = false;
    setHistoryLoading(true);
    api
      .getStockHistory(upper, window.start, window.end)
      .then((res) => {
        if (cancelled) return;
        setHistory(res.status === 204 ? [] : res.data);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error(err);
        setHistory([]);
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [upper, window.start, window.end]);

  return (
    <Container component="main" sx={{ py: 4 }}>
      <Typography variant="h1" gutterBottom>${upper}</Typography>
      <Body
        status={status}
        profile={profile}
        history={history}
        similar={similar}
        range={range}
        onRangeChange={setRange}
        historyLoading={historyLoading}
      />
    </Container>
  );
}

const SIMILAR_COLUMNS = [
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
    field: 'corr_ret',
    header: 'Correlation',
    align: 'right',
    render: (row) => (
      <Signed value={row.corr_ret}>{formatNumber(row.corr_ret, 3)}</Signed>
    ),
  },
  {
    field: 'n_overlap',
    header: 'Days overlap',
    align: 'right',
    render: (row) => formatInteger(row.n_overlap),
  },
];

function Body({ status, profile, history, similar, range, onRangeChange, historyLoading }) {
  if (status === 'loading') {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <CircularProgress size={20} />
        <Typography>Loading…</Typography>
      </Box>
    );
  }
  if (status === 'not_found') {
    return <Alert severity="warning">Ticker not found.</Alert>;
  }
  if (status === 'error') {
    return <Alert severity="error">Couldn't load stock detail.</Alert>;
  }

  return (
    <>
      <ProfileCard profile={profile} />
      <Paper
        sx={{ p: 2, mt: 3, bgcolor: 'background.paper', color: 'text.primary' }}
        elevation={1}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1, mb: 1 }}>
          <Typography variant="h2">Closing price (USD)</Typography>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={range}
            onChange={(_, value) => value && onRangeChange(value)}
            aria-label="Date range"
          >
            {RANGES.map((r) => (
              <ToggleButton key={r.key} value={r.key} aria-label={r.label}>
                {r.label}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Box>
        {historyLoading ? (
          <Box sx={{ height: 360, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CircularProgress size={24} />
          </Box>
        ) : (
          <StockChart data={history} />
        )}
      </Paper>

      <Box sx={{ mt: 3 }}>
        <Typography variant="h2" gutterBottom>Similar tickers</Typography>
        <LazyTable
          columns={SIMILAR_COLUMNS}
          rows={similar}
          emptyMessage="No correlated peers in this window."
        />
      </Box>
    </>
  );
}

function ProfileCard({ profile }) {
  if (!profile) return null;
  const stats = [
    { label: 'Latest date', value: formatDate(profile.latest_date) },
    { label: 'Latest close', value: formatPrice(profile.latest_close) },
    { label: 'Latest volume', value: formatInteger(profile.latest_volume) },
    {
      label: '30-day return',
      value: formatPercent(profile.return_30_trading_days),
      color: signedColor(profile.return_30_trading_days),
    },
  ];
  return (
    <Paper sx={{ p: 2 }} elevation={1}>
      <Grid container spacing={2}>
        {stats.map((stat) => (
          <Grid item xs={6} md={3} key={stat.label}>
            <Typography variant="caption" color="text.secondary">
              {stat.label}
            </Typography>
            <Typography variant="h2" sx={{ fontSize: '1.25rem', color: stat.color }}>
              {stat.value}
            </Typography>
          </Grid>
        ))}
      </Grid>
    </Paper>
  );
}
