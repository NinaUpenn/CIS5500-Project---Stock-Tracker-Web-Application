// Top-of-app navigation. Uses MUI AppBar for layout and react-router
// NavLink so the active tab gets a distinct style without any extra
// state plumbing on our side.

import { AppBar, Toolbar, Typography, Box, Button } from '@mui/material';
import { NavLink } from 'react-router-dom';

const links = [
  { to: '/', label: 'Home', end: true },
  { to: '/search', label: 'Search' },
  { to: '/leaderboards', label: 'Leaderboards' },
  { to: '/news', label: 'News' },
  { to: '/industries', label: 'Industries' },
];

function NavButton({ to, label, end }) {
  return (
    <Button
      component={NavLink}
      to={to}
      end={end}
      sx={{
        color: 'white',
        mx: 0.5,
        '&.active': {
          backgroundColor: 'rgba(255,255,255,0.18)',
          fontWeight: 600,
        },
      }}
    >
      {label}
    </Button>
  );
}

export default function NavBar() {
  return (
    <AppBar position="static" component="nav" aria-label="Primary">
      <Toolbar>
        <Typography variant="h6" component="div" sx={{ flexGrow: 0, mr: 4 }}>
          Stock News Trader
        </Typography>
        <Box sx={{ display: 'flex', flexGrow: 1 }}>
          {links.map((link) => (
            <NavButton key={link.to} {...link} />
          ))}
        </Box>
      </Toolbar>
    </AppBar>
  );
}
