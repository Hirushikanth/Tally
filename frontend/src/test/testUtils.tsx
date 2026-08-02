import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';

/** Fresh QueryClient with retries disabled — keeps tests fast and deterministic. */
export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
}

interface RenderOptions {
  route?: string;
  queryClient?: QueryClient;
}

/** Render a component with QueryClient + Router providers (no routes defined). */
export function renderWithProviders(
  ui: ReactNode,
  { route = '/', queryClient = createTestQueryClient() }: RenderOptions = {},
) {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}
