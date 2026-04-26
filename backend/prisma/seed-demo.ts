// Seed demo — IT-11.
// Carga datos realistas que cubren TODAS las entidades del esquema para que cada
// página del frontend renderice algo en local y en CI manual.
//
// Idempotente: ejecutar varias veces no duplica. Usa claves naturales (domain,
// email, slug-like) y guards "si ya existe contexto demo, saltar la sección".
//
// IMPORTANTE: este seed corre DESPUÉS del seed base (taxonomías + Alex/Alba).
// Comando: `pnpm seed:demo`.

import { randomBytes } from 'node:crypto';

import { CONTENT_PILLARS } from '@heyday/shared';
import {
  ActivityKind,
  ContentChannel,
  ContentIdeaStatus,
  ContentItemStatus,
  ContentVersionGeneratedBy,
  DetectionOrigin,
  EnrichmentRunStatus,
  EnrichmentSourceHitStatus,
  EnrichmentSourceType,
  IcpVertical,
  IntegrationHealthStatus,
  JobQueueStatus,
  LeadSource,
  LeadStatus,
  PainPointConfidence,
  TagKind,
  AiFeature,
} from '@prisma/client';

import { prisma } from '../src/core/prisma/client.js';
import { encrypt as vaultEncrypt } from '../src/core/crypto/vault.js';

// --- helpers ----------------------------------------------------------------

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}
function daysFromNow(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}

async function getAdminUsers() {
  const alex = await prisma.user.findUnique({
    where: { email: (process.env['SEED_ALEX_EMAIL'] ?? 'alex@heyday.studio').toLowerCase() },
  });
  const alba = await prisma.user.findUnique({
    where: { email: (process.env['SEED_ALBA_EMAIL'] ?? 'alba@heyday.studio').toLowerCase() },
  });
  if (!alex || !alba) {
    throw new Error('[seed:demo] Falta Alex o Alba en DB. Corre `pnpm seed` primero.');
  }
  return { alex, alba };
}

// --- companies + contacts ---------------------------------------------------

interface CompanySeed {
  domain: string;
  name: string;
  vertical: IcpVertical;
  city: string;
  region: string;
  industry: string;
  website: string;
  phone: string;
  email: string;
  instagramHandle?: string;
  contacts: Array<{
    firstName: string;
    lastName?: string;
    roleTitle: string;
    email: string;
    isPrimary?: boolean;
  }>;
}

const COMPANIES: CompanySeed[] = [
  {
    domain: 'fisiomadrid.test',
    name: 'Fisio Madrid Centro',
    vertical: IcpVertical.physiotherapy,
    city: 'Madrid',
    region: 'Madrid',
    industry: 'Salud',
    website: 'https://fisiomadrid.test',
    phone: '+34 911 234 567',
    email: 'hola@fisiomadrid.test',
    instagramHandle: '@fisiomadrid',
    contacts: [
      {
        firstName: 'Lucía',
        lastName: 'Hernández',
        roleTitle: 'Directora clínica',
        email: 'lucia@fisiomadrid.test',
        isPrimary: true,
      },
      {
        firstName: 'Pablo',
        lastName: 'Vera',
        roleTitle: 'Fisioterapeuta',
        email: 'pablo@fisiomadrid.test',
      },
    ],
  },
  {
    domain: 'pilatesalondra.test',
    name: 'Pilates Alondra',
    vertical: IcpVertical.pilates,
    city: 'Barcelona',
    region: 'Cataluña',
    industry: 'Bienestar',
    website: 'https://pilatesalondra.test',
    phone: '+34 932 555 100',
    email: 'info@pilatesalondra.test',
    instagramHandle: '@pilatesalondra',
    contacts: [
      {
        firstName: 'Marta',
        lastName: 'Casals',
        roleTitle: 'Fundadora',
        email: 'marta@pilatesalondra.test',
        isPrimary: true,
      },
    ],
  },
  {
    domain: 'yogasol.test',
    name: 'Yoga Sol',
    vertical: IcpVertical.yoga,
    city: 'Valencia',
    region: 'Valencia',
    industry: 'Bienestar',
    website: 'https://yogasol.test',
    phone: '+34 962 110 022',
    email: 'hola@yogasol.test',
    contacts: [
      {
        firstName: 'Aitana',
        lastName: 'Roig',
        roleTitle: 'Profesora & owner',
        email: 'aitana@yogasol.test',
        isPrimary: true,
      },
      {
        firstName: 'Iván',
        lastName: 'Pérez',
        roleTitle: 'Recepción',
        email: 'recepcion@yogasol.test',
      },
    ],
  },
  {
    domain: 'gymforte.test',
    name: 'Gym Forte',
    vertical: IcpVertical.gym_fitness,
    city: 'Sevilla',
    region: 'Andalucía',
    industry: 'Fitness',
    website: 'https://gymforte.test',
    phone: '+34 954 333 444',
    email: 'contacto@gymforte.test',
    instagramHandle: '@gymforte',
    contacts: [
      {
        firstName: 'Diego',
        lastName: 'Ruiz',
        roleTitle: 'Gerente',
        email: 'diego@gymforte.test',
        isPrimary: true,
      },
      {
        firstName: 'Carla',
        lastName: 'Mena',
        roleTitle: 'Responsable de marketing',
        email: 'carla@gymforte.test',
      },
    ],
  },
  {
    domain: 'panaderiaaurora.test',
    name: 'Panadería Aurora',
    vertical: IcpVertical.bakery,
    city: 'Bilbao',
    region: 'País Vasco',
    industry: 'Alimentación',
    website: 'https://panaderiaaurora.test',
    phone: '+34 944 700 800',
    email: 'aurora@panaderiaaurora.test',
    contacts: [
      {
        firstName: 'Iker',
        lastName: 'Etxebarria',
        roleTitle: 'Maestro panadero',
        email: 'iker@panaderiaaurora.test',
        isPrimary: true,
      },
    ],
  },
  {
    domain: 'cafeluna.test',
    name: 'Café Luna',
    vertical: IcpVertical.cafe,
    city: 'Málaga',
    region: 'Andalucía',
    industry: 'Hostelería',
    website: 'https://cafeluna.test',
    phone: '+34 952 010 200',
    email: 'hola@cafeluna.test',
    instagramHandle: '@cafeluna_mlg',
    contacts: [
      {
        firstName: 'Sofía',
        lastName: 'García',
        roleTitle: 'Propietaria',
        email: 'sofia@cafeluna.test',
        isPrimary: true,
      },
      {
        firstName: 'Mateo',
        lastName: 'López',
        roleTitle: 'Encargado',
        email: 'mateo@cafeluna.test',
      },
    ],
  },
  {
    domain: 'fisiozaragoza.test',
    name: 'Fisio Zaragoza Norte',
    vertical: IcpVertical.physiotherapy,
    city: 'Zaragoza',
    region: 'Aragón',
    industry: 'Salud',
    website: 'https://fisiozaragoza.test',
    phone: '+34 976 500 500',
    email: 'reservas@fisiozaragoza.test',
    contacts: [
      {
        firstName: 'Nuria',
        lastName: 'Beltrán',
        roleTitle: 'Coordinadora',
        email: 'nuria@fisiozaragoza.test',
        isPrimary: true,
      },
    ],
  },
  {
    domain: 'pilatesoporto.test',
    name: 'Pilates Oporto Studio',
    vertical: IcpVertical.pilates,
    city: 'Oporto',
    region: 'Norte',
    industry: 'Bienestar',
    website: 'https://pilatesoporto.test',
    phone: '+351 220 100 100',
    email: 'studio@pilatesoporto.test',
    contacts: [
      {
        firstName: 'Beatriz',
        lastName: 'Almeida',
        roleTitle: 'Owner',
        email: 'bea@pilatesoporto.test',
        isPrimary: true,
      },
    ],
  },
  {
    domain: 'panaderialahuerta.test',
    name: 'Panadería La Huerta',
    vertical: IcpVertical.bakery,
    city: 'Granada',
    region: 'Andalucía',
    industry: 'Alimentación',
    website: 'https://panaderialahuerta.test',
    phone: '+34 958 222 333',
    email: 'lahuerta@panaderialahuerta.test',
    contacts: [
      {
        firstName: 'Rocío',
        lastName: 'Molina',
        roleTitle: 'Encargada',
        email: 'rocio@panaderialahuerta.test',
        isPrimary: true,
      },
    ],
  },
  {
    domain: 'gymvolt.test',
    name: 'Volt Functional Gym',
    vertical: IcpVertical.gym_fitness,
    city: 'Madrid',
    region: 'Madrid',
    industry: 'Fitness',
    website: 'https://gymvolt.test',
    phone: '+34 910 999 888',
    email: 'volt@gymvolt.test',
    instagramHandle: '@volt.gym',
    contacts: [
      {
        firstName: 'Andrea',
        lastName: 'Soto',
        roleTitle: 'Founder',
        email: 'andrea@gymvolt.test',
        isPrimary: true,
      },
      {
        firstName: 'Hugo',
        lastName: 'Ramos',
        roleTitle: 'Head coach',
        email: 'hugo@gymvolt.test',
      },
    ],
  },
];

async function seedCompaniesAndContacts(creatorId: string) {
  for (const c of COMPANIES) {
    const company = await prisma.company.upsert({
      where: { domain: c.domain },
      update: {
        name: c.name,
        website: c.website,
        industry: c.industry,
        icpVertical: c.vertical,
        city: c.city,
        region: c.region,
        phone: c.phone,
        email: c.email,
        instagramHandle: c.instagramHandle ?? null,
      },
      create: {
        name: c.name,
        domain: c.domain,
        website: c.website,
        industry: c.industry,
        icpVertical: c.vertical,
        country: 'ES',
        city: c.city,
        region: c.region,
        phone: c.phone,
        email: c.email,
        instagramHandle: c.instagramHandle ?? null,
        createdById: creatorId,
      },
    });

    for (const ct of c.contacts) {
      const existing = await prisma.contact.findFirst({
        where: { companyId: company.id, email: ct.email },
      });
      if (existing) {
        await prisma.contact.update({
          where: { id: existing.id },
          data: {
            firstName: ct.firstName,
            lastName: ct.lastName ?? null,
            roleTitle: ct.roleTitle,
            isPrimary: ct.isPrimary ?? false,
          },
        });
      } else {
        await prisma.contact.create({
          data: {
            companyId: company.id,
            firstName: ct.firstName,
            lastName: ct.lastName ?? null,
            roleTitle: ct.roleTitle,
            email: ct.email,
            isPrimary: ct.isPrimary ?? false,
            createdById: creatorId,
          },
        });
      }
    }
  }
}

// --- tags + taggables -------------------------------------------------------

const TAGS = [
  { name: 'Madrid', kind: TagKind.general, color: '#3A6B4A' },
  { name: 'Barcelona', kind: TagKind.general, color: '#3A6B4A' },
  { name: 'physiotherapy', kind: TagKind.vertical, color: '#7A4A3A' },
  { name: 'pilates', kind: TagKind.vertical, color: '#7A4A3A' },
  { name: 'cafe', kind: TagKind.vertical, color: '#7A4A3A' },
  { name: 'owner', kind: TagKind.persona, color: '#2A4A6A' },
  { name: 'manager', kind: TagKind.persona, color: '#2A4A6A' },
  { name: 'service:website', kind: TagKind.service_interest, color: '#B07A1F' },
  { name: 'service:content', kind: TagKind.service_interest, color: '#B07A1F' },
  { name: 'service:automation', kind: TagKind.service_interest, color: '#B07A1F' },
];

async function seedTagsAndTaggables() {
  for (const t of TAGS) {
    await prisma.tag.upsert({
      where: { name: t.name },
      update: { kind: t.kind, color: t.color },
      create: t,
    });
  }
  // Taggable: cada company recibe 1-2 tags (vertical + ciudad si aplica).
  const companies = await prisma.company.findMany({ take: 50 });
  for (const c of companies) {
    const tagNames: string[] = [];
    if (c.icpVertical && ['physiotherapy', 'pilates', 'cafe'].includes(c.icpVertical)) {
      tagNames.push(c.icpVertical);
    }
    if (c.city && ['Madrid', 'Barcelona'].includes(c.city)) tagNames.push(c.city);
    for (const tn of tagNames) {
      const tag = await prisma.tag.findUnique({ where: { name: tn } });
      if (!tag) continue;
      await prisma.taggable.upsert({
        where: {
          tagId_entityType_entityId: {
            tagId: tag.id,
            entityType: 'company',
            entityId: c.id,
          },
        },
        update: {},
        create: { tagId: tag.id, entityType: 'company', entityId: c.id },
      });
    }
  }
}

// --- leads ------------------------------------------------------------------

async function seedLeads(ownerId: string) {
  const pipeline = await prisma.pipeline.findFirst({
    where: { isDefault: true },
    include: { stages: true },
  });
  if (!pipeline) throw new Error('[seed:demo] No hay pipeline default — corre el seed base.');

  const stages = pipeline.stages.sort((a, b) => a.orderIndex - b.orderIndex);
  const companies = await prisma.company.findMany({
    take: 20,
    include: { contacts: { take: 1, where: { isPrimary: true } } },
  });

  // Distribución: ~70% primeros stages (open), 1-2 won, 1 lost.
  const distribution = [
    { idx: 0, status: LeadStatus.open, count: 4, priorityRange: [60, 90] as const },
    { idx: 1, status: LeadStatus.open, count: 3, priorityRange: [40, 70] as const },
    { idx: 2, status: LeadStatus.open, count: 3, priorityRange: [50, 80] as const },
  ];

  let companyIdx = 0;
  for (const slot of distribution) {
    const stage = stages[slot.idx];
    if (!stage) continue;
    for (let i = 0; i < slot.count && companyIdx < companies.length; i++, companyIdx++) {
      const company = companies[companyIdx]!;
      const exists = await prisma.lead.findFirst({
        where: { companyId: company.id, deletedAt: null },
      });
      if (exists) continue;
      const priority =
        slot.priorityRange[0] +
        Math.floor(Math.random() * (slot.priorityRange[1] - slot.priorityRange[0]));
      await prisma.lead.create({
        data: {
          companyId: company.id,
          primaryContactId: company.contacts[0]?.id ?? null,
          pipelineId: pipeline.id,
          stageId: stage.id,
          ownerId,
          source: LeadSource.manual,
          status: slot.status,
          priorityScore: priority,
          nextActionAt: daysFromNow(2 + Math.floor(Math.random() * 7)),
        },
      });
    }
  }

  // 1 won + 1 lost para cubrir todos los kinds.
  const wonStage = stages.find((s) => s.kind === 'won');
  const lostStage = stages.find((s) => s.kind === 'lost');
  if (wonStage && companies[companyIdx]) {
    const company = companies[companyIdx++]!;
    const exists = await prisma.lead.findFirst({ where: { companyId: company.id } });
    if (!exists) {
      await prisma.lead.create({
        data: {
          companyId: company.id,
          primaryContactId: company.contacts[0]?.id ?? null,
          pipelineId: pipeline.id,
          stageId: wonStage.id,
          ownerId,
          source: LeadSource.enrichment,
          status: LeadStatus.won,
          priorityScore: 95,
        },
      });
    }
  }
  if (lostStage && companies[companyIdx]) {
    const company = companies[companyIdx++]!;
    const exists = await prisma.lead.findFirst({ where: { companyId: company.id } });
    if (!exists) {
      await prisma.lead.create({
        data: {
          companyId: company.id,
          primaryContactId: company.contacts[0]?.id ?? null,
          pipelineId: pipeline.id,
          stageId: lostStage.id,
          ownerId,
          source: LeadSource.csv_import,
          status: LeadStatus.lost,
          priorityScore: 25,
          lostReason: 'Sin presupuesto este trimestre',
        },
      });
    }
  }
}

// --- activities -------------------------------------------------------------

async function seedActivities(ownerId: string, creatorId: string) {
  const leads = await prisma.lead.findMany({ take: 8 });
  const contacts = await prisma.contact.findMany({ where: { isPrimary: true }, take: 6 });
  const companies = await prisma.company.findMany({ take: 4 });

  // Si ya hay actividades demo, salta.
  const count = await prisma.activity.count();
  if (count >= 20) return;

  const seeds: Array<{
    kind: ActivityKind;
    entityType: 'lead' | 'contact' | 'company';
    entityId: string;
    title: string;
    body?: string;
    dueAt?: Date;
    completedAt?: Date;
  }> = [];

  for (const lead of leads) {
    seeds.push({
      kind: ActivityKind.task,
      entityType: 'lead',
      entityId: lead.id,
      title: 'Llamar para cualificar',
      dueAt: daysFromNow(Math.floor(Math.random() * 5) + 1),
    });
    seeds.push({
      kind: ActivityKind.note,
      entityType: 'lead',
      entityId: lead.id,
      title: 'Notas de la llamada inicial',
      body: 'Interesados en redes y web. Presupuesto medio. Decisión en 2 semanas.',
    });
  }
  for (const contact of contacts) {
    seeds.push({
      kind: ActivityKind.email_log,
      entityType: 'contact',
      entityId: contact.id,
      title: 'Email de presentación enviado',
      body: 'Plantilla "intro_v2" — pendiente respuesta.',
      completedAt: daysAgo(Math.floor(Math.random() * 7) + 1),
    });
  }
  for (const company of companies) {
    seeds.push({
      kind: ActivityKind.meeting_log,
      entityType: 'company',
      entityId: company.id,
      title: 'Reunión de descubrimiento',
      body: 'Asistieron founder + responsable de operaciones.',
      completedAt: daysAgo(Math.floor(Math.random() * 14) + 1),
    });
  }

  for (const a of seeds) {
    await prisma.activity.create({
      data: {
        kind: a.kind,
        entityType: a.entityType,
        entityId: a.entityId,
        title: a.title,
        body: a.body ?? null,
        ownerId,
        createdById: creatorId,
        dueAt: a.dueAt ?? null,
        completedAt: a.completedAt ?? null,
      },
    });
  }
}

// --- enrichment + pain points + service fit + outbound ---------------------

async function seedLeadIntelligence(triggeredById: string, verifiedById: string) {
  const companies = await prisma.company.findMany({
    where: {
      domain: { in: ['fisiomadrid.test', 'pilatesalondra.test', 'gymforte.test', 'cafeluna.test'] },
    },
    take: 4,
  });
  const categories = await prisma.painPointCategory.findMany();
  const catByKey = new Map(categories.map((c) => [c.key, c]));

  for (const company of companies) {
    const existingRun = await prisma.enrichmentRun.findFirst({ where: { companyId: company.id } });
    if (existingRun) continue;

    const run = await prisma.enrichmentRun.create({
      data: {
        companyId: company.id,
        triggeredById,
        status: EnrichmentRunStatus.succeeded,
        inputUrl: company.website,
        startedAt: daysAgo(3),
        finishedAt: daysAgo(3),
        summary: { signalsFound: 4, painPointsExtracted: 2, durationMs: 18234 },
      },
    });

    const websiteHit = await prisma.enrichmentSourceHit.create({
      data: {
        runId: run.id,
        sourceType: EnrichmentSourceType.website_scrape,
        sourceUrl: company.website,
        status: EnrichmentSourceHitStatus.ok,
        fetchedAt: daysAgo(3),
        responseExcerpt:
          'Inicio | Reservar cita | Equipo | Contacto. Última actualización del blog: 2023.',
        extracted: { title: company.name, lastBlogPost: '2023-08-12', hasOnlineBooking: false },
      },
    });
    await prisma.enrichmentSourceHit.create({
      data: {
        runId: run.id,
        sourceType: EnrichmentSourceType.lighthouse,
        sourceUrl: company.website,
        status: EnrichmentSourceHitStatus.ok,
        fetchedAt: daysAgo(3),
        extracted: { performance: 38, accessibility: 71, seo: 64, mobileScore: 42 },
      },
    });
    await prisma.enrichmentSourceHit.create({
      data: {
        runId: run.id,
        sourceType: EnrichmentSourceType.google_places,
        sourceUrl: 'https://www.google.com/maps',
        status: EnrichmentSourceHitStatus.ok,
        fetchedAt: daysAgo(3),
        extracted: { rating: 4.6, reviewCount: 87, hasPhotos: true, lastReviewDays: 12 },
      },
    });

    // 2 pain points por empresa, mezclando confidence.
    const weakWeb = catByKey.get('weak_website');
    const noSeo = catByKey.get('no_seo');
    if (weakWeb) {
      await prisma.painPoint.create({
        data: {
          companyId: company.id,
          categoryId: weakWeb.id,
          confidence: PainPointConfidence.observed,
          evidenceText:
            'Lighthouse performance score 38/100 en mobile. LCP > 5s. Sin reserva online detectada.',
          evidenceSourceUrl: company.website,
          evidenceSourceHitId: websiteHit.id,
          evidenceTimestamp: daysAgo(3),
          detectedBy: DetectionOrigin.claude,
          humanVerified: true,
          verifiedById,
        },
      });
    }
    if (noSeo) {
      await prisma.painPoint.create({
        data: {
          companyId: company.id,
          categoryId: noSeo.id,
          confidence: PainPointConfidence.inferred,
          evidenceText:
            'Sin meta description. Title genérico ("Inicio"). Falta sitemap.xml. Ficha de Google sin horarios.',
          evidenceSourceUrl: company.website,
          evidenceSourceHitId: websiteHit.id,
          evidenceTimestamp: daysAgo(3),
          detectedBy: DetectionOrigin.rule,
          humanVerified: false,
        },
      });
    }
  }

  // ServiceFitRecommendations: 1 por company con pain points.
  const serviceLines = await prisma.serviceLine.findMany();
  const slByKey = new Map(serviceLines.map((s) => [s.key, s]));
  const websiteSeo = slByKey.get('website_seo');
  if (websiteSeo) {
    for (const company of companies) {
      const exists = await prisma.serviceFitRecommendation.findFirst({
        where: { companyId: company.id, serviceLineId: websiteSeo.id },
      });
      if (exists) continue;
      await prisma.serviceFitRecommendation.create({
        data: {
          companyId: company.id,
          serviceLineId: websiteSeo.id,
          triggeringSignals: ['weak_website', 'no_seo', 'low_lighthouse_score'],
          rationaleEs:
            'La web no convierte: performance baja, sin reserva online y sin SEO básico. Es el cuello de botella prioritario.',
          expectedOutcomeEs:
            'En 60 días: web rediseñada con reserva online, mejora de performance >85, posicionamiento local en top 3 para "fisio + ciudad".',
          fitScore: 82,
          generatedBy: DetectionOrigin.claude,
        },
      });
    }
  }

  // OutboundPrep: para 2 empresas.
  for (const company of companies.slice(0, 2)) {
    const exists = await prisma.outboundPrep.findUnique({ where: { companyId: company.id } });
    if (exists) continue;
    await prisma.outboundPrep.create({
      data: {
        companyId: company.id,
        segment: `${company.icpVertical} local — ciudad media`,
        likelyNeed: 'Captar pacientes/clientes nuevos sin depender de plataformas de terceros.',
        outreachAngle: `Vimos que vuestra web ${company.website} tiene un potencial enorme pero hoy no convierte: tarda demasiado en cargar y no tiene reserva online.`,
        valueProposition:
          'En 6 semanas tendréis una web que carga en <2s, con reserva integrada y posicionada en Google local.',
        servicePitch: 'website_seo + automations',
        toneGuidance: 'Cercano, directo, sin jerga. Tutearles. Mostrar respeto por su tiempo.',
        priorityScore: 80,
        sdrNotes: 'Mencionar el caso de Volt Functional Gym si pregunta por referencias.',
        lastGeneratedAt: daysAgo(1),
        lastGeneratedById: triggeredById,
      },
    });
  }
}

// --- content engine ---------------------------------------------------------

async function seedContentEngine(creatorId: string, approverId: string) {
  const pillars = await prisma.contentPillar.findMany();
  const pillarByKey = new Map(pillars.map((p) => [p.key, p]));
  const serviceLines = await prisma.serviceLine.findMany();
  const slByKey = new Map(serviceLines.map((s) => [s.key, s]));

  const ideaSeeds: Array<{
    title: string;
    angle: string;
    pillar: (typeof CONTENT_PILLARS)[number];
    serviceKey?: 'website_seo' | 'content' | 'automations';
    icpVertical?: IcpVertical;
    brief: string;
    status: ContentIdeaStatus;
  }> = [
    {
      title: 'Por qué la web de tu fisio te está costando pacientes',
      angle:
        'Datos: 60% de las búsquedas locales no convierten porque la web no tiene reserva online.',
      pillar: 'authority',
      serviceKey: 'website_seo',
      icpVertical: IcpVertical.physiotherapy,
      brief: 'Hilo educativo + caso real. Termina con CTA a auditoría gratis.',
      status: ContentIdeaStatus.in_production,
    },
    {
      title: 'Tres automatizaciones que cualquier estudio de pilates debería tener',
      angle: 'No vendemos automatización, vendemos tiempo recuperado.',
      pillar: 'education',
      serviceKey: 'automations',
      icpVertical: IcpVertical.pilates,
      brief: 'Lista práctica con ejemplos de n8n + Calendly + WhatsApp.',
      status: ContentIdeaStatus.shipped,
    },
    {
      title: 'Caso de estudio: Café Luna duplicó reservas con menos esfuerzo',
      angle: 'Historia real: cómo Sofía pasó de Excel a un panel automático.',
      pillar: 'case_study',
      serviceKey: 'automations',
      icpVertical: IcpVertical.cafe,
      brief: 'Antes/después + screenshots. Ángulo: la herramienta no importa, el cambio sí.',
      status: ContentIdeaStatus.idea,
    },
    {
      title: 'Lo que aprendí mirando 200 webs de fisios',
      angle: 'Patrón común: usan plantillas genéricas que no transmiten confianza.',
      pillar: 'opinion',
      serviceKey: 'website_seo',
      icpVertical: IcpVertical.physiotherapy,
      brief: 'Post de opinión con 5 errores y 5 ejemplos de webs que sí funcionan.',
      status: ContentIdeaStatus.idea,
    },
    {
      title: 'Newsletter mensual — Edición abril',
      angle: 'Mix de artículo principal + 3 enlaces curados + un cliente destacado.',
      pillar: 'authority',
      brief: 'Plantilla newsletter mensual. Editorial corto + casos.',
      status: ContentIdeaStatus.in_production,
    },
    {
      title: 'IA y pequeños negocios — qué cambió de verdad este trimestre',
      angle: 'Reactivo a la actualidad pero sin hype.',
      pillar: 'news_reactive',
      brief: 'Análisis breve y honesto. Posicionar a HeyDay como guía con criterio.',
      status: ContentIdeaStatus.idea,
    },
  ];

  for (const seed of ideaSeeds) {
    const pillar = pillarByKey.get(seed.pillar);
    if (!pillar) continue;
    const sl = seed.serviceKey ? (slByKey.get(seed.serviceKey) ?? null) : null;

    let idea = await prisma.contentIdea.findFirst({ where: { title: seed.title } });
    if (!idea) {
      idea = await prisma.contentIdea.create({
        data: {
          title: seed.title,
          angle: seed.angle,
          pillarId: pillar.id,
          serviceLineId: sl?.id ?? null,
          icpVertical: seed.icpVertical ?? null,
          briefEs: seed.brief,
          status: seed.status,
          createdById: creatorId,
        },
      });
    }

    // Para idea "shipped" o "in_production" generamos al menos un ContentItem con versiones.
    if (seed.status === ContentIdeaStatus.idea) continue;
    const existingItem = await prisma.contentItem.findFirst({ where: { ideaId: idea.id } });
    if (existingItem) continue;

    const channel =
      seed.pillar === 'authority' && seed.title.includes('Newsletter')
        ? ContentChannel.newsletter
        : seed.pillar === 'education'
          ? ContentChannel.linkedin
          : ContentChannel.instagram;

    const status =
      seed.status === ContentIdeaStatus.shipped
        ? ContentItemStatus.exported
        : ContentItemStatus.in_review;

    const item = await prisma.contentItem.create({
      data: {
        ideaId: idea.id,
        channel,
        status,
        scheduledFor: status === ContentItemStatus.exported ? daysAgo(7) : daysFromNow(3),
        createdById: creatorId,
        approvedById: status === ContentItemStatus.exported ? approverId : null,
        approvedAt: status === ContentItemStatus.exported ? daysAgo(8) : null,
        exportedAt: status === ContentItemStatus.exported ? daysAgo(7) : null,
      },
    });

    const v1 = await prisma.contentVersion.create({
      data: {
        itemId: item.id,
        versionNumber: 1,
        title: seed.title,
        body: `Borrador inicial generado por Claude para "${seed.title}". ${seed.brief}`,
        hooks: ['¿Sabías que…?', 'Un dato incómodo:'],
        ctas: ['Auditoría gratis en 15 min', 'Reserva una llamada'],
        hashtags:
          channel === ContentChannel.instagram
            ? ['#heyday', '#negocioslocales', '#automatización']
            : [],
        meta: { wordCount: 240, model: 'claude-sonnet-4-6' },
        generatedBy: ContentVersionGeneratedBy.claude,
        editedById: creatorId,
      },
    });

    const v2 = await prisma.contentVersion.create({
      data: {
        itemId: item.id,
        versionNumber: 2,
        title: seed.title,
        body: `Versión revisada por humano. Ajustes de tono y CTA. Basado en "${seed.title}".`,
        hooks: ['Hoy te cuento algo que vemos cada semana:'],
        ctas: ['Te lo audito gratis'],
        hashtags: channel === ContentChannel.instagram ? ['#heyday', '#negocioslocales'] : [],
        meta: { wordCount: 215, editedBy: 'human' },
        generatedBy: ContentVersionGeneratedBy.claude_edited_by_human,
        editedById: approverId,
      },
    });

    await prisma.contentItem.update({
      where: { id: item.id },
      data: { currentVersionId: v2.id },
    });

    // Approval events (transiciones de estado).
    await prisma.contentApprovalEvent.create({
      data: {
        itemId: item.id,
        fromStatus: 'draft',
        toStatus: 'in_review',
        actorId: creatorId,
        comment: 'Listo para revisar.',
      },
    });
    if (status === ContentItemStatus.exported) {
      await prisma.contentApprovalEvent.create({
        data: {
          itemId: item.id,
          fromStatus: 'in_review',
          toStatus: 'approved',
          actorId: approverId,
          comment: 'Aprobado con pequeñas ediciones de tono.',
        },
      });
      await prisma.contentApprovalEvent.create({
        data: {
          itemId: item.id,
          fromStatus: 'approved',
          toStatus: 'exported',
          actorId: approverId,
        },
      });
    }
    void v1; // versión 1 se conserva para histórico aunque ya no sea current.
  }
}

// --- credentials + integration health + ai usage logs + jobs + audit -------

async function seedAdminInfra(creatorId: string) {
  // Credential demo (Anthropic) — sólo si no existe. Cifrada con la master key
  // que vault.ts lee de env. Si CREDENTIAL_MASTER_KEY no está, saltamos.
  const existingCred = await prisma.credential.findUnique({ where: { key: 'anthropic_primary' } });
  if (!existingCred && process.env['CREDENTIAL_MASTER_KEY']) {
    const fakeApiKey = `sk-ant-demo-${randomBytes(8).toString('hex')}`;
    const enc = vaultEncrypt(fakeApiKey);
    const cred = await prisma.credential.create({
      data: {
        key: 'anthropic_primary',
        provider: 'anthropic',
        label: 'Anthropic — clave principal (DEMO)',
        ciphertext: enc.ciphertext,
        iv: enc.iv,
        authTag: enc.authTag,
        keyVersion: enc.keyVersion,
        isActive: true,
        createdById: creatorId,
      },
    });
    await prisma.integrationHealth.create({
      data: {
        credentialId: cred.id,
        lastCheckedAt: daysAgo(1),
        lastStatus: IntegrationHealthStatus.ok,
        successCount24h: 47,
        errorCount24h: 1,
      },
    });
  }

  // AI usage logs sintéticos (últimos 7 días) para el dashboard de costes.
  const aiLogCount = await prisma.aiUsageLog.count();
  if (aiLogCount < 20) {
    const features: AiFeature[] = [
      AiFeature.lead_enrichment_extract,
      AiFeature.pain_points,
      AiFeature.service_fit,
      AiFeature.content_idea,
      AiFeature.content_draft,
    ];
    for (let i = 0; i < 30; i++) {
      const feature = features[i % features.length]!;
      const inputTokens = 800 + Math.floor(Math.random() * 1200);
      const outputTokens = 200 + Math.floor(Math.random() * 600);
      const cacheRead = i % 3 === 0 ? Math.floor(inputTokens * 0.7) : 0;
      const cost = inputTokens * 0.000003 + outputTokens * 0.000015 + cacheRead * 0.0000003;
      await prisma.aiUsageLog.create({
        data: {
          feature,
          model: i % 5 === 0 ? 'claude-haiku-4-5-20251001' : 'claude-sonnet-4-6',
          inputTokens,
          outputTokens,
          cacheReadInputTokens: cacheRead,
          estimatedCostUsd: cost.toFixed(6),
          latencyMs: 800 + Math.floor(Math.random() * 1800),
          userId: creatorId,
          createdAt: daysAgo(Math.floor(i / 5)),
        },
      });
    }
  }

  // Jobs sample.
  const jobCount = await prisma.job.count();
  if (jobCount < 4) {
    await prisma.job.createMany({
      data: [
        {
          queue: 'enrichment',
          status: JobQueueStatus.succeeded,
          payload: { companyId: 'demo', url: 'https://fisiomadrid.test' },
          result: { sourcesHit: 4, painPoints: 2 },
          startedAt: daysAgo(2),
          finishedAt: daysAgo(2),
        },
        {
          queue: 'content_generation',
          status: JobQueueStatus.succeeded,
          payload: { ideaId: 'demo', channel: 'instagram' },
          result: { versionId: 'demo' },
          startedAt: daysAgo(1),
          finishedAt: daysAgo(1),
        },
        {
          queue: 'enrichment',
          status: JobQueueStatus.failed,
          payload: { companyId: 'demo', url: 'https://blocked.test' },
          error: 'CloudFlare 403 tras 3 intentos',
          startedAt: daysAgo(3),
          finishedAt: daysAgo(3),
        },
        {
          queue: 'integration_test',
          status: JobQueueStatus.queued,
          payload: { credentialKey: 'anthropic_primary' },
        },
      ],
    });
  }

  // Audit logs sintéticos.
  const auditCount = await prisma.auditLog.count();
  if (auditCount < 10) {
    const samples = [
      { action: 'auth.login', metadata: { method: 'password' } },
      { action: 'company.create', entityType: 'company', metadata: { source: 'manual' } },
      { action: 'company.update', entityType: 'company', metadata: { fields: ['notes'] } },
      {
        action: 'lead.move_stage',
        entityType: 'lead',
        metadata: { from: 'qualified', to: 'proposal' },
      },
      { action: 'content.approve', entityType: 'content_item', metadata: {} },
      {
        action: 'credential.create',
        entityType: 'credential',
        metadata: { provider: 'anthropic' },
      },
    ];
    for (const s of samples) {
      await prisma.auditLog.create({
        data: {
          actorUserId: creatorId,
          action: s.action,
          entityType: s.entityType ?? null,
          metadata: s.metadata,
        },
      });
    }
  }
}

// --- main -------------------------------------------------------------------

async function main() {
  console.log('[seed:demo] Cargando datos demo …');
  const { alex, alba } = await getAdminUsers();

  console.log('[seed:demo]   ↳ companies + contacts');
  await seedCompaniesAndContacts(alex.id);

  console.log('[seed:demo]   ↳ tags + taggables');
  await seedTagsAndTaggables();

  console.log('[seed:demo]   ↳ leads');
  await seedLeads(alba.id);

  console.log('[seed:demo]   ↳ activities');
  await seedActivities(alba.id, alex.id);

  console.log(
    '[seed:demo]   ↳ lead intelligence (enrichment + pain points + service fit + outbound)',
  );
  await seedLeadIntelligence(alex.id, alba.id);

  console.log('[seed:demo]   ↳ content engine (ideas + items + versions + approvals)');
  await seedContentEngine(alba.id, alex.id);

  console.log('[seed:demo]   ↳ admin (credentials + integration health + ai usage + jobs + audit)');
  await seedAdminInfra(alex.id);

  console.log('[seed:demo] Done.');
}

main()
  .catch((err) => {
    console.error('[seed:demo] Failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
