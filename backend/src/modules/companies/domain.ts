export function normalizeDomain(input: string | null | undefined): string | null {
  const trimmed = input?.trim();
  if (!trimmed) return null;

  return (
    trimmed
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .split('/')[0]
      ?.trim()
      .replace(/\/+$/, '') || null
  );
}
