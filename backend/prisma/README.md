# Prisma — HeyDay CRM

## Archivos

- `schema.prisma` — única fuente de verdad del modelo de datos (29 entidades).
- `seed.ts` — taxonomías base + pipeline por defecto. Los usuarios se añaden en IT-05 y el demo completo en IT-11.
- `migrations/` — generado por `prisma migrate dev`. No editar manualmente; cada cambio de schema crea una migración nueva.

## Convenciones

- **Modelos** PascalCase en código; tablas en `snake_case` plural vía `@@map`.
- **Campos** camelCase en código; columnas en `snake_case` vía `@map`.
- **IDs** `cuid()` por defecto. `AuditLog`, `AiUsageLog`, `ExternalApiUsageLog` usan `BigInt autoincrement()` por volumen.
- **Timestamps** siempre `@db.Timestamptz(6)`. UTC en base; presentación en `Europe/Madrid` en UI.
- **Soft delete** vía `deletedAt` sólo en entidades editables por el usuario (Company, Contact, Lead, ContentItem). Los logs y derivados son hard-delete.
- **Polimorfismo** en `Taggable` y `Activity` con `(entityType, entityId)`. Integridad referencial se asegura en services, no en DB.
- **Enums** dedicados por dominio; se exponen como strings en la API.

## Scripts útiles (desde la raíz del repo o desde `backend/`)

```bash
# Dev: aplicar cambios pendientes + generar cliente
pnpm db:migrate

# Prod: aplicar migraciones sin crear nuevas
pnpm db:migrate:deploy

# Estudio interactivo
pnpm db:studio

# Regenerar cliente tras editar el schema sin migrar
pnpm --filter @heyday/backend run db:generate

# Seed (taxonomías base)
pnpm seed

# Reset completo (¡destructivo!)
pnpm db:reset
```

## Flujo recomendado al editar el schema

1. Editar `schema.prisma`.
2. `pnpm db:migrate` → aparece un prompt pidiendo nombre para la migración (ej. `add_lead_priority_override`).
3. Se regenera automáticamente el cliente.
4. Commitea `schema.prisma` + la nueva carpeta de `migrations/`.

## Notas sobre consistencia

- `ContentItem.currentVersionId` es 1-a-1 opcional con `ContentVersion`. Rollback = crear nueva versión con body antiguo y apuntar `currentVersionId` a ella.
- `OutboundPrep` es 1-a-1 con `Company` (`companyId @unique`).
- `IntegrationHealth` es 1-a-1 con `Credential`.
- Índices críticos (Kanban, calendario, dashboards) declarados en `@@index`.

## Troubleshooting

- **"Environment variable not found: DATABASE_URL"**: falta `.env` en la raíz o en `backend/`.
- **Conexión rechazada**: levanta la DB con `docker compose up -d db`.
- **Cliente no encontrado al ejecutar tests**: `pnpm --filter @heyday/backend run db:generate`.
