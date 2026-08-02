import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

// Test-only config — mirrors vite.config.ts aliases/plugins.
// Vite build ignores this file; vitest picks it up over vite.config.ts.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**', 'src/components/common/**'],
      reporter: ['text', 'json', 'html'],
      thresholds: {
        statements: 40,
        functions: 40,
        lines: 40,
        branches: 30,
      },
    },
  },
});
