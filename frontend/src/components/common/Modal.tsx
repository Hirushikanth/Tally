import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  /** Accessible name — rendered as the modal's heading and aria-labelledby target. */
  title: string;
  /** Optional supplementary description wired to aria-describedby. */
  description?: string;
  children: ReactNode;
  panelStyle?: React.CSSProperties;
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/** Must match the .modal transition-duration in index.css. */
const EXIT_MS = 280;

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  panelStyle,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const lastFocusedRef = useRef<Element | null>(null);
  const exitTimerRef = useRef<number | null>(null);
  const [mounted, setMounted] = useState(open);
  const [leaving, setLeaving] = useState(false);
  const titleId = useId();
  const descId = useId();

  // Mount/unmount with a CSS exit animation: keep the DOM around for EXIT_MS
  // after `open` flips to false so the transition can play.
  useEffect(() => {
    if (open) {
      if (exitTimerRef.current) {
        window.clearTimeout(exitTimerRef.current);
        exitTimerRef.current = null;
      }
      lastFocusedRef.current = document.activeElement;
      setMounted(true);
      setLeaving(false);
      const id = window.setTimeout(() => panelRef.current?.focus(), 0);
      return () => window.clearTimeout(id);
    }
    setLeaving(true);
    exitTimerRef.current = window.setTimeout(() => {
      setMounted(false);
      setLeaving(false);
      exitTimerRef.current = null;
    }, EXIT_MS);
    return () => {
      if (exitTimerRef.current) {
        window.clearTimeout(exitTimerRef.current);
        exitTimerRef.current = null;
      }
    };
  }, [open]);

  // Restore focus to the trigger as soon as the dialog starts closing.
  useEffect(() => {
    if (!open && lastFocusedRef.current) {
      const toRestore = lastFocusedRef.current;
      lastFocusedRef.current = null;
      if (toRestore instanceof HTMLElement) {
        toRestore.focus();
      }
    }
  }, [open]);

  const trapFocus = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Tab') return;
    const panel = panelRef.current;
    if (!panel) return;

    const focusables = panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    if (focusables.length === 0) return;
    const first = focusables[0]!;
    const last = focusables[focusables.length - 1]!;

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  if (!mounted) return null;

  return (
    <div
      className={`modal-overlay${leaving ? ' modal-overlay-leaving' : ''}`}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        className={`modal${leaving ? ' modal-leaving' : ''}`}
        style={panelStyle}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={trapFocus}
      >
        <div className="modal-header">
          <h2 id={titleId} className="modal-title">
            {title}
          </h2>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            <span aria-hidden="true">✕</span>
          </button>
        </div>
        {description && (
          <p id={descId} className="sr-only">
            {description}
          </p>
        )}
        {children}
      </div>
    </div>
  );
}
