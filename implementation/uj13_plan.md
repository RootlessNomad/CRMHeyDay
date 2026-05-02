# UJ-13 Taxonomías editables — Plan de ejecución

> Modelo: Sonnet 4.6 (plan escrito, Codex implementa).  
> Patrón: Claude orquesta + revisa, Codex implementa por pases.

## 0. Estado de partida (verificado 2026-04-29)

No existe ningún módulo de taxonomías en el backend. Los modelos Prisma están completos:

| Modelo              | Tabla                   | Campos clave                                                                                 |
| ------------------- | ----------------------- | -------------------------------------------------------------------------------------------- |
| `PainPointCategory` | `pain_point_categories` | id, key (unique), labelEs, descriptionEs, defaultServiceRecommendations (String[]), isActive |
| `ServiceLine`       | `service_lines`         | id, key (unique), labelEs, descriptionEs, subCapabilities (Json), isActive                   |
| `ContentPillar`     | `content_pillars`       | id, key (unique), labelEs, descriptionEs, isActive                                           |

Seed base (`prisma/seed.ts`) ya carga datos iniciales para los 3 modelos. Frontend tiene stub `ComingSoonPage` en `/admin/taxonomies`.

## 1. Alcance

- **3 entidades editables** desde UI admin: PainPointCategory, ServiceLine, ContentPillar.
- **Operaciones por entidad**: list (GET público), create (POST admin), update (PATCH admin), toggle isActive (PATCH admin).
- **No hay delete** — las entidades tienen relaciones FK (`Restrict`/`SetNull`), así que deshabilitar con `isActive: false` es la operación equivalente.
- Página `/admin/taxonomies` con 3 tabs (una por entidad).
- Tests backend (service + routes) y frontend (tabla + dialog).

## 2. Endpoints a implementar

### `GET /intel/taxonomies/pain-points` — público (requireAuth)

→ `PainPointCategoryDto[]` ordenado por key ASC.

### `POST /intel/taxonomies/pain-points` — admin

Body: `{ key, labelEs, descriptionEs, defaultServiceRecommendations? }`. Crea nueva categoría. 409 si key duplicada.

### `PATCH /intel/taxonomies/pain-points/:id` — admin

Body: `{ labelEs?, descriptionEs?, defaultServiceRecommendations?, isActive? }`. Update parcial.

### `GET /intel/service-lines` — público (requireAuth)

→ `ServiceLineDto[]` ordenado por key ASC.

### `POST /intel/service-lines` — admin

Body: `{ key, labelEs, descriptionEs, subCapabilities? }`. 409 si key duplicada.

### `PATCH /intel/service-lines/:id` — admin

Body: `{ labelEs?, descriptionEs?, subCapabilities?, isActive? }`.

### `GET /content/pillars` — público (requireAuth)

→ `ContentPillarDto[]` ordenado por key ASC.

### `POST /content/pillars` — admin

Body: `{ key, labelEs, descriptionEs }`. 409 si key duplicada.

### `PATCH /content/pillars/:id` — admin

Body: `{ labelEs?, descriptionEs?, isActive? }`.

## 3. DTOs (backend → frontend, sin campos internos extra)

```ts
interface PainPointCategoryDto {
  id: string;
  key: string;
  labelEs: string;
  descriptionEs: string;
  defaultServiceRecommendations: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
interface ServiceLineDto {
  id: string;
  key: string;
  labelEs: string;
  descriptionEs: string;
  subCapabilities: unknown;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
interface ContentPillarDto {
  id: string;
  key: string;
  labelEs: string;
  descriptionEs: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
```

## 4. Estructura de archivos

### Backend — 1 módulo nuevo

- `backend/src/modules/taxonomies/service.ts` — `TaxonomiesService` con métodos para los 3 modelos. Errores: `TaxonomyNotFoundError`, `TaxonomyConflictError`.
- `backend/src/modules/taxonomies/index.ts` — exports.
- `backend/src/modules/taxonomies/service.test.ts` — tests unitarios del service con prisma mocked.

### Backend — 2 routes nuevas

- `backend/src/api/routes/taxonomies.ts` — registra los 9 endpoints. GETs con `requireAuth`, POSTs y PATCHs con `requireAuth + requireRole('admin')`.
- `backend/src/api/routes/taxonomies.test.ts` — tests de routes (401, 403, 200, 201, 404, 409 para cada entidad).

### Backend — modificar

- `backend/src/api/server.ts` — registrar `registerTaxonomiesRoutes`.

### Frontend — nuevos

- `frontend/src/lib/api/taxonomies.ts` — tipos + cliente (listPainPointCategories, createPainPointCategory, updatePainPointCategory, listServiceLines, createServiceLine, updateServiceLine, listContentPillars, createContentPillar, updateContentPillar).
- `frontend/src/components/taxonomies/TaxonomyTable.tsx` — tabla genérica: columnas Key, Label, Descripción, Estado (chip Activo/Inactivo), Acciones (Editar, Activar/Desactivar). Tipada con genérico `{ id: string; key: string; labelEs: string; descriptionEs: string; isActive: boolean }`.
- `frontend/src/components/taxonomies/TaxonomyTable.test.tsx` — 4 tests.
- `frontend/src/components/taxonomies/CreateTaxonomyDialog.tsx` — dialog genérico para crear (key + labelEs + descriptionEs + campos extras opcionales). Props: `entityName`, `extraFields?`, `onCreate`.
- `frontend/src/components/taxonomies/EditTaxonomyDialog.tsx` — dialog para editar (mismos campos, pre-rellenos). Props: `entityName`, `item`, `extraFields?`, `onUpdate`.

### Frontend — modificar

- `frontend/src/app/(app)/admin/taxonomies/page.tsx` — reemplaza stub. 3 tabs con `<TaxonomyTable />` por entidad. Botón "Añadir" por tab. React-query keys: `['pain-point-categories']`, `['service-lines']`, `['content-pillars']`.

## 5. Pases de Codex

### Pase 1 — Backend

Crear módulo + routes + tests + cableado en server.ts.

**Verificación**: `pnpm --filter @heyday/backend run lint && typecheck && test -- --testPathPattern=taxonom`

### Pase 2 — Frontend

Crear cliente API + componentes + page.

**Verificación**: `pnpm --filter frontend run lint && typecheck && test`

## 6. Notas de implementación

- `key` sigue el patrón del resto del vault: `^[a-z0-9_]+$`, 1–100 chars, unique por tabla. Mensaje Zod en español.
- `subCapabilities` en ServiceLine es `Json` en Prisma. El DTO puede tiparlo como `string[]` por convención del seed (array de strings vacío por defecto). No validar la estructura interna — pasar `as Prisma.InputJsonValue`.
- `defaultServiceRecommendations` en PainPointCategory es `String[]` — array de keys de ServiceLine. No validar que los keys existan (referencia débil por diseño del data model).
- No hay delete; el toggle de `isActive` es la desactivación equivalente.
- Rutas backend: pain-points bajo `/intel/taxonomies/...`, service-lines bajo `/intel/...`, content-pillars bajo `/content/...`. Esto sigue lo que dice api_contracts.md.
- Tests de routes: mirar `credentials.test.ts` como modelo (pattern admin/operator, 401/403).

## 7. Checklist de seguridad pre-entrega

- GETs de lista: `requireAuth` (no admin — pueden ser usados por dropdowns en UJ-16+).
- POSTs y PATCHs: `requireAuth + requireRole('admin')`.
- Sin XSS: campos `labelEs`/`descriptionEs` son strings, React escapa.
- Sin SQL injection: Prisma parameterizado.
- No se devuelven datos sensibles.

## 8. Comando de verificación final

```
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test
```

Esperado: ~353 actuales + ~15 backend + ~6 frontend ≈ **374 tests**.
