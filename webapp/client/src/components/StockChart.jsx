// mui x linechart for the close-price series. expects the
// /companies/:ticker/prices row shape. overlay flags toggle ma
// and sector-benchmark lines without re-fetching

import { Box, Typography } from '@mui/material';
import { LineChart } from '@mui/x-charts/LineChart';
import { formatDate, formatNumber } from '../helpers/formatter';

export default function StockChart({
  data,
  height = 360,
  showMa7 = false,
  showMa30 = false,
  showSectorAvg = false,
}) {
  if (!data || data.length === 0) {
    return (
      <Box
        role="status"
        sx={{
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '1px dashed',
          borderColor: 'divider',
          borderRadius: 1,
        }}
      >
        <Typography color="text.secondary">No price history in range.</Typography>
      </Box>
    );
  }

  const xData = data.map((d) => new Date(d.trading_date || d.trade_date));
  const closeData = data.map((d) => (d.close == null ? null : Number(d.close)));

  const series = [
    {
      data: closeData,
      label: 'Close',
      color: '#0d47a1',
      showMark: false,
      curve: 'monotoneX',
      valueFormatter: (value) =>
        value == null ? '—' : `$${formatNumber(value, 2)}`,
    },
  ];

  if (showMa7 && data.some((d) => d.ma_7_day != null)) {
    series.push({
      data: data.map((d) => (d.ma_7_day == null ? null : Number(d.ma_7_day))),
      label: 'MA 7d',
      color: '#ef6c00',
      showMark: false,
      curve: 'monotoneX',
      valueFormatter: (value) =>
        value == null ? '—' : `$${formatNumber(value, 2)}`,
    });
  }

  if (showMa30 && data.some((d) => d.ma_30_day != null)) {
    series.push({
      data: data.map((d) => (d.ma_30_day == null ? null : Number(d.ma_30_day))),
      label: 'MA 30d',
      color: '#6a1b9a',
      showMark: false,
      curve: 'monotoneX',
      valueFormatter: (value) =>
        value == null ? '—' : `$${formatNumber(value, 2)}`,
    });
  }

  if (showSectorAvg && data.some((d) => d.sector_avg_close != null)) {
    series.push({
      data: data.map((d) =>
        d.sector_avg_close == null ? null : Number(d.sector_avg_close),
      ),
      label: 'Sector avg',
      color: '#2e7d32',
      showMark: false,
      curve: 'monotoneX',
      valueFormatter: (value) =>
        value == null ? '—' : `$${formatNumber(value, 2)}`,
    });
  }

  const showLegend = series.length > 1;

  return (
    <Box sx={{ width: '100%', height }} aria-label="Closing price chart">
      <LineChart
        height={height}
        margin={{ top: showLegend ? 40 : 16, right: 24, bottom: 40, left: 64 }}
        xAxis={[
          {
            data: xData,
            scaleType: 'time',
            valueFormatter: (value) => formatDate(value),
            tickNumber: 6,
          },
        ]}
        yAxis={[
          {
            valueFormatter: (value) => formatAxisPrice(value),
            tickNumber: 6,
          },
        ]}
        series={series}
        grid={{ vertical: true, horizontal: true }}
        slotProps={{ legend: { hidden: !showLegend } }}
      />
    </Box>
  );
}

function formatAxisPrice(value) {
  if (value == null || Number.isNaN(Number(value))) return '';
  const n = Number(value);
  const digits = Math.abs(n) >= 10 ? 0 : 1;
  return `$${formatNumber(n, digits)}`;
}
