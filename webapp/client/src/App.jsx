// Top-level app: theming + routing. One place to see every page the
// app has. Phase 1 routes are listed below; Phase 2's /news and
// /industries are deliberately wired now so the nav has something to
// point at — they render the ComingSoon placeholder until the stubs
// feature PR lands.

import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider, CssBaseline } from '@mui/material';

import theme from './theme';
import NavBar from './components/NavBar';
import HomePage from './pages/HomePage';
import SearchPage from './pages/SearchPage';
import StockPage from './pages/StockPage';
import LeaderboardsPage from './pages/LeaderboardsPage';
import ComingSoonPage from './pages/ComingSoonPage';

export default function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <NavBar />
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/stocks/:ticker" element={<StockPage />} />
          <Route path="/leaderboards" element={<LeaderboardsPage />} />
          <Route path="/news" element={<ComingSoonPage pageKey="news" />} />
          <Route path="/industries" element={<ComingSoonPage pageKey="industries" />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}
