'use client'

import { useState, useTransition, useEffect } from 'react'
import {
  Phone, Mail, MessageCircle, Calendar, CheckSquare,
  FileText, Share2, Flag, Zap, X, Save, Trash2,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import type { DealActivity, PlaybookActivityType } from '@/types/supabase'
import { updateDealActivity, deleteDealActivity } from '@/lib/actions/playbook'
import { ACTIVITY_TYPE_DEFAULTS } from '@/lib/utils/playbook-constants'
import { toast } from 'sonner'
import { handleScriptRichPaste } from './ScriptFormatting'

// ── Icon registry ──────────────────────────────────────────────────────────────

const ICON_MAP: Record<string, LucideIcon> = {
  phone:      Phone,
  mail:       Mail,
  whatsapp:   MessageCircle,
  instagram:  FileText,
  share:      Share2,
  calendar:   Calendar,
  check:      CheckSquare,
  'file-text':FileText,
  flag:       Flag,
  zap:        Zap,
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

// ── Type configs ───────────────────────────────────────────────────────────────

const TYPE_OPTIONS: { value: PlaybookActivityType; label: string; iconKey: string; color: string }[] = [
  { value: 'call',      label: 'Ligação',      iconKey: 'phone',     color: 'text-blue-400 bg-blue-500/10' },
  { value: 'whatsapp',  label: 'WhatsApp',     iconKey: 'whatsapp',  color: 'text-green-400 bg-green-500/10' },
  { value: 'email',     label: 'E-mail',       iconKey: 'mail',      color: 'text-indigo-400 bg-indigo-500/10' },
  { value: 'social',    label: 'Social',       iconKey: 'share',     color: 'text-cyan-400 bg-cyan-500/10' },
  { value: 'instagram', label: 'Instagram',    iconKey: 'instagram', color: 'text-pink-400 bg-pink-500/10' },
  { value: 'meeting',   label: 'Reunião',      iconKey: 'calendar',  color: 'text-violet-400 bg-violet-500/10' },
  { value: 'task',      label: 'Tarefa',       iconKey: 'check',     color: 'text-amber-400 bg-amber-500/10' },
  { value: 'proposal',  label: 'Proposta',     iconKey: 'file-text', color: 'text-orange-400 bg-orange-500/10' },
  { value: 'closure',   label: 'Encerramento', iconKey: 'flag',      color: 'text-rose-400 bg-rose-500/10' },
]

// ── Main component ─────────────────────────────────────────────────────────────

interface ActivityEditorModalProps {
  activity: DealActivity
  onClose: () => void
  onSaved: (updated: DealActivity) => void
  onDeleted: (id: string) => void
}

export function ActivityEditorModal({ activity, onClose, onSaved, onDeleted }: ActivityEditorModalProps) {
  const [title, setTitle] = useState(activity.title)
  const [type, setType] = useState<PlaybookActivityType>(activity.activity_type)
  const [day, setDay] = useState(activity.day_offset ?? 1)
  const [script, setScript] = useState(activity.script ?? '')
  const [actionLabel, setActionLabel] = useState(activity.action_label ?? ACTIVITY_TYPE_DEFAULTS[activity.activity_type]?.actionLabel ?? 'Executar')
  const [isPending, startTransition] = useTransition()
  const [confirmDelete, setConfirmDelete] = useState(false)

  // When type changes, reset icon to type default
  useEffect(() => {
    // Just keep track — icon_key will be derived from type unless user overrides
  }, [type])

  function handleSave() {
    if (!title.trim()) { toast.error('Título obrigatório'); return }
    startTransition(async () => {
      const iconKey = ACTIVITY_TYPE_DEFAULTS[type]?.icon ?? 'zap'
      const res = await updateDealActivity(activity.id, {
        title: title.trim(),
        activity_type: type,
        icon_key: iconKey,
        day_offset: day,
        script: script || undefined,
        action_label: actionLabel.trim() || undefined,
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
        is_custom: true,
      })
    })
  }

  function handleDelete() {
    startTransition(async () => {
      const res = await deleteDealActivity(activity.id)
      if (res.error) { toast.error(res.error); return }
      toast.success('Atividade removida')
      onDeleted(activity.id)
    })
  }

  const selectedTypeCfg = TYPE_OPTIONS.find((t) => t.value === type)

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-lg rounded-2xl border border-border/50 bg-background shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/30 px-5 py-4">
          <div className="flex items-center gap-2">
            <div className={cn('flex h-7 w-7 items-center justify-center rounded-lg text-sm', selectedTypeCfg?.color)}>
              <ActivityIcon activityType={type} className="h-4 w-4" />
            </div>
            <h3 className="text-sm font-bold text-foreground">Editar Atividade</h3>
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

        {/* Body */}
        <div className="space-y-5 p-5">
          {/* Title */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
              Título
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Nome da atividade"
              className="h-9 w-full rounded-lg border border-border/40 bg-card/60 px-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
            />
          </div>

          {/* Type selector */}
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
              Tipo de Atividade
            </label>
            <div className="grid grid-cols-3 gap-2">
              {TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setType(opt.value)}
                  className={cn(
                    'flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-[12px] font-medium transition-all',
                    type === opt.value
                      ? `${opt.color} border-current/30 ring-1 ring-current/20`
                      : 'border-border/30 text-muted-foreground/60 hover:border-border/60 hover:text-foreground'
                  )}
                >
                  <ActivityIcon activityType={opt.value} className="h-3.5 w-3.5 flex-shrink-0" />
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Day offset */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
              Dia de Execução
            </label>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                {Array.from({ length: 6 }, (_, i) => i + 1).map((d) => (
                  <button
                    key={d}
                    onClick={() => setDay(d)}
                    className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold transition-all',
                      day === d
                        ? 'bg-primary text-white'
                        : 'bg-muted/30 text-muted-foreground/60 hover:bg-muted/60 hover:text-foreground'
                    )}
                  >
                    {d}
                  </button>
                ))}
              </div>
              <input
                type="number"
                min={1}
                max={90}
                value={day}
                onChange={(e) => setDay(Math.max(1, parseInt(e.target.value) || 1))}
                className="h-8 w-16 rounded-lg border border-border/40 bg-card/60 px-2 text-center text-sm text-foreground focus:border-primary/50 focus:outline-none"
              />
            </div>
          </div>

          {/* Script */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
              Script / Mensagem
            </label>
            <p className="text-[10.5px] text-muted-foreground/60">
              Use [NOME DO LEAD], [SEU NOME], [NOME DA EMPRESA] como variáveis dinâmicas.
            </p>
            <textarea
              value={script}
              onChange={(e) => setScript(e.target.value)}
              onPaste={(event) => handleScriptRichPaste(event, script, setScript)}
              rows={4}
              placeholder={'Escreva o script ou mensagem desta atividade...\n\nUse # título, - bullets, **negrito** e [variáveis].'}
              className="w-full resize-none rounded-lg border border-border/40 bg-card/60 px-3 py-2.5 text-[12.5px] text-foreground placeholder:text-muted-foreground/60 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 leading-relaxed"
            />
          </div>

          {/* Action Label */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
              Texto do botão principal
            </label>
            <input
              type="text"
              value={actionLabel}
              onChange={(e) => setActionLabel(e.target.value)}
              placeholder="Ex: Enviar WhatsApp, Ligar, etc."
              className="h-9 w-full rounded-lg border border-border/40 bg-card/60 px-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border/30 px-5 py-4">
          {/* Delete */}
          <div>
            {confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground/60">Confirmar exclusão?</span>
                <button
                  onClick={handleDelete}
                  disabled={isPending}
                  className="rounded-lg bg-red-500/15 px-3 py-1.5 text-xs font-semibold text-red-400 hover:bg-red-500/25"
                >
                  Excluir
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="rounded-lg px-3 py-1.5 text-xs text-muted-foreground/60 hover:bg-white/5"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-muted-foreground/60 transition-colors hover:bg-red-500/10 hover:text-red-400"
              >
                <Trash2 className="h-3 w-3" />
                Excluir
              </button>
            )}
          </div>

          {/* Save */}
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded-lg border border-border/40 px-4 py-2 text-xs font-medium text-muted-foreground/60 transition-colors hover:bg-white/5 hover:text-foreground"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={isPending || !title.trim()}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white transition-all hover:bg-primary/90 disabled:opacity-50"
            >
              <Save className="h-3 w-3" />
              {isPending ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
