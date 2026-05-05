'use client';

// Sidebar principal, secciones del ui_wireframes.md.
// - Fija ≥ lg, colapsa a drawer < lg (M1 añadirá el toggle; de momento oculta en móvil).
// - Active state por pathname (sencillo prefix match).
// - Admin sólo visible a role admin (lee del store).

import {
  Building2,
  Calendar,
  CalendarDays,
  CreditCard,
  FileCheck,
  FileText,
  FlaskConical,
  Gauge,
  Layers,
  LayoutDashboard,
  Library,
  Lightbulb,
  ListChecks,
  PhoneCall,
  Search,
  Settings2,
  Shield,
  Sparkles,
  Tag,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ComponentType, SVGProps } from 'react';

import { useAuthStore } from '@/lib/auth/store';
import { cn } from '@/lib/cn';

interface NavItem {
  href: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
}

interface NavSection {
  title?: string;
  items: NavItem[];
  adminOnly?: boolean;
}

const SECTIONS: NavSection[] = [
  {
    items: [{ href: '/dashboard', label: 'Inicio', icon: LayoutDashboard }],
  },
  {
    title: 'CRM',
    items: [
      { href: '/companies', label: 'Empresas', icon: Building2 },
      { href: '/contacts', label: 'Contactos', icon: Users },
      { href: '/leads', label: 'Leads', icon: ListChecks },
      { href: '/activities', label: 'Actividades', icon: PhoneCall },
      { href: '/calendar', label: 'Calendario', icon: CalendarDays },
    ],
  },
  {
    title: 'Lead Intelligence',
    items: [
      { href: '/intel/research', label: 'Investigar', icon: Search },
      { href: '/intel/pain-points', label: 'Pain Points', icon: FlaskConical },
      { href: '/intel/service-fit', label: 'Recomendaciones', icon: Sparkles },
      { href: '/intel/outbound', label: 'Outbound Prep', icon: FileText },
    ],
  },
  {
    title: 'Content Engine',
    items: [
      { href: '/content/ideas', label: 'Ideas', icon: Lightbulb },
      { href: '/content/calendar', label: 'Calendario', icon: Calendar },
      { href: '/content/library', label: 'Biblioteca', icon: Library },
      { href: '/content/reviews', label: 'Aprobaciones', icon: FileCheck },
    ],
  },
  {
    title: 'Admin',
    adminOnly: true,
    items: [
      { href: '/admin/users', label: 'Usuarios', icon: Users },
      { href: '/admin/credentials', label: 'Credenciales', icon: Shield },
      { href: '/admin/integrations', label: 'Integraciones', icon: Layers },
      { href: '/admin/ai-costs', label: 'Costes IA', icon: CreditCard },
      { href: '/admin/audit', label: 'Audit log', icon: Gauge },
      { href: '/admin/taxonomies', label: 'Taxonomías', icon: Tag },
      { href: '/admin/settings', label: 'Ajustes', icon: Settings2 },
    ],
  },
];

function NavLink({ item }: { item: NavItem }): JSX.Element {
  const pathname = usePathname();
  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={cn(
        'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition',
        active
          ? 'bg-accent-soft text-text font-medium'
          : 'text-text-muted hover:bg-surface-muted hover:text-text',
      )}
      aria-current={active ? 'page' : undefined}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span>{item.label}</span>
    </Link>
  );
}

export function Sidebar(): JSX.Element {
  const role = useAuthStore((s) => s.user?.role);

  return (
    <aside className="border-border bg-surface hidden border-r lg:flex lg:w-64 lg:shrink-0 lg:flex-col">
      <div className="border-border flex h-14 items-center border-b px-5">
        <span className="text-lg font-semibold tracking-tight">HeyDay</span>
      </div>
      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
        {SECTIONS.map((section, i) => {
          if (section.adminOnly && role !== 'admin') return null;
          return (
            <div key={section.title ?? i}>
              {section.title ? (
                <p className="text-text-muted mb-2 px-3 text-xs font-medium uppercase tracking-wider">
                  {section.title}
                </p>
              ) : null}
              <ul className="space-y-0.5">
                {section.items.map((item) => (
                  <li key={item.href}>
                    <NavLink item={item} />
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
