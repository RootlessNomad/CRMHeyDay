// Layout del grupo (app) — área autenticada.
// - Resuelve la sesión en cliente (AuthBootstrap).
// - Sidebar fija + Topbar sticky + main scrollable.
import type { ReactNode } from 'react';

import { AuthBootstrap } from '@/components/AuthBootstrap';
import { SessionWatcher } from '@/components/SessionWatcher';
import { Sidebar } from '@/components/Sidebar';
import { Topbar } from '@/components/Topbar';

export default function AppLayout({ children }: { children: ReactNode }): JSX.Element {
  return (
    <AuthBootstrap>
      <SessionWatcher />
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          <main className="flex-1 overflow-y-auto px-4 py-6 lg:px-8 lg:py-8">{children}</main>
        </div>
      </div>
    </AuthBootstrap>
  );
}
