'use client'

// signOut: supabaseClient direto (sem server action); volta pro hub.

import { LogOut, Settings, UserRound } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { supabaseClient } from '@/lib/supabase'

interface UserMenuProps {
  user: { name: string; email: string; avatarUrl?: string | null } | null
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase()
}

export function UserMenu({ user }: UserMenuProps) {
  const displayName = user?.name ?? 'Usuário'
  const displayEmail = user?.email ?? ''
  const initials = getInitials(displayName)
  const avatarSrc = user?.avatarUrl || '/brand/pipeflow-icon.svg'

  async function handleSignOut() {
    if (supabaseClient) await supabaseClient.auth.signOut()
    window.location.href = '/'
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left transition-all duration-200 hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-canary/20"
      >
        <Avatar size="sm" className="flex-shrink-0">
          <AvatarImage src={avatarSrc} alt={displayName} />
          <AvatarFallback
            className="text-[11px] font-bold text-bunker"
            style={{ background: '#c6f432' }}
          >
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-[#F7F9FA]">{displayName}</p>
          <p className="truncate text-[11px] text-slate">{displayEmail}</p>
        </div>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" side="top" sideOffset={6} className="w-52">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate/60">
            Minha conta
          </DropdownMenuLabel>
          <DropdownMenuItem className="gap-2.5 py-2 text-sm" onClick={() => { window.location.href = '/' }}>
            <UserRound className="h-4 w-4 text-slate" />
            <span>Perfil (Monster Hub)</span>
          </DropdownMenuItem>
          <DropdownMenuItem className="gap-2.5 py-2 text-sm" onClick={() => { window.location.href = '/crm/config' }}>
            <Settings className="h-4 w-4 text-slate" />
            <span>Configurações</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="gap-2.5 py-2 text-sm text-danger focus:text-danger"
          onClick={handleSignOut}
        >
          <LogOut className="h-4 w-4" />
          <span>Sair</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
