/// <reference types="@testing-library/jest-dom" />
// Tests del SessionWatcher.
//   - Reacciona al evento `heyday:auth-expired` con toast + redirect.
//   - Reacciona a `{type:'logout'}` por BroadcastChannel limpiando el store.

import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { __resetChannelForTests } from '@/lib/auth/broadcast';
import { useAuthStore } from '@/lib/auth/store';

import { SessionWatcher } from './SessionWatcher';

const replaceMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

const toastErrorMock = vi.fn();
const toastMessageMock = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastErrorMock(...args),
    message: (...args: unknown[]) => toastMessageMock(...args),
    success: vi.fn(),
  },
}));

// Pequeño polyfill controlable de BroadcastChannel para jsdom.
class FakeChannel {
  static channels: FakeChannel[] = [];
  listeners: Array<(ev: MessageEvent<unknown>) => void> = [];
  constructor(public name: string) {
    FakeChannel.channels.push(this);
  }
  postMessage(data: unknown): void {
    for (const ch of FakeChannel.channels) {
      if (ch === this) continue; // BroadcastChannel no envía al sender
      for (const l of ch.listeners) l(new MessageEvent('message', { data }));
    }
  }
  addEventListener(_type: 'message', listener: (ev: MessageEvent<unknown>) => void): void {
    this.listeners.push(listener);
  }
  removeEventListener(_type: 'message', listener: (ev: MessageEvent<unknown>) => void): void {
    this.listeners = this.listeners.filter((l) => l !== listener);
  }
  close(): void {
    this.listeners = [];
  }
}

describe('SessionWatcher', () => {
  beforeEach(() => {
    replaceMock.mockReset();
    toastErrorMock.mockReset();
    toastMessageMock.mockReset();
    FakeChannel.channels = [];
    (globalThis as unknown as { BroadcastChannel: typeof FakeChannel }).BroadcastChannel =
      FakeChannel;
    __resetChannelForTests();
    useAuthStore.getState().setSession({
      user: {
        id: 'u1',
        email: 'a@b.c',
        name: 'A',
        role: 'admin',
        isActive: true,
        lastLoginAt: null,
      },
      accessToken: 'tok',
      accessExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reacciona a heyday:auth-expired con toast.error + redirect /login', () => {
    render(<SessionWatcher />);
    act(() => {
      window.dispatchEvent(new Event('heyday:auth-expired'));
    });
    expect(toastErrorMock).toHaveBeenCalledTimes(1);
    expect(replaceMock).toHaveBeenCalledWith('/login');
  });

  it('al recibir logout broadcast desde otra pestaña: limpia store + redirect', () => {
    render(<SessionWatcher />);
    // Otra pestaña: instancia un canal y emite logout.
    const otherTab = new FakeChannel('heyday-auth');
    act(() => {
      otherTab.postMessage({ type: 'logout' });
    });
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(toastMessageMock).toHaveBeenCalledTimes(1);
    expect(replaceMock).toHaveBeenCalledWith('/login');
  });

  it('ignora mensajes desconocidos del canal', () => {
    render(<SessionWatcher />);
    const otherTab = new FakeChannel('heyday-auth');
    act(() => {
      otherTab.postMessage({ type: 'something-else' });
    });
    expect(replaceMock).not.toHaveBeenCalled();
    expect(useAuthStore.getState().user).not.toBeNull();
  });
});
