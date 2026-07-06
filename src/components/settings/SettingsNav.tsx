'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Bell,
  Building2,
  Code2,
  Database,
  MessageSquare,
  Sliders,
  Tag,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// Port fiel do SettingsNav do PipeFlow, com rotas /crm/settings/*.
// Sem account/billing/workspace (moram no Monster Hub) e sem modelos do
// WhatsApp (exigem credenciais reais da Meta).
const groups = [
  {
    label: 'Conta',
    items: [
      { href: '/', icon: Building2, label: 'Conta & Empresa (Hub)' },
      { href: '/crm/settings/notifications', icon: Bell, label: 'Notificações' },
    ],
  },
  {
    label: 'Personalização',
    items: [
      { href: '/crm/settings/custom-fields', icon: Sliders, label: 'Campos Personalizados' },
      { href: '/crm/settings/tags', icon: Tag, label: 'Tags' },
    ],
  },
  {
    label: 'Integrações',
    items: [
      { href: '/crm/settings/channels', icon: MessageSquare, label: 'Canais de Mensagens' },
      { href: '/crm/settings/developers', icon: Code2, label: 'Desenvolvedores' },
    ],
  },
  {
    label: 'Dados',
    items: [
      { href: '/crm/settings/data', icon: Database, label: 'Importar / Exportar' },
    ],
  },
]

export function SettingsNav() {
  const pathname = usePathname()

  function isActive(href: string) {
    if (href === '/') return false
    return pathname === href || pathname.startsWith(href + '/')
  }

  return (
    <nav className="flex w-[220px] shrink-0 flex-col gap-6">
      {groups.map((group) => (
        <div key={group.label} className="flex flex-col gap-0.5">
          <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate/50">
            {group.label}
          </p>
          {group.items.map((item) => {
            const active = isActive(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'group relative flex h-9 items-center gap-2.5 rounded-xl px-3 text-sm font-medium transition-all duration-150',
                  active ? 'text-canary' : 'text-slate hover:text-geyser'
                )}
                style={active ? {
                  background: 'rgba(198,244,50,0.10)',
                  border: '1px solid rgba(198,244,50,0.16)',
                } : undefined}
              >
                {!active && (
                  <span
                    className="absolute inset-0 rounded-xl opacity-0 transition-opacity duration-150 group-hover:opacity-100"
                    style={{ background: 'rgba(216,222,227,0.05)' }}
                  />
                )}
                {active && (
                  <span className="absolute left-0 inset-y-1.5 w-[3px] rounded-full bg-canary" />
                )}
                <item.icon
                  className={cn(
                    'relative h-4 w-4 shrink-0',
                    active ? 'text-canary' : 'text-slate group-hover:text-geyser'
                  )}
                />
                <span className="relative truncate">{item.label}</span>
              </Link>
            )
          })}
        </div>
      ))}
    </nav>
  )
}
