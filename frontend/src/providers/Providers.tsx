'use client';

// Composición única de providers client-side. Se usa en el root layout para mantener
// el layout como server component.
import type { ReactNode } from 'react';
import { Toaster } from 'sonner';

import { QueryProvider } from './QueryProvider';
import { ThemeProvider } from './ThemeProvider';

export function Providers({ children }: { children: ReactNode }): JSX.Element {
  return (
    <ThemeProvider>
      <QueryProvider>
        {children}
        {/* Toaster del style_guide: bottom-right, 4s, respeta theme. */}
        <Toaster position="bottom-right" duration={4000} richColors closeButton />
      </QueryProvider>
    </ThemeProvider>
  );
}
