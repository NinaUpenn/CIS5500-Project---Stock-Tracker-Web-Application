// Search page — type a prefix, see a list of matching tickers, click
// one to go to its detail page.
//
// Design choices worth reading once:
//   * Input is controlled (UI rules §Forms). Every keystroke triggers
//     a debounced call through the api seam so we don't spam the DB.
//   * `requestId` tracking guards against an older response landing
//     after a newer one — classic race when the user types fast.
//   * `status` is a single union-like string so the view code never
//     has to juggle "loading AND results" or "error BUT empty".

import { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  Container,
  Typography,
  TextField,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  CircularProgress,
  Alert,
  Box,
} from '@mui/material';

import { api } from '../services/api';

const DEBOUNCE_MS = 200;

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState('idle'); // idle | loading | ok | empty | error
  const lastRequestId = useRef(0);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed === '') {
      setResults([]);
      setStatus('idle');
      return undefined;
    }

    const id = lastRequestId.current + 1;
    lastRequestId.current = id;
    setStatus('loading');

    const timer = setTimeout(async () => {
      try {
        const { data, status: httpStatus } = await api.searchCompanies(trimmed);
        if (id !== lastRequestId.current) return; // stale response
        if (httpStatus === 204 || data.length === 0) {
          setResults([]);
          setStatus('empty');
        } else {
          setResults(data);
          setStatus('ok');
        }
      } catch (err) {
        if (id !== lastRequestId.current) return;
        console.error(err);
        setStatus('error');
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query]);

  return (
    <Container component="main" sx={{ py: 4 }}>
      <Typography variant="h1" gutterBottom>Search</Typography>

      <TextField
        fullWidth
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        label="Ticker prefix"
        placeholder="e.g. AA"
        inputProps={{ 'aria-label': 'Search tickers', role: 'searchbox' }}
        sx={{ mb: 3 }}
      />

      <ResultBlock status={status} results={results} />
    </Container>
  );
}

function ResultBlock({ status, results }) {
  if (status === 'idle') {
    return <Typography color="text.secondary">Start typing a ticker prefix.</Typography>;
  }
  if (status === 'loading') {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <CircularProgress size={20} />
        <Typography>Searching…</Typography>
      </Box>
    );
  }
  if (status === 'error') {
    return <Alert severity="error">Couldn't reach the search service.</Alert>;
  }
  if (status === 'empty') {
    return <Typography color="text.secondary">No tickers match.</Typography>;
  }
  return (
    <List aria-label="Search results">
      {results.map((row) => (
        <ListItem key={row.ticker} disablePadding>
          <ListItemButton component={Link} to={`/stocks/${row.ticker}`}>
            <ListItemText primary={row.ticker} />
          </ListItemButton>
        </ListItem>
      ))}
    </List>
  );
}
