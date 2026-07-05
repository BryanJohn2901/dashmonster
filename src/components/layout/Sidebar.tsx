'use client'

// Port fiel de pipeflow-crm/components/layout/Sidebar.tsx.
// Notificações/busca buscam sozinhas via crm.ts (companyId), sem props de seed.

import { Suspense, useCallback, useEffect, useState } from 'react'
import { PanelLeftClose, PanelLeftOpen, Search } from 'lucide-react'
import { SidebarNav } from './SidebarNav'
import { WorkspaceSwitcher, type WorkspaceItem } from './WorkspaceSwitcher'
import { UserMenu } from './UserMenu'
import { PipeFlowLogo } from './PipeFlowLogo'
import { CommandPalette } from './CommandPalette'
import { NotificationBell } from './NotificationBell'

export const SIDEBAR_COLLAPSED_COOKIE = 'pf_sidebar_collapsed'

interface SidebarProps {
  companyId: string
  workspaces: WorkspaceItem[]
  currentWorkspaceId: string
  onSwitchWorkspace: (id: string) => void
  user: { name: string; email: string; avatarUrl: string | null } | null
  pipelines: { id: string; name: string }[]
  inboxUnreadCount: number
  initialCollapsed?: boolean
  onCreatePipeline?: () => void
}

export function Sidebar({
  companyId,
  workspaces,
  currentWorkspaceId,
  onSwitchWorkspace,
  user,
  pipelines,
  inboxUnreadCount,
  initialCollapsed = false,
  onCreatePipeline,
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState(initialCollapsed)
  const [searchOpen, setSearchOpen] = useState(false)

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev
      document.cookie = `${SIDEBAR_COLLAPSED_COOKIE}=${next ? '1' : '0'}; path=/; max-age=31536000; samesite=lax`
      return next
    })
  }, [])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'b') {
        event.preventDefault()
        toggle()
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearchOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [toggle])

  return (
    <>
    <aside
      className="sticky top-0 hidden h-screen flex-shrink-0 flex-col bg-bunker transition-[width] duration-200 ease-out lg:flex"
      style={{
        width: collapsed ? 76 : 'var(--sidebar-w)',
        borderRight: '1px solid rgba(216,222,227,0.08)',
      }}
    >
      {/* Logo + toggle */}
      <div
        className={`flex h-[72px] flex-shrink-0 items-center ${collapsed ? 'justify-center px-0' : 'justify-between px-5'}`}
        style={{ borderBottom: '1px solid rgba(216,222,227,0.08)' }}
      >
        {!collapsed && <PipeFlowLogo variant="sidebar" />}
        <button
          type="button"
          onClick={toggle}
          title={collapsed ? 'Expandir menu (Ctrl+B)' : 'Recolher menu (Ctrl+B)'}
          aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl text-slate transition-colors hover:text-geyser"
          style={{ background: 'rgba(216,222,227,0.05)' }}
        >
          {collapsed ? <PanelLeftOpen className="h-[18px] w-[18px]" /> : <PanelLeftClose className="h-[18px] w-[18px]" />}
        </button>
      </div>

      {/* Nav */}
      <div className="flex-1 overflow-y-auto py-4 scrollbar-none">
        <Suspense fallback={null}>
          <SidebarNav
            pipelines={pipelines}
            inboxUnreadCount={inboxUnreadCount}
            collapsed={collapsed}
            onCreatePipeline={onCreatePipeline}
          />
        </Suspense>
      </div>

      {/* Footer */}
      {!collapsed && (
        <div className="flex-shrink-0 space-y-1 p-3" style={{ borderTop: '1px solid rgba(216,222,227,0.08)' }}>
          {/* Search */}
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-slate transition-all duration-200 hover:bg-surface hover:text-geyser focus-visible:outline-none"
          >
            <Search className="h-[18px] w-[18px] flex-shrink-0" />
            <span className="flex-1 text-[13px] font-medium">Buscar...</span>
            <kbd className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-semibold text-slate/50">
              Ctrl K
            </kbd>
          </button>

          {/* Notifications */}
          <NotificationBell companyId={companyId} variant="sidebar" />

          <div className="my-1.5 h-px" style={{ background: 'rgba(216,222,227,0.07)' }} />

          <WorkspaceSwitcher
            workspaces={workspaces}
            currentWorkspaceId={currentWorkspaceId}
            onSwitch={onSwitchWorkspace}
          />
          <div className="my-1.5 h-px" style={{ background: 'rgba(216,222,227,0.07)' }} />
          <UserMenu user={user} />
        </div>
      )}
      {collapsed && (
        <div
          className="flex flex-shrink-0 flex-col items-center gap-1 p-3"
          style={{ borderTop: '1px solid rgba(216,222,227,0.08)' }}
        >
          {/* Search icon */}
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            title="Buscar (Ctrl+K)"
            className="flex h-10 w-full items-center justify-center rounded-xl text-slate transition-all duration-200 hover:bg-surface hover:text-geyser"
          >
            <Search className="h-[18px] w-[18px]" />
          </button>

          {/* Notifications icon */}
          <NotificationBell companyId={companyId} variant="sidebar" collapsed />

          <div className="my-1 h-px w-8" style={{ background: 'rgba(216,222,227,0.07)' }} />

          <PipeFlowLogo variant="sidebar" compact />
        </div>
      )}
    </aside>

    <CommandPalette companyId={companyId} open={searchOpen} onOpenChange={setSearchOpen} />
    </>
  )
}
