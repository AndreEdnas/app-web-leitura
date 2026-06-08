import { render, screen } from '@testing-library/react';
import App from './App';

test('renders store selection page', () => {
  render(<App />);
  const linkElement = screen.getByText(/seleção de loja/i);
  expect(linkElement).toBeInTheDocument();
});
