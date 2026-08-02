import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Modal } from '@/components/common/Modal';

describe('Modal', () => {
  it('renders nothing when closed', () => {
    render(<Modal open={false} onClose={vi.fn()}>content</Modal>);
    expect(screen.queryByText('content')).not.toBeInTheDocument();
  });

  it('renders content when open', () => {
    render(<Modal open onClose={vi.fn()}>content</Modal>);
    expect(screen.getByText('content')).toBeInTheDocument();
  });

  it('exposes dialog semantics', () => {
    render(<Modal open onClose={vi.fn()}>content</Modal>);
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
  });

  it('closes when the overlay is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Modal open onClose={onClose}>content</Modal>);
    await user.click(screen.getByRole('dialog').parentElement!);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('does not close when content itself is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Modal open onClose={onClose}>content</Modal>);
    await user.click(screen.getByText('content'));
    expect(onClose).not.toHaveBeenCalled();
  });
});
