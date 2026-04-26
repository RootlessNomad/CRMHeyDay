# Style Guide

## Principios visuales

Alineado con HeyDay: minimalista, neutral, moderno, preciso. Glassmorphism aplicado con mesura, no como efecto dominante. Nunca ruidoso ni corporativo frío.

## Tipografía

- **Sans principal**: Inter (variable, self-hosted). Fallback: system-ui.
- **Monospace**: JetBrains Mono (para logs, código, valores técnicos). Fallback: ui-monospace.
- Escala (rem):
  - xs 0.75 / sm 0.875 / base 1 / lg 1.125 / xl 1.25 / 2xl 1.5 / 3xl 1.875 / 4xl 2.25
- Pesos usados: 400 regular, 500 medium (UI), 600 semibold (headings/énfasis).

## Color tokens

Light mode:

- `bg` `#F7F7F5` (off-white cálido)
- `surface` `#FFFFFF`
- `surface-muted` `#F1F1EE`
- `border` `#E4E4DF`
- `text` `#13140F`
- `text-muted` `#5E5F58`
- `accent` `#3A6B4A` (verde oliva profundo — evoca confianza, no genérico)
- `accent-soft` `#E7EEEA`
- `danger` `#B4442B`
- `warn` `#B07A1F`
- `success` `#3A6B4A`

Dark mode:

- `bg` `#0E100D`
- `surface` `#161813`
- `surface-muted` `#1C1F1A`
- `border` `#2A2D27`
- `text` `#EDEDE8`
- `text-muted` `#9A9C92`
- `accent` `#7FB193`
- `accent-soft` `#1E2C23`
- `danger` `#E6806A`
- `warn` `#D9B165`
- `success` `#7FB193`

## Spacing

Tailwind default (0.25rem = 1). Ritmo base 4/8/12/16/24/32/48.

## Radios

- `sm` 6px (inputs/chips)
- `md` 10px (buttons, small cards)
- `lg` 14px (cards principales)
- `xl` 20px (modales, contenedores grandes)

## Glassmorphism — uso controlado

Solo en superficies destacadas (topbar, sidebar activa, job-status banner, modales de confirmación):

- `background: color-mix(in oklab, var(--surface) 65%, transparent)`
- `backdrop-filter: blur(10px) saturate(120%)`
- `border: 1px solid color-mix(in oklab, var(--border) 70%, transparent)`

No usar en listas, tablas o paneles de datos (claridad > efecto).

## Sombras

- `shadow-sm` elevación sutil de cards
- `shadow-md` modales y menús flotantes
- Colores: ligeramente tintadas con `text` al 6-10%

## Componentes

- **Button**: primario (accent), secundario (outline), ghost, destructive. Altura 36px (sm) / 40px (md) / 48px (lg). Icon + text con gap 8px.
- **Input**: altura 40px, border 1px, focus ring accent, estado error con border danger + helper text.
- **Card**: radius lg, padding 24px, header con title + optional actions.
- **Table**: zebra opcional, headers uppercase tracking-wide text-xs text-muted, row hover surface-muted.
- **Badge/Chip**: radius sm, padding 2px 8px, variantes por kind (vertical, persona, service_interest, confidence level, status).
- **Modal**: max-width 640px (sm) / 880px (md), cerrar con Esc y click outside, focus trap.
- **Kanban card**: radius md, drag handle sutil, priority color bar izquierda (rojo >80, naranja 60-80, verde <60).
- **Empty state**: ilustración line-art monocromo, h3 + copy + CTA primaria.
- **Toast**: bottom-right, 4s auto-dismiss, variantes info/success/warn/danger.

## Breakpoints (Tailwind)

- sm 640 / md 768 / lg 1024 / xl 1280 / 2xl 1536
- Sidebar colapsa a drawer bajo `lg`

## Accesibilidad

- Contraste mínimo 4.5:1 para texto normal, 3:1 para large/UI
- Focus ring visible de 2px con offset 2px, color accent
- No usar solo color para transmitir estado (añadir icono o texto)
- `prefers-reduced-motion`: respetar, suprimir transitions > 200ms
- Navegación completa por teclado en Kanban, calendario, tablas y modales
