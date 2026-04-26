// Tailwind — tokens del style_guide.md.
// Los colores se exponen como CSS variables (definidas en globals.css) para permitir
// light/dark sin duplicar clases. `dark` mode por clase (toggle de next-themes).

import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx,mdx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: 'var(--color-bg)',
        surface: 'var(--color-surface)',
        'surface-muted': 'var(--color-surface-muted)',
        border: 'var(--color-border)',
        text: 'var(--color-text)',
        'text-muted': 'var(--color-text-muted)',
        accent: 'var(--color-accent)',
        'accent-soft': 'var(--color-accent-soft)',
        danger: 'var(--color-danger)',
        warn: 'var(--color-warn)',
        success: 'var(--color-success)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        sm: '6px',
        md: '10px',
        lg: '14px',
        xl: '20px',
      },
      boxShadow: {
        sm: '0 1px 2px 0 rgb(19 20 15 / 0.06)',
        md: '0 4px 12px -2px rgb(19 20 15 / 0.08)',
      },
    },
  },
  plugins: [],
};

export default config;
