'use client'

// Rotas prefixadas com /crm. O board hoje vive em /crm (raiz); quando o Kanban
// mover pra /crm/pipeline, basta trocar PIPELINE_HREF.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  CalendarDays,
  ChevronRight,
  Columns3,
  LayoutDashboard,
  MessageSquare,
  Plus,
  Settings,
  Users,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const PIPELINE_HREF = '/crm/pipeline'

const mainNavItems = [
  { href: '/crm/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/crm/inbox', icon: MessageSquare, label: 'Inbox', badge: true },
  { href: '/crm/leads', icon: Users, label: 'Leads' },
  { href: '/crm/calendar', icon: CalendarDays, label: 'Calendário' },
]

const settingsNavItems = [
  { href: '/crm/settings/notifications', icon: Settings, label: 'Configurações' },
]

interface SidebarNavProps {
  onItemClick?: () => void
  pipelines?: { id: string; name: string }[]
  inboxUnreadCount?: number
  /** Modo rail (sidebar colapsada): só ícones, com tooltip nativo. */
  collapsed?: boolean
  /** Abre o modal de criar funil (vem do AppShell). */
  onCreatePipeline?: () => void
}

export function SidebarNav({ onItemClick, pipelines = [], inboxUnreadCount = 0, collapsed = false, onCreatePipeline }: SidebarNavProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()
  const isPipelinePath = pathname === PIPELINE_HREF
  const [pipelinesExpanded, setPipelinesExpanded] = useState(isPipelinePath)

  const activePipelineId = searchParams.get('id') || pipelines[0]?.id

  useEffect(() => {
    if (pathname === PIPELINE_HREF) {
      setPipelinesExpanded(true)
    }
  }, [pathname])

  function isActive(href: string) {
    if (href === '/crm/dashboard') return pathname === href
    return pathname === href || pathname.startsWith(href + '/')
  }

  function renderLink(item: { href: string; icon: React.ElementType; label: string; badge?: boolean }) {
    const active = isActive(item.href)

    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={onItemClick}
        title={collapsed ? item.label : undefined}
        className={cn(
          'group relative flex items-center rounded-xl font-medium transition-all duration-200 ease-out',
          collapsed ? 'justify-center px-0' : 'gap-3 px-3',
          active
            ? 'text-canary'
            : 'text-slate hover:text-geyser'
        )}
        style={{
          height: 'var(--nav-h)',
          fontSize: 'var(--nav-font)',
          ...(active ? {
            background: 'rgba(198,244,50,0.10)',
            border: '1px solid rgba(198,244,50,0.18)',
          } : {}),
        }}
      >
        {!active && (
          <span
            className="absolute inset-0 rounded-xl opacity-0 transition-opacity duration-200 group-hover:opacity-100"
            style={{ background: 'rgba(216,222,227,0.05)' }}
          />
        )}
        {active && !collapsed && (
          <span className="absolute left-0 inset-y-2.5 w-[3px] rounded-full bg-canary" />
        )}
        <span className="relative flex-shrink-0">
          <item.icon
            className={cn(
              'transition-colors',
              active ? 'text-canary' : 'text-slate group-hover:text-geyser'
            )}
            style={{ width: 'var(--nav-icon)', height: 'var(--nav-icon)' }}
          />
          {/* No modo colapsado o badge vira um ponto sobre o ícone */}
          {collapsed && item.badge && inboxUnreadCount > 0 && (
            <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-red-500" />
          )}
        </span>
        {!collapsed && <span className="relative truncate">{item.label}</span>}
        {!collapsed && item.badge && inboxUnreadCount > 0 && (
          <Badge className="ml-auto flex h-5 min-w-[20px] px-1 items-center justify-center rounded-full bg-red-500 hover:bg-red-600 text-white border-0 text-[10px] font-bold">
            {inboxUnreadCount > 99 ? '99+' : inboxUnreadCount}
          </Badge>
        )}
      </Link>
    )
  }

  if (collapsed) {
    return (
      <nav className="flex flex-col px-3" style={{ gap: 'var(--nav-gap)' }}>
        {mainNavItems.map(renderLink)}

        {/* Funis (rail): ícone único que navega para o funil */}
        <button
          type="button"
          title="Funis de Vendas"
          onClick={() => {
            router.push(PIPELINE_HREF + (pipelines[0] ? `?id=${pipelines[0].id}` : ''))
            onItemClick?.()
          }}
          className={cn(
            'group relative flex w-full items-center justify-center rounded-xl font-medium transition-all duration-200 ease-out',
            isPipelinePath ? 'text-canary' : 'text-slate hover:text-geyser'
          )}
          style={{
            height: 'var(--nav-h)',
            fontSize: 'var(--nav-font)',
            ...(isPipelinePath ? {
              background: 'rgba(198,244,50,0.10)',
              border: '1px solid rgba(198,244,50,0.18)',
            } : {}),
          }}
        >
          <Columns3 style={{ width: 'var(--nav-icon)', height: 'var(--nav-icon)' }} />
        </button>

        <div className="mx-auto my-3 h-px w-8" style={{ background: 'rgba(216,222,227,0.10)' }} />

        {settingsNavItems.map(renderLink)}
      </nav>
    )
  }

  return (
    <nav className="flex flex-col px-3" style={{ gap: 'var(--nav-gap)' }}>
      {mainNavItems.map(renderLink)}

      {/* Funis section */}
      <div className="flex flex-col">
        <button
          type="button"
          onClick={() => {
            if (!isPipelinePath) {
              router.push(PIPELINE_HREF + (pipelines[0] ? `?id=${pipelines[0].id}` : ''))
              setPipelinesExpanded(true)
              onItemClick?.()
            } else {
              setPipelinesExpanded((expanded) => !expanded)
            }
          }}
          className={cn(
            'group relative flex w-full items-center justify-between rounded-xl px-3 font-medium transition-all duration-200 ease-out',
            isPipelinePath ? 'text-canary' : 'text-slate hover:text-geyser'
          )}
          style={{
            height: 'var(--nav-h)',
            fontSize: 'var(--nav-font)',
            ...(isPipelinePath ? {
              background: 'rgba(198,244,50,0.10)',
              border: '1px solid rgba(198,244,50,0.18)',
            } : {}),
          }}
        >
          {!isPipelinePath && (
            <span
              className="absolute inset-0 rounded-xl opacity-0 transition-opacity duration-200 group-hover:opacity-100"
              style={{ background: 'rgba(216,222,227,0.05)' }}
            />
          )}
          <div className="relative flex min-w-0 items-center gap-3">
            {isPipelinePath && (
              <span className="absolute -left-3 inset-y-[-10px] w-[3px] rounded-full bg-canary" />
            )}
            <Columns3
              className={cn(
                'flex-shrink-0 transition-colors',
                isPipelinePath ? 'text-canary' : 'text-slate group-hover:text-geyser'
              )}
              style={{ width: 'var(--nav-icon)', height: 'var(--nav-icon)' }}
            />
            <span className="truncate">Funis de Vendas</span>
          </div>
          <ChevronRight
            className={cn(
              'relative h-4 w-4 shrink-0 transition-transform duration-200',
              pipelinesExpanded && 'rotate-90',
              isPipelinePath ? 'text-canary/70' : 'text-slate/50 group-hover:text-slate'
            )}
          />
        </button>

        {pipelinesExpanded && (
          <div className="mb-1 mt-0.5 flex flex-col gap-0.5 pl-[42px] pr-2">
            {pipelines.map((pipeline) => {
              const isActivePipeline = isPipelinePath && activePipelineId === pipeline.id

              return (
                <Link
                  key={pipeline.id}
                  href={`${PIPELINE_HREF}?id=${pipeline.id}`}
                  onClick={onItemClick}
                  className={cn(
                    'truncate rounded-lg px-3 py-2 text-xs font-medium transition-colors duration-150',
                    isActivePipeline
                      ? 'text-geyser'
                      : 'text-slate hover:text-geyser'
                  )}
                  style={isActivePipeline ? { background: 'rgba(216,222,227,0.07)' } : undefined}
                >
                  {pipeline.name}
                </Link>
              )
            })}

            <button
              type="button"
              onClick={() => onCreatePipeline?.()}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-slate/60 transition-colors hover:text-slate"
            >
              <Plus className="h-3.5 w-3.5" />
              Criar novo funil
            </button>
          </div>
        )}
      </div>

      {/* Settings section */}
      <div className="mb-1.5 mt-5 px-3">
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate/50">
          Configurações
        </span>
      </div>

      {settingsNavItems.map(renderLink)}
    </nav>
  )
}
