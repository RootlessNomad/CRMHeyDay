import type { PrismaClient } from '@prisma/client';

import { prisma as defaultPrisma } from '../../core/prisma/client.js';
import { ContactNotFoundError } from '../contacts/service.js';

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
    createdAt: Date;
    updatedAt: Date;
    anonymizedAt: Date | null;
    deletedAt: Date | null;
  };
  activities: {
    id: string;
    kind: string;
    subject: string | null;
    body: string | null;
    dueAt: Date | null;
    completedAt: Date | null;
    createdAt: Date;
  }[];
  leads: {
    id: string;
    title: string | null;
    stage: string;
    pipelineName: string;
    createdAt: Date;
  }[];
}

export interface PurgeLogsResult {
  aiLogsDeleted: number;
  externalLogsDeleted: number;
  retentionDays: number;
}

export class GdprService {
  constructor(private readonly db: PrismaClient = defaultPrisma) {}

  async exportContactData(contactId: string): Promise<ContactDataExportDto> {
    // Include soft-deleted contacts — GDPR right of access applies regardless
    const contact = await this.db.contact.findFirst({
      where: { id: contactId },
    });
    if (!contact) throw new ContactNotFoundError(contactId);

    // Activities linked to this contact via entity polymorphism
    const activities = await this.db.activity.findMany({
      where: { entityType: 'contact', entityId: contactId },
      orderBy: { createdAt: 'asc' },
    });

    // Leads where this contact is the primaryContact
    const leads = await this.db.lead.findMany({
      where: { primaryContactId: contactId, deletedAt: null },
      include: { company: true, stage: { include: { pipeline: true } } },
      orderBy: { createdAt: 'asc' },
    });

    return {
      exportedAt: new Date().toISOString(),
      contact: {
        id: contact.id,
        firstName: contact.firstName,
        lastName: contact.lastName,
        roleTitle: contact.roleTitle,
        email: contact.email,
        phone: contact.phone,
        whatsapp: contact.whatsapp,
        linkedinUrl: contact.linkedinUrl,
        isPrimary: contact.isPrimary,
        consentStatus: contact.consentStatus,
        createdAt: contact.createdAt,
        updatedAt: contact.updatedAt,
        anonymizedAt: contact.anonymizedAt,
        deletedAt: contact.deletedAt,
      },
      activities: activities.map((a) => ({
        id: a.id,
        kind: a.kind,
        subject: a.title,
        body: a.body,
        dueAt: a.dueAt,
        completedAt: a.completedAt,
        createdAt: a.createdAt,
      })),
      leads: leads.map((l) => ({
        id: l.id,
        title: l.company.name,
        stage: l.stage.name,
        pipelineName: l.stage.pipeline.name,
        createdAt: l.createdAt,
      })),
    };
  }

  async purgeOldLogs(retentionDays: number): Promise<PurgeLogsResult> {
    const days = Math.max(1, Math.min(3650, retentionDays));
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [aiResult, externalResult] = await Promise.all([
      this.db.aiUsageLog.deleteMany({ where: { createdAt: { lt: cutoff } } }),
      this.db.externalApiUsageLog.deleteMany({ where: { createdAt: { lt: cutoff } } }),
    ]);

    return {
      aiLogsDeleted: aiResult.count,
      externalLogsDeleted: externalResult.count,
      retentionDays: days,
    };
  }
}

export const gdprService = new GdprService();
