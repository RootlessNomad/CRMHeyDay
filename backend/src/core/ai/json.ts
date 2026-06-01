// Parseo tolerante de JSON devuelto por un LLM.
//
// Los modelos a veces envuelven el JSON en fences markdown (```json … ```) o lo
// rodean de prosa ("Aquí tienes el JSON: { … }"). Un `JSON.parse` directo falla y
// el enrichment quedaba en `partial`. Probamos en orden:
//   1) parse directo
//   2) el contenido de un bloque ```…```
//   3) el primer objeto/array {…} o […] embebido en el texto
// Devuelve null si nada parsea.

export function parseAiJson<T>(value: string): T | null {
  const tryParse = (candidate: string): T | null => {
    try {
      return JSON.parse(candidate) as T;
    } catch {
      return null;
    }
  };

  const trimmed = value.trim();

  const direct = tryParse(trimmed);
  if (direct !== null) return direct;

  // 2) bloque markdown ```json … ``` (o ``` … ```)
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    const parsed = tryParse(fenced[1].trim());
    if (parsed !== null) return parsed;
  }

  // 3) primer objeto/array embebido entre prosa
  const embedded = trimmed.match(/[[{][\s\S]*[\]}]/);
  if (embedded) {
    const parsed = tryParse(embedded[0]);
    if (parsed !== null) return parsed;
  }

  return null;
}
