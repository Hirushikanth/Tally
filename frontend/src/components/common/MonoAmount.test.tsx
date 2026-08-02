import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MonoAmount } from '@/components/common/MonoAmount';

describe('MonoAmount', () => {
  it('renders a formatted amount', () => {
    render(<MonoAmount value={84200} />);
    expect(screen.getByText('Rs 842')).toBeInTheDocument();
  });

  it('renders with the given currency', () => {
    render(<MonoAmount value={1000} currency="USD" />);
    expect(screen.getByText('USD 10.00')).toBeInTheDocument();
  });

  it('applies positive coloring for a positive balance', () => {
    render(<MonoAmount value={5000} asBalance />);
    const el = screen.getByText('+ Rs 50');
    expect(el).toHaveClass('mono-amount', 'positive');
  });

  it('applies negative coloring for a negative balance', () => {
    render(<MonoAmount value={-5000} asBalance />);
    const el = screen.getByText('− Rs 50');
    expect(el).toHaveClass('mono-amount', 'negative');
  });

  it('applies neutral coloring for zero balance', () => {
    render(<MonoAmount value={0} asBalance />);
    expect(screen.getByText('+ Rs 0')).toHaveClass('neutral');
  });

  it('merges custom className and fontSize', () => {
    render(<MonoAmount value={100} className="big" size="24px" />);
    const el = screen.getByText('Rs 1');
    expect(el).toHaveClass('mono-amount', 'big');
    expect(el).toHaveStyle({ fontSize: '24px' });
  });
});
