# UI Wireframes

Desktop-first, responsive. Next.js App Router. Layout: sidebar fija (lg) + topbar; colapsable a drawer en md/sm. Dark mode por defecto del sistema, toggle manual.

## Estructura de navegación

Sidebar principal (en este orden):

- **Inicio** `/` — dashboard
- **CRM**
  - Empresas `/companies`
  - Contactos `/contacts`
  - Leads `/leads` (con sub-vista Kanban y Lista)
  - Actividades `/activities`
- **Lead Intelligence**
  - Investigar `/intel/research` (nueva URL o CSV)
  - Pain Points `/intel/pain-points`
  - Recomendaciones `/intel/service-fit`
  - Outbound Prep `/intel/outbound`
- **Content Engine**
  - Ideas `/content/ideas`
  - Calendario `/content/calendar`
  - Biblioteca `/content/library`
  - Aprobaciones pendientes `/content/reviews`
- **Admin** (visible solo a role admin)
  - Usuarios `/admin/users`
  - Credenciales `/admin/credentials`
  - Integraciones `/admin/integrations`
  - Costes IA `/admin/ai-costs`
  - Audit log `/admin/audit`
  - Taxonomías `/admin/taxonomies`

Topbar: buscador global (cmd-K), notificaciones de jobs, avatar con menú.

## Componentes transversales

- Lista paginada con filtros laterales colapsables
- Detalle con pestañas (overview / activities / pain points / content / audit)
- Modales para crear/editar con React Hook Form + Zod
- Toasts para confirmaciones y errores
- Job status banner cuando hay jobs activos del usuario
- Empty states con CTA claro ("Aún no tienes empresas. Crea una o pega una URL para investigar.")

---

## Pantallas clave

### Login

- Route: `/login` — public
- Layout: card centrado; logo HeyDay; inputs email+password; link "recuperar" (v1 muestra mensaje "contacta con admin").

### Dashboard

- Route: `/` — auth
- Layout:
  - Fila de métricas: leads abiertos, leads sin acción en >7 días, aprobaciones pendientes, jobs en ejecución
  - "Próximas acciones" — lista de activities con due_at próximos (mías)
  - "Leads de máxima prioridad" — top 5 por priority_score
  - "Contenido en revisión" — top 5 pendientes
  - "Coste IA del mes" — mini gráfico
- Estado vacío: "Empieza añadiendo tu primera empresa o pegando una URL en Investigar."

### Empresas — lista

- Route: `/companies`
- Filtros: búsqueda, ICP vertical, ciudad, etiquetas, tiene pain points, tiene recomendación de servicio
- Columnas: nombre, dominio, ciudad, vertical ICP, pain points (count con chips por confidence), prioridad, última actividad
- Acciones: crear, importar CSV, investigar URL nueva

### Empresa — detalle

- Route: `/companies/:id`
- Header: nombre, dominio clicable, badges (vertical, tamaño, última actualización), botones (Editar, Re-enriquecer, Nuevo lead, Nueva nota)
- Tabs:
  - **Overview**: datos normalizados, fuentes de las que proviene cada campo, mapa si hay address
  - **Pain points**: lista agrupada por confidence (observed / inferred / speculative), cada uno con evidencia y fuente clicable, botones "verificar" / "editar" / "descartar"
  - **Service fit**: cards con vertical recomendado, señales que lo disparan, outcome esperado, botón "regenerar con Claude"
  - **Outbound prep**: panel editable (segmento, likely_need, ángulo, VP, pitch, tono, priority, notas SDR), botones "regenerar" y "copiar"
  - **Contactos**: lista de contactos asociados
  - **Leads**: leads asociados con su stage
  - **Actividad**: timeline de activities + enrichment runs
  - **Enrichment**: histórico de runs con sources hit

### Contactos — lista y detalle

- Route: `/contacts` y `/contacts/:id`
- Lista: nombre, empresa, rol, email, última actividad
- Detalle: info + timeline de activities + leads asociados + botón "anonimizar (GDPR)"

### Leads — Kanban

- Route: `/leads`
- Toggle Kanban / Lista
- Columnas = stages. Cada card: empresa, owner avatar, priority score color-coded, próxima acción, etiquetas
- Drag & drop entre columnas (llama a PATCH /leads/:id)
- Filtros: owner, vertical ICP, priority min, etiquetas

### Leads — detalle

- Route: `/leads/:id`
- Similar a Empresa pero con foco en stage actual, acciones rápidas "ganado/perdido" con motivo

### Actividades

- Route: `/activities`
- Vista tareas pendientes mías + todas, con filtros por entidad

---

### Investigar (Lead Intelligence entrada)

- Route: `/intel/research`
- Input grande: "Pega una URL de web objetivo" + botón "Investigar"
- Tab alternativo: "Subir CSV" con plantilla descargable
- Debajo: "Últimas investigaciones" con estado (queued / running / done / failed), duración, empresa creada

### Pain Points (vista cross-empresa)

- Route: `/intel/pain-points`
- Tabla filtrable: empresa, categoría, confidence, evidencia, fecha
- Bulk verify, bulk descartar

### Recomendaciones (cross-empresa)

- Route: `/intel/service-fit`
- Tabla: empresa, vertical recomendado, fit score, señales, rationale
- Permite enviar a Outbound Prep en un click

### Outbound Prep (cross-empresa)

- Route: `/intel/outbound`
- Lista priorizada de empresas listas para contactar. Click abre panel lateral con toda la info copiable.

---

### Content — Ideas

- Route: `/content/ideas`
- Botón "Generar ideas con Claude" — modal con pillar + vertical + brief → devuelve 5 sugerencias que puedes aceptar individualmente
- Tabla de ideas existentes

### Idea — detalle

- Route: `/content/ideas/:id`
- Info + botón "Generar borradores multi-canal" (crea 3 ContentItem simultáneamente)
- Lista de ContentItems generados con estado

### Content — Calendario

- Route: `/content/calendar`
- Toggle Mes / Semana
- Cards por día con chips de canal y estado
- Drag & drop para re-agendar
- Filtros por canal / estado / vertical

### Content — Item (editor)

- Route: `/content/items/:id`
- Header: canal, estado, fecha programada, acciones (Enviar a revisión, Aprobar, Rechazar, Regenerar, Exportar)
- Editor markdown con preview side-by-side
- Panel derecho: hooks variantes, CTAs variantes, hashtags (IG), meta (longitud, reading_time)
- Tabs inferiores: Versiones (historial con diff y revert), Comentarios/approval events

### Content — Library

- Route: `/content/library`
- Buscador + filtros; todo el contenido (approved / exported / archived)

### Content — Aprobaciones

- Route: `/content/reviews`
- Cola de items en `in_review` asignados o globales

---

### Admin — Usuarios

- Route: `/admin/users`
- Tabla con acciones: invitar, resetear contraseña, activar/desactivar, cambiar rol

### Admin — Credenciales

- Route: `/admin/credentials`
- Tabla: provider, label, último uso, salud (chip de IntegrationHealth), creada por, creada el
- Acciones: añadir, rotar, probar, desactivar, eliminar
- Formulario añadir: key + provider + label + value (password input, nunca leído de vuelta)

### Admin — Integraciones

- Route: `/admin/integrations`
- Lista de credenciales con estado de salud en tiempo real, últimos errores

### Admin — Costes IA

- Route: `/admin/ai-costs`
- Gráfico de línea por día (último 30 / 90 días)
- Breakdown por feature y por modelo
- Tabla detallada con filtros
- Total mensual y estimación de cierre de mes

### Admin — Audit log

- Route: `/admin/audit`
- Tabla filtrable por actor, acción, fecha, entidad

### Admin — Taxonomías

- Route: `/admin/taxonomies`
- Tabs: Pain point categories / Service lines / Content pillars
- CRUD inline

---

## Estados (aplicables a todas las listas)

- **Loading**: skeleton rows
- **Empty**: ilustración minimalista + copy útil + CTA primaria
- **Error**: card con mensaje claro + botón "Reintentar" + link a "ver logs" si admin
- **Job in progress**: banner superior con spinner + link al job
- **Job failed**: toast + banner con CTA "ver detalle"

## Accesibilidad

- Foco visible en todos los interactivos
- aria-labels en iconos sin texto
- Contraste AA mínimo
- Navegación por teclado en Kanban (flechas para mover card entre stages)
- Modales con trap de foco y Esc para cerrar
