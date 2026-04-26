import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Paths con espacios (ej. "AI Projects") → usamos fileURLToPath, nunca .pathname.
const sharedEntry = fileURLToPath(new URL('../shared/src/index.ts', import.meta.url));
const srcRoot = fileURLToPath(new URL('./src/', import.meta.url));

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.{ts,tsx}'],
    exclude: ['node_modules', '.next', 'dist'],
    clearMocks: true,
    restoreMocks: true,
  },
  resolve: {
    alias: {
      '@heyday/shared': sharedEntry,
      '@/': srcRoot,
    },
  },
});
