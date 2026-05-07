// Next.js config — App Router.
// - `reactStrictMode` para detectar side-effects en dev.
// - No exponemos variables sensibles aquí; todo lo que necesite el cliente va por NEXT_PUBLIC_*.
// - @heyday/shared se consume desde dist/ compilado (no transpilePackages).
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // standalone output: genera un directorio self-contained para Docker prod
  // (Dockerfile.frontend prod target lo copia desde .next/standalone/)
  output: 'standalone',
  experimental: {
    typedRoutes: false,
  },
};

export default nextConfig;
