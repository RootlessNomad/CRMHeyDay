// Root layout — server component. Envuelve TODAS las rutas con <html>/<body>
// y carga los providers client-side.
//
// `suppressHydrationWarning` en <html> es recomendación oficial de next-themes:
// el theme aplica una clase antes del React hydrate, y el warning sería falso positivo.

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { Providers } from '@/providers/Providers';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: 'HeyDay CRM',
  description: 'CRM + Lead Intelligence + Content Engine',
};

export default function RootLayout({ children }: { children: ReactNode }): JSX.Element {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className="bg-bg text-text min-h-screen">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
