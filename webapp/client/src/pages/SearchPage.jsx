// search page. type a prefix (ticker or company name), pick one
// from the matches to go to its detail page

import { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  Container,
  Typography,
  TextField,
  List,
  ListItem,
  ListItemButton,
  CircularProgress,
  Alert,
  Box,
} from '@mui/material';

import { api } from '../services/api';

const DEBOUNCE_MS = 200;

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState('idle');
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
        if (id !== lastRequestId.current) return;
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
        label="Ticker or company"
        placeholder="e.g. AAPL or Apple"
        inputProps={{ 'aria-label': 'Search tickers', role: 'searchbox' }}
        sx={{ mb: 3 }}
      />

      <ResultBlock status={status} results={results} />
    </Container>
  );
}

function ResultBlock({ status, results }) {
  if (status === 'idle') {
    return <Typography color="text.secondary">Start typing a ticker or company name.</Typography>;
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
    return <Typography color="text.secondary">No matches.</Typography>;
  }
  return (
    <List aria-label="Search results">
      {results.map((row) => (
        <ListItem key={row.ticker} disablePadding>
          <ListItemButton component={Link} to={`/stocks/${row.ticker}`}>
            <Box>
              <Typography component="span" sx={{ fontWeight: 600 }}>
                ${row.ticker}
              </Typography>
              {row.company_name && (
                <Typography component="span" sx={{ color: 'text.primary', ml: 1 }}>
                  — {row.company_name}
                </Typography>
              )}
              {(row.industry_name || row.sector_name) && (
                <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>
                  {[row.industry_name, row.sector_name].filter(Boolean).join(' · ')}
                </Typography>
              )}
            </Box>
          </ListItemButton>
        </ListItem>
      ))}
    </List>
  );
}
