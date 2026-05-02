# UJ-12 Credential Vault UI — Plan de ejecución

> Modelo recomendado para ejecutar: **Sonnet 4.6** (orquestación de Codex con plan ya escrito).
> Patrón: Claude orquesta + revisa, Codex implementa por pases cortos. Verificar lint/typecheck/tests entre pases.

## 0. Estado de partida (verificado en sesión Opus 2026-04-29)

**Backend ya escrito en working tree (sin commitear)** — `backend/src/api/routes/credentials.ts` + `credentials.test.ts` cubren:

- `GET /admin/credentials` → `CredentialWithHealthDto[]` (incluye health embebido)
- `GET /admin/credentials/:id` → 200 / 404
- `POST /admin/credentials` → 201 (Zod: key `^[a-z0-9_]+$` 1–100, provider 1–100, label 1–200, plaintext 1–8192) / 409 conflict
- `POST /admin/credentials/:id/rotate` → 200 (body `{ newPlaintext }` 1–8192) / 404
- `PATCH /admin/credentials/:id/active` → 200 (body `{ isActive: boolean }`) / 404
- `DELETE /admin/credentials/:id` → 204 / 404
- `POST /admin/credentials/:id/test` → 202 `{ jobId }` (encola `integration_test` queue) / 404
- Todas con `requireAuth + requireRole('admin')`. Tests cubren 401, 403, 200, 201, 404, 409.

`CredentialsService` (`backend/src/modules/credentials/service.ts`) ya tenía: `listWithHealth`, `getWithHealthById`, `create`, `rotate`, `setActive`, `delete`, `getPublicById`, `reveal`. Audit log escribe `credential.create|rotate|activate|deactivate|delete` con metadata SIN secretos.

`registerCredentialsRoutes` ya está cableada en `backend/src/api/server.ts:33,117`.

**Frontend** — solo existe el stub `frontend/src/app/(app)/admin/credentials/page.tsx` con `<ComingSoonPage />`. Hay que reemplazarlo.

**Worker `integration_test`**: en `backend/src/worker/main.ts:49` es un **placeholder** que solo loguea. NO actualiza `credential_health`. Implicación de scope: el botón "Probar" encola el job y devuelve `{ jobId }`, pero el chip de salud no cambia hasta que un worker real haga el ping. Tratar como **deuda fuera de UJ-12** (un probe real por proveedor es trabajo aparte).

## 1. Alcance (lo que entrega UJ-12)

- Página real `/admin/credentials` con tabla de credenciales + chip de salud + acciones.
- Diálogos: crear, rotar, desactivar/activar, eliminar, "Probar" (encola job).
- Cliente API y tipado en frontend.
- Tests frontend de la tabla + al menos un dialog crítico (crear).
- Verificación lint/typecheck/test verde.

**Fuera de scope** (deuda explícita):

- Implementación real del worker `integration_test` (un probe HTTP por provider). El UI muestra el último estado del row de health; el ping queda encolado.
- Endpoint admin para `reencryptAllToCurrentKeyVersion` (ya está en service pero sin route). Añadir cuando se rote la master key, no en este UJ.
- Reveal del plaintext en UI: **NUNCA** se expone. Solo se pide al crear/rotar.

## 2. Pase 1 — Confirmación backend (Claude directo, sin Codex)

El backend ya está escrito por una sesión previa. Antes de tocar frontend:

1. `pnpm --filter @heyday/backend run lint`
2. `pnpm --filter @heyday/backend run typecheck`
3. `pnpm --filter @heyday/backend run test -- routes/credentials`
4. Releer `routes/credentials.ts` + `routes/credentials.test.ts` y verificar:
   - Ningún endpoint devuelve `ciphertext`/`iv`/`authTag`/`plaintext` (la prueba `POST 201` ya lo asegura, confirmar visualmente).
   - El error handler mapea `CredentialNotFoundError` → 404 y `CredentialConflictError` → 409 vía `app.httpErrors.*` (en el route, no en el handler global). OK según el código actual.
   - Audit log se escribe en service (ya OK). No duplicar en route.

Si todo verde → pasar a Pase 2. Si rojo → arreglar antes de Codex.

## 3. Pase 2 — Frontend (Codex, prompt acotado)

**Archivos a crear**:

- `frontend/src/lib/api/credentials.ts` — tipos + cliente. Tipos:

  ```ts
  export type CredentialHealthStatus = 'ok' | 'warn' | 'error' | 'unknown';
  export interface CredentialHealthDto {
    lastStatus: CredentialHealthStatus;
    lastCheckedAt: string | null;
    lastError: string | null;
    successCount24h: number;
    errorCount24h: number;
  }
  export interface CredentialDto {
    id: string;
    key: string;
    provider: string;
    label: string;
    keyVersion: number;
    isActive: boolean;
    lastUsedAt: string | null;
    lastRotatedAt: string | null;
    createdAt: string;
    updatedAt: string;
    health: CredentialHealthDto | null;
  }
  ```

  Funciones: `listCredentials`, `getCredential`, `createCredential`, `rotateCredential`, `setCredentialActive`, `deleteCredential`, `testCredential`. Mismo patrón que `lib/api/users.ts`.

- `frontend/src/components/credentials/CredentialsTable.tsx` — columnas: key, provider, label, chip de salud (con tooltip mostrando `lastError`/`lastCheckedAt`), `isActive` badge, `lastRotatedAt` relativo, acciones (Rotar / Probar / Activar-Desactivar / Eliminar). Disabled en row inactiva para "Probar".
- `frontend/src/components/credentials/CreateCredentialDialog.tsx` — Zod equivalente al backend (key regex `^[a-z0-9_]+$`, etc.). Manejo 409 → toast "ya existe". Plaintext en `<input type="password">` con toggle show/hide. Reset de form al cerrar.
- `frontend/src/components/credentials/RotateCredentialDialog.tsx` — solo `newPlaintext`. Confirmación antes de submit.
- `frontend/src/components/credentials/DeleteCredentialDialog.tsx` — doble confirmación literal con la `key` (mismo patrón que `AnonymizeContactDialog`).
- `frontend/src/components/credentials/HealthChip.tsx` (o inline en table) — colores: ok=verde, warn=amber, error=rojo, unknown=gris. Tooltip con `lastError` truncado a 200 chars.

**Archivos a modificar**:

- `frontend/src/app/(app)/admin/credentials/page.tsx` — reemplazar stub. Misma estructura que `admin/users/page.tsx` (header + botón "Añadir credencial" + tabla + dialogs). React-query key: `['credentials']`.

**Tests** (mínimo viable):

- `CredentialsTable.test.tsx` — render con 2 filas (una activa con health=ok, una inactiva con health=error), click en "Probar" llama al callback, "Probar" deshabilitado en inactiva.
- `CreateCredentialDialog.test.tsx` — submit válido llama `createCredential`, error 409 muestra toast, validación Zod (key con espacios → error).

**Constraints en el prompt a Codex**:

- NO instalar dependencias nuevas (todo lo necesario ya está: react-query, zod, sonner, react-hook-form si se usa en otros dialogs — usar el mismo patrón).
- Usar primitives ya existentes (Modal, Tabs, etc. en `frontend/src/components/ui/`).
- Mirror exacto del estilo de `components/users/*` (clases tailwind, naming, estructura).
- NO mostrar nunca `plaintext` en pantalla excepto el campo de input (write-only). Tras submit, el dialog se cierra y el valor se pierde.
- "Probar" solo encola: tras 202, mostrar toast `"Test encolado (job <jobId>)"` y dejar al usuario refrescar manualmente. NO hacer polling del job en este UJ.
- Reportar al terminar: ficheros tocados, delta de tests, snippets de los componentes principales.

## 4. Pase 3 — Revisión (Claude)

1. Releer todo el diff manualmente.
2. `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test` (root).
3. Verificar que el JSON de `GET /admin/credentials` no tiene campos crypto (curl/inject manual o test).
4. Aplicar checklist de seguridad CLAUDE.md:
   - Sin secretos en logs (audit metadata ya verificado, frontend no debería loguear).
   - Sin XSS en `lastError` (React escapa por defecto, confirmar que no se usa `dangerouslySetInnerHTML`).
   - Authz: route bajo `requireRole('admin')` ✅. UI no asume rol — un operator que entre por URL recibirá 403 y el `apiFetch` ya lo maneja.
   - No exponer `ciphertext`/`iv`/`authTag`/`plaintext` por API ni pantalla.
5. Si todo OK → actualizar `task_tracker.md` (UJ-12 completed, security yes, review pending) y `work_log.md` + `project_memory.md` con el cierre.

## 5. Decisiones a respetar

- **No commitear** hasta cerrar M3 (decisión del usuario sesión 2026-04-29).
- **No revelar plaintext** por API en ningún caso — solo `service.reveal()` para uso interno del backend.
- **Health chip muestra estado del último probe**, no del momento actual. Si nunca se ha probado: `unknown`/gris.
- **Test-ping = fire-and-forget** en este UJ; no implementar el worker real aquí.

## 6. Comando de verificación final

```
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test
```

Todos los tests verdes (esperado: ~334 actuales + ~12 backend (ya en working tree) + ~6 frontend nuevos = ~352).
