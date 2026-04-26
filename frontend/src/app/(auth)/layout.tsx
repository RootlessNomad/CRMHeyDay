// Layout del grupo (auth). Centrado, sin sidebar ni topbar.
import type { ReactNode } from 'react';

export default function AuthLayout({ children }: { children: ReactNode }): JSX.Element {
  return (
    <main className="bg-bg flex min-h-screen items-center justify-center px-4 py-12">
      {children}
    </main>
  );
}
