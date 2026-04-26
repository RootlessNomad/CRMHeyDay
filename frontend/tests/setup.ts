// Setup global para vitest del frontend.
import '@testing-library/jest-dom/vitest';

// jsdom no implementa matchMedia; algunos componentes (next-themes) lo consultan.
if (typeof window !== 'undefined' && !window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

// IntersectionObserver (por si algún componente lo consume — no en login, pero es barato).
if (typeof window !== 'undefined' && !window.IntersectionObserver) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).IntersectionObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
    takeRecords(): [] {
      return [];
    }
  };
}
