import { render, screen } from '@testing-library/react';
import ComingSoonCard from '../../components/ComingSoonCard';

test('phase 2 card calls out the news ETL', () => {
  render(<ComingSoonCard phase={2} reason="news_article not ready" title="Source Impact" />);
  expect(screen.getByText('Source Impact')).toBeInTheDocument();
  expect(screen.getByText(/coming in phase 2/i)).toBeInTheDocument();
  expect(screen.getByText(/news_article not ready/)).toBeInTheDocument();
});

test('later-phase card uses the later-phase chip', () => {
  render(<ComingSoonCard phase="later" reason="needs company table" />);
  expect(screen.getByText(/later phase/i)).toBeInTheDocument();
});
