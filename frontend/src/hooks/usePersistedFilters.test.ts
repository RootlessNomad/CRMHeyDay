import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { usePersistedFilters } from './usePersistedFilters';

describe('usePersistedFilters', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('saveFilters almacena en localStorage con la key correcta', () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
    const { result } = renderHook(() => usePersistedFilters('companies', 'user-1'));

    act(() => {
      result.current.saveFilters(new URLSearchParams('q=acme&city=Madrid'));
    });

    expect(setItemSpy).toHaveBeenCalledWith(
      'heyday:filters:companies:user-1',
      'q=acme&city=Madrid',
    );
  });

  it('loadFilters devuelve null cuando no hay nada guardado', () => {
    const { result } = renderHook(() => usePersistedFilters('companies', 'user-1'));

    expect(result.current.loadFilters()).toBeNull();
  });

  it('loadFilters devuelve el valor guardado tras saveFilters', () => {
    const { result } = renderHook(() => usePersistedFilters('leads', 'user-1'));

    act(() => {
      result.current.saveFilters(new URLSearchParams('status=open&owner_id=user-1'));
    });

    expect(result.current.loadFilters()).toBe('status=open&owner_id=user-1');
  });

  it('clearFilters elimina el valor y userId distinto usa key distinta', () => {
    const { result: firstUser } = renderHook(() => usePersistedFilters('leads', 'user-1'));
    const { result: secondUser } = renderHook(() => usePersistedFilters('leads', 'user-2'));

    act(() => {
      firstUser.current.saveFilters(new URLSearchParams('status=won'));
      secondUser.current.saveFilters(new URLSearchParams('status=lost'));
      firstUser.current.clearFilters();
    });

    expect(firstUser.current.loadFilters()).toBeNull();
    expect(secondUser.current.loadFilters()).toBe('status=lost');
  });
});
