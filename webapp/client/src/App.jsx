// top-level app. theming + routing, every page is wired up here

import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider, CssBaseline } from '@mui/material';

import theme from './theme';
import NavBar from './components/NavBar';
import HomePage from './pages/HomePage';
import SearchPage from './pages/SearchPage';
import StockPage from './pages/StockPage';
import LeaderboardsPage from './pages/LeaderboardsPage';
import TrendingNewsPage from './pages/TrendingNewsPage';
import IndustryRotationsPage from './pages/IndustryRotationsPage';

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
          <Route path="/news" element={<TrendingNewsPage />} />
          <Route path="/industries" element={<IndustryRotationsPage />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}
