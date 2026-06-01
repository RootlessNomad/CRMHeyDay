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

  // /login SIEMPRE accesible: NO rebotamos a /dashboard por la mera presencia de
  // la cookie. El middleware no valida el JWT, así que una cookie presente pero
  // inválida (revocada por reúso multi-pestaña, o expirada) dejaría al usuario
  // atrapado en un bucle /login↔/dashboard sin poder volver a entrar. El redirect
  // de cortesía para usuarios ya autenticados lo hace el cliente (LoginForm) con
  // la sesión en memoria, que sí es de fiar.

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
