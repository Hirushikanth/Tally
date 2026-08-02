import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// RTL auto-cleanup only registers when globals are enabled — do it manually.
afterEach(() => {
  cleanup();
});
