'use client'

import { useState } from 'react'
import { ArrowRightLeft, CheckCircle2, Clock, FileText, MessageSquare, PlusCircle, Search, User, type LucideIcon } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import type { DealHistory } from '@/types/supabase'

interface HistoryTabProps {
  history: DealHistory[]
}

const EVENT_ICONS: Record<string, LucideIcon> = {
  stage_change: ArrowRightLeft,
  activity_completed: CheckCircle2,
  status_change: CheckCircle2,
  owner_change: User,
  note_added: MessageSquare,
  contact_updated: User,
  company_updated: FileText,
  field_updated: FileText,
  deal_created: PlusCircle,
}

const EVENT_COLORS: Record<string, string> = {
  stage_change: 'text-blue-500 bg-blue-500/10',
  activity_completed: 'text-green-500 bg-green-500/10',
  status_change: 'text-purple-500 bg-purple-500/10',
  owner_change: 'text-amber-500 bg-amber-500/10',
  note_added: 'text-indigo-500 bg-indigo-500/10',
  deal_created: 'text-emerald-500 bg-emerald-500/10',
}

function formatEventType(eventType: string) {
  const labels: Record<string, string> = {
    stage_change: 'Mudança de etapa',
    activity_completed: 'Atividade',
    status_change: 'Mudança de status',
    owner_change: 'Responsável alterado',
    note_added: 'Nota adicionada',
    contact_updated: 'Contato atualizado',
    company_updated: 'Empresa atualizada',
    field_updated: 'Campo atualizado',
    deal_created: 'Negócio criado',
  }

  return labels[eventType] ?? eventType.split('_').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
}

export function HistoryTab({ history }: HistoryTabProps) {
  const [search, setSearch] = useState('')
  const filteredHistory = history.filter((event) =>
    event.details?.toLowerCase().includes(search.toLowerCase()) ||
    event.event_type.toLowerCase().includes(search.toLowerCase()) ||
    event.old_value?.toLowerCase().includes(search.toLowerCase()) ||
    event.new_value?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="border-b border-border/10 bg-primary/5 px-6 py-4">
        <h3 className="mb-4 text-[13px] font-bold uppercase tracking-widest text-primary/80">Histórico</h3>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar no histórico..."
            className="h-10 w-full rounded-xl border border-border/40 bg-background pl-10 pr-4 text-sm outline-none transition-all focus:border-primary/50"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 scrollbar-none">
        <div className="relative space-y-6 before:absolute before:bottom-2 before:left-[17px] before:top-2 before:w-px before:bg-border/40">
          {filteredHistory.length === 0 ? (
            <div className="py-10 text-center text-sm italic text-muted-foreground/30">
              Nenhum evento encontrado.
            </div>
          ) : (
            filteredHistory.map((event) => {
              const Icon = EVENT_ICONS[event.event_type] || Clock
              const colorClass = EVENT_COLORS[event.event_type] || 'text-muted-foreground bg-muted/10'

              return (
                <div key={event.id} className="relative pl-12">
                  <div className={cn(
                    'absolute left-0 top-0 z-10 flex h-9 w-9 items-center justify-center rounded-full border-4 border-background ring-1 ring-border/20',
                    colorClass
                  )}>
                    <Icon className="h-4 w-4" />
                  </div>

                  <div className="flex flex-col">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="text-[13px] font-bold text-foreground">{formatEventType(event.event_type)}</span>
                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground/60">
                        <Clock className="h-2.5 w-2.5" />
                        {formatDistanceToNow(new Date(event.created_at), { addSuffix: true, locale: ptBR })}
                      </span>
                    </div>

                    {event.details && (
                      <p className="rounded-xl border border-border/5 bg-muted/5 p-3 text-[12px] leading-relaxed text-muted-foreground/70">
                        {event.details}
                      </p>
                    )}

                    {(event.old_value || event.new_value) && (
                      <div className="mt-2 flex items-center gap-2 text-[10px]">
                        {event.old_value && <span className="line-through text-muted-foreground/60">{event.old_value}</span>}
                        {event.old_value && <ArrowRightLeft className="h-2 w-2 text-muted-foreground/20" />}
                        <span className="font-bold text-primary">{event.new_value}</span>
                      </div>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
