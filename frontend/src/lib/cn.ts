// Helper único `cn` — concatena clases Tailwind con merge inteligente
// (resuelve conflictos como `p-2 p-4` → `p-4`).
import clsx, { type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
