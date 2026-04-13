// Leaderboards — two tabs backed by separate endpoints.
//
// Each tab opens with a description card explaining what the metric
// measures and how to read the table, then renders the ranked rows.

import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Container,
  Typography,
  Tabs,
  Tab,
  Box,
  Paper,
  Stack,
  Alert,
  CircularProgress,
  Link as MuiLink,
} from '@mui/material';

import { api } from '../services/api';
import LazyTable from '../components/LazyTable';
import {
  formatPercent,
  formatNumber,
  formatInteger,
  signedColor,
} from '../helpers/formatter';

function Signed({ value, children }) {
  return (
    <Box component="span" sx={{ color: signedColor(value), fontWeight: 500 }}>
      {children}
    </Box>
  );
}

const WINDOW_START = '2022-01-01';
const WINDOW_END = '2022-12-12';

const RISK_COLUMNS = [
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
    field: 'n_days',
    header: 'Days',
    align: 'right',
    render: (row) => formatInteger(row.n_days),
  },
  {
    field: 'risk_adj_score',
    header: 'Score',
    align: 'right',
    render: (row) => (
      <Signed value={row.risk_adj_score}>{formatNumber(row.risk_adj_score, 3)}</Signed>
    ),
  },
];

const SPIKE_COLUMNS = [
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
    field: 'spike_days',
    header: 'Spike days',
    align: 'right',
    render: (row) => formatInteger(row.spike_days),
  },
  {
    field: 'avg_zscore',
    header: 'Avg z-score',
    align: 'right',
    render: (row) => formatNumber(row.avg_zscore, 2),
  },
];

const RISK_DESCRIPTION = {
  title: 'Risk-adjusted return',
  summary:
    "Ranks tickers by how much daily return they delivered per unit of daily price volatility — a Sharpe-style efficiency score.",
  formula: 'Score = average daily return ÷ daily volatility (standard deviation of returns)',
  reading: [
    ['Avg daily return', 'Mean of (close / prev close − 1) across the window.'],
    ['Daily volatility', 'Standard deviation of those daily returns. Lower = smoother ride.'],
    ['Days', 'Trading days that survived the liquidity and outlier filters.'],
    ['Score', 'Higher = more return per unit of risk. Negative means the ticker lost money on average.'],
  ],
  caveats:
    'Penny stocks, names with too few clean days, and extreme outlier returns are filtered out so the leaderboard reflects investable, well-sampled tickers.',
};

const SPIKES_DESCRIPTION = {
  title: 'Volume spikes',
  summary:
    "Surfaces tickers whose daily trading volume repeatedly broke far above their own recent baseline — a classic 'unusual activity' signal.",
  formula:
    'For each day: z = (volume − 60-day rolling average) ÷ 60-day rolling stddev. A "spike" is any day with z ≥ threshold (default 3).',
  reading: [
    ['Spike days', 'Total trading days in the window flagged as spikes. Primary ranking signal.'],
    ['Avg z-score', 'Average magnitude of those spikes (capped at 10 to keep one freak day from dominating).'],
  ],
  caveats:
    'Tickers with rolling 60-day average volume below 100k shares are excluded — anomaly-detection on thinly-traded names produces meaningless z-scores.',
};

export default function LeaderboardsPage() {
  const [tab, setTab] = useState('risk');

  return (
    <Container component="main" sx={{ py: 4 }}>
      <Typography variant="h1" gutterBottom>Leaderboards</Typography>
      <Tabs
        value={tab}
        onChange={(_e, next) => setTab(next)}
        aria-label="Leaderboard tabs"
        sx={{ mb: 3 }}
      >
        <Tab value="risk" label="Risk-adjusted" />
        <Tab value="spikes" label="Volume spikes" />
      </Tabs>
      {tab === 'risk' ? <RiskAdjustedTab /> : <VolumeSpikesTab />}
    </Container>
  );
}

function MetricExplainer({ description }) {
  return (
    <Paper
      elevation={0}
      variant="outlined"
      sx={{ p: 2, mb: 2, bgcolor: 'background.paper' }}
    >
      <Stack spacing={1.25}>
        <Typography variant="h2" sx={{ fontSize: '1.15rem' }}>
          {description.title}
        </Typography>
        <Typography variant="body2">{description.summary}</Typography>
        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            How it's calculated
          </Typography>
          <Typography variant="body2" sx={{ fontFamily: 'monospace', mt: 0.25 }}>
            {description.formula}
          </Typography>
        </Box>
        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
            How to read the columns
          </Typography>
          <Stack component="ul" spacing={0.25} sx={{ pl: 2.5, m: 0 }}>
            {description.reading.map(([label, body]) => (
              <Box component="li" key={label}>
                <Typography variant="body2">
                  <Box component="span" sx={{ fontWeight: 600 }}>{label}:</Box> {body}
                </Typography>
              </Box>
            ))}
          </Stack>
        </Box>
        <Typography variant="caption" color="text.secondary">
          {description.caveats}
        </Typography>
      </Stack>
    </Paper>
  );
}

// Stable-identity fetchers (declared outside the component) so the
// useEffect dep array can legitimately include them without re-firing
// on every render.
const FETCHERS = {
  risk: () => api.getRiskAdjusted(WINDOW_START, WINDOW_END, 25),
  spikes: () => api.getVolumeSpikes(WINDOW_START, WINDOW_END),
};

function useLeaderboard(kind) {
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    FETCHERS[kind]()
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
  }, [kind]);

  return { rows, status };
}

function StateWrapper({ status, children }) {
  if (status === 'loading') {
    return (
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
        <CircularProgress size={20} />
        <Typography>Loading…</Typography>
      </Box>
    );
  }
  if (status === 'error') {
    return <Alert severity="error">Couldn't load leaderboard.</Alert>;
  }
  if (status === 'empty') {
    return <Typography color="text.secondary">No data yet.</Typography>;
  }
  return children;
}

function RiskAdjustedTab() {
  const { rows, status } = useLeaderboard('risk');
  return (
    <>
      <MetricExplainer description={RISK_DESCRIPTION} />
      <StateWrapper status={status}>
        <LazyTable columns={RISK_COLUMNS} rows={rows} pageSize={10} />
      </StateWrapper>
    </>
  );
}

function VolumeSpikesTab() {
  const { rows, status } = useLeaderboard('spikes');
  return (
    <>
      <MetricExplainer description={SPIKES_DESCRIPTION} />
      <StateWrapper status={status}>
        <LazyTable columns={SPIKE_COLUMNS} rows={rows} pageSize={10} />
      </StateWrapper>
    </>
  );
}
