'use client'

// Dados: crm.ts (client-side), sem server actions.
// InboxNotification → CrmNotification (sem related_lead_id).

import { useState, useTransition, useRef, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  Bell, CheckCheck, Clock, Building2, User, Calendar,
  AlertCircle, Star, UserPlus, ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  fetchNotifications, markNotificationRead, markAllNotificationsRead,
  type CrmNotification,
} from '@/lib/crm'

const POLL_INTERVAL_MS = 60_000

const EVENT_ICONS: Record<string, React.ElementType> = {
  lead_assigned: User,
  deal_stage_changed: Building2,
  deal_due_soon: Clock,
  activity_reminder: Calendar,
  member_invited: UserPlus,
  member_joined: Star,
}

const EVENT_COLORS: Record<string, string> = {
  lead_assigned: 'text-blue-400 bg-blue-500/10',
  deal_stage_changed: 'text-violet-400 bg-violet-500/10',
  deal_due_soon: 'text-amber-400 bg-amber-500/10',
  activity_reminder: 'text-green-400 bg-green-500/10',
  member_invited: 'text-cyan-400 bg-cyan-500/10',
  member_joined: 'text-canary bg-canary/10',
}

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60) return 'agora'
  if (diff < 3600) return `${Math.floor(diff / 60)}min`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

function notificationHref(n: CrmNotification): string {
  if (n.relatedDealId) return `/crm/pipeline?deal=${n.relatedDealId}`
  return '/crm/dashboard'
}

interface NotificationBellProps {
  companyId: string
  /** 'sidebar': botão de linha inteira + painel abre para cima */
  variant?: 'header' | 'sidebar'
  /** sidebar rail (colapsada): só ícone */
  collapsed?: boolean
}

export function NotificationBell({ companyId, variant = 'header', collapsed = false }: NotificationBellProps) {
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<CrmNotification[]>([])
  const [isPending, startTransition] = useTransition()
  const panelRef = useRef<HTMLDivElement>(null)

  const unreadCount = notifications.filter((n) => !n.readAt).length

  const refresh = useCallback(async () => {
    try {
      setNotifications(await fetchNotifications(companyId))
    } catch {
      // non-fatal — badge stays stale until next tick
    }
  }, [companyId])

  // Carga inicial + poll a cada 60s com painel fechado.
  useEffect(() => { refresh() }, [refresh])
  useEffect(() => {
    const id = setInterval(() => {
      if (!open) refresh()
    }, POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [open, refresh])

  // Refresh list when panel opens so it's always up-to-date.
  useEffect(() => {
    if (open) refresh()
  }, [open, refresh])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  function handleRead(id: string) {
    setNotifications((prev) =>
      prev.map((n) => n.id === id ? { ...n, readAt: new Date().toISOString() } : n)
    )
    startTransition(async () => { await markNotificationRead(id) })
  }

  function handleMarkAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })))
    startTransition(async () => { await markAllNotificationsRead(companyId) })
  }

  const hasUnread = unreadCount > 0

  const isSidebar = variant === 'sidebar'

  return (
    <div className={cn('relative', isSidebar && !collapsed && 'w-full')} ref={panelRef}>
      {/* Header variant: small icon box */}
      {!isSidebar && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={cn(
            'relative flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-slate transition-all duration-200 hover:text-geyser focus-visible:outline-none',
            open && 'text-geyser'
          )}
          style={{
            background: open ? 'rgba(216,222,227,0.08)' : '#151A20',
            border: `1px solid ${open ? 'rgba(216,222,227,0.18)' : 'rgba(216,222,227,0.10)'}`,
          }}
          aria-label="Notificações"
        >
          <Bell className="h-[18px] w-[18px]" />
          {hasUnread && (
            <span
              className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-canary text-[9px] font-bold text-bunker"
              style={{ boxShadow: '0 0 0 2px #0B0D11' }}
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      )}

      {/* Sidebar expanded: row button */}
      {isSidebar && !collapsed && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={cn(
            'relative flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-slate transition-all duration-200 hover:bg-surface hover:text-geyser focus-visible:outline-none',
            open && 'bg-surface text-geyser'
          )}
          aria-label="Notificações"
        >
          <Bell className="h-[18px] w-[18px] flex-shrink-0" />
          <span className="flex-1 text-[13px] font-medium">Notificações</span>
          {hasUnread && (
            <span className="flex min-w-[18px] h-[18px] items-center justify-center rounded-full bg-canary px-1.5 text-[10px] font-bold text-bunker">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      )}

      {/* Sidebar collapsed: icon only */}
      {isSidebar && collapsed && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          title="Notificações"
          className={cn(
            'relative flex h-10 w-full items-center justify-center rounded-xl text-slate transition-all duration-200 hover:bg-surface hover:text-geyser focus-visible:outline-none',
            open && 'bg-surface text-geyser'
          )}
          aria-label="Notificações"
        >
          <Bell className="h-[18px] w-[18px]" />
          {hasUnread && (
            <span
              className="absolute right-1.5 top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-canary text-[8px] font-bold text-bunker"
              style={{ boxShadow: '0 0 0 2px #0B0D11' }}
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      )}

      {open && (
        <div
          className={cn(
            'absolute z-50 flex w-[360px] flex-col rounded-2xl shadow-2xl',
            isSidebar ? 'bottom-full left-0 mb-2' : 'right-0 top-[calc(100%+8px)]'
          )}
          style={{
            background: '#0F1318',
            border: '1px solid rgba(216,222,227,0.10)',
            maxHeight: '520px',
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{ borderBottom: '1px solid rgba(216,222,227,0.08)' }}
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-foreground">Notificações</span>
              {hasUnread && (
                <span className="rounded-full bg-canary/15 px-1.5 py-0.5 text-[10px] font-bold text-canary">
                  {unreadCount} nova{unreadCount !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            {hasUnread && (
              <button
                onClick={handleMarkAllRead}
                disabled={isPending}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10.5px] font-medium text-muted-foreground/60 transition-colors hover:bg-white/5 hover:text-foreground disabled:opacity-40"
              >
                <CheckCheck className="h-3 w-3" />
                Marcar todas como lidas
              </button>
            )}
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto scrollbar-none">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Bell className="mb-3 h-8 w-8 text-muted-foreground/20" />
                <p className="text-sm text-muted-foreground/60">Nenhuma notificação</p>
              </div>
            ) : (
              notifications.map((n) => {
                const Icon = EVENT_ICONS[n.eventType] ?? AlertCircle
                const color = EVENT_COLORS[n.eventType] ?? 'text-muted-foreground bg-muted/20'
                const isUnread = !n.readAt
                const href = notificationHref(n)

                return (
                  <Link
                    key={n.id}
                    href={href}
                    onClick={() => {
                      if (isUnread) handleRead(n.id)
                      setOpen(false)
                    }}
                    className={cn(
                      'flex items-start gap-3 px-4 py-3 transition-colors hover:bg-white/4',
                      isUnread && 'bg-white/[0.025]'
                    )}
                    style={{ borderBottom: '1px solid rgba(216,222,227,0.05)' }}
                  >
                    <span className={cn('mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs', color)}>
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className={cn(
                          'text-[12.5px] leading-snug',
                          isUnread ? 'font-semibold text-foreground' : 'font-medium text-muted-foreground/70'
                        )}>
                          {n.title}
                        </p>
                        <span className="shrink-0 text-[10px] text-muted-foreground/60">
                          {timeAgo(n.createdAt)}
                        </span>
                      </div>
                      {n.body && (
                        <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground/60 line-clamp-2">
                          {n.body}
                        </p>
                      )}
                    </div>
                    {isUnread && (
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-canary" />
                    )}
                  </Link>
                )
              })
            )}
          </div>

          {/* Footer */}
          <div
            className="flex items-center justify-center px-4 py-2.5"
            style={{ borderTop: '1px solid rgba(216,222,227,0.08)' }}
          >
            <Link
              href="/crm/settings/notifications"
              onClick={() => setOpen(false)}
              className="flex items-center gap-1 text-[11px] text-muted-foreground/60 transition-colors hover:text-muted-foreground/70"
            >
              Preferências de notificação
              <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
