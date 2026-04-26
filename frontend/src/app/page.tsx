// Página root en modo server: redirige al dashboard. La protección ya la aplica
// el middleware (redirige a /login si no hay cookie de refresh).
import { redirect } from 'next/navigation';

export default function RootPage(): never {
  redirect('/dashboard');
}
