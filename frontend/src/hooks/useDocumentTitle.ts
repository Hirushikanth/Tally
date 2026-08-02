import { useEffect } from 'react';

/**
 * Set the browser tab title to "<title> — Tally" while the page is mounted.
 */
export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} — Tally` : 'Tally';
  }, [title]);
}
