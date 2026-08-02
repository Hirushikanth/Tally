import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Modal } from '@/components/common/Modal';

function ModalHarness({ initialOpen = false }: { initialOpen?: boolean }) {
  const [open, setOpen] = useState(initialOpen);
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Open modal
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Test dialog">
        <button type="button">First action</button>
        <button type="button">Last action</button>
      </Modal>
    </div>
  );
}

describe('Modal', () => {
  it('renders nothing when closed', () => {
    render(<Modal open={false} onClose={vi.fn()} title="T">content</Modal>);
    expect(screen.queryByText('content')).not.toBeInTheDocument();
  });

  it('renders content when open', () => {
    render(<Modal open onClose={vi.fn()} title="T">content</Modal>);
    expect(screen.getByText('content')).toBeInTheDocument();
  });

  it('exposes dialog semantics and a labelled heading', () => {
    render(<Modal open onClose={vi.fn()} title="Test dialog">content</Modal>);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    const heading = screen.getByRole('heading', { name: 'Test dialog' });
    expect(dialog).toHaveAttribute('aria-labelledby', heading.id);
  });

  it('closes when the overlay is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Modal open onClose={onClose} title="T">content</Modal>);
    await user.click(screen.getByRole('dialog').parentElement!);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('does not close when content itself is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Modal open onClose={onClose} title="T">content</Modal>);
    await user.click(screen.getByText('content'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    render(<ModalHarness />);
    await user.click(screen.getByRole('button', { name: 'Open modal' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
  });

  it('moves focus into the dialog when it opens', async () => {
    const user = userEvent.setup();
    render(<ModalHarness />);
    await user.click(screen.getByRole('button', { name: 'Open modal' }));
    expect(screen.getByRole('dialog')).toHaveFocus();
  });

  it('restores focus to the trigger when it closes', async () => {
    const user = userEvent.setup();
    render(<ModalHarness />);
    const trigger = screen.getByRole('button', { name: 'Open modal' });
    await user.click(trigger);
    expect(screen.getByRole('dialog')).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(trigger).toHaveFocus();
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
  });

  it('cycles focus within the dialog on Tab, wrapping at both ends', async () => {
    const user = userEvent.setup();
    render(<ModalHarness />);
    await user.click(screen.getByRole('button', { name: 'Open modal' }));

    const close = screen.getByRole('button', { name: 'Close' });
    const first = screen.getByRole('button', { name: 'First action' });
    const last = screen.getByRole('button', { name: 'Last action' });

    // Dialog → close → first action → last action → wraps back to close
    await user.tab();
    expect(close).toHaveFocus();
    await user.tab();
    expect(first).toHaveFocus();
    await user.tab();
    expect(last).toHaveFocus();
    await user.tab();
    expect(close).toHaveFocus();

    // Shift+Tab from close → wraps to the last action
    await user.tab({ shift: true });
    expect(last).toHaveFocus();
  });

  it('renders a description wired to aria-describedby when provided', () => {
    render(
      <Modal open onClose={vi.fn()} title="T" description="This dialog does a thing">
        content
      </Modal>,
    );
    const dialog = screen.getByRole('dialog');
    const desc = document.getElementById(dialog.getAttribute('aria-describedby')!);
    expect(desc?.textContent).toBe('This dialog does a thing');
  });
});
