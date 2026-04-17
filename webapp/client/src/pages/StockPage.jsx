// stock detail page. pulls from three endpoints:
//   /companies/:ticker         (profile + snapshot + latest)
//   /companies/:ticker/prices  (ohlcv + ma + sector benchmark)
//   /companies/:ticker/news    (articles with sentiment)

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
  ToggleButton,
  ToggleButtonGroup,
  FormControlLabel,
  Switch,
  Stack,
} from '@mui/material';

import { api } from '../services/api';
import StockChart from '../components/StockChart';
import NewsCard from '../components/NewsCard';
import {
  formatPercent,
  formatNumber,
  formatInteger,
  formatDate,
  formatPrice,
  signedColor,
} from '../helpers/formatter';

// dataset ends 2022-12-12. range presets anchor to this "last trading
// day" instead of today, since there's no post-2022 data
const DATA_END = '2022-12-12';

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

function Signed({ value, children }) {
  return (
    <Box component="span" sx={{ color: signedColor(value), fontWeight: 500 }}>
      {children}
    </Box>
  );
}

export default function StockPage() {
  const { ticker } = useParams();
  const upper = String(ticker).toUpperCase();

  const [profile, setProfile] = useState(null);
  const [prices, setPrices] = useState([]);
  const [news, setNews] = useState([]);
  const [status, setStatus] = useState('loading'); // loading | ok | not_found | error
  const [pricesLoading, setPricesLoading] = useState(false);
  const [newsLoading, setNewsLoading] = useState(false);
  const [range, setRange] = useState('1W');
  const [showMa7, setShowMa7] = useState(false);
  const [showMa30, setShowMa30] = useState(false);
  const [showSectorAvg, setShowSectorAvg] = useState(false);

  const window = useMemo(() => rangeToWindow(range), [range]);

  // profile + news: only depend on ticker
  useEffect(() => {
    let cancelled = false;
    setStatus('loading');

    api
      .getCompany(upper)
      .then((profileRes) => {
        if (cancelled) return;
        if (profileRes.status === 404) {
          setStatus('not_found');
          return;
        }
        setProfile(profileRes.data);
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

  useEffect(() => {
    let cancelled = false;
    setNewsLoading(true);
    api
      .getCompanyNews(upper, 30, 10)
      .then((res) => {
        if (cancelled) return;
        if (res.status === 204 || res.status === 404) {
          setNews([]);
        } else {
          setNews(res.data);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.error(err);
        setNews([]);
      })
      .finally(() => {
        if (!cancelled) setNewsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [upper]);

  // prices refetch whenever the selected range changes
  useEffect(() => {
    let cancelled = false;
    setPricesLoading(true);
    api
      .getCompanyPrices(upper, window.start, window.end)
      .then((res) => {
        if (cancelled) return;
        if (res.status === 204 || res.status === 404) {
          setPrices([]);
        } else {
          setPrices(res.data);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.error(err);
        setPrices([]);
      })
      .finally(() => {
        if (!cancelled) setPricesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [upper, window.start, window.end]);

  return (
    <Container component="main" sx={{ py: 4 }}>
      <Header profile={profile} ticker={upper} status={status} />
      <Body
        status={status}
        profile={profile}
        prices={prices}
        news={news}
        range={range}
        onRangeChange={setRange}
        pricesLoading={pricesLoading}
        newsLoading={newsLoading}
        showMa7={showMa7}
        showMa30={showMa30}
        showSectorAvg={showSectorAvg}
        onToggleMa7={() => setShowMa7((v) => !v)}
        onToggleMa30={() => setShowMa30((v) => !v)}
        onToggleSectorAvg={() => setShowSectorAvg((v) => !v)}
      />
    </Container>
  );
}

function Header({ profile, ticker, status }) {
  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="h1" gutterBottom sx={{ mb: 0 }}>${ticker}</Typography>
      {status === 'ok' && profile && (
        <Typography variant="body1" sx={{ color: 'text.secondary' }}>
          {profile.company_name || '—'}
          {(profile.sector_name || profile.industry_name) && (
            <>
              {' · '}
              {[profile.sector_name, profile.industry_name].filter(Boolean).join(' · ')}
            </>
          )}
        </Typography>
      )}
    </Box>
  );
}

function Body({
  status,
  profile,
  prices,
  news,
  range,
  onRangeChange,
  pricesLoading,
  newsLoading,
  showMa7,
  showMa30,
  showSectorAvg,
  onToggleMa7,
  onToggleMa30,
  onToggleSectorAvg,
}) {
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
      <LatestTradeSection profile={profile} />

      <Paper
        sx={{ p: 2, mt: 3, bgcolor: 'background.paper', color: 'text.primary' }}
        elevation={1}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 1,
            mb: 1,
          }}
        >
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
        <Stack direction="row" spacing={2} sx={{ mb: 1, flexWrap: 'wrap' }}>
          <FormControlLabel
            control={<Switch size="small" checked={showMa7} onChange={onToggleMa7} />}
            label="7d moving avg"
          />
          <FormControlLabel
            control={<Switch size="small" checked={showMa30} onChange={onToggleMa30} />}
            label="30d moving avg"
          />
          <FormControlLabel
            control={<Switch size="small" checked={showSectorAvg} onChange={onToggleSectorAvg} />}
            label="Sector average"
          />
        </Stack>
        {pricesLoading ? (
          <Box sx={{ height: 360, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CircularProgress size={24} />
          </Box>
        ) : (
          <StockChart
            data={prices}
            showMa7={showMa7}
            showMa30={showMa30}
            showSectorAvg={showSectorAvg}
          />
        )}
      </Paper>

      <ValuationSection profile={profile} />
      <OverviewSection profile={profile} />

      <Box sx={{ mt: 3 }}>
        <Typography variant="h2" gutterBottom>Recent news</Typography>
        {newsLoading ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CircularProgress size={20} />
            <Typography>Loading news…</Typography>
          </Box>
        ) : news.length === 0 ? (
          <Typography color="text.secondary">No recent articles for this ticker.</Typography>
        ) : (
          <Stack spacing={1.5}>
            {news.map((article) => (
              <NewsCard key={article.url || article.title} article={article} />
            ))}
          </Stack>
        )}
      </Box>
    </>
  );
}

// profile is split into three section components so `body` can
// interleave the price chart between latest-trade and valuation-
// snapshot. each sits in its own paper with matching top margin

function LatestTradeSection({ profile }) {
  if (!profile) return null;
  const stats = [
    { label: 'Latest date', value: formatDate(profile.latest_trading_date) },
    { label: 'Latest close', value: formatPrice(profile.latest_close) },
    { label: 'Latest volume', value: formatInteger(profile.latest_volume) },
    {
      label: '52w range',
      value:
        profile.week_52_low != null && profile.week_52_high != null
          ? `${formatPrice(profile.week_52_low)} – ${formatPrice(profile.week_52_high)}`
          : '—',
    },
  ];
  return (
    <Paper sx={{ p: 2 }} elevation={1}>
      <SectionHeading>Latest trade</SectionHeading>
      <StatGrid stats={stats} />
    </Paper>
  );
}

function ValuationSection({ profile }) {
  if (!profile) return null;
  const stats = [
    {
      label: 'Market cap',
      value: formatInteger(profile.snapshot_market_cap || profile.profile_market_cap),
    },
    {
      label: 'EBITDA',
      value: formatInteger(profile.snapshot_ebitda || profile.profile_ebitda),
    },
    { label: 'P/E', value: formatNumber(profile.price_earnings, 1) },
    {
      label: 'Dividend yield',
      value: profile.dividend_yield == null ? '—' : formatPercent(profile.dividend_yield, 2),
      color: signedColor(profile.dividend_yield),
    },
    { label: 'EPS', value: formatNumber(profile.earnings_share, 2) },
    { label: 'P/S', value: formatNumber(profile.price_sales, 2) },
    { label: 'P/B', value: formatNumber(profile.price_book, 2) },
    {
      label: 'Revenue growth',
      value:
        profile.profile_revenue_growth == null
          ? '—'
          : formatPercent(profile.profile_revenue_growth, 1),
      color: signedColor(profile.profile_revenue_growth),
    },
  ];
  return (
    <Paper sx={{ p: 2, mt: 3 }} elevation={1}>
      <SectionHeading>Valuation snapshot</SectionHeading>
      <StatGrid stats={stats} />
    </Paper>
  );
}

function OverviewSection({ profile }) {
  if (!profile) return null;
  const stats = [
    { label: 'Exchange', value: profile.exchange || '—' },
    {
      label: 'Location',
      value:
        [profile.city, profile.state, profile.country].filter(Boolean).join(', ') || '—',
    },
    { label: 'CIK', value: profile.cik || '—' },
    {
      label: 'S&P 500 weight',
      value: profile.sp500_weight == null ? '—' : formatPercent(profile.sp500_weight, 2),
    },
  ];
  return (
    <Paper sx={{ p: 2, mt: 3 }} elevation={1}>
      <SectionHeading>Overview</SectionHeading>
      <StatGrid stats={stats} />
      {profile.long_business_summary && (
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 2 }}>
          {profile.long_business_summary}
        </Typography>
      )}
    </Paper>
  );
}

function SectionHeading({ children }) {
  return (
    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1, textTransform: 'uppercase', letterSpacing: 0.5 }}>
      {children}
    </Typography>
  );
}

function StatGrid({ stats }) {
  return (
    <Grid container spacing={2}>
      {stats.map((stat) => (
        <Grid item xs={6} md={3} key={stat.label}>
          <Typography variant="caption" color="text.secondary">
            {stat.label}
          </Typography>
          <Typography variant="h2" sx={{ fontSize: '1.1rem', color: stat.color }}>
            {stat.value}
          </Typography>
        </Grid>
      ))}
    </Grid>
  );
}

// re-export signed for tests / future reuse on other pages
export { Signed };
