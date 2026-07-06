'use client'

import { useState, useTransition, useEffect } from 'react'
import { X, Calendar, Clock, User, Flag, Save, Building2, Bell } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { createDealActivity } from '@/lib/actions/playbook'
import { getDealsForSelect, type DealForSelect } from '@/lib/actions/deals'
import { toast } from 'sonner'

const ACTIVITY_TYPES = [
  { value: 'call',      label: 'Ligação' },
  { value: 'email',     label: 'E-mail' },
  { value: 'whatsapp',  label: 'WhatsApp' },
  { value: 'meeting',   label: 'Reunião' },
  { value: 'task',      label: 'Tarefa' },
  { value: 'proposal',  label: 'Proposta' },
] as const

const PRIORITY_OPTIONS = [
  { value: 'low',    label: 'Baixa' },
  { value: 'normal', label: 'Normal' },
  { value: 'high',   label: 'Alta' },
  { value: 'urgent', label: 'Urgente' },
] as const

const REMINDER_OPTIONS = [
  { value: null,  label: 'Sem lembrete' },
  { value: 15,   label: '15 min antes' },
  { value: 60,   label: '1 hora antes' },
  { value: 1440, label: '1 dia antes' },
] as const

type ReminderOffset = typeof REMINDER_OPTIONS[number]['value']

function addMinutes(iso: string, minutes: number): string {
  const d = new Date(iso)
  d.setMinutes(d.getMinutes() + minutes)
  return d.toISOString()
}

function toLocalDateTimeValue(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

interface QuickCreateActivityModalProps {
  initialDate?: string
  members: { id: string; name: string }[]
  currentUserId: string
  onClose: () => void
  onCreated: () => void
}

export function QuickCreateActivityModal({
  initialDate,
  members,
  currentUserId,
  onClose,
  onCreated,
}: QuickCreateActivityModalProps) {
  const defaultDate = initialDate
    ? toLocalDateTimeValue(initialDate)
    : toLocalDateTimeValue(new Date().toISOString())

  const [title, setTitle] = useState('')
  const [activityType, setActivityType] = useState<string>('call')
  const [startAt, setStartAt] = useState(defaultDate)
  const [assignedTo, setAssignedTo] = useState(currentUserId)
  const [priority, setPriority] = useState<string>('normal')
  const [dealId, setDealId] = useState<string>('')
  const [deals, setDeals] = useState<DealForSelect[]>([])
  const [dealsLoading, setDealsLoading] = useState(true)
  const [reminderOffset, setReminderOffset] = useState<ReminderOffset>(60)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    getDealsForSelect().then((res) => {
      setDeals(res)
      setDealsLoading(false)
    })
  }, [])

  function handleSave() {
    if (!title.trim()) { toast.error('Informe o título da atividade'); return }
    if (!dealId) { toast.error('Selecione um negócio'); return }
    if (!startAt) { toast.error('Informe a data e hora'); return }

    const startIso = new Date(startAt).toISOString()
    const reminderIso = reminderOffset !== null ? addMinutes(startIso, -reminderOffset) : undefined

    startTransition(async () => {
      const res = await createDealActivity({
        deal_id: dealId,
        title: title.trim(),
        activity_type: activityType as 'call',
        scheduled_start_at: startIso,
        due_date: startIso,
        assigned_to: assignedTo || null,
        priority,
        // null explícito quando "Sem lembrete" → respeita o opt-out (o default
        // do servidor só age quando reminder_at vem undefined).
        reminder_at: reminderIso ?? null,
        day_offset: 0,
        is_custom: true,
      })
      if (res.error) { toast.error(res.error); return }
      toast.success('Atividade criada!')
      onCreated()
    })
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-md rounded-2xl border border-border/50 bg-background shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/30 px-5 py-4">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-bold text-foreground">Nova Atividade</h3>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-muted-foreground/60 hover:bg-white/5 hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 p-5">

          {/* Title */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">Título</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Ligar para cliente..."
              autoFocus
              className="h-9 w-full rounded-lg border border-border/40 bg-card/60 px-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
            />
          </div>

          {/* Activity Type */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">Tipo</label>
            <div className="flex flex-wrap gap-1.5">
              {ACTIVITY_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setActivityType(t.value)}
                  className={cn(
                    'rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition-all',
                    activityType === t.value
                      ? 'border-primary/40 bg-primary/15 text-primary'
                      : 'border-border/30 text-muted-foreground/60 hover:border-border/60 hover:text-foreground'
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Deal */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
              <Building2 className="h-3 w-3" /> Negócio
            </label>
            <select
              value={dealId}
              onChange={(e) => setDealId(e.target.value)}
              disabled={dealsLoading}
              className="h-9 w-full rounded-lg border border-border/40 bg-card/60 px-3 text-sm text-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 disabled:opacity-50"
            >
              <option value="">{dealsLoading ? 'Carregando...' : 'Selecionar negócio...'}</option>
              {deals.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title}{d.lead_name ? ` — ${d.lead_name}` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Date + Time */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
              <Clock className="h-3 w-3" /> Data e Hora
            </label>
            <input
              type="datetime-local"
              value={startAt}
              onChange={(e) => setStartAt(e.target.value)}
              className="h-9 w-full rounded-lg border border-border/40 bg-card/60 px-3 text-sm text-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 [color-scheme:dark]"
            />
          </div>

          {/* Reminder */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
              <Bell className="h-3 w-3" /> Lembrete
            </label>
            <div className="flex flex-wrap gap-1.5">
              {REMINDER_OPTIONS.map((opt) => (
                <button
                  key={String(opt.value)}
                  type="button"
                  onClick={() => setReminderOffset(opt.value)}
                  className={cn(
                    'rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition-all',
                    reminderOffset === opt.value
                      ? 'border-primary/40 bg-primary/15 text-primary'
                      : 'border-border/30 text-muted-foreground/60 hover:border-border/60 hover:text-foreground'
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Assignee + Priority */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
                <User className="h-3 w-3" /> Responsável
              </label>
              <select
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                className="h-9 w-full rounded-lg border border-border/40 bg-card/60 px-3 text-sm text-foreground focus:border-primary/50 focus:outline-none"
              >
                <option value="">Nenhum</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
                <Flag className="h-3 w-3" /> Prioridade
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="h-9 w-full rounded-lg border border-border/40 bg-card/60 px-3 text-sm text-foreground focus:border-primary/50 focus:outline-none"
              >
                {PRIORITY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-border/30 px-5 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-border/40 px-4 py-2 text-xs font-medium text-muted-foreground/60 transition-colors hover:bg-white/5 hover:text-foreground"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={isPending || !title.trim() || !dealId || !startAt}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white transition-all hover:bg-primary/90 disabled:opacity-50"
          >
            <Save className="h-3 w-3" />
            {isPending ? 'Criando...' : 'Criar Atividade'}
          </button>
        </div>
      </div>
    </div>
  )
}
