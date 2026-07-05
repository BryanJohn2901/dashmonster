import { Users } from 'lucide-react'
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { LeadCard } from './LeadCard'
import type { LeadRow } from '@/lib/actions/leads'

interface LeadListProps {
  leads: LeadRow[]
  onEdit: (lead: LeadRow) => void
  onDelete: (lead: LeadRow) => void
}

export function LeadList({ leads, onEdit, onDelete }: LeadListProps) {
  if (leads.length === 0) {
    return (
      <div
        className="flex h-64 flex-col items-center justify-center gap-4 rounded-[20px] border border-dashed text-center"
        style={{ borderColor: 'rgba(216,222,227,0.12)', background: '#151A20' }}
      >
        <div
          className="flex h-14 w-14 items-center justify-center rounded-2xl"
          style={{ background: 'rgba(216,222,227,0.06)' }}
        >
          <Users className="h-6 w-6 text-slate" />
        </div>
        <div>
          <p className="text-[15px] font-semibold text-[#F7F9FA]">Nenhum lead encontrado</p>
          <p className="mt-1 text-sm text-slate">Ajuste os filtros ou crie um novo lead.</p>
        </div>
      </div>
    )
  }

  return (
    <div
      className="overflow-hidden rounded-[20px]"
      style={{
        background: '#151A20',
        border: '1px solid rgba(216,222,227,0.09)',
      }}
    >
      <Table>
        <TableHeader>
          <TableRow
            className="hover:bg-transparent"
            style={{ borderBottom: '1px solid rgba(216,222,227,0.07)' }}
          >
            <TableHead
              className="h-11 text-[11px] font-semibold uppercase tracking-[0.06em] text-slate/70 px-4"
              style={{ background: 'rgba(216,222,227,0.025)' }}
            >
              Nome
            </TableHead>
            <TableHead
              className="h-11 text-[11px] font-semibold uppercase tracking-[0.06em] text-slate/70 px-4"
              style={{ background: 'rgba(216,222,227,0.025)' }}
            >
              Empresa
            </TableHead>
            <TableHead
              className="h-11 text-[11px] font-semibold uppercase tracking-[0.06em] text-slate/70 px-4"
              style={{ background: 'rgba(216,222,227,0.025)' }}
            >
              Status
            </TableHead>
            <TableHead
              className="hidden lg:table-cell h-11 text-[11px] font-semibold uppercase tracking-[0.06em] text-slate/70 px-4"
              style={{ background: 'rgba(216,222,227,0.025)' }}
            >
              Telefone
            </TableHead>
            <TableHead
              className="hidden md:table-cell h-11 text-[11px] font-semibold uppercase tracking-[0.06em] text-slate/70 px-4"
              style={{ background: 'rgba(216,222,227,0.025)' }}
            >
              Responsável
            </TableHead>
            <TableHead
              className="hidden xl:table-cell h-11 text-[11px] font-semibold uppercase tracking-[0.06em] text-slate/70 px-4"
              style={{ background: 'rgba(216,222,227,0.025)' }}
            >
              Criado em
            </TableHead>
            <TableHead
              className="h-11 px-4"
              style={{ background: 'rgba(216,222,227,0.025)' }}
            >
              <span className="sr-only">Ações</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {leads.map((lead) => (
            <LeadCard key={lead.id} lead={lead} onEdit={onEdit} onDelete={onDelete} />
          ))}
        </TableBody>
      </Table>

      <div
        className="flex items-center justify-between px-5 py-3"
        style={{ borderTop: '1px solid rgba(216,222,227,0.07)' }}
      >
        <p className="text-[12px] text-slate">
          {leads.length} {leads.length === 1 ? 'lead' : 'leads'}
        </p>
      </div>
    </div>
  )
}
