// ComingSoonCard — renders the 501 `{ phase, reason }` envelope.
//
// Both the real API and the mock layer return the same shape, so this
// single card covers every deferred endpoint. Two visual variants:
//   * phase === 2 — "Coming in Phase 2" (news ETL lands).
//   * anything else (we use "later") — "Planned for a future phase".

import { Paper, Typography, Chip, Box } from '@mui/material';

export default function ComingSoonCard({ phase, reason, title }) {
  const isPhase2 = phase === 2 || phase === '2';
  const chipLabel = isPhase2 ? 'Coming in Phase 2' : 'Planned for a later phase';
  const chipColor = isPhase2 ? 'secondary' : 'default';

  return (
    <Paper
      elevation={1}
      sx={{ p: 3, borderLeft: '4px solid', borderColor: isPhase2 ? 'secondary.main' : 'grey.400' }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        {title && <Typography variant="h2" sx={{ fontSize: '1.25rem', m: 0 }}>{title}</Typography>}
        <Chip size="small" label={chipLabel} color={chipColor} />
      </Box>
      <Typography variant="body2" color="text.secondary">
        {reason || 'Data not yet available.'}
      </Typography>
    </Paper>
  );
}
