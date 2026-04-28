import { apiFetch } from './client';
import type {
  ContactCreateInput,
  ContactDto,
  ContactListQuery,
  ContactListResponse,
  ContactUpdateInput,
} from '@/types/contact';

function buildSearchParams(query: ContactListQuery): string {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, String(value));
  }

  const serialized = params.toString();
  return serialized ? `?${serialized}` : '';
}

export async function listContacts(query: ContactListQuery = {}): Promise<ContactListResponse> {
  return apiFetch<ContactListResponse>(`/contacts${buildSearchParams(query)}`);
}

export async function getContact(id: string): Promise<ContactDto> {
  return apiFetch<ContactDto>(`/contacts/${id}`);
}

export async function createContact(input: ContactCreateInput): Promise<ContactDto> {
  return apiFetch<ContactDto>('/contacts', { method: 'POST', json: input });
}

export async function updateContact(id: string, patch: ContactUpdateInput): Promise<ContactDto> {
  return apiFetch<ContactDto>(`/contacts/${id}`, { method: 'PATCH', json: patch });
}

export async function deleteContact(id: string): Promise<void> {
  await apiFetch<void>(`/contacts/${id}`, { method: 'DELETE' });
}

export async function anonymizeContact(id: string): Promise<ContactDto> {
  return apiFetch<ContactDto>(`/contacts/${id}/anonymize`, { method: 'POST' });
}
