import { render, screen } from '@testing-library/react';
import App from './App';

test('renders store selection page', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: /entrada da loja/i })).toBeInTheDocument();
});
