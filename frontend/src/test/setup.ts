import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// RTL auto-cleanup only registers when globals are enabled — do it manually.
afterEach(() => {
  cleanup();
});

// jsdom doesn't implement matchMedia; framer-motion's useReducedMotion needs it.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// jsdom lacks Element.prototype.animate (WAAPI) — framer-motion relies on it
// for layout/transform animations. Provide a no-op so components render.
if (!Element.prototype.animate) {
  Element.prototype.animate = vi.fn().mockReturnValue({
    cancel: vi.fn(),
    finish: vi.fn(),
    pause: vi.fn(),
    play: vi.fn(),
    reverse: vi.fn(),
  });
}

// Motion is not under test — render motion.* as plain divs and AnimatePresence
// as a passthrough so exit animations never leave elements stuck in the DOM.
vi.mock('framer-motion', async (importOriginal) => {
  const { createElement } = await import('react');
  const actual = await importOriginal<typeof import('framer-motion')>();
  const passthrough = (props: Record<string, unknown>) => {
    const { children, initial, animate, exit, transition, ...domProps } = props;
    return createElement('div', domProps, children as never);
  };
  return {
    ...actual,
    AnimatePresence: ({ children }: { children?: unknown }) => children,
    motion: new Proxy({}, { get: () => passthrough }),
    useReducedMotion: () => false,
  };
});
