import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { Database } from '@/types/supabase'

type DbLeadStatus = Database['public']['Enums']['lead_status']

export const LEAD_STATUS_LABELS: Record<DbLeadStatus, string> = {
  new: 'Novo Lead',
  contacted: 'Contatado',
  proposal: 'Proposta Enviada',
  negotiation: 'Negociação',
  won: 'Fechado Ganho',
  lost: 'Fechado Perdido',
}

const STATUS_STYLES: Record<DbLeadStatus, string> = {
  new:         'bg-[rgba(125,211,252,0.12)] text-info   border-[rgba(125,211,252,0.22)]',
  contacted:   'bg-[rgba(198,244,50,0.12)] text-canary border-[rgba(198,244,50,0.28)]',
  proposal:    'bg-[rgba(216,222,227,0.08)] text-geyser border-[rgba(216,222,227,0.16)]',
  negotiation: 'bg-[rgba(255,209,102,0.12)] text-warning border-[rgba(255,209,102,0.22)]',
  won:         'bg-[rgba(128,237,153,0.12)] text-success border-[rgba(128,237,153,0.22)]',
  lost:        'bg-[rgba(255,107,107,0.12)] text-danger  border-[rgba(255,107,107,0.22)]',
}

interface LeadStatusBadgeProps {
  status: DbLeadStatus
  className?: string
}

export function LeadStatusBadge({ status, className }: LeadStatusBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'h-[26px] px-2.5 py-0 text-[11px] font-semibold border',
        STATUS_STYLES[status],
        className
      )}
    >
      <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full opacity-80 flex-shrink-0" style={{ background: 'currentColor' }} />
      {LEAD_STATUS_LABELS[status]}
    </Badge>
  )
}
