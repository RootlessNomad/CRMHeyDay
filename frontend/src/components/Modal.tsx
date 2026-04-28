'use client';

import {
  useEffect,
  useId,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: 'md' | 'lg';
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

export function Modal({
  open,
  onClose,
  title,
  children,
  size = 'md',
}: ModalProps): JSX.Element | null {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const dialog = dialogRef.current;
    if (!dialog) return;

    const focusables = dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    const firstFocusable = focusables[0];
    if (firstFocusable) {
      firstFocusable.focus();
    } else {
      dialog.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function handleKeydown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab') return;

      const dialog = dialogRef.current;
      if (!dialog) return;

      const focusables = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)];
      if (focusables.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (!first || !last) return;
      const activeElement = document.activeElement;

      if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
      }

      if (event.shiftKey && activeElement === first) {
        event.preventDefault();
        last.focus();
      }
    }

    document.addEventListener('keydown', handleKeydown);
    return () => {
      document.removeEventListener('keydown', handleKeydown);
    };
  }, [onClose, open]);

  if (!open) return null;

  function handleBackdropKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 py-6"
      onClick={onClose}
      onKeyDown={handleBackdropKeyDown}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`glass border-border bg-surface w-full rounded-xl border p-5 shadow-xl ${
          size === 'lg' ? 'max-w-4xl' : 'max-w-2xl'
        }`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 id={titleId} className="text-lg font-semibold">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-text-muted hover:text-text rounded-sm px-2 py-1 text-sm transition"
            aria-label="Cerrar modal"
          >
            Cerrar
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
