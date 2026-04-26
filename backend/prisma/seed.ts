// Seed — IT-03 (taxonomías + pipeline) + IT-05 (usuarios Alex y Alba).
// IT-11 extenderá con demo data completa (empresas, contactos, leads, contenidos).
// Todas las operaciones son idempotentes: se puede re-ejecutar sin duplicar.

import { CONTENT_PILLARS, DEFAULT_PIPELINE_STAGES, SERVICE_LINE_KEYS } from '@heyday/shared';

import { prisma } from '../src/core/prisma/client.js';
import { AuthService } from '../src/modules/auth/service.js';

const authService = new AuthService(prisma);

const PAIN_POINT_CATEGORIES = [
  {
    key: 'weak_website',
    labelEs: 'Web débil o desactualizada',
    descriptionEs:
      'Sitio web con mala experiencia de usuario, performance lenta, diseño obsoleto o sin versión móvil adecuada.',
    defaultServiceRecommendations: ['website_seo'],
  },
  {
    key: 'no_seo',
    labelEs: 'Sin SEO',
    descriptionEs:
      'Ausencia de metadatos, fichas de Google Business incompletas, sin estrategia de palabras clave.',
    defaultServiceRecommendations: ['website_seo'],
  },
  {
    key: 'poor_content_cadence',
    labelEs: 'Cadencia de contenido pobre',
    descriptionEs:
      'Perfiles con publicaciones esporádicas, sin calendario editorial ni línea creativa coherente.',
    defaultServiceRecommendations: ['content'],
  },
  {
    key: 'no_automation',
    labelEs: 'Sin automatización',
    descriptionEs:
      'Procesos manuales repetitivos (reservas, seguimiento, campañas) sin herramientas de automatización.',
    defaultServiceRecommendations: ['automations'],
  },
  {
    key: 'weak_social_presence',
    labelEs: 'Presencia social débil',
    descriptionEs: 'Cuentas inactivas, pocos seguidores o interacción, sin estrategia multicanal.',
    defaultServiceRecommendations: ['content'],
  },
  {
    key: 'generic_messaging',
    labelEs: 'Mensaje genérico sin posicionamiento',
    descriptionEs:
      'Comunicación sin propuesta de valor clara ni diferenciación frente a competidores.',
    defaultServiceRecommendations: ['content', 'website_seo'],
  },
] as const;

const SERVICE_LINES: Array<{
  key: (typeof SERVICE_LINE_KEYS)[number];
  labelEs: string;
  descriptionEs: string;
  subCapabilities: string[];
}> = [
  {
    key: 'automations',
    labelEs: 'Automatizaciones',
    descriptionEs:
      'Automatización de procesos con IA y n8n: reservas, seguimiento de leads, campañas, integraciones.',
    subCapabilities: [
      'Flujos con n8n e IA',
      'Integración con reserva online',
      'Seguimiento automático de leads',
      'Dashboards operativos',
    ],
  },
  {
    key: 'content',
    labelEs: 'Contenido',
    descriptionEs: 'Producción de contenido premium multi-canal con línea creativa consistente.',
    subCapabilities: [
      'Calendario editorial',
      'Reels y posts para IG',
      'Artículos y posts LinkedIn',
      'Newsletter editorial',
    ],
  },
  {
    key: 'website_seo',
    labelEs: 'Web & SEO',
    descriptionEs:
      'Diseño y desarrollo de webs premium orientadas a conversión y posicionamiento local.',
    subCapabilities: [
      'Diseño premium responsive',
      'SEO técnico y on-page',
      'Google Business Profile',
      'Analítica y CRO',
    ],
  },
];

const CONTENT_PILLAR_SEED: Record<
  (typeof CONTENT_PILLARS)[number],
  { labelEs: string; descriptionEs: string }
> = {
  education: {
    labelEs: 'Educación',
    descriptionEs: 'Contenido que enseña a la audiencia de forma accionable.',
  },
  authority: {
    labelEs: 'Autoridad',
    descriptionEs: 'Posiciona a HeyDay o al cliente como referencia en su vertical.',
  },
  opinion: {
    labelEs: 'Opinión',
    descriptionEs: 'Punto de vista, análisis y crítica constructiva del sector.',
  },
  case_study: {
    labelEs: 'Caso de estudio',
    descriptionEs: 'Historia de un cliente real con problema, solución y resultado.',
  },
  news_reactive: {
    labelEs: 'Noticia / reactivo',
    descriptionEs: 'Reacción a eventos actuales relevantes para el público.',
  },
};

async function seedPainPointCategories() {
  for (const cat of PAIN_POINT_CATEGORIES) {
    await prisma.painPointCategory.upsert({
      where: { key: cat.key },
      update: {
        labelEs: cat.labelEs,
        descriptionEs: cat.descriptionEs,
        defaultServiceRecommendations: [...cat.defaultServiceRecommendations],
      },
      create: {
        key: cat.key,
        labelEs: cat.labelEs,
        descriptionEs: cat.descriptionEs,
        defaultServiceRecommendations: [...cat.defaultServiceRecommendations],
      },
    });
  }
}

async function seedServiceLines() {
  for (const sl of SERVICE_LINES) {
    await prisma.serviceLine.upsert({
      where: { key: sl.key },
      update: {
        labelEs: sl.labelEs,
        descriptionEs: sl.descriptionEs,
        subCapabilities: sl.subCapabilities,
      },
      create: {
        key: sl.key,
        labelEs: sl.labelEs,
        descriptionEs: sl.descriptionEs,
        subCapabilities: sl.subCapabilities,
      },
    });
  }
}

async function seedContentPillars() {
  for (const key of CONTENT_PILLARS) {
    const meta = CONTENT_PILLAR_SEED[key];
    await prisma.contentPillar.upsert({
      where: { key },
      update: meta,
      create: { key, ...meta },
    });
  }
}

async function seedDefaultPipeline() {
  const existing = await prisma.pipeline.findFirst({ where: { isDefault: true } });
  if (existing) return;

  await prisma.pipeline.create({
    data: {
      name: 'Pipeline principal',
      isDefault: true,
      stages: {
        create: DEFAULT_PIPELINE_STAGES.map((s) => ({
          name: s.name,
          kind: s.kind,
          orderIndex: s.order_index,
          color: s.color,
        })),
      },
    },
  });
}

async function seedInitialUsers() {
  const users = [
    {
      label: 'Alex',
      email: (process.env['SEED_ALEX_EMAIL'] ?? 'alex@heyday.studio').trim().toLowerCase(),
      password: process.env['SEED_ALEX_PASSWORD'],
    },
    {
      label: 'Alba',
      email: (process.env['SEED_ALBA_EMAIL'] ?? 'alba@heyday.studio').trim().toLowerCase(),
      password: process.env['SEED_ALBA_PASSWORD'],
    },
  ];

  const missing = users.filter((u) => !u.password || u.password.length < 12);
  if (missing.length > 0) {
    const names = missing.map((u) => u.label).join(', ');
    throw new Error(
      `[seed] Falta SEED_${missing[0]!.label.toUpperCase()}_PASSWORD (o <12 chars) ` +
        `para: ${names}. Define ambas contraseñas en .env antes de ejecutar el seed.`,
    );
  }

  for (const u of users) {
    const result = await authService.registerAdmin({
      email: u.email,
      name: u.label,
      password: u.password!,
    });
    console.log(`[seed] Admin listo: ${result.email} (${result.id})`);
  }
}

async function main() {
  console.log('[seed] Seeding base taxonomies …');
  await seedPainPointCategories();
  await seedServiceLines();
  await seedContentPillars();
  await seedDefaultPipeline();

  console.log('[seed] Seeding initial admin users …');
  await seedInitialUsers();

  console.log('[seed] Done. (Demo data de CRM/Intel/Content llega en IT-11.)');
}

main()
  .catch((err) => {
    console.error('[seed] Failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
