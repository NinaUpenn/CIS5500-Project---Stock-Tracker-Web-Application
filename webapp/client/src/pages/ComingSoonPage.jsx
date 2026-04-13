// Placeholder page mounted on /news and /industries. It queries the
// corresponding stub endpoint so the card shows whatever reason the
// server (or mock) decided to publish — if we change the server-side
// reason string, the UI updates for free.

import { useEffect, useState } from 'react';
import { Container, Typography, Stack, CircularProgress, Box } from '@mui/material';

import { api } from '../services/api';
import ComingSoonCard from '../components/ComingSoonCard';

const PAGES = {
  news: {
    title: 'News Impact',
    blurb: 'Once the news ETL lands, this page will show which sources move prices and which tickers are most news-sensitive.',
    cards: [
      { title: 'Source Impact', fetch: () => api.getNewsSourceImpact() },
      { title: 'News Sensitivity', fetch: () => api.getNewsReturnCorrelation() },
    ],
  },
  industries: {
    title: 'Industries',
    blurb: 'Industry / sector leaderboards and rotation charts light up once the company + industry tables are populated.',
    // No live data fetches yet — we render static "later-phase" cards.
    cards: [
      {
        title: 'Industry Leaderboard',
        static: { phase: 'later', reason: 'Requires tables not yet populated: company, industry, sector' },
      },
      {
        title: 'Industry Rotation',
        static: { phase: 'later', reason: 'Requires tables not yet populated: company, industry, sector' },
      },
    ],
  },
};

export default function ComingSoonPage({ pageKey = 'news' }) {
  const config = PAGES[pageKey] || PAGES.news;

  return (
    <Container component="main" sx={{ py: 4 }}>
      <Typography variant="h1" gutterBottom>{config.title}</Typography>
      <Typography variant="body1" sx={{ mb: 3 }}>{config.blurb}</Typography>

      <Stack spacing={2}>
        {config.cards.map((card) => (
          <CardSlot key={card.title} card={card} />
        ))}
      </Stack>
    </Container>
  );
}

function CardSlot({ card }) {
  const [state, setState] = useState({
    phase: card.static?.phase,
    reason: card.static?.reason,
    loading: !card.static,
  });

  useEffect(() => {
    if (card.static) return undefined;
    let cancelled = false;
    card
      .fetch()
      .then((res) => {
        if (cancelled) return;
        if (res.status === 501 && res.stub) {
          setState({ phase: res.stub.phase, reason: res.stub.reason, loading: false });
        } else {
          setState({ phase: 'later', reason: 'Unexpected response from server.', loading: false });
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.error(err);
        setState({ phase: 'later', reason: "Couldn't reach the server.", loading: false });
      });
    return () => {
      cancelled = true;
    };
  }, [card]);

  if (state.loading) {
    return (
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
        <CircularProgress size={20} />
        <Typography>Checking {card.title}…</Typography>
      </Box>
    );
  }

  return <ComingSoonCard title={card.title} phase={state.phase} reason={state.reason} />;
}
