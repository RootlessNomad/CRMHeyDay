# @heyday/frontend

Next.js 15 App Router + Tailwind + shadcn/ui + TanStack Query.

## Estructura prevista (se materializa en IT-10 + M1+)

```
src/
  app/
    (auth)/login/
    (app)/                  # layout autenticado
      page.tsx              # dashboard
      companies/
      contacts/
      leads/
      activities/
      intel/
      content/
      admin/
  components/
    ui/                     # shadcn primitives
    domain/                 # CompanyCard, KanbanBoard, CalendarGrid, ...
  lib/
    api/                    # clientes tipados por módulo
    auth/
    query/
    jobs/
  styles/
```

Ver `../design/ui_wireframes.md` para navegación y pantallas.

## Scripts

- `pnpm dev` — Next.js en modo dev
- `pnpm build` — build de producción
- `pnpm test:e2e` — Playwright E2E
