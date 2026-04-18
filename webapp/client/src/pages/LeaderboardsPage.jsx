// leaderboards. five tabs covering the analytics routes. each tab
// opens with a description card, then renders the ranked rows

import { useCallback, useEffect, useState } from 'react';
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
  TextField,
  MenuItem,
} from '@mui/material';

import { api } from '../services/api';
import LazyTable from '../components/LazyTable';
import {
  formatPercent,
  formatNumber,
  formatInteger,
  formatPrice,
  formatDate,
  signedColor,
} from '../helpers/formatter';

const DATA_END = '2022-12-12';
const DEFAULT_START = '2022-01-01';

function Signed({ value, children }) {
  return (
    <Box component="span" sx={{ color: signedColor(value), fontWeight: 500 }}>
      {children}
    </Box>
  );
}

function TickerLink({ ticker }) {
  return (
    <MuiLink component={RouterLink} to={`/stocks/${ticker}`}>
      ${ticker}
    </MuiLink>
  );
}

// column definitions

const TOP_GAINERS_COLUMNS = [
  { field: 'sector_rank', header: 'Sector #', align: 'right' },
  { field: 'ticker', header: 'Ticker', render: (row) => <TickerLink ticker={row.ticker} /> },
  { field: 'company_name', header: 'Company' },
  { field: 'sector_name', header: 'Sector' },
  {
    field: 'pct_change',
    header: 'Change',
    align: 'right',
    render: (row) => <Signed value={row.pct_change}>{formatNumber(row.pct_change, 2)}%</Signed>,
  },
  {
    field: 'close',
    header: 'Close',
    align: 'right',
    render: (row) => formatPrice(row.close),
  },
  {
    field: 'avg_sector_change',
    header: 'Sector avg',
    align: 'right',
    render: (row) => (
      <Signed value={row.avg_sector_change}>
        {formatNumber(row.avg_sector_change, 2)}%
      </Signed>
    ),
  },
];

const TOP_RETURNS_COLUMNS = [
  { field: 'return_rank', header: '#', align: 'right' },
  { field: 'ticker', header: 'Ticker', render: (row) => <TickerLink ticker={row.ticker} /> },
  { field: 'company_name', header: 'Company' },
  { field: 'sector_name', header: 'Sector' },
  {
    field: 'avg_daily_return',
    header: 'Avg daily return',
    align: 'right',
    render: (row) => (
      <Signed value={row.avg_daily_return}>{formatPercent(row.avg_daily_return, 3)}</Signed>
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

const MOMENTUM_COLUMNS = [
  { field: 'sector_rank', header: 'Sector #', align: 'right' },
  { field: 'ticker', header: 'Ticker', render: (row) => <TickerLink ticker={row.ticker} /> },
  { field: 'company_name', header: 'Company' },
  { field: 'sector_name', header: 'Sector' },
  { field: 'industry_name', header: 'Industry' },
  {
    field: 'return_7d',
    header: '7d return',
    align: 'right',
    render: (row) => <Signed value={row.return_7d}>{formatNumber(row.return_7d, 2)}%</Signed>,
  },
  {
    field: 'avg_sector_return',
    header: 'Sector avg',
    align: 'right',
    render: (row) => (
      <Signed value={row.avg_sector_return}>
        {formatNumber(row.avg_sector_return, 2)}%
      </Signed>
    ),
  },
];

const TRENDING_NEWS_COLUMNS = [
  { field: 'sector_rank', header: 'Sector #', align: 'right' },
  { field: 'ticker', header: 'Ticker', render: (row) => <TickerLink ticker={row.ticker} /> },
  { field: 'company_name', header: 'Company' },
  { field: 'sector_name', header: 'Sector' },
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

const DISAGREEMENT_COLUMNS = [
  { field: 'ticker', header: 'Ticker', render: (row) => <TickerLink ticker={row.ticker} /> },
  { field: 'company_name', header: 'Company' },
  {
    field: 'trading_date',
    header: 'Date',
    render: (row) => formatDate(row.trading_date),
  },
  {
    field: 'n_sources',
    header: 'Sources',
    align: 'right',
    render: (row) => formatInteger(row.n_sources),
  },
  {
    field: 'min_close',
    header: 'Min close',
    align: 'right',
    render: (row) => formatPrice(row.min_close),
  },
  {
    field: 'max_close',
    header: 'Max close',
    align: 'right',
    render: (row) => formatPrice(row.max_close),
  },
  {
    field: 'pct_spread',
    header: 'Spread %',
    align: 'right',
    render: (row) => formatNumber(row.pct_spread, 3),
  },
];

// descriptions

const DESCRIPTIONS = {
  gainers: {
    title: 'Top gainers (daily)',
    summary:
      'Ranks stocks whose day-over-day return beat their own sector average on a given trading day.',
    formula: 'pct_change = (close − prev_close) / prev_close × 100; filtered to rows where pct_change > sector_avg',
    reading: [
      ['Change', 'Percentage move vs the previous trading day.'],
      ['Close', 'Closing price on the selected date.'],
      ['Sector avg', 'Mean pct_change across all stocks in the same sector.'],
      ['Sector #', 'Rank within the sector, 1 = biggest outperformer.'],
    ],
    caveats: 'Previous trading day is found per-company with a LATERAL join, so weekends/holidays stay aligned.',
  },
  returns: {
    title: 'Top average returns (~30d)',
    summary:
      'Ranks tickers by their average daily return over the last ~30 calendar days (~21 trading days).',
    formula: 'Score = mean(daily_return) over anchor-to-anchor−30d; requires n_obs ≥ min_observations',
    reading: [
      ['Avg daily return', 'Simple mean of daily returns.'],
      ['Volatility', 'Sample standard deviation of those daily returns.'],
      ['Obs', 'Trading days with a valid return; floor is configurable.'],
    ],
    caveats: 'Tickers with fewer than 10 observations in the window are excluded by default.',
  },
  momentum: {
    title: 'Sector momentum (7-trading-day)',
    summary:
      'Surfaces stocks whose 7-trading-day return sits above their sector average, ranked within each sector.',
    formula: 'return_7d = (close / close_7_trading_days_ago − 1) × 100; filtered where return_7d > sector_avg',
    reading: [
      ['7d return', 'Percentage move across the last 7 trading days (~9 calendar).'],
      ['Sector avg', 'Mean of 7d return across all stocks in the same sector.'],
    ],
    caveats: 'Anchor date defaults to the latest trading day in the dataset.',
  },
  trending: {
    title: 'Trending news (last ~30 days)',
    summary:
      'Stocks with the most news articles in the lookback window, requiring they beat their own sector average.',
    formula: 'article_count = COUNT(DISTINCT article_id) WHERE published_at ≥ now − lookback',
    reading: [
      ['Articles', 'Distinct articles mentioning this ticker.'],
      ['Sector avg', 'Mean article_count across tickers in the same sector.'],
    ],
    caveats: 'Only tickers with ≥ min_articles (default 5) mentions are considered.',
  },
  disagreement: {
    title: 'Source disagreement',
    summary:
      'Days where different price feeds reported noticeably different closing prices for the same ticker.',
    formula: 'pct_spread = (max_close − min_close) / avg_close × 100; at least min_sources feeds required',
    reading: [
      ['Min/max close', 'Lowest/highest close reported across sources that day.'],
      ['Spread %', 'Percent gap between sources, used as the primary ranker.'],
      ['Sources', 'Number of distinct feeds that had a row for this day.'],
    ],
    caveats: 'Pulls the single worst day per ticker by pct_spread, then close_spread, then date.',
  },
};

// page

export default function LeaderboardsPage() {
  const [tab, setTab] = useState('returns');

  return (
    <Container component="main" sx={{ py: 4 }}>
      <Typography variant="h1" gutterBottom>Leaderboards</Typography>
      <Tabs
        value={tab}
        onChange={(_e, next) => setTab(next)}
        aria-label="Leaderboard tabs"
        variant="scrollable"
        scrollButtons="auto"
        sx={{ mb: 3 }}
      >
        <Tab value="gainers" label="Top gainers" />
        <Tab value="returns" label="Top avg returns" />
        <Tab value="momentum" label="Sector momentum" />
        <Tab value="trending" label="Trending news" />
        <Tab value="disagreement" label="Source disagreement" />
      </Tabs>
      {tab === 'gainers' && <TopGainersTab />}
      {tab === 'returns' && <TopReturnsTab />}
      {tab === 'momentum' && <SectorMomentumTab />}
      {tab === 'trending' && <TrendingNewsTab />}
      {tab === 'disagreement' && <SourceDisagreementTab />}
    </Container>
  );
}

function MetricExplainer({ description }) {
  return (
    <Paper elevation={0} variant="outlined" sx={{ p: 2, mb: 2, bgcolor: 'background.paper' }}>
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

// callers wrap their api call in usecallback so `fetcher` has a stable
// identity across renders. the effect re-runs only when the deps
// captured in that usecallback change, which avoids needing an
// eslint-disable on exhaustive-deps
function useAsync(fetcher) {
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    fetcher()
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
  }, [fetcher]);

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

// tab bodies

function TopGainersTab() {
  const [tradingDate, setTradingDate] = useState(DATA_END);
  const fetcher = useCallback(
    () => api.getTopGainers(tradingDate, 25),
    [tradingDate],
  );
  const { rows, status } = useAsync(fetcher);

  return (
    <>
      <MetricExplainer description={DESCRIPTIONS.gainers} />
      <Box sx={{ mb: 2 }}>
        <TextField
          label="Trading date"
          type="date"
          size="small"
          value={tradingDate}
          onChange={(e) => setTradingDate(e.target.value)}
          InputLabelProps={{ shrink: true }}
        />
      </Box>
      <StateWrapper status={status}>
        <LazyTable columns={TOP_GAINERS_COLUMNS} rows={rows} pageSize={10} keyField="ticker" />
      </StateWrapper>
    </>
  );
}

function TopReturnsTab() {
  const fetcher = useCallback(
    () => api.getTopAverageReturns(DATA_END, 10, 25),
    [],
  );
  const { rows, status } = useAsync(fetcher);
  return (
    <>
      <MetricExplainer description={DESCRIPTIONS.returns} />
      <StateWrapper status={status}>
        <LazyTable columns={TOP_RETURNS_COLUMNS} rows={rows} pageSize={10} keyField="ticker" />
      </StateWrapper>
    </>
  );
}

function SectorMomentumTab() {
  const [sectorFilter, setSectorFilter] = useState('');
  const [sectors, setSectors] = useState([]);

  useEffect(() => {
    let cancelled = false;
    api
      .getSectors()
      .then((res) => {
        if (!cancelled && res.status === 200) setSectors(res.data);
      })
      .catch((err) => {
        if (!cancelled) console.error(err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const fetcher = useCallback(
    () => api.getSectorMomentum(DATA_END, sectorFilter || null, 50),
    [sectorFilter],
  );
  const { rows, status } = useAsync(fetcher);

  return (
    <>
      <MetricExplainer description={DESCRIPTIONS.momentum} />
      <Box sx={{ mb: 2 }}>
        <TextField
          select
          label="Sector"
          size="small"
          value={sectorFilter}
          onChange={(e) => setSectorFilter(e.target.value)}
          sx={{ minWidth: 240 }}
        >
          <MenuItem value="">All sectors</MenuItem>
          {sectors.map((s) => (
            <MenuItem key={s.sector_id} value={s.sector_name}>
              {s.sector_name}
            </MenuItem>
          ))}
        </TextField>
      </Box>
      <StateWrapper status={status}>
        <LazyTable columns={MOMENTUM_COLUMNS} rows={rows} pageSize={10} keyField="ticker" />
      </StateWrapper>
    </>
  );
}

function TrendingNewsTab() {
  const fetcher = useCallback(() => api.getTrendingNews(30, 5, 25), []);
  const { rows, status } = useAsync(fetcher);
  return (
    <>
      <MetricExplainer description={DESCRIPTIONS.trending} />
      <StateWrapper status={status}>
        <LazyTable columns={TRENDING_NEWS_COLUMNS} rows={rows} pageSize={10} keyField="ticker" />
      </StateWrapper>
    </>
  );
}

function SourceDisagreementTab() {
  const [startDate, setStartDate] = useState(DEFAULT_START);
  const [endDate, setEndDate] = useState(DATA_END);
  const fetcher = useCallback(
    () => api.getSourceDisagreement(startDate, endDate, 2, 50),
    [startDate, endDate],
  );
  const { rows, status } = useAsync(fetcher);
  return (
    <>
      <MetricExplainer description={DESCRIPTIONS.disagreement} />
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
      <StateWrapper status={status}>
        <LazyTable columns={DISAGREEMENT_COLUMNS} rows={rows} pageSize={10} keyField="ticker" />
      </StateWrapper>
    </>
  );
}
