'use client'

import Link from 'next/link'
import { MoreHorizontal, Pencil, Trash2, MessageSquare } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { buttonVariants } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { TableCell, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { LeadStatusBadge } from './LeadStatusBadge'
import type { LeadRow } from '@/lib/actions/leads'

interface LeadCardProps {
  lead: LeadRow
  onEdit: (lead: LeadRow) => void
  onDelete: (lead: LeadRow) => void
}

function getInitials(name: string) {
  return name
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
}

export function LeadCard({ lead, onEdit, onDelete }: LeadCardProps) {
  const createdAt = format(parseISO(lead.created_at), 'dd MMM yyyy', { locale: ptBR })
  const ownerName = lead.owner_profile?.full_name ?? 'Usuário'

  return (
    <TableRow
      className="group h-16 transition-colors duration-150"
      style={{ borderBottom: '1px solid rgba(216,222,227,0.06)' }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(198,244,50,0.025)' }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
    >
      {/* Name / email */}
      <TableCell className="px-4">
        <Link href={`/crm/leads/${lead.id}`} className="group/link flex items-center gap-3">
          <Avatar className="h-8 w-8 flex-shrink-0">
            <AvatarFallback
              className="text-[11px] font-semibold text-bunker"
              style={{ background: '#c6f432' }}
            >
              {getInitials(lead.name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[#F7F9FA] transition-colors group-hover/link:text-canary">
              {lead.name}
            </p>
            <p className="truncate text-xs text-slate">{lead.email ?? '-'}</p>
          </div>
        </Link>
      </TableCell>

      {/* Company */}
      <TableCell className="px-4">
        <p className="truncate text-sm font-medium text-geyser">
          {lead.company_record?.name ?? lead.company ?? '-'}
        </p>
        {lead.job_title && <p className="truncate text-xs text-slate">{lead.job_title}</p>}
      </TableCell>

      {/* Status */}
      <TableCell className="px-4">
        <LeadStatusBadge status={lead.status} />
      </TableCell>

      {/* Phone */}
      <TableCell className="hidden px-4 lg:table-cell">
        <p className="whitespace-nowrap text-sm text-slate">{lead.phone ?? '-'}</p>
      </TableCell>

      {/* Owner */}
      <TableCell className="hidden px-4 md:table-cell">
        <div className="flex items-center gap-2">
          <Avatar className="h-6 w-6 flex-shrink-0">
            <AvatarFallback className="text-[10px] font-semibold" style={{ background: 'rgba(216,222,227,0.10)', color: '#D8DEE3' }}>
              {getInitials(ownerName)}
            </AvatarFallback>
          </Avatar>
          <span className="truncate text-sm text-slate">{ownerName}</span>
        </div>
      </TableCell>

      {/* Created at */}
      <TableCell className="hidden px-4 xl:table-cell">
        <p className="whitespace-nowrap text-sm text-slate">{createdAt}</p>
      </TableCell>

      {/* Actions */}
      <TableCell className="px-4 text-right">
        <div className="flex items-center justify-end gap-1.5">
          <Link
            href={`/crm/inbox`}
            className={cn(
              buttonVariants({ variant: 'ghost', size: 'icon-sm' }),
              'text-slate/50 opacity-100 transition-all duration-150 hover:text-canary sm:opacity-0 sm:group-hover:opacity-100',
              'rounded-[10px] h-9 w-9 bg-white/[0.04]',
            )}
            title="Abrir no Inbox"
          >
            <MessageSquare className="h-4 w-4" />
            <span className="sr-only">Mensagens</span>
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger
              className={cn(
                buttonVariants({ variant: 'ghost', size: 'icon-sm' }),
                'text-slate/50 opacity-100 transition-all duration-150 hover:text-canary sm:opacity-0 sm:group-hover:opacity-100 aria-expanded:opacity-100',
                'rounded-[10px] h-9 w-9',
              )}
              style={{ background: 'rgba(216,222,227,0.04)' }}
            >
              <MoreHorizontal className="h-4 w-4" />
              <span className="sr-only">Ações do lead</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onClick={() => onEdit(lead)}>
                <Pencil className="mr-2 h-3.5 w-3.5" />
                Editar
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-danger focus:text-danger"
                onClick={() => onDelete(lead)}
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" />
                Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TableCell>
    </TableRow>
  )
}
