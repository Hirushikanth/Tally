import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/**
 * Catches render errors in the subtree and shows a fallback UI with a
 * "Reload" action instead of a blank screen.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, info.componentStack);
  }

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
            minHeight: '60vh',
            padding: 24,
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 40 }}>😵</div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--text-hi)' }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: 14, color: 'var(--text-low)', maxWidth: 420 }}>
            An unexpected error occurred while rendering this page. Reload to
            try again.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={this.handleReload}
          >
            Reload page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
