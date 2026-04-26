# Skills Inventory

## Selected (se usarán durante el proyecto)

| Skill                      | Scope            | Status                     | Notes                                                                                                                                                                                                     |
| -------------------------- | ---------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `claude-api`               | base             | **selected — obligatorio** | Se activa al tocar cualquier archivo que importe `@anthropic-ai/sdk`. Aporta patrones de prompt caching, migración de modelos y buenas prácticas de la API. Crítico para IT-08 y todas las UJ de M4 y M5. |
| `init-project`             | base             | **in use** (esta sesión)   | Usado para planning.                                                                                                                                                                                      |
| `start-execution`          | base             | **selected**               | Se usará al comenzar implementación tras aprobación.                                                                                                                                                      |
| `session-start`            | base             | **selected**               | Arranque de cada sesión futura.                                                                                                                                                                           |
| `review`                   | base             | **selected — obligatorio** | Tras cada milestone (M0-M5) y antes de delivery.                                                                                                                                                          |
| `security-review`          | base             | **selected — obligatorio** | Antes de delivery; también puntualmente en UJ sensibles (IT-06 credential vault, UJ-12 credential UI, UJ-15 GDPR).                                                                                        |
| `simplify`                 | base             | **selected on-demand**     | Tras grandes cambios o cuando `/review` detecte duplicación.                                                                                                                                              |
| `iterate`                  | base             | **selected on-demand**     | Post-delivery, para cambios del usuario.                                                                                                                                                                  |
| `update-config`            | base             | available                  | Útil para añadir hooks o permisos a `.claude/settings.json` si se identifica una automatización (ej. pre-commit de tests).                                                                                |
| `less-permission-prompts`  | base             | available                  | Para reducir prompts de permiso tras algunas sesiones de desarrollo.                                                                                                                                      |
| `keybindings-help`         | base             | available                  | Puntual.                                                                                                                                                                                                  |
| `loop` / `schedule`        | base             | available                  | No necesarios para el producto; útiles para monitorizar builds o jobs largos durante desarrollo.                                                                                                          |
| `consolidate-memory`       | anthropic-skills | available                  | Para compactar memorias si el repo acumula notas personales.                                                                                                                                              |
| `setup-cowork`             | anthropic-skills | available                  | No aplica directamente.                                                                                                                                                                                   |
| `skill-creator`            | anthropic-skills | available                  | Candidato: crear una skill propia "heyday-tone" que valide borradores de contenido contra la guía de voz (sería útil en UJ-23/UJ-24). Evaluar tras M5.                                                    |
| `docx`                     | anthropic-skills | available                  | Solo si se pide export de contenido a Word (no está en scope v1).                                                                                                                                         |
| `pptx`                     | anthropic-skills | available                  | No aplica v1.                                                                                                                                                                                             |
| `pdf`                      | anthropic-skills | available                  | Podría usarse si se pide export de briefings Outbound a PDF. Fuera de scope v1.                                                                                                                           |
| `xlsx`                     | anthropic-skills | available                  | Podría usarse para import/export CSV avanzado. v1 usa CSV simple.                                                                                                                                         |
| `init` / `review` (git/PR) | base             | available                  | Sesión inicial ya hecha manualmente; `/review` git lo cubriremos con PRs reales.                                                                                                                          |

## Rejected (explícitamente no se usarán)

(ninguna por ahora — nos mantenemos abiertos)

## Skills candidatas a crear durante el proyecto

1. **heyday-tone-validator** — valida borradores de Content Engine contra la guía de voz (words prohibidas, métricas de claridad), lanzada antes de `approved`. Evaluar en M5 tras tener UJ-23 y UJ-25 funcionando.
2. **crm-golden-paths** — playbook de verificación de las 6 success criteria del v1 antes de delivery. Evaluar al iniciar auditoría final.

## Conclusión

- Para arrancar: `start-execution`, `claude-api` y `session-start` cubren todo.
- Tras cada milestone: `/review` + `/security-review` puntual.
- Candidatos a skill personalizada: 2 (evaluar tras M5).
