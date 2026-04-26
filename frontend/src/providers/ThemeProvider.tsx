'use client';

// Wrap de next-themes con defaults del proyecto:
// - class strategy (coincide con tailwind.config darkMode: 'class')
// - attribute 'class' en <html>
// - defaultTheme 'system'
// - disable transition on theme change para evitar flash
import { ThemeProvider as NextThemesProvider } from 'next-themes';
import type { ReactNode } from 'react';

export function ThemeProvider({ children }: { children: ReactNode }): JSX.Element {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
