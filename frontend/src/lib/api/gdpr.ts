import { apiFetch } from './client';

export interface ContactDataExportDto {
  exportedAt: string;
  contact: {
    id: string;
    firstName: string;
    lastName: string | null;
    roleTitle: string | null;
    email: string | null;
    phone: string | null;
    whatsapp: string | null;
    linkedinUrl: string | null;
    isPrimary: boolean;
    consentStatus: string;
    createdAt: string;
    updatedAt: string;
    anonymizedAt: string | null;
    deletedAt: string | null;
  };
  activities: {
    id: string;
    kind: string;
    subject: string | null;
    body: string | null;
    dueAt: string | null;
    completedAt: string | null;
    createdAt: string;
  }[];
  leads: {
    id: string;
    title: string | null;
    stage: string;
    pipelineName: string;
    createdAt: string;
  }[];
}

export interface PurgeLogsResult {
  aiLogsDeleted: number;
  externalLogsDeleted: number;
  retentionDays: number;
}

export async function exportContactData(contactId: string): Promise<void> {
  const data = await apiFetch<ContactDataExportDto>(`/contacts/${contactId}/data-export`);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `contact-${contactId}-export.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function purgeOldLogs(retentionDays: number): Promise<PurgeLogsResult> {
  return apiFetch<PurgeLogsResult>('/admin/gdpr/purge-logs', {
    method: 'POST',
    json: { retentionDays },
  });
}
