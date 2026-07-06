'use client'

import { useState, useTransition } from 'react'
import { X, Clock, Calendar, User, Flag, Bell, FileText, Save } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import type { DealActivity, PlaybookActivityType } from '@/types/supabase'
import { updateDealActivity } from '@/lib/actions/playbook'
import { ACTIVITY_TYPE_DEFAULTS } from '@/lib/utils/playbook-constants'
import { toast } from 'sonner'
import { ActivityIcon } from './ActivityEditorModal'

// ── Constants ──────────────────────────────────────────────────────────────────

const PRIORITY_OPTIONS = [
  { value: 'low',    label: 'Baixa',   color: 'text-slate-400 bg-slate-500/10 border-slate-500/20' },
  { value: 'normal', label: 'Normal',  color: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
  { value: 'high',   label: 'Alta',    color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
  { value: 'urgent', label: 'Urgente', color: 'text-red-400 bg-red-500/10 border-red-500/20' },
] as const

type Priority = typeof PRIORITY_OPTIONS[number]['value']

const DURATION_OPTIONS = [
  { value: 15,    label: '15 min' },
  { value: 30,    label: '30 min' },
  { value: 60,    label: '1 hora' },
  { value: 120,   label: '2 horas' },
  { value: 480,   label: 'Dia inteiro' },
  { value: 0,     label: 'Sem fim' },
]

const REMINDER_OPTIONS = [
  { value: null,  label: 'Sem lembrete' },
  { value: 15,   label: '15 min antes' },
  { value: 60,   label: '1 hora antes' },
  { value: 1440, label: '1 dia antes' },
] as const

type ReminderOffset = typeof REMINDER_OPTIONS[number]['value']

const TYPE_COLOR_MAP: Record<string, string> = {
  call:      'text-blue-400 bg-blue-500/10',
  email:     'text-indigo-400 bg-indigo-500/10',
  whatsapp:  'text-green-400 bg-green-500/10',
  instagram: 'text-pink-400 bg-pink-500/10',
  social:    'text-cyan-400 bg-cyan-500/10',
  meeting:   'text-violet-400 bg-violet-500/10',
  task:      'text-amber-400 bg-amber-500/10',
  proposal:  'text-orange-400 bg-orange-500/10',
  closure:   'text-rose-400 bg-rose-500/10',
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function toLocalDateTimeValue(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function addMinutes(iso: string, minutes: number): string {
  const d = new Date(iso)
  d.setMinutes(d.getMinutes() + minutes)
  return d.toISOString()
}

// Returns the REMINDER_OPTIONS offset that matches an existing reminder_at, or null.
function inferReminderOffset(startAt: string | null | undefined, reminderAt: string | null | undefined): ReminderOffset {
  if (!startAt || !reminderAt) return null
  const diffMin = Math.round((new Date(startAt).getTime() - new Date(reminderAt).getTime()) / 60000)
  const valid: ReminderOffset[] = [15, 60, 1440]
  return (valid as number[]).includes(diffMin) ? (diffMin as ReminderOffset) : null
}

// ── Component ──────────────────────────────────────────────────────────────────

interface ActivityScheduleModalProps {
  activity: DealActivity
  members: { id: string; name: string }[]
  onClose: () => void
  onSaved: (updated: DealActivity) => void
}

export function ActivityScheduleModal({
  activity,
  members,
  onClose,
  onSaved,
}: ActivityScheduleModalProps) {
  const meta = ACTIVITY_TYPE_DEFAULTS[activity.activity_type]
  const typeColor = TYPE_COLOR_MAP[activity.activity_type] ?? 'text-muted-foreground bg-muted/10'

  // Form state — initialise from existing activity data
  const [startAt, setStartAt] = useState(
    toLocalDateTimeValue(activity.scheduled_start_at ?? activity.due_date)
  )
  const [durationMinutes, setDurationMinutes] = useState<number>(60)
  const [customDuration, setCustomDuration] = useState('')
  const [showCustomDuration, setShowCustomDuration] = useState(false)
  const [assignedTo, setAssignedTo] = useState<string>(activity.assigned_to ?? '')
  const [priority, setPriority] = useState<Priority>((activity.priority as Priority) ?? 'normal')
  const [reminderOffset, setReminderOffset] = useState<ReminderOffset>(() =>
    inferReminderOffset(activity.scheduled_start_at ?? activity.due_date, activity.reminder_at)
  )
  const [notes, setNotes] = useState(activity.notes ?? '')
  const [isPending, startTransition] = useTransition()

  function handleDurationSelect(minutes: number) {
    setDurationMinutes(minutes)
    setShowCustomDuration(false)
    setCustomDuration('')
  }

  function handleSave() {
    if (!startAt) { toast.error('Informe a data/hora de início'); return }

    const startIso = new Date(startAt).toISOString()

    // Compute end time
    const effectiveDuration = showCustomDuration ? parseInt(customDuration) || 0 : durationMinutes
    const endIso = effectiveDuration > 0 ? addMinutes(startIso, effectiveDuration) : null

    // Compute reminder
    let reminderIso: string | null = null
    if (reminderOffset !== null) {
      reminderIso = addMinutes(startIso, -reminderOffset)
    }

    startTransition(async () => {
      const res = await updateDealActivity(activity.id, {
        scheduled_start_at: startIso,
        scheduled_end_at: endIso ?? null,
        due_date: startIso,
        assigned_to: assignedTo || null,
        priority,
        reminder_at: reminderIso,
        notes: notes.trim() || null,
      })
      if (res.error) { toast.error(res.error); return }
      toast.success('Atividade agendada!')
      onSaved({
        ...activity,
        scheduled_start_at: startIso,
        scheduled_end_at: endIso,
        due_date: startIso,
        assigned_to: assignedTo || null,
        priority,
        reminder_at: reminderIso,
        notes: notes.trim() || null,
      })
    })
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-md rounded-2xl border border-border/50 bg-background shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/30 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className={cn('flex h-7 w-7 items-center justify-center rounded-lg text-sm', typeColor)}>
              <ActivityIcon activityType={activity.activity_type as PlaybookActivityType} iconKey={activity.icon_key} className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground leading-none">{activity.title}</h3>
              <p className="mt-0.5 text-[10px] text-muted-foreground/60">{meta?.label ?? activity.activity_type}</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-muted-foreground/60 hover:bg-white/5 hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-5 p-5">

          {/* Date & Time */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
              <Calendar className="h-3 w-3" /> Data e Hora de Início
            </label>
            <input
              type="datetime-local"
              value={startAt}
              onChange={(e) => setStartAt(e.target.value)}
              className="h-9 w-full rounded-lg border border-border/40 bg-card/60 px-3 text-sm text-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 [color-scheme:dark]"
            />
          </div>

          {/* Duration */}
          <div className="space-y-2">
            <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
              <Clock className="h-3 w-3" /> Duração
            </label>
            <div className="flex flex-wrap gap-1.5">
              {DURATION_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleDurationSelect(opt.value)}
                  className={cn(
                    'rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition-all',
                    !showCustomDuration && durationMinutes === opt.value
                      ? 'border-primary/40 bg-primary/15 text-primary'
                      : 'border-border/30 text-muted-foreground/60 hover:border-border/60 hover:text-foreground'
                  )}
                >
                  {opt.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => { setShowCustomDuration(true); setCustomDuration('') }}
                className={cn(
                  'rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition-all',
                  showCustomDuration
                    ? 'border-primary/40 bg-primary/15 text-primary'
                    : 'border-border/30 text-muted-foreground/60 hover:border-border/60 hover:text-foreground'
                )}
              >
                Personalizado
              </button>
            </div>
            {showCustomDuration && (
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={480}
                  value={customDuration}
                  onChange={(e) => setCustomDuration(e.target.value)}
                  placeholder="Ex: 45"
                  className="h-8 w-24 rounded-lg border border-border/40 bg-card/60 px-3 text-sm text-foreground focus:border-primary/50 focus:outline-none"
                />
                <span className="text-xs text-muted-foreground/60">minutos</span>
              </div>
            )}
          </div>

          {/* Assigned To + Priority row */}
          <div className="grid grid-cols-2 gap-3">
            {/* Assigned To */}
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
                <User className="h-3 w-3" /> Responsável
              </label>
              <select
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                className="h-9 w-full rounded-lg border border-border/40 bg-card/60 px-3 text-sm text-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
              >
                <option value="">Nenhum</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>

            {/* Priority */}
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
                <Flag className="h-3 w-3" /> Prioridade
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
                className="h-9 w-full rounded-lg border border-border/40 bg-card/60 px-3 text-sm text-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
              >
                {PRIORITY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
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

          {/* Notes */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
              <FileText className="h-3 w-3" /> Observações
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Anotações livres sobre esta atividade..."
              className="w-full resize-none rounded-lg border border-border/40 bg-card/60 px-3 py-2.5 text-[12.5px] text-foreground placeholder:text-muted-foreground/60 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 leading-relaxed"
            />
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
            disabled={isPending || !startAt}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white transition-all hover:bg-primary/90 disabled:opacity-50"
          >
            <Save className="h-3 w-3" />
            {isPending ? 'Agendando...' : 'Agendar'}
          </button>
        </div>
      </div>
    </div>
  )
}
