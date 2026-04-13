// StockChart — a thin wrapper around MUI X Charts for the closing-price
// line. Keeps chart config in one place so pages just pass the series.
//
// `data` shape matches the /stocks/:ticker/history response:
//   [{ trade_date, open, high, low, close, volume }]

import { Box, Typography } from '@mui/material';
import { LineChart } from '@mui/x-charts/LineChart';
import { formatDate, formatNumber } from '../helpers/formatter';

export default function StockChart({ data, height = 360 }) {
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

  const xData = data.map((d) => new Date(d.trade_date));
  const yData = data.map((d) => Number(d.close));

  return (
    <Box sx={{ width: '100%', height }} aria-label="Closing price chart">
      <LineChart
        height={height}
        margin={{ top: 16, right: 24, bottom: 40, left: 64 }}
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
        series={[
          {
            data: yData,
            label: 'Close',
            color: '#0d47a1',
            showMark: false,
            curve: 'monotoneX',
            valueFormatter: (value) =>
              value == null ? '—' : `$${formatNumber(value, 2)}`,
          },
        ]}
        grid={{ vertical: true, horizontal: true }}
        slotProps={{ legend: { hidden: true } }}
      />
    </Box>
  );
}

// Tick labels live in narrow gutters — avoid 2-decimal noise like $10.00.
// Drop decimals for whole dollars; keep one for sub-dollar prices.
function formatAxisPrice(value) {
  if (value == null || Number.isNaN(Number(value))) return '';
  const n = Number(value);
  const digits = Math.abs(n) >= 10 ? 0 : 1;
  return `$${formatNumber(n, digits)}`;
}
