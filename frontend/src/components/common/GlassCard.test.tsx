import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GlassCard } from '@/components/common/GlassCard';

describe('GlassCard', () => {
  it('renders its children', () => {
    render(<GlassCard>Hello card</GlassCard>);
    expect(screen.getByText('Hello card')).toBeInTheDocument();
  });

  it('applies the glass class and merges className', () => {
    render(<GlassCard className="trip-card">x</GlassCard>);
    expect(screen.getByText('x')).toHaveClass('glass', 'trip-card');
  });

  it('calls onClick when clicked', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<GlassCard onClick={onClick}>Click me</GlassCard>);
    await user.click(screen.getByText('Click me'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('does not call onClick when not provided', async () => {
    const user = userEvent.setup();
    render(<GlassCard>Static</GlassCard>);
    await user.click(screen.getByText('Static'));
    expect(screen.getByText('Static')).toBeInTheDocument();
  });
});
