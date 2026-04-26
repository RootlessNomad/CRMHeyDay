// Middleware Next.js — redirección básica por presencia de cookie de refresh.
//
// Importante: el middleware NO valida el JWT (no tiene el secret, ni debe tenerlo).
// Sólo chequea que exista la cookie `hd_refresh` para evitar mostrar la UI
// autenticada a un usuario anónimo. La validación real ocurre en el backend.
//
// Matcher: todo salvo estáticos y la ruta pública /login.
import { NextResponse, type NextRequest } from 'next/server';

const REFRESH_COOKIE = 'hd_refresh';
const PUBLIC_PATHS = ['/login'];

export function middleware(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;
  const hasRefresh = req.cookies.has(REFRESH_COOKIE);

  // Si ya está logueado e intenta entrar a /login → manda al dashboard.
  if (PUBLIC_PATHS.includes(pathname) && hasRefresh) {
    const url = req.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  // Si es ruta protegida y no hay cookie → /login.
  if (!PUBLIC_PATHS.includes(pathname) && !hasRefresh) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Ignoramos API routes, _next static, assets y archivos públicos.
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
