'use client';

import { useCallback } from 'react';

export function usePersistedFilters(
  key: string,
  userId: string | undefined,
): {
  saveFilters: (params: URLSearchParams) => void;
  loadFilters: () => string | null;
  clearFilters: () => void;
} {
  const storageKey = `heyday:filters:${key}:${userId ?? 'anonymous'}`;

  const saveFilters = useCallback(
    (params: URLSearchParams) => {
      if (typeof window === 'undefined') return;

      const serialized = params.toString();
      if (serialized === '') {
        window.localStorage.removeItem(storageKey);
        return;
      }

      window.localStorage.setItem(storageKey, serialized);
    },
    [storageKey],
  );

  const loadFilters = useCallback(() => {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(storageKey);
  }, [storageKey]);

  const clearFilters = useCallback(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(storageKey);
  }, [storageKey]);

  return { saveFilters, loadFilters, clearFilters };
}
