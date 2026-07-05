'use client'

// Port fiel de pipeflow-crm/components/layout/WorkspaceSwitcher.tsx.
// Workspaces → EMPRESAS do Monster Hub (useCompany). Criar workspace saiu:
// empresa nasce no hub (super admin); item final leva de volta ao hub.

import { useState, useTransition } from 'react'
import { Check, ChevronsUpDown, ExternalLink, Loader2 } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export interface WorkspaceItem {
  id: string
  name: string
  initials: string
  /** Empresa tem o PipeFlow contratado? Sem 'pipe' o item fica desabilitado. */
  hasPipe: boolean
}

interface WorkspaceSwitcherProps {
  workspaces: WorkspaceItem[]
  currentWorkspaceId: string
  onSwitch: (id: string) => void
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
}

export function WorkspaceSwitcher({ workspaces, currentWorkspaceId, onSwitch }: WorkspaceSwitcherProps) {
  const [isPending, startTransition] = useTransition()
  const [currentId, setCurrentId] = useState(currentWorkspaceId)

  const enriched = workspaces.map((w) => ({
    ...w,
    initials: w.initials || getInitials(w.name),
  }))

  const current = enriched.find((w) => w.id === currentId) ?? enriched[0]

  function handleSwitch(id: string) {
    if (id === currentId) return
    setCurrentId(id)
    startTransition(() => {
      onSwitch(id)
    })
  }

  if (!current) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left transition-all duration-200 hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-canary/20">
        {/* Company avatar */}
        <span
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-[11px] font-bold text-bunker"
          style={{ background: '#c6f432' }}
        >
          {current.initials}
        </span>
        <span className="flex-1 truncate text-[13px] font-medium text-[#F7F9FA]">
          {current.name}
        </span>
        {isPending ? (
          <Loader2 className="h-3.5 w-3.5 flex-shrink-0 animate-spin text-slate" />
        ) : (
          <ChevronsUpDown className="h-3.5 w-3.5 flex-shrink-0 text-slate/50" />
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" sideOffset={6} className="min-w-[230px]">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate/60">
            Empresas
          </DropdownMenuLabel>

          {enriched.map((ws) => (
            <DropdownMenuItem
              key={ws.id}
              onClick={() => ws.hasPipe && handleSwitch(ws.id)}
              className="flex items-center gap-2.5 py-2"
              disabled={!ws.hasPipe}
            >
              <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md text-[10px] font-bold text-bunker" style={{ background: '#c6f432' }}>
                {ws.initials}
              </span>
              <span className="flex-1 text-sm">{ws.name}</span>
              {!ws.hasPipe && (
                <span className="text-[9px] font-semibold uppercase text-slate/50">sem CRM</span>
              )}
              {ws.id === currentId && <Check className="h-3.5 w-3.5 text-canary" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          className="gap-2.5 py-2 text-slate/70"
          onClick={() => { window.location.href = '/' }}
        >
          <span
            className="flex h-6 w-6 items-center justify-center rounded-md"
            style={{ border: '1px dashed rgba(216,222,227,0.20)' }}
          >
            <ExternalLink className="h-3 w-3" />
          </span>
          <span className="text-sm">Monster Hub</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
