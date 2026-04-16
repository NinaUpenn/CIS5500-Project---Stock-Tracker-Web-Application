// NewsCard — renders one /companies/:ticker/news or /news/trending row.
// Used on StockPage (per-ticker news) and TrendingNewsPage (cross-ticker
// trending list).

import { Paper, Typography, Link as MuiLink, Box, Chip } from '@mui/material';
import { formatDate } from '../helpers/formatter';

const SENTIMENT_COLORS = {
  positive: 'success',
  negative: 'error',
  neutral: 'default',
};

function sentimentChipProps(sentiment) {
  if (!sentiment) return null;
  const key = String(sentiment).toLowerCase();
  return {
    label: key,
    color: SENTIMENT_COLORS[key] || 'default',
    size: 'small',
    variant: 'outlined',
  };
}

export default function NewsCard({ article }) {
  const pub = article.published_at ? new Date(article.published_at) : null;
  const published = pub && !Number.isNaN(pub.getTime()) ? pub : null;
  const chip = sentimentChipProps(article.lm_sentiment);

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5, flexWrap: 'wrap' }}>
        {article.source && (
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
            {article.source}
          </Typography>
        )}
        {published && (
          <Typography variant="caption" color="text.secondary">
            · {formatDate(published)}
          </Typography>
        )}
        {chip && <Chip {...chip} sx={{ ml: 'auto' }} />}
      </Box>
      <Typography variant="subtitle1" sx={{ fontWeight: 600, lineHeight: 1.3 }}>
        {article.url ? (
          <MuiLink href={article.url} target="_blank" rel="noopener noreferrer">
            {article.title}
          </MuiLink>
        ) : (
          article.title
        )}
      </Typography>
      {article.summary && (
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.75 }}>
          {article.summary}
        </Typography>
      )}
      {article.mention_confidence != null && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
          Mention confidence: {(Number(article.mention_confidence) * 100).toFixed(0)}%
        </Typography>
      )}
    </Paper>
  );
}
