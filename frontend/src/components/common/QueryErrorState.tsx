import { Button } from './Button';

interface QueryErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

/**
 * Inline error card for failed data queries — shown instead of empty states
 * so a network failure is never mistaken for "no data yet".
 */
export function QueryErrorState({ message, onRetry }: QueryErrorStateProps) {
  return (
    <div className="empty-state glass" style={{ margin: '40px 0', borderRadius: 16, padding: '48px 40px' }}>
      <div className="empty-state-icon">⚠️</div>
      <div className="empty-state-title">Something went wrong</div>
      <div className="empty-state-desc">
        {message ?? 'We could not load this data. Check your connection and try again.'}
      </div>
      {onRetry && (
        <Button variant="primary" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}
