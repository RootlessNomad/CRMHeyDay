import { apiFetch } from './client';

export interface SearchHit {
  type: 'company' | 'contact' | 'lead' | 'activity';
  id: string;
  title: string;
  subtitle: string | null;
  score: number;
}

export interface SearchResults {
  query: string;
  companies: SearchHit[];
  contacts: SearchHit[];
  leads: SearchHit[];
  activities: SearchHit[];
}

export async function searchAll(q: string, limit = 10): Promise<SearchResults> {
  const params = new URLSearchParams({
    q,
    limit: String(limit),
  });

  return apiFetch<SearchResults>(`/search?${params.toString()}`);
}
