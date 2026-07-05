'use client'

import { useState, useTransition } from 'react'
import { X, BookTemplate, Plus, Replace, Trash2, Pencil, Check, ArrowLeft, CalendarDays } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import type { Playbook, PlaybookActivity, PlaybookActivityType } from '@/types/supabase'
import { ActivityIcon } from './ActivityEditorModal'
import {
  applyPlaybookToDeal,
  createPlaybook,
  deletePlaybook,
  addPlaybookActivity,
  updatePlaybookActivity,
  deletePlaybookActivity,
} from '@/lib/actions/playbook-templates'
import { ACTIVITY_TYPE_DEFAULTS } from '@/lib/utils/playbook-constants'
import { toast } from 'sonner'
import { handleScriptRichPaste } from './ScriptFormatting'

// ── Types ──────────────────────────────────────────────────────────────────────

interface Props {
  dealId: string
  hasExistingActivities: boolean
  playbooks: (Playbook & { activities: PlaybookActivity[] })[]
  onClose: () => void
  onApplied: () => void
  onTemplatesChanged?: () => void
}

const TYPE_OPTIONS: { value: PlaybookActivityType; label: string; iconKey: string }[] = [
  { value: 'call',      label: 'Ligação',      iconKey: 'phone' },
  { value: 'whatsapp',  label: 'WhatsApp',     iconKey: 'whatsapp' },
  { value: 'email',     label: 'E-mail',       iconKey: 'mail' },
  { value: 'task',      label: 'Tarefa',       iconKey: 'check' },
  { value: 'meeting',   label: 'Reunião',      iconKey: 'calendar' },
  { value: 'social',    label: 'Social',       iconKey: 'share' },
  { value: 'instagram', label: 'Instagram',    iconKey: 'instagram' },
  { value: 'proposal',  label: 'Proposta',     iconKey: 'file-text' },
  { value: 'closure',   label: 'Encerramento', iconKey: 'flag' },
]

// ── Activity row in view mode ──────────────────────────────────────────────────

function ActivityRow({ activity }: { activity: PlaybookActivity }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-border/20 bg-background/40 px-3 py-2.5">
      <div className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md border border-border/30 bg-background">
        <ActivityIcon activityType={activity.activity_type} className="h-3.5 w-3.5 text-muted-foreground/60" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12px] font-semibold text-foreground">{activity.title}</p>
        <p className="text-[10.5px] text-muted-foreground/60">{TYPE_OPTIONS.find(t => t.value === activity.activity_type)?.label ?? activity.activity_type}</p>
      </div>
    </div>
  )
}

// ── Inline activity editor form ────────────────────────────────────────────────

interface ActivityFormState {
  id?: string // if set, editing existing
  title: string
  activity_type: PlaybookActivityType
  day_offset: number
  script: string
  action_label: string
}

const EMPTY_FORM: ActivityFormState = {
  title: '',
  activity_type: 'call',
  day_offset: 1,
  script: '',
  action_label: '',
}

function sortTemplateActivities(activities: PlaybookActivity[]) {
  return [...activities].sort((a, b) =>
    a.day_offset - b.day_offset ||
    a.order_index - b.order_index ||
    a.created_at.localeCompare(b.created_at)
  )
}

function syncMessage(base: string, count?: number, target = 'negocio') {
  if (!count) return base
  const plural = count === 1 ? target : `${target}s`
  return `${base} ${count} ${plural} ja sincronizado${count === 1 ? '' : 's'}.`
}

interface ActivityInlineEditorProps {
  playbookId: string
  workspaceId?: string
  initial?: ActivityFormState
  existingCount: number
  onSaved: (activity: PlaybookActivity) => void
  onCancel: () => void
}

function ActivityInlineEditor({ playbookId, initial, existingCount, onSaved, onCancel }: ActivityInlineEditorProps) {
  const [form, setForm] = useState<ActivityFormState>(initial ?? EMPTY_FORM)
  const [isPending, startTransition] = useTransition()

  const set = (patch: Partial<ActivityFormState>) => setForm(f => ({ ...f, ...patch }))

  const handleSave = () => {
    if (!form.title.trim()) { toast.error('Título obrigatório'); return }
    startTransition(async () => {
      const iconKey = ACTIVITY_TYPE_DEFAULTS[form.activity_type]?.icon ?? 'zap'
      const defaultLabel = ACTIVITY_TYPE_DEFAULTS[form.activity_type]?.actionLabel ?? 'Executar'

      if (form.id) {
        const res = await updatePlaybookActivity(form.id, {
          title: form.title.trim(),
          activity_type: form.activity_type,
          day_offset: form.day_offset,
          icon_key: iconKey,
          script: form.script || null,
          action_label: form.action_label.trim() || null,
        })
        if (res.error) { toast.error(res.error); return }
        if (res.syncError) toast.warning(`Template salvo, mas a sincronizacao falhou: ${res.syncError}`)
        toast.success(syncMessage('Atividade salva.', res.syncedActivities, 'atividade'))
        onSaved(res.data!)
      } else {
        const res = await addPlaybookActivity({
          playbook_id: playbookId,
          title: form.title.trim(),
          activity_type: form.activity_type,
          day_offset: form.day_offset,
          order_index: existingCount,
          icon_key: iconKey,
          script: form.script || undefined,
          action_label: form.action_label.trim() || defaultLabel,
        })
        if (res.error) { toast.error(res.error); return }
        if (res.syncError) toast.warning(`Atividade criada, mas a sincronizacao falhou: ${res.syncError}`)
        toast.success(syncMessage('Atividade adicionada.', res.syncedDeals))
        onSaved(res.data!)
      }
    })
  }

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
      {/* Title */}
      <input
        autoFocus
        value={form.title}
        onChange={e => set({ title: e.target.value })}
        placeholder="Título da atividade..."
        className="w-full rounded-lg border border-border/30 bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-primary/50 focus:outline-none"
      />

      {/* Type selector */}
      <div className="grid grid-cols-3 gap-1.5">
        {TYPE_OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={() => set({ activity_type: opt.value, action_label: ACTIVITY_TYPE_DEFAULTS[opt.value]?.actionLabel ?? '' })}
            className={cn(
              'flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-left text-[11px] font-medium transition-all',
              form.activity_type === opt.value
                ? 'border-primary/40 bg-primary/10 text-primary'
                : 'border-border/30 text-muted-foreground/60 hover:border-border/50 hover:text-foreground'
            )}
          >
            <ActivityIcon activityType={opt.value} className="h-3 w-3 flex-shrink-0" />
            {opt.label}
          </button>
        ))}
      </div>

      {/* Day offset */}
      <div className="flex items-center gap-2">
        <span className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground/60">Dia</span>
        <div className="flex gap-1">
          {[1,2,3,4,5,6].map(d => (
            <button
              key={d}
              onClick={() => set({ day_offset: d })}
              className={cn(
                'flex h-6 w-6 items-center justify-center rounded-md text-[11px] font-bold transition-all',
                form.day_offset === d ? 'bg-primary text-white' : 'bg-muted/30 text-muted-foreground/60 hover:bg-muted/60 hover:text-foreground'
              )}
            >
              {d}
            </button>
          ))}
        </div>
        <input
          type="number" min={1} max={90}
          value={form.day_offset}
          onChange={e => set({ day_offset: Math.max(1, parseInt(e.target.value) || 1) })}
          className="h-6 w-12 rounded-md border border-border/40 bg-card/60 px-2 text-center text-[11px] text-foreground focus:border-primary/50 focus:outline-none"
        />
      </div>

      {/* Script */}
      <textarea
        value={form.script}
        onChange={e => set({ script: e.target.value })}
        onPaste={(event) => handleScriptRichPaste(event, form.script, (script) => set({ script }))}
        rows={3}
        placeholder={'Script / mensagem (opcional)...\n\nUse Markdown: # título, - bullets, **negrito** e [variáveis].'}
        className="w-full resize-none rounded-lg border border-border/30 bg-background px-3 py-2 text-[11.5px] text-foreground placeholder:text-muted-foreground/60 focus:border-primary/50 focus:outline-none leading-relaxed"
      />

      {/* Action label */}
      <input
        value={form.action_label}
        onChange={e => set({ action_label: e.target.value })}
        placeholder={`Texto do botão (ex: ${ACTIVITY_TYPE_DEFAULTS[form.activity_type]?.actionLabel ?? 'Executar'})`}
        className="w-full rounded-lg border border-border/30 bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-primary/50 focus:outline-none"
      />

      {/* Buttons */}
      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onCancel} className="px-3 py-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground">Cancelar</button>
        <button
          onClick={handleSave}
          disabled={isPending || !form.title.trim()}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[11px] font-bold text-white transition-all hover:bg-primary/90 disabled:opacity-50"
        >
          <Check className="h-3 w-3" />
          {isPending ? 'Salvando...' : (form.id ? 'Salvar' : 'Adicionar')}
        </button>
      </div>
    </div>
  )
}

// ── Right panel: Edit template activities ──────────────────────────────────────

interface EditPanelProps {
  playbook: Playbook & { activities: PlaybookActivity[] }
  onBack: () => void
  onActivitiesChanged: (activities: PlaybookActivity[]) => void
  onTemplatesChanged?: () => void
}

function EditPanel({ playbook, onBack, onActivitiesChanged, onTemplatesChanged }: EditPanelProps) {
  const [activities, setActivities] = useState<PlaybookActivity[]>(() => sortTemplateActivities(playbook.activities))
  const [addingNew, setAddingNew] = useState(activities.length === 0)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const handleSaved = (saved: PlaybookActivity) => {
    setActivities(prev => {
      const exists = prev.find(a => a.id === saved.id)
      const next = sortTemplateActivities(exists ? prev.map(a => a.id === saved.id ? saved : a) : [...prev, saved])
      onActivitiesChanged(next)
      return next
    })
    setAddingNew(false)
    setEditingId(null)
    onTemplatesChanged?.()
  }

  const handleDelete = (id: string) => {
    startTransition(async () => {
      const res = await deletePlaybookActivity(id)
      if (res.error) { toast.error(res.error); return }
      if (res.syncError) toast.warning(`Atividade excluida, mas a sincronizacao falhou: ${res.syncError}`)
      toast.success(syncMessage('Atividade excluida.', res.syncedActivities, 'atividade'))
      setActivities(prev => {
        const next = prev.filter(a => a.id !== id)
        onActivitiesChanged(next)
        return next
      })
      setDeletingId(null)
      onTemplatesChanged?.()
    })
  }

  // Group by day
  const byDay = activities.reduce<Record<number, PlaybookActivity[]>>((acc, a) => {
    if (!acc[a.day_offset]) acc[a.day_offset] = []
    acc[a.day_offset].push(a)
    return acc
  }, {})
  const days = Object.keys(byDay).map(Number).sort((a, b) => a - b)

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Sub-header */}
      <div className="flex items-center gap-2 border-b border-border/20 px-4 py-3">
        <button onClick={onBack} className="rounded-lg p-1 text-muted-foreground/60 hover:bg-white/5 hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-bold text-foreground">{playbook.name}</p>
          <p className="text-[10px] text-muted-foreground/60">{activities.length} atividade{activities.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* Activity list */}
      <div className="flex-1 overflow-y-auto p-4 scrollbar-none space-y-4">
        {days.map(day => (
          <div key={day}>
            <p className="mb-2 text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground/60">Dia {day}</p>
            <div className="space-y-1.5">
              {byDay[day].map(act => (
                <div key={act.id}>
                  {editingId === act.id ? (
                    <ActivityInlineEditor
                      playbookId={playbook.id}
                      existingCount={activities.length}
                      initial={{ id: act.id, title: act.title, activity_type: act.activity_type, day_offset: act.day_offset, script: act.script ?? '', action_label: act.action_label ?? '' }}
                      onSaved={handleSaved}
                      onCancel={() => setEditingId(null)}
                    />
                  ) : deletingId === act.id ? (
                    <div className="flex items-center justify-between gap-2 rounded-lg border border-red-500/30 bg-background/95 px-3 py-2.5">
                      <span className="text-xs font-medium text-foreground/80">Excluir &quot;{act.title}&quot;?</span>
                      <div className="flex gap-2">
                        <button onClick={() => setDeletingId(null)} className="text-[11px] font-medium text-muted-foreground hover:text-foreground">Cancelar</button>
                        <button onClick={() => handleDelete(act.id)} disabled={isPending} className="rounded-lg bg-red-500 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-red-600 disabled:opacity-50">Excluir</button>
                      </div>
                    </div>
                  ) : (
                    <div className="group flex items-center gap-2">
                      <div className="flex flex-1 items-start gap-2 rounded-lg border border-border/20 bg-background/40 px-3 py-2.5">
                        <div className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md border border-border/30 bg-background">
                          <ActivityIcon activityType={act.activity_type} className="h-3.5 w-3.5 text-muted-foreground/60" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[12px] font-semibold text-foreground">{act.title}</p>
                          <p className="text-[10.5px] text-muted-foreground/60">{TYPE_OPTIONS.find(t => t.value === act.activity_type)?.label}</p>
                        </div>
                      </div>
                      <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <button onClick={() => { setEditingId(act.id); setAddingNew(false) }} className="rounded-md p-1 text-muted-foreground/60 hover:bg-white/5 hover:text-foreground">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => setDeletingId(act.id)} className="rounded-md p-1 text-muted-foreground/60 hover:bg-red-500/10 hover:text-red-500">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}

        {activities.length === 0 && !addingNew && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <BookTemplate className="mb-2 h-8 w-8 text-muted-foreground/15" />
            <p className="text-xs text-muted-foreground/60">Nenhuma atividade ainda.</p>
            <p className="text-[10.5px] text-muted-foreground/30">Adicione a primeira atividade abaixo.</p>
          </div>
        )}

        {addingNew && !editingId && (
          <ActivityInlineEditor
            playbookId={playbook.id}
            existingCount={activities.length}
            onSaved={handleSaved}
            onCancel={() => setAddingNew(false)}
          />
        )}
      </div>

      {/* Add button */}
      {!addingNew && !editingId && (
        <div className="border-t border-border/20 p-3">
          <button
            onClick={() => setAddingNew(true)}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border/40 py-2.5 text-[11.5px] font-bold text-muted-foreground/60 transition-all hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
          >
            <Plus className="h-3.5 w-3.5" /> Adicionar atividade
          </button>
        </div>
      )}
    </div>
  )
}

// ── Main modal ─────────────────────────────────────────────────────────────────

export function PlaybookSelectorModal({ dealId, hasExistingActivities, playbooks, onClose, onApplied, onTemplatesChanged }: Props) {
  const [selectedPlaybook, setSelectedPlaybook] = useState<string | null>(() => playbooks[0]?.id ?? null)
  const [mode, setMode] = useState<'replace' | 'append'>('append')
  const [isPending, startTransition] = useTransition()
  const [isCreating, setIsCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  // 'view' shows activity list; 'edit' shows the activity editor for the selected template
  const [rightPanel, setRightPanel] = useState<'view' | 'edit'>('view')
  // Local copy of playbooks so we can update activities without full refresh
  const [localPlaybooks, setLocalPlaybooks] = useState(playbooks)
  // Start date for template application (defaults to today)
  const todayStr = new Date().toISOString().slice(0, 10)
  const [startDate, setStartDate] = useState(todayStr)

  const selectedData = localPlaybooks.find(p => p.id === selectedPlaybook)

  const handleCreate = () => {
    if (!newName.trim()) return
    startTransition(async () => {
      const res = await createPlaybook({ name: newName.trim() })
      if (res.error) { toast.error(res.error); return }
      toast.success('Template criado! Adicione as atividades.')
      setIsCreating(false)
      setNewName('')
      if (res.data) {
        // Add to local list immediately so the user sees it selected
        const newPb = { ...res.data, activities: [] }
        setLocalPlaybooks(prev => [...prev, newPb])
        setSelectedPlaybook(res.data!.id)
        setRightPanel('edit')
      }
      onTemplatesChanged?.()
    })
  }

  const handleDelete = (id: string) => {
    startTransition(async () => {
      const res = await deletePlaybook(id)
      if (res.error) { toast.error(res.error); return }
      toast.success('Template excluído.')
      setConfirmDeleteId(null)
      const nextPlaybooks = localPlaybooks.filter((playbook) => playbook.id !== id)
      setLocalPlaybooks(nextPlaybooks)
      if (selectedPlaybook === id) {
        setSelectedPlaybook(nextPlaybooks[0]?.id ?? null)
        setRightPanel('view')
      }
      onTemplatesChanged?.()
    })
  }

  const handleApply = () => {
    if (!selectedPlaybook) return
    startTransition(async () => {
      const res = await applyPlaybookToDeal({
        deal_id: dealId,
        playbook_id: selectedPlaybook,
        mode: hasExistingActivities ? mode : 'append',
        startDate,
      })
      if (res.error) { toast.error(res.error); return }
      toast.success('Template aplicado com sucesso!')
      onApplied()
    })
  }

  // Group selected playbook's activities by day for view panel
  const byDay = selectedData
    ? selectedData.activities.reduce<Record<number, PlaybookActivity[]>>((acc, a) => {
        if (!acc[a.day_offset]) acc[a.day_offset] = []
        acc[a.day_offset].push(a)
        return acc
      }, {})
    : {}
  const days = Object.keys(byDay).map(Number).sort((a, b) => a - b)

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl border border-border/50 bg-background shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/30 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <BookTemplate className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">Escolher template</h2>
              <p className="text-xs text-muted-foreground/60">Selecione um playbook de atividades para este negócio.</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-muted-foreground/60 hover:bg-white/5 hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex flex-1 overflow-hidden">

          {/* Left: template list */}
          <div className="w-1/2 overflow-y-auto border-r border-border/20 p-4 scrollbar-none">
            {/* Create button */}
            {isCreating ? (
              <div className="mb-4 rounded-xl border border-primary/30 bg-primary/5 p-4">
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Nome do template..."
                  className="mb-3 w-full rounded-lg border border-border/30 bg-background px-3 py-2 text-xs focus:border-primary/50 focus:outline-none"
                  onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                />
                <div className="flex justify-end gap-2">
                  <button onClick={() => setIsCreating(false)} className="px-3 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground">Cancelar</button>
                  <button onClick={handleCreate} disabled={isPending || !newName.trim()} className="rounded-lg bg-primary px-3 py-1 text-[11px] font-bold text-white transition-all hover:bg-primary/90 disabled:opacity-50">Criar</button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setIsCreating(true)}
                className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border/40 bg-muted/5 p-4 text-xs font-bold text-muted-foreground/60 transition-all hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
              >
                <Plus className="h-4 w-4" /> Criar novo template
              </button>
            )}

            {localPlaybooks.map(pb => {
              const uniqueDays = new Set(pb.activities.map(a => a.day_offset)).size
              const actCount = pb.activities.length
              const isSelected = selectedPlaybook === pb.id
              const isConfirming = confirmDeleteId === pb.id
              return (
                <div key={pb.id} className="relative mb-3 group">
                  <button
                    onClick={() => { setSelectedPlaybook(pb.id); setRightPanel('view') }}
                    className={cn('w-full rounded-xl border p-4 text-left transition-all',
                      isSelected ? 'border-primary/50 bg-primary/5 ring-1 ring-primary/20' : 'border-border/30 bg-card/30 hover:border-border/60 hover:bg-white/5'
                    )}
                  >
                    <h3 className="font-bold text-foreground pr-7">{pb.name}</h3>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground/60">{pb.description}</p>
                    <div className="mt-3 flex items-center gap-3 text-[11px] font-semibold text-muted-foreground/60">
                      <span>{uniqueDays} {uniqueDays === 1 ? 'dia' : 'dias'}</span>
                      <span>•</span>
                      <span>{actCount} ativ.</span>
                    </div>
                  </button>
                  {!isConfirming && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(pb.id) }}
                      className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground/0 transition-all group-hover:text-muted-foreground/60 hover:!text-red-500 hover:bg-red-500/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {isConfirming && (
                    <div className="absolute inset-0 flex items-center justify-between gap-2 rounded-xl border border-red-500/30 bg-background/95 px-4 backdrop-blur-sm">
                      <span className="text-xs font-medium text-foreground/80">Excluir este template?</span>
                      <div className="flex gap-2">
                        <button onClick={() => setConfirmDeleteId(null)} className="rounded-lg px-3 py-1 text-[11px] font-medium text-muted-foreground hover:bg-white/5 hover:text-foreground">Cancelar</button>
                        <button onClick={() => handleDelete(pb.id)} disabled={isPending} className="rounded-lg bg-red-500 px-3 py-1 text-[11px] font-bold text-white transition-all hover:bg-red-600 disabled:opacity-50">Excluir</button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Right panel */}
          <div className="flex w-1/2 flex-col overflow-hidden bg-muted/5">
            {!selectedData ? (
              <div className="flex h-full flex-col items-center justify-center text-center p-6">
                <BookTemplate className="mb-4 h-12 w-12 text-muted-foreground/15" />
                <p className="text-sm text-muted-foreground/60">Selecione um template à esquerda para visualizar os detalhes.</p>
              </div>
            ) : rightPanel === 'edit' ? (
              <EditPanel
                key={selectedData.id}
                playbook={selectedData}
                onBack={() => setRightPanel('view')}
                onTemplatesChanged={onTemplatesChanged}
                onActivitiesChanged={(acts) => {
                  setLocalPlaybooks(prev =>
                    prev.map(p => p.id === selectedPlaybook ? { ...p, activities: acts } : p)
                  )
                }}
              />
            ) : (
              /* View mode */
              <div className="flex flex-1 flex-col overflow-hidden">
                <div className="flex-1 overflow-y-auto p-6 scrollbar-none">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-foreground">{selectedData.name}</h3>
                      <p className="mt-0.5 text-xs text-muted-foreground/60">{selectedData.description}</p>
                    </div>
                    <button
                      onClick={() => setRightPanel('edit')}
                      className="flex items-center gap-1.5 rounded-lg border border-border/30 px-3 py-1.5 text-[11px] font-semibold text-muted-foreground/60 transition-all hover:border-border/60 hover:text-foreground"
                    >
                      <Pencil className="h-3 w-3" /> Editar
                    </button>
                  </div>

                  {selectedData.activities.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <p className="text-xs text-muted-foreground/60">Este template não tem atividades.</p>
                      <button onClick={() => setRightPanel('edit')} className="mt-2 text-[11.5px] font-semibold text-primary hover:underline">Adicionar atividades →</button>
                    </div>
                  ) : (
                    <div className="space-y-5">
                      {days.map(day => (
                        <div key={day}>
                          <p className="mb-2 text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground/60">Dia {day}</p>
                          <div className="space-y-1.5">
                            {byDay[day].map(act => <ActivityRow key={act.id} activity={act} />)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {hasExistingActivities && (
                    <div className="mt-6 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                      <h4 className="mb-2 text-xs font-bold text-amber-500">Este negócio já possui atividades</h4>
                      <div className="space-y-2">
                        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border/30 bg-background p-2.5 transition-colors hover:bg-white/5">
                          <input type="radio" checked={mode === 'replace'} onChange={() => setMode('replace')} className="text-primary focus:ring-primary" />
                          <div className="flex items-center gap-2">
                            <Replace className="h-4 w-4 text-muted-foreground/60" />
                            <span className="text-[11px] font-medium text-foreground/80">Substituir atividades atuais</span>
                          </div>
                        </label>
                        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border/30 bg-background p-2.5 transition-colors hover:bg-white/5">
                          <input type="radio" checked={mode === 'append'} onChange={() => setMode('append')} className="text-primary focus:ring-primary" />
                          <div className="flex items-center gap-2">
                            <Plus className="h-4 w-4 text-muted-foreground/60" />
                            <span className="text-[11px] font-medium text-foreground/80">Adicionar ao final</span>
                          </div>
                        </label>
                      </div>
                    </div>
                  )}
                </div>

                <div className="border-t border-border/20 p-4 space-y-3">
                  {/* Start date picker */}
                  <div className="flex items-center gap-2 rounded-xl border border-border/30 bg-muted/10 px-3 py-2.5">
                    <CalendarDays className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground/60" />
                    <span className="text-[11px] font-semibold text-muted-foreground/60 whitespace-nowrap">Iniciar em</span>
                    <input
                      type="date"
                      value={startDate}
                      onChange={e => setStartDate(e.target.value || todayStr)}
                      min={todayStr}
                      className="flex-1 bg-transparent text-[12px] font-semibold text-foreground focus:outline-none [color-scheme:dark] cursor-pointer"
                    />
                    {startDate !== todayStr && (
                      <button
                        onClick={() => setStartDate(todayStr)}
                        className="text-[10px] font-semibold text-primary hover:underline whitespace-nowrap"
                      >
                        Hoje
                      </button>
                    )}
                  </div>

                  <div className="flex justify-end gap-3">
                    <button onClick={onClose} className="rounded-lg px-4 py-2 text-xs font-medium text-muted-foreground/60 hover:bg-white/5 hover:text-foreground">
                      Cancelar
                    </button>
                    <button
                      onClick={handleApply}
                      disabled={isPending || selectedData.activities.length === 0}
                      className="rounded-lg bg-primary px-5 py-2 text-xs font-bold text-white transition-all hover:bg-primary/90 disabled:opacity-50"
                      title={selectedData.activities.length === 0 ? 'Adicione atividades ao template antes de aplicar' : undefined}
                    >
                      {isPending ? 'Aplicando...' : 'Usar template'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
