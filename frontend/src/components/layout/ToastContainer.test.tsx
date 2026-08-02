import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastContainer } from '@/components/layout/ToastContainer';
import { useUIStore } from '@/store/ui.store';

function renderWithToasts(toasts: Array<{ id: string; message: string; type: 'success' | 'error' | 'info' }>) {
  useUIStore.setState({ toasts });
  return render(<ToastContainer />);
}

describe('ToastContainer', () => {
  it('renders nothing when there are no toasts', () => {
    renderWithToasts([]);
    expect(document.querySelector('.toast-container')).toBeEmptyDOMElement();
  });

  it('renders each toast with its message', () => {
    renderWithToasts([
      { id: '1', message: 'Trip created', type: 'success' },
      { id: '2', message: 'Something broke', type: 'error' },
    ]);
    expect(screen.getByText('Trip created')).toBeInTheDocument();
    expect(screen.getByText('Something broke')).toBeInTheDocument();
  });

  it('applies the toast type class', () => {
    renderWithToasts([{ id: '1', message: 'Broke', type: 'error' }]);
    expect(screen.getByText('Broke').className).toContain('toast');
    expect(screen.getByText('Broke').className).toContain('error');
  });

  it('removes a toast when clicked', async () => {
    const user = userEvent.setup();
    renderWithToasts([{ id: '1', message: 'Dismiss me', type: 'info' }]);
    await user.click(screen.getByText('Dismiss me'));
    expect(useUIStore.getState().toasts).toEqual([]);
    expect(screen.queryByText('Dismiss me')).not.toBeInTheDocument();
  });
});
