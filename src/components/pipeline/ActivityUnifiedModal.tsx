'use client'

import { useState, useTransition } from 'react'
import {
  Phone, Mail, MessageCircle, Calendar, CheckSquare,
  FileText, Share2, Flag, Zap, X, Save, Trash2,
  User, Bell,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import type { DealActivity, PlaybookActivityType } from '@/types/supabase'
import { updateDealActivity, deleteDealActivity } from '@/lib/actions/playbook'
import { ACTIVITY_TYPE_DEFAULTS } from '@/lib/utils/playbook-constants'
import { toast } from 'sonner'
import { handleScriptRichPaste } from './ScriptFormatting'

// ── Icon registry (re-exported for consumers) ──────────────────────────────────

const ICON_MAP: Record<string, LucideIcon> = {
  phone:       Phone,
  mail:        Mail,
  whatsapp:    MessageCircle,
  instagram:   FileText,
  share:       Share2,
  calendar:    Calendar,
  check:       CheckSquare,
  'file-text': FileText,
  flag:        Flag,
  zap:         Zap,
}

export function ActivityIcon({
  iconKey,
  activityType,
  className,
}: {
  iconKey?: string | null
  activityType: PlaybookActivityType
  className?: string
}) {
  const key = iconKey ?? ACTIVITY_TYPE_DEFAULTS[activityType]?.icon ?? 'zap'
  const Icon = ICON_MAP[key] ?? Zap
  return <Icon className={className} />
}

// ── Constants ──────────────────────────────────────────────────────────────────

const TYPE_OPTIONS: { value: PlaybookActivityType; label: string; color: string }[] = [
  { value: 'call',      label: 'Ligação',      color: 'text-blue-400 bg-blue-500/10 border-blue-500/30' },
  { value: 'whatsapp',  label: 'WhatsApp',     color: 'text-green-400 bg-green-500/10 border-green-500/30' },
  { value: 'email',     label: 'E-mail',       color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/30' },
  { value: 'social',    label: 'Social',       color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30' },
  { value: 'instagram', label: 'Instagram',    color: 'text-pink-400 bg-pink-500/10 border-pink-500/30' },
  { value: 'meeting',   label: 'Reunião',      color: 'text-violet-400 bg-violet-500/10 border-violet-500/30' },
  { value: 'task',      label: 'Tarefa',       color: 'text-amber-400 bg-amber-500/10 border-amber-500/30' },
  { value: 'proposal',  label: 'Proposta',     color: 'text-orange-400 bg-orange-500/10 border-orange-500/30' },
  { value: 'closure',   label: 'Encerramento', color: 'text-rose-400 bg-rose-500/10 border-rose-500/30' },
]

const TYPE_COLOR_MAP = Object.fromEntries(TYPE_OPTIONS.map(t => [t.value, t.color]))

const PRIORITY_OPTIONS = [
  { value: 'low',    label: 'Baixa' },
  { value: 'normal', label: 'Normal' },
  { value: 'high',   label: 'Alta' },
  { value: 'urgent', label: 'Urgente' },
] as const
type Priority = typeof PRIORITY_OPTIONS[number]['value']

const REMINDER_OPTIONS = [
  { value: null, label: 'Sem lembrete' },
  { value: 15,   label: '15 min antes' },
  { value: 60,   label: '1 hora antes' },
  { value: 1440, label: '1 dia antes' },
] as const
type ReminderOffset = typeof REMINDER_OPTIONS[number]['value']

// ── Helpers ────────────────────────────────────────────────────────────────────

function toLocalDateTimeValue(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function toDateInputValue(iso: string | null | undefined): string {
  if (!iso) return new Date().toISOString().slice(0, 10)
  return new Date(iso).toISOString().slice(0, 10)
}

function calcDateFromBase(baseDateStr: string, dayOffset: number): string {
  const base = new Date(baseDateStr + 'T09:00:00')
  base.setDate(base.getDate() + (dayOffset - 1))
  return base.toISOString().slice(0, 10)
}

function formatDatePtBR(isoDate: string): string {
  const [year, month, day] = isoDate.split('-')
  return `${day}/${month}/${year}`
}

function addMinutes(iso: string, minutes: number): string {
  const d = new Date(iso)
  d.setMinutes(d.getMinutes() + minutes)
  return d.toISOString()
}

function inferReminderOffset(startAt: string | null | undefined, reminderAt: string | null | undefined): ReminderOffset {
  if (!startAt || !reminderAt) return null
  const diffMin = Math.round((new Date(startAt).getTime() - new Date(reminderAt).getTime()) / 60000)
  const valid: ReminderOffset[] = [15, 60, 1440]
  return (valid as number[]).includes(diffMin) ? (diffMin as ReminderOffset) : null
}

// ── Props ──────────────────────────────────────────────────────────────────────

export type ActivityModalTab = 'content' | 'schedule'

interface ActivityUnifiedModalProps {
  activity: DealActivity
  members: { id: string; name: string }[]
  initialTab?: ActivityModalTab
  onClose: () => void
  onSaved: (updated: DealActivity) => void
  onDeleted: (id: string) => void
}

// ── Component ──────────────────────────────────────────────────────────────────

export function ActivityUnifiedModal({
  activity,
  members,
  initialTab = 'content',
  onClose,
  onSaved,
  onDeleted,
}: ActivityUnifiedModalProps) {

  const [tab, setTab] = useState<ActivityModalTab>(initialTab)
  const [isPending, startTransition] = useTransition()
  const [confirmDelete, setConfirmDelete] = useState(false)

  // ── Content tab state ──────────────────────────────────────────────────────
  const [title, setTitle] = useState(activity.title)
  const [type, setType] = useState<PlaybookActivityType>(activity.activity_type)
  const [day, setDay] = useState(activity.day_offset ?? 1)
  const [script, setScript] = useState(activity.script ?? '')
  const [actionLabel, setActionLabel] = useState(
    activity.action_label ?? ACTIVITY_TYPE_DEFAULTS[activity.activity_type]?.actionLabel ?? 'Executar'
  )
  // Base date: derived from the activity's existing due_date/scheduled_start_at, or today
  const [baseDate, setBaseDate] = useState<string>(() =>
    toDateInputValue(activity.scheduled_start_at ?? activity.due_date)
  )

  // ── Schedule tab state ─────────────────────────────────────────────────────
  const [startAt, setStartAt] = useState(() => {
    // If explicitly scheduled with a time, use it; otherwise derive from base date + day offset
    if (activity.scheduled_start_at) return toLocalDateTimeValue(activity.scheduled_start_at)
    const execDateStr = calcDateFromBase(
      toDateInputValue(activity.due_date),
      activity.day_offset ?? 1
    )
    return `${execDateStr}T09:00`
  })
  const [assignedTo, setAssignedTo] = useState(activity.assigned_to ?? '')
  const [priority, setPriority] = useState<Priority>((activity.priority as Priority) ?? 'normal')
  const [reminderOffset, setReminderOffset] = useState<ReminderOffset>(() =>
    inferReminderOffset(activity.scheduled_start_at ?? activity.due_date, activity.reminder_at)
  )
  const [notes, setNotes] = useState(activity.notes ?? '')

  // ── When type changes, auto-update actionLabel only if user hasn't customised it ──
  function handleTypeChange(newType: PlaybookActivityType) {
    const defaultLabel = ACTIVITY_TYPE_DEFAULTS[newType]?.actionLabel ?? 'Executar'
    const currentDefault = ACTIVITY_TYPE_DEFAULTS[type]?.actionLabel ?? 'Executar'
    if (actionLabel === currentDefault) setActionLabel(defaultLabel)
    setType(newType)
  }

  // ── Save content ───────────────────────────────────────────────────────────
  function handleSaveContent() {
    if (!title.trim()) { toast.error('Título obrigatório'); return }
    startTransition(async () => {
      const iconKey = ACTIVITY_TYPE_DEFAULTS[type]?.icon ?? 'zap'
      // Calculate the execution date from the base date + day offset
      const execDateStr = calcDateFromBase(baseDate, day)
      const execIso = new Date(execDateStr + 'T09:00:00').toISOString()
      const res = await updateDealActivity(activity.id, {
        title: title.trim(),
        activity_type: type,
        icon_key: iconKey,
        day_offset: day,
        script: script || null,
        action_label: actionLabel.trim() || null,
        due_date: execIso,
        scheduled_start_at: execIso,
      })
      if (res.error) { toast.error(res.error); return }
      toast.success('Atividade salva!')
      onSaved({
        ...activity,
        title: title.trim(),
        activity_type: type,
        icon_key: iconKey,
        day_offset: day,
        script: script || null,
        action_label: actionLabel.trim() || null,
        due_date: execIso,
        scheduled_start_at: execIso,
        is_custom: true,
      })
    })
  }

  // ── Save schedule ──────────────────────────────────────────────────────────
  function handleSaveSchedule() {
    if (!startAt) { toast.error('Informe a data/hora de início'); return }
    const startIso = new Date(startAt).toISOString()
    const reminderIso = reminderOffset !== null ? addMinutes(startIso, -reminderOffset) : null

    startTransition(async () => {
      const res = await updateDealActivity(activity.id, {
        scheduled_start_at: startIso,
        scheduled_end_at: null,
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
        scheduled_end_at: null,
        due_date: startIso,
        assigned_to: assignedTo || null,
        priority,
        reminder_at: reminderIso,
        notes: notes.trim() || null,
      })
    })
  }

  // ── Delete ─────────────────────────────────────────────────────────────────
  function handleDelete() {
    startTransition(async () => {
      const res = await deleteDealActivity(activity.id)
      if (res.error) { toast.error(res.error); return }
      toast.success('Atividade removida')
      onDeleted(activity.id)
    })
  }

  const typeColor = TYPE_COLOR_MAP[activity.activity_type] ?? 'text-muted-foreground bg-muted/10'
  const isScheduled = !!activity.scheduled_start_at

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative flex w-full max-w-lg flex-col rounded-2xl border border-border/50 bg-background shadow-2xl" style={{ maxHeight: '90vh' }}>

        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/30 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className={cn('flex h-8 w-8 items-center justify-center rounded-lg text-sm', typeColor)}>
              <ActivityIcon activityType={tab === 'content' ? type : activity.activity_type} iconKey={activity.icon_key} className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold leading-none text-foreground">
                {tab === 'content' ? (title.trim() || 'Editar Atividade') : activity.title}
              </h3>
              <p className="mt-0.5 text-[10px] text-muted-foreground/60">
                {ACTIVITY_TYPE_DEFAULTS[tab === 'content' ? type : activity.activity_type]?.label ?? activity.activity_type}
              </p>
            </div>
            {activity.is_custom && (
              <span className="rounded-full bg-amber-500/15 px-1.5 py-px text-[9.5px] font-semibold text-amber-400">
                Personalizada
              </span>
            )}
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-muted-foreground/60 hover:bg-white/5 hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border/20 px-5">
          <button
            onClick={() => setTab('content')}
            className={cn(
              'flex items-center gap-1.5 border-b-2 px-1 pb-2.5 pt-3 text-[12px] font-semibold transition-colors',
              tab === 'content'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground/60 hover:text-foreground'
            )}
          >
            <FileText className="h-3.5 w-3.5" /> Conteúdo
          </button>
          <button
            onClick={() => setTab('schedule')}
            className={cn(
              'ml-5 flex items-center gap-1.5 border-b-2 px-1 pb-2.5 pt-3 text-[12px] font-semibold transition-colors',
              tab === 'schedule'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground/60 hover:text-foreground'
            )}
          >
            <Calendar className="h-3.5 w-3.5" />
            Agendamento
            {isScheduled && (
              <span className="ml-1 h-1.5 w-1.5 rounded-full bg-primary" />
            )}
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto scrollbar-none">

          {/* ── Content Tab ── */}
          {tab === 'content' && (
            <div className="space-y-5 p-5">
              {/* Title */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">Título</label>
                <input
                  autoFocus
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="Nome da atividade"
                  className="h-9 w-full rounded-lg border border-border/40 bg-card/60 px-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
                />
              </div>

              {/* Type selector */}
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">Tipo de Atividade</label>
                <div className="grid grid-cols-3 gap-2">
                  {TYPE_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => handleTypeChange(opt.value)}
                      className={cn(
                        'flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-[12px] font-medium transition-all',
                        type === opt.value
                          ? `${opt.color} ring-1 ring-current/20`
                          : 'border-border/30 text-muted-foreground/60 hover:border-border/60 hover:text-foreground'
                      )}
                    >
                      <ActivityIcon activityType={opt.value} className="h-3.5 w-3.5 flex-shrink-0" />
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Day offset + calculated date */}
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">Dia de Execução</label>
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    {[1,2,3,4,5,6].map(d => (
                      <button
                        key={d}
                        onClick={() => setDay(d)}
                        className={cn(
                          'flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold transition-all',
                          day === d ? 'bg-primary text-white' : 'bg-muted/30 text-muted-foreground/60 hover:bg-muted/60 hover:text-foreground'
                        )}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                  <input
                    type="number" min={1} max={90}
                    value={day}
                    onChange={e => setDay(Math.max(1, parseInt(e.target.value) || 1))}
                    className="h-8 w-16 rounded-lg border border-border/40 bg-card/60 px-2 text-center text-sm text-foreground focus:border-primary/50 focus:outline-none"
                  />
                </div>
                {/* Calculated date row */}
                <div className="flex items-center gap-2 rounded-lg border border-border/20 bg-muted/10 px-3 py-2">
                  <Calendar className="h-3.5 w-3.5 flex-shrink-0 text-primary/60" />
                  <span className="text-[12px] font-bold text-foreground">
                    {formatDatePtBR(calcDateFromBase(baseDate, day))}
                  </span>
                  <span className="text-[10.5px] text-muted-foreground/60">— data de execução</span>
                  <div className="ml-auto flex items-center gap-1.5">
                    <span className="text-[10px] text-muted-foreground/60">base:</span>
                    <input
                      type="date"
                      value={baseDate}
                      onChange={e => setBaseDate(e.target.value || new Date().toISOString().slice(0, 10))}
                      className="h-6 rounded bg-transparent text-[11px] font-semibold text-muted-foreground/60 focus:outline-none focus:text-foreground [color-scheme:dark] cursor-pointer"
                    />
                  </div>
                </div>
              </div>

              {/* Script */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">Script / Mensagem</label>
                <p className="text-[10.5px] text-muted-foreground/60">Use [NOME DO LEAD], [SEU NOME], [NOME DA EMPRESA] como variáveis dinâmicas.</p>
                <textarea
                  value={script}
                  onChange={e => setScript(e.target.value)}
                  onPaste={(event) => handleScriptRichPaste(event, script, setScript)}
                  rows={4}
                  placeholder={'Escreva o script ou mensagem desta atividade...\n\nExemplo:\n# Dia 1 - Pré-análise\n- Ver melhor post\n- Checar bio\n**Mensagem:** [NOME DO LEAD], tudo bem?'}
                  className="w-full resize-none rounded-lg border border-border/40 bg-card/60 px-3 py-2.5 text-[12.5px] leading-relaxed text-foreground placeholder:text-muted-foreground/60 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
                />
              </div>

              {/* Action label */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">Texto do botão principal</label>
                <input
                  type="text"
                  value={actionLabel}
                  onChange={e => setActionLabel(e.target.value)}
                  placeholder="Ex: Enviar WhatsApp, Ligar, etc."
                  className="h-9 w-full rounded-lg border border-border/40 bg-card/60 px-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
                />
              </div>
            </div>
          )}

          {/* ── Schedule Tab ── */}
          {tab === 'schedule' && (
            <div className="space-y-5 p-5">
              {/* Date & Time */}
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
                  <Calendar className="h-3 w-3" /> Data e Hora de Início
                </label>
                <input
                  autoFocus
                  type="datetime-local"
                  value={startAt}
                  onChange={e => setStartAt(e.target.value)}
                  className="h-9 w-full rounded-lg border border-border/40 bg-card/60 px-3 text-sm text-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 [color-scheme:dark]"
                />
              </div>

              {/* Assigned + Priority */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
                    <User className="h-3 w-3" /> Responsável
                  </label>
                  <select
                    value={assignedTo}
                    onChange={e => setAssignedTo(e.target.value)}
                    className="h-9 w-full rounded-lg border border-border/40 bg-card/60 px-3 text-sm text-foreground focus:border-primary/50 focus:outline-none"
                  >
                    <option value="">Nenhum</option>
                    {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
                    <Flag className="h-3 w-3" /> Prioridade
                  </label>
                  <select
                    value={priority}
                    onChange={e => setPriority(e.target.value as Priority)}
                    className="h-9 w-full rounded-lg border border-border/40 bg-card/60 px-3 text-sm text-foreground focus:border-primary/50 focus:outline-none"
                  >
                    {PRIORITY_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </select>
                </div>
              </div>

              {/* Reminder */}
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
                  <Bell className="h-3 w-3" /> Lembrete
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {REMINDER_OPTIONS.map(opt => (
                    <button
                      key={String(opt.value)}
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
                  onChange={e => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Anotações livres sobre esta atividade..."
                  className="w-full resize-none rounded-lg border border-border/40 bg-card/60 px-3 py-2.5 text-[12.5px] leading-relaxed text-foreground placeholder:text-muted-foreground/60 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border/30 px-5 py-4">
          {/* Delete */}
          <div>
            {confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground/60">Confirmar exclusão?</span>
                <button onClick={handleDelete} disabled={isPending} className="rounded-lg bg-red-500/15 px-3 py-1.5 text-xs font-semibold text-red-400 hover:bg-red-500/25">
                  Excluir
                </button>
                <button onClick={() => setConfirmDelete(false)} className="rounded-lg px-3 py-1.5 text-xs text-muted-foreground/60 hover:bg-white/5">
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-muted-foreground/60 transition-colors hover:bg-red-500/10 hover:text-red-400"
              >
                <Trash2 className="h-3 w-3" /> Excluir
              </button>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded-lg border border-border/40 px-4 py-2 text-xs font-medium text-muted-foreground/60 transition-colors hover:bg-white/5 hover:text-foreground"
            >
              Cancelar
            </button>
            {tab === 'content' ? (
              <button
                onClick={handleSaveContent}
                disabled={isPending || !title.trim()}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white transition-all hover:bg-primary/90 disabled:opacity-50"
              >
                <Save className="h-3 w-3" />
                {isPending ? 'Salvando...' : 'Salvar'}
              </button>
            ) : (
              <button
                onClick={handleSaveSchedule}
                disabled={isPending || !startAt}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white transition-all hover:bg-primary/90 disabled:opacity-50"
              >
                <Calendar className="h-3 w-3" />
                {isPending ? 'Agendando...' : 'Agendar'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
