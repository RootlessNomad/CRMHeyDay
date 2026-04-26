// Next.js config — App Router.
// - `transpilePackages` para que el workspace @heyday/shared se compile con el proyecto.
// - `reactStrictMode` para detectar side-effects en dev.
// - No exponemos variables sensibles aquí; todo lo que necesite el cliente va por NEXT_PUBLIC_*.
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@heyday/shared'],
  experimental: {
    typedRoutes: false,
  },
};

export default nextConfig;
