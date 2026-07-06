'use client'

// Port fiel de pipeflow-crm/components/layout/Header.tsx (header mobile + sheet).

import { useState } from 'react'
import { Menu, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { CommandPalette } from './CommandPalette'
import { SidebarNav } from './SidebarNav'
import { WorkspaceSwitcher, type WorkspaceItem } from './WorkspaceSwitcher'
import { UserMenu } from './UserMenu'
import { PipeFlowLogo } from './PipeFlowLogo'
import { NotificationBell } from './NotificationBell'

interface HeaderProps {
  companyId: string
  workspaces: WorkspaceItem[]
  currentWorkspaceId: string
  onSwitchWorkspace: (id: string) => void
  user: { name: string; email: string; avatarUrl: string | null } | null
  pipelines: { id: string; name: string }[]
  inboxUnreadCount: number
  onCreatePipeline?: () => void
}

export function Header({
  companyId,
  workspaces,
  currentWorkspaceId,
  onSwitchWorkspace,
  user,
  pipelines,
  inboxUnreadCount,
  onCreatePipeline,
}: HeaderProps) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)

  return (
    <>
      {/* Mobile-only header — hidden on desktop (lg+) */}
      <header
        className="sticky top-0 z-40 flex h-[52px] flex-shrink-0 items-center gap-3 px-4 lg:hidden"
        style={{
          background: 'rgba(11,13,17,0.92)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderBottom: '1px solid rgba(216,222,227,0.08)',
        }}
      >
        {/* Hamburger */}
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 flex-shrink-0 rounded-xl text-slate hover:text-geyser"
          style={{ background: 'rgba(216,222,227,0.05)' }}
          onClick={() => setMobileOpen(true)}
          aria-label="Abrir menu"
        >
          <Menu className="h-[18px] w-[18px]" />
        </Button>

        {/* App name */}
        <span className="text-[15px] font-bold text-[#F7F9FA] tracking-tight">PipeFlow CRM</span>

        <div className="flex-1" />

        {/* Search icon */}
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 flex-shrink-0 rounded-xl text-slate hover:text-geyser"
          style={{ background: 'rgba(216,222,227,0.05)' }}
          onClick={() => setSearchOpen(true)}
          aria-label="Buscar"
        >
          <Search className="h-[18px] w-[18px]" />
        </Button>

        {/* Bell (mobile) */}
        <NotificationBell companyId={companyId} />
      </header>

      {/* Busca global */}
      <CommandPalette companyId={companyId} open={searchOpen} onOpenChange={setSearchOpen} />

      {/* Mobile sheet */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="left"
          showCloseButton={false}
          className="flex w-[272px] flex-col gap-0 bg-bunker p-0"
          style={{ borderRight: '1px solid rgba(216,222,227,0.08)' }}
        >
          <SheetHeader
            className="flex h-[72px] flex-row items-center px-5 py-0"
            style={{ borderBottom: '1px solid rgba(216,222,227,0.08)' }}
          >
            <PipeFlowLogo variant="sidebar" />
            <SheetTitle className="sr-only">Menu de navegação</SheetTitle>
          </SheetHeader>

          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto py-4 scrollbar-none">
              <SidebarNav
                onItemClick={() => setMobileOpen(false)}
                pipelines={pipelines}
                inboxUnreadCount={inboxUnreadCount}
                onCreatePipeline={onCreatePipeline}
              />
            </div>

            <div className="flex-shrink-0 space-y-1 p-3" style={{ borderTop: '1px solid rgba(216,222,227,0.08)' }}>
              <WorkspaceSwitcher
                workspaces={workspaces}
                currentWorkspaceId={currentWorkspaceId}
                onSwitch={onSwitchWorkspace}
              />
              <div className="my-1.5 h-px" style={{ background: 'rgba(216,222,227,0.07)' }} />
              <UserMenu user={user} />
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
