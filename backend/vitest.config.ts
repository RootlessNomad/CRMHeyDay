import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Usamos fileURLToPath (no .pathname) para que paths con espacios, p.ej.
// "/Users/.../AI Projects/CRM/...", se decodifiquen correctamente
// (".pathname" devuelve el URL percent-encoded, roto para resolución de FS).
const sharedEntry = fileURLToPath(new URL('../shared/src/index.ts', import.meta.url));

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    clearMocks: true,
    restoreMocks: true,
  },
  resolve: {
    alias: {
      '@heyday/shared': sharedEntry,
    },
  },
});
