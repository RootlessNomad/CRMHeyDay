import { describe, expect, it } from 'vitest';

import { parseAiJson } from './json.js';

describe('parseAiJson', () => {
  it('parsea JSON directo', () => {
    expect(parseAiJson<{ a: number }>('{"a":1}')).toEqual({ a: 1 });
    expect(parseAiJson<number[]>('[1,2,3]')).toEqual([1, 2, 3]);
  });

  it('parsea JSON envuelto en fences markdown ```json', () => {
    const text = 'Aquí tienes:\n```json\n{"name":"Gym","ok":true}\n```\n';
    expect(parseAiJson<{ name: string; ok: boolean }>(text)).toEqual({ name: 'Gym', ok: true });
  });

  it('parsea fences sin etiqueta de lenguaje', () => {
    expect(parseAiJson('```\n[{"x":1}]\n```')).toEqual([{ x: 1 }]);
  });

  it('extrae el objeto embebido entre prosa', () => {
    const text = 'Claro, el resultado es {"score": 87, "fit": "alto"} según el análisis.';
    expect(parseAiJson<{ score: number; fit: string }>(text)).toEqual({ score: 87, fit: 'alto' });
  });

  it('devuelve null si no hay JSON', () => {
    expect(parseAiJson('lo siento, no puedo')).toBeNull();
    expect(parseAiJson('')).toBeNull();
  });
});
