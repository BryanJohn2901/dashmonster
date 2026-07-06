'use client'

import React, { useState, useEffect, useTransition, useRef, useCallback, type KeyboardEvent } from 'react'
import {
  FileText,
  ChevronLeft, ChevronRight, X, Plus,
  Edit2, CheckSquare, Square, BookTemplate, CalendarClock,
  ChevronDown, ChevronUp, Bell, Eraser, Trash2,
} from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { formatCurrency } from '@/lib/utils/formatters'
import type { DealRow } from '@/lib/actions/deals'
import type { PipelineWithStages } from '@/lib/actions/pipelines'
import type { DealActivity, Playbook, PlaybookActivity } from '@/types/supabase'
import type { Database } from '@/types/supabase'
type DealRow2 = Database['public']['Tables']['deals']['Row']
import {
  toggleDealActivity,
  createDealActivity,
  clearDealActivities,
} from '@/lib/actions/playbook'
import { getPlaybooks } from '@/lib/actions/playbook-templates'
import { ACTIVITY_TYPE_DEFAULTS } from '@/lib/utils/playbook-constants'
import { moveDeal, updateDeal, deleteDeal } from '@/lib/actions/deals'
import { toast } from 'sonner'
import { ActivityUnifiedModal, ActivityIcon, type ActivityModalTab } from './ActivityUnifiedModal'
import { PlaybookSelectorModal } from './PlaybookSelectorModal'
import { ContactTab } from './deal-detail/ContactTab'
import { CompanyTab } from './deal-detail/CompanyTab'
import { DealInfoTab } from './deal-detail/DealInfoTab'
import { HistoryTab } from './deal-detail/HistoryTab'
import { NotesTab } from './deal-detail/NotesTab'
import { CustomFieldsManagerModal } from './deal-detail/CustomFieldsManagerModal'
import { getContact, type ContactOption } from '@/lib/actions/contacts'
import { getCompany, type CompanyWithStats } from '@/lib/actions/companies'
import { createLead, updateLead } from '@/lib/actions/leads'
import { getDealSheetData } from '@/lib/actions/deal-sheet'
import { MessagesPanel } from '@/components/inbox/MessagesPanel'
import type { Contact, Company, CustomFieldDefinition, CustomFieldValue, DealHistory, CustomFieldEntity } from '@/types/supabase'
import { ScriptRenderer } from './ScriptFormatting'

// ── Helpers ───────────────────────────────────────────────────────────────────

function groupActivities(acts: DealActivity[]) {
  const scheduled = acts
    .filter((a) => !a.completed_at && a.scheduled_start_at)
    .sort((a, b) => new Date(a.scheduled_start_at!).getTime() - new Date(b.scheduled_start_at!).getTime())
  const pending = acts
    .filter((a) => !a.completed_at && !a.scheduled_start_at)
    .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
  const done = acts
    .filter((a) => !!a.completed_at)
    .sort((a, b) => new Date(b.completed_at!).getTime() - new Date(a.completed_at!).getTime())
  return { scheduled, pending, done }
}

function sortForList(acts: DealActivity[]): DealActivity[] {
  return [...acts].sort((a, b) => {
    const dayA = a.day_offset ?? 999
    const dayB = b.day_offset ?? 999
    if (dayA !== dayB) return dayA - dayB
    return (a.order_index ?? 0) - (b.order_index ?? 0)
  })
}

function getActivityStatus(act: DealActivity): 'done' | 'overdue' | 'today' | 'upcoming' {
  if (act.completed_at) return 'done'
  const dateRef = act.scheduled_start_at ?? act.due_date
  if (!dateRef) return 'upcoming'
  const now = new Date()
  const due = new Date(dateRef)
  const diffDays = Math.floor((due.getTime() - now.setHours(0,0,0,0)) / 86_400_000)
  if (diffDays < 0) return 'overdue'
  if (diffDays === 0) return 'today'
  return 'upcoming'
}

const _PRIORITY_CONFIG = {
  urgent: { label: 'Urgente', color: 'bg-red-500' },
  high:   { label: 'Alta',    color: 'bg-amber-500' },
  normal: { label: 'Normal',  color: 'bg-blue-500' },
  low:    { label: 'Baixa',   color: 'bg-slate-400' },
} as const

// ── Sub-components ────────────────────────────────────────────────────────────

function ActivityRow({
  act, isSelected, onToggle, onSelect, onSchedule,
}: {
  act: DealActivity
  isSelected: boolean
  onToggle: (act: DealActivity) => void
  onSelect: (act: DealActivity) => void
  onSchedule: (act: DealActivity) => void
}) {
  const isDone = !!act.completed_at
  const status = getActivityStatus(act)

  return (
    <div
      className={cn(
        'group flex items-center gap-3 px-4 py-2.5 transition-all cursor-pointer border-l-2',
        isSelected
          ? 'border-primary bg-primary/6'
          : 'border-transparent hover:bg-muted/20 hover:border-border/30',
        isDone && !isSelected && 'opacity-50',
      )}
      onClick={() => onSelect(act)}
    >
      {/* Dia */}
      <span className="w-5 flex-shrink-0 text-center text-[11px] font-black tabular-nums ui-muted-subtle select-none">
        {act.day_offset ?? '—'}
      </span>

      {/* Ícone do tipo */}
      <span className={cn(
        'flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md',
        isSelected ? 'bg-primary/15 text-primary' : 'bg-muted/50 ui-muted-readable',
      )}>
        <ActivityIcon activityType={act.activity_type} iconKey={act.icon_key} className="h-3 w-3" />
      </span>

      {/* Título */}
      <span className={cn(
        'min-w-0 flex-1 truncate text-[13px] leading-snug',
        isDone ? 'line-through ui-muted-subtle' : isSelected ? 'font-semibold text-foreground' : 'font-medium text-foreground/80',
      )}>
        {act.title}
      </span>

      {/* Indicadores compactos */}
      <div className="flex flex-shrink-0 items-center gap-1.5">
        {act.scheduled_start_at && !isDone && (
          <span className="text-[10px] font-bold text-primary/70">
            {new Date(act.scheduled_start_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit' })}
          </span>
        )}
        {status === 'overdue' && !isDone && <span className="h-1.5 w-1.5 rounded-full bg-red-500" title="Atrasada" />}
        {status === 'today' && !isDone && <span className="h-1.5 w-1.5 rounded-full bg-amber-400" title="Hoje" />}
        {act.reminder_at && !isDone && <span title="Lembrete agendado"><Bell className="h-3 w-3 ui-muted-subtle" /></span>}
        <button
          type="button"
          aria-label={isDone ? 'Reabrir' : 'Concluir'}
          className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => { e.stopPropagation(); onToggle(act) }}
        >
          {isDone
            ? <CheckSquare className="h-4 w-4 text-primary" />
            : <Square className="h-4 w-4 ui-muted-subtle hover:text-primary transition-colors" />}
        </button>
        <button
          type="button"
          title="Agendar"
          className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity rounded p-0.5 ui-muted-subtle hover:text-primary"
          onClick={(e) => { e.stopPropagation(); onSchedule(act) }}
        >
          <CalendarClock className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

function daysSince(iso: string | null): number {
  if (!iso) return 0
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000))
}

/**
 * Jornada do negócio em "chevrons" (estilo breadcrumb de funil): cada etapa é
 * um segmento em seta. Concluídas em canary suave, atual em canary cheio com os
 * dias na etapa, futuras em cinza. Clicar move o negócio para a etapa.
 */
function JourneyMap({ stages, currentStageId, stageEnteredAt, onMove }: {
  stages: PipelineWithStages['stages']
  currentStageId: string
  stageEnteredAt: string | null
  onMove: (stageId: string) => void
}) {
  const currentIdx = stages.findIndex((s) => s.id === currentStageId)
  const currentDays = daysSince(stageEnteredAt)
  const POINT = 11 // px do bico/entalhe do chevron

  return (
    <div className="flex items-stretch gap-[3px] overflow-x-auto pb-1 scrollbar-none">
      {stages.map((stage, i) => {
        const isDone = i < currentIdx
        const isCurrent = i === currentIdx
        const isFirst = i === 0
        const isLast = i === stages.length - 1

        // clip-path do chevron: bico à direita (exceto último) e entalhe à
        // esquerda (exceto primeiro), encaixando como num funil.
        const notch = isFirst ? '' : `, ${POINT}px 50%`
        const clip = isLast
          ? `polygon(0 0, 100% 0, 100% 100%, 0 100%${notch})`
          : `polygon(0 0, calc(100% - ${POINT}px) 0, 100% 50%, calc(100% - ${POINT}px) 100%, 0 100%${notch})`

        return (
          <button
            key={stage.id}
            type="button"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              if (!isCurrent) onMove(stage.id)
            }}
            disabled={isCurrent}
            title={isCurrent ? `${stage.name} · ${currentDays} ${currentDays === 1 ? 'dia' : 'dias'} nesta etapa` : `Mover para ${stage.name}`}
            style={{
              clipPath: clip,
              paddingLeft: isFirst ? 14 : POINT + 10,
              paddingRight: isLast ? 14 : POINT + 10,
            }}
            className={cn(
              'flex min-w-[120px] flex-1 items-center justify-center py-2.5 text-center transition-colors outline-none',
              isCurrent
                ? 'bg-primary text-primary-foreground'
                : isDone
                ? 'cursor-pointer bg-primary/20 text-primary hover:bg-primary/30'
                : 'cursor-pointer bg-white/[0.05] text-muted-foreground hover:bg-white/[0.09] hover:text-geyser'
            )}
          >
            <span className="truncate text-[11px] font-bold tracking-tight">
              {stage.name}
              {isCurrent && (
                <span className="ml-1 font-semibold opacity-80">
                  ({currentDays} {currentDays === 1 ? 'dia' : 'dias'})
                </span>
              )}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function ScriptPanel({ activity, onEdit, onComplete }: { activity: DealActivity | null; onEdit: () => void, onComplete: () => void }) {
  if (!activity) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <FileText className="h-10 w-10 text-muted-foreground/15" />
        <p className="text-[13px] font-medium ui-muted-subtle">Selecione uma atividade para ver os detalhes.</p>
      </div>
    )
  }

  const meta = ACTIVITY_TYPE_DEFAULTS[activity.activity_type]
  const isDone = !!activity.completed_at

  return (
    <div className="flex h-full flex-col">
      {/* Título */}
      <div className="flex-shrink-0 border-b border-border/20 px-8 py-6">
        <div className="mb-2.5 flex items-center gap-2">
          <ActivityIcon activityType={activity.activity_type} iconKey={activity.icon_key} className="h-3.5 w-3.5 ui-muted-subtle" />
          <span className="text-[11px] font-bold uppercase tracking-wider ui-muted-subtle">{meta?.label}</span>
          <span className="text-border/50">·</span>
          <span className="text-[11px] font-bold uppercase tracking-wider ui-muted-subtle">Dia {activity.day_offset}</span>
          {activity.is_custom && (
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-500">Personalizada</span>
          )}
        </div>
        <h2 className="text-[20px] font-bold leading-tight text-foreground">{activity.title}</h2>
      </div>

      {/* Script */}
      <div className="flex-1 overflow-y-auto px-8 py-6 scrollbar-none">
        {activity.script ? (
          <>
            <p className="mb-5 text-[11px] font-bold uppercase tracking-widest ui-muted-subtle">Script sugerido</p>
            <ScriptRenderer text={activity.script} />
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-[13px] font-medium ui-muted-subtle italic">
            Esta atividade não possui um script configurado.
          </div>
        )}
      </div>

      {/* Ações */}
      <div className="flex flex-shrink-0 items-center gap-3 border-t border-border/20 px-8 py-4">
        <button
          onClick={onComplete}
          className={cn(
            'flex flex-[2] items-center justify-center gap-2 rounded-xl py-3.5 text-[14px] font-bold transition-all active:scale-[0.98]',
            isDone
              ? 'bg-muted/50 text-geyser hover:bg-muted/70'
              : 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-md shadow-primary/20',
          )}
        >
          {isDone ? <Square className="h-4 w-4" /> : <CheckSquare className="h-4 w-4" />}
          {isDone ? 'Reabrir atividade' : 'Concluir atividade'}
        </button>
        <button
          onClick={onEdit}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-border/40 py-3.5 text-[14px] font-bold ui-muted-readable transition-all hover:border-primary/40 hover:text-primary active:scale-[0.98]"
        >
          <Edit2 className="h-4 w-4" />
          Editar
        </button>
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

type Tab = 'activities' | 'contact' | 'company' | 'deal' | 'notes' | 'history' | 'messages'

const DETAIL_TABS: { key: Tab; label: string }[] = [
  { key: 'activities', label: 'Atividades' },
  { key: 'messages', label: 'Mensagens' },
  { key: 'contact', label: 'Contato' },
  { key: 'company', label: 'Empresa' },
  { key: 'deal', label: 'Negócio' },
  { key: 'notes', label: 'Notas' },
  { key: 'history', label: 'Histórico' },
]

interface DealDetailSheetProps {
  deal: DealRow
  pipeline: PipelineWithStages
  allDeals: DealRow[]
  members: { id: string; name: string }[]
  onClose: () => void
  onUpdate: (deal: DealRow) => void
  onDelete: (dealId: string) => void
}

export function DealDetailSheet({ deal: initialDeal, pipeline, allDeals, members, onClose, onUpdate, onDelete }: DealDetailSheetProps) {
  const [deal, setDeal] = useState(initialDeal)
  const [tab, setTab] = useState<Tab>('activities')
  const [activities, setActivities] = useState<DealActivity[]>([])
  const [selected, setSelected] = useState<DealActivity | null>(null)
  const [showDone, setShowDone] = useState(false)

  const [playbooks, setPlaybooks] = useState<(Playbook & { activities: PlaybookActivity[] })[]>([])
  const [loading, setLoading] = useState(false)
  const [activeActivity, setActiveActivity] = useState<{ activity: DealActivity; tab: ActivityModalTab } | null>(null)
  const [showSelector, setShowSelector] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [, startTransition] = useTransition()

  // New states for tabs
  const [contact, setContact] = useState<Contact | null>(null)
  const [contactOptions, setContactOptions] = useState<ContactOption[]>([])
  const [company, setCompany] = useState<Company | null>(null)
  const [companyOptions, setCompanyOptions] = useState<CompanyWithStats[]>([])
  const [otherDeals, setOtherDeals] = useState<DealRow2[]>([])
  const [customFields, setCustomFields] = useState<CustomFieldDefinition[]>([])
  const [fieldValues, setFieldValues] = useState<CustomFieldValue[]>([])
  const [history, setHistory] = useState<DealHistory[]>([])
  const [showFieldsManager, setShowFieldsManager] = useState<CustomFieldEntity | null>(null)

  const activitiesListRef = useRef<HTMLDivElement>(null)

  const currentStage = pipeline.stages.find((s) => s.id === deal.stage_id)
  const currentDealIdx = allDeals.findIndex((d) => d.id === deal.id)
  const ownerName = deal.owner_profile?.full_name ?? 'Usuário'
  const displayName = deal.lead?.name ?? deal.title
  const initials = displayName.split(' ').slice(0, 2).map((p: string) => p[0]).join('').toUpperCase()

  const actGroups = groupActivities(activities)

  useEffect(() => {
    setDeal(initialDeal)
  }, [initialDeal])

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)

    // Uma única server action carrega tudo que a aba ativa precisa. Antes eram
    // 3-4 actions por aba e o Next.js serializa server actions vindas do client
    // (rodavam em fila, um round-trip cada). Agora é um round-trip só — o
    // servidor paraleliza internamente. A action é tolerante a falha por peça,
    // então uma aba com erro não derruba as atividades.
    try {
      const data = await getDealSheetData({
        dealId: deal.id,
        leadId: deal.lead_id ?? null,
        companyId: deal.company_id ?? null,
        tab,
      })

      setActivities(data.activities)
      if (data.activities.length > 0) {
        setSelected((prev) => {
          if (prev && data.activities.find((a: DealActivity) => a.id === prev.id)) return prev
          const { scheduled, pending } = groupActivities(data.activities)
          return scheduled[0] ?? pending[0] ?? data.activities[0]
        })
      }

      if (tab === 'contact') {
        setContact(data.contact)
        setCustomFields(data.customFields)
        setFieldValues(data.fieldValues)
        setContactOptions(data.contactOptions)
      } else if (tab === 'company') {
        setCompanyOptions(data.companyOptions)
        setCompany(data.company)
        setCustomFields(data.customFields)
        setFieldValues(data.fieldValues)
      } else if (tab === 'deal') {
        setCustomFields(data.customFields)
        setFieldValues(data.fieldValues)
        setOtherDeals(data.otherDeals)
      } else if (tab === 'notes' || tab === 'history') {
        setHistory(data.history)
      }
    } catch (err) {
      console.error('Failed to load deal sheet data:', err)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [deal.id, deal.lead_id, deal.company_id, tab])

  function switchDeal(nextDeal: DealRow) {
    setDeal(nextDeal)
    setSelected(null)
    setActivities([])
    setContact(null)
    setContactOptions([])
    setCompany(null)
    setOtherDeals([])
    setCustomFields([])
    setFieldValues([])
    setHistory([])
  }

  function handleNavigateDeal(direction: 'previous' | 'next') {
    const nextIndex = direction === 'previous' ? currentDealIdx - 1 : currentDealIdx + 1
    const nextDeal = allDeals[nextIndex]
    if (nextDeal) switchDeal(nextDeal)
  }

  function handleOpenRelatedDeal(dealId: string) {
    const related = allDeals.find((item) => item.id === dealId)
    if (!related) {
      toast.info('Este negócio não está na visualização atual do funil.')
      return
    }

    switchDeal(related)
  }

  function toLeadSummary(contactRecord: Contact): DealRow['lead'] {
    return {
      name: contactRecord.name,
      company: contactRecord.company,
      phone: contactRecord.phone,
      email: contactRecord.email,
    }
  }

  // Propagates current activity counts to the Kanban card immediately so the
  // board updates without a full page refresh.
  function syncActivityCounts(nextActivities: DealActivity[]) {
    const total = nextActivities.length
    const done = nextActivities.filter((a) => !!a.completed_at).length
    const updated = { ...deal, activities_total: total, activities_done: done }
    setDeal(updated)
    onUpdate(updated)
  }

  function applyDealPatch(patch: Partial<DealRow>) {
    const updated = { ...deal, ...patch }
    setDeal(updated)
    onUpdate(updated)
  }

  function handleContactUpdated(updatedContact: Contact) {
    setContact(updatedContact)
    applyDealPatch({ lead: toLeadSummary(updatedContact) })
  }

  async function handleLinkContact(contactId: string) {
    const contactRes = await getContact(contactId)
    if (!contactRes) {
      toast.error('Contato não encontrado.')
      throw new Error('Contato não encontrado.')
    }

    let nextContact = contactRes
    let nextCompanyId = contactRes.company_id ?? deal.company_id

    if (deal.company_id && !contactRes.company_id && company?.name) {
      const leadRes = await updateLead(contactId, {
        company_id: deal.company_id,
        company: company.name,
      })
      if (leadRes.error) {
        toast.error(leadRes.error)
        throw new Error(leadRes.error)
      }
      nextContact = { ...contactRes, company_id: deal.company_id, company: company.name }
      nextCompanyId = deal.company_id
    }

    const dealRes = await updateDeal(deal.id, {
      lead_id: contactId,
      company_id: nextCompanyId ?? null,
    })
    if (dealRes.error) {
      toast.error(dealRes.error)
      throw new Error(dealRes.error)
    }

    setContact(nextContact)
    setContactOptions((prev) => prev.filter((item) => item.id !== contactId))
    applyDealPatch({
      lead_id: contactId,
      company_id: nextCompanyId ?? null,
      lead: toLeadSummary(nextContact),
    })

    if (nextCompanyId && nextCompanyId !== company?.id) {
      setCompany(await getCompany(nextCompanyId))
    }

    toast.success('Contato vinculado ao negócio')
  }

  async function handleCreateContact(input: { name: string; email?: string; phone?: string; company?: string; instagram?: string; google_business?: string }) {
    const res = await createLead({
      name: input.name,
      email: input.email,
      phone: input.phone,
      company: input.company || company?.name || undefined,
      company_id: deal.company_id ?? null,
      status: 'new',
      instagram: input.instagram,
      google_business: input.google_business,
    })
    if (res.error || !res.id) {
      toast.error(res.error ?? 'Não foi possível criar o contato.')
      throw new Error(res.error ?? 'Não foi possível criar o contato.')
    }

    await handleLinkContact(res.id)
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, tabKey: Tab) {
    const currentIndex = DETAIL_TABS.findIndex((item) => item.key === tabKey)
    const lastIndex = DETAIL_TABS.length - 1
    let nextIndex: number | null = null

    if (event.key === 'ArrowRight') nextIndex = currentIndex === lastIndex ? 0 : currentIndex + 1
    if (event.key === 'ArrowLeft') nextIndex = currentIndex === 0 ? lastIndex : currentIndex - 1
    if (event.key === 'Home') nextIndex = 0
    if (event.key === 'End') nextIndex = lastIndex

    if (nextIndex === null) return

    event.preventDefault()
    setTab(DETAIL_TABS[nextIndex].key)
    window.requestAnimationFrame(() => {
      document.getElementById(`deal-tab-${DETAIL_TABS[nextIndex].key}`)?.focus()
    })
  }

  useEffect(() => {
    loadData()
  }, [loadData])

  // Keep the Kanban card's activity counter in sync whenever activities change
  // (add, toggle, clear, playbook applied). Covers all mutation paths in one place.
  useEffect(() => {
    syncActivityCounts(activities)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activities])

  function handleMove(stageId: string) {
    const targetStage = pipeline.stages.find(s => s.id === stageId)
    const status = targetStage?.status_kind === 'won'
      ? 'won'
      : targetStage?.status_kind === 'lost'
        ? 'lost'
        : 'open'

    startTransition(async () => {
      const res = await moveDeal(deal.id, stageId)
      if (res.error) { toast.error(res.error); return }
      
      const updatedDeal = { ...deal, stage_id: stageId, status }
      setDeal(updatedDeal)
      onUpdate(updatedDeal)
      
      toast.success(`Movido para ${targetStage?.name || 'nova etapa'}`)
      // Estado já atualizado de forma otimista acima; refetch completo aqui
      // (router.refresh + loadData) custava 15+ queries por movimentação.
      loadData(true)
    })
  }

  function handleToggle(act: DealActivity) {
    // Optimistic: flip locally and persist. No refetch needed — the toggle
    // changes nothing else on screen. The activities useEffect syncs counts to
    // the board card automatically when the state updates.
    const complete = !act.completed_at
    const completedAt = complete ? new Date().toISOString() : null
    setActivities(activities.map((a) => (a.id === act.id ? { ...a, completed_at: completedAt } : a)))
    if (selected?.id === act.id) {
      setSelected((prev) => (prev ? { ...prev, completed_at: completedAt } : prev))
    }
    startTransition(async () => {
      const res = await toggleDealActivity(act.id, complete)
      if (res.error) {
        toast.error(res.error)
        // Revert on failure.
        setActivities(activities.map((a) => (a.id === act.id ? { ...a, completed_at: act.completed_at } : a)))
        if (selected?.id === act.id) {
          setSelected((prev) => (prev ? { ...prev, completed_at: act.completed_at } : prev))
        }
      }
    })
  }

  async function handleAddActivity() {
    const todayIso = new Date().toISOString().slice(0, 10) + 'T09:00:00'
    const execIso = new Date(todayIso).toISOString()
    const res = await createDealActivity({
      deal_id: deal.id,
      title: 'Nova atividade',
      activity_type: 'task',
      day_offset: 1,
      due_date: execIso,
      scheduled_start_at: execIso,
      is_custom: true,
      assigned_to: (deal as DealRow2).owner_id ?? null,
      priority: 'normal',
    })
    if (res.error) { toast.error(res.error); return }
    await loadData()
  }

  async function handleClearActivities() {
    const res = await clearDealActivities(deal.id)
    if (res.error) { toast.error(res.error); return }
    setActivities([])
    setSelected(null)
    setConfirmClear(false)
    toast.success('Todas as atividades foram removidas.')
  }

  async function handleDeleteDeal() {
    setIsDeleting(true)
    const res = await deleteDeal(deal.id)
    setIsDeleting(false)
    if (res.error) { toast.error(res.error); setConfirmDelete(false); return }
    toast.success('Negócio excluído.')
    onDelete(deal.id)
    onClose()
  }

  async function handleOpenPlaybookSelector() {
    try {
      setLoading(true)
      const pbRes = await getPlaybooks()
      setPlaybooks(pbRes)
      setShowSelector(true)
    } catch {
      toast.error('Erro ao carregar templates.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex overflow-hidden">
      {/* Background overlay is gone, the sheet itself takes the whole screen next to sidebar */}
      {/* We assume the sidebar is ~14rem or 256px wide. We will add a dark backdrop just for the sidebar area if we are truly full screen, or we just slide over the app area. Let's make it fixed over everything with a slight backdrop, but mostly solid background. */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      
      {/* The Sheet: almost 100vw, starts after a small margin to show it's an overlay */}
      <div className="relative ml-auto flex h-full w-[calc(100vw-5rem)] flex-col bg-background shadow-2xl animate-in slide-in-from-right-full duration-300">

        {/* Header */}
        <div className="flex-shrink-0 border-b border-border/50 bg-card/60 px-6 pt-3.5 backdrop-blur-md">
          {/* Linha 1: breadcrumb (esq) + navegação/excluir/fechar (dir) */}
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="min-w-0 truncate text-[10.5px] font-semibold uppercase tracking-[0.12em] ui-muted-subtle">
              {pipeline.name}{currentStage && <> <span className="mx-0.5 text-muted-foreground/40">/</span> <span className="text-muted-foreground/70">{currentStage.name}</span></>}
            </p>
            <div className="flex flex-shrink-0 items-center gap-1.5">
              <button onClick={() => handleNavigateDeal('previous')} disabled={currentDealIdx <= 0} title="Negócio anterior" className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/30 bg-background ui-muted-readable shadow-sm transition-all hover:bg-white/5 hover:text-foreground disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
              <button onClick={() => handleNavigateDeal('next')} disabled={currentDealIdx < 0 || currentDealIdx >= allDeals.length - 1} title="Próximo negócio" className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/30 bg-background ui-muted-readable shadow-sm transition-all hover:bg-white/5 hover:text-foreground disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
              <div className="mx-1 h-6 w-px bg-border/40" />
              {confirmDelete ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-muted-foreground/60">Excluir negócio?</span>
                  <button
                    onClick={handleDeleteDeal}
                    disabled={isDeleting}
                    className="rounded-md bg-red-500/15 px-2.5 py-1 text-[11px] font-bold text-red-400 hover:bg-red-500/25 disabled:opacity-50"
                  >
                    {isDeleting ? 'Excluindo...' : 'Confirmar'}
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="rounded-md px-2 py-1 text-[11px] font-bold text-muted-foreground/60 hover:text-foreground"
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  title="Excluir negócio"
                  className="flex h-8 w-8 items-center justify-center rounded-lg ui-muted-readable transition-colors hover:bg-red-500/10 hover:text-red-500"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
              <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg ui-muted-readable transition-colors hover:bg-red-500/10 hover:text-red-500"><X className="h-5 w-5" /></button>
            </div>
          </div>

          {/* Linha 2: identidade (esq) · valor como número-âncora + dono (dir) */}
          <div className="flex items-end justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary/55 text-base font-black text-primary-foreground shadow-lg shadow-primary/25 ring-1 ring-white/10">
                {initials}
              </div>
              <h1 className="truncate text-[23px] font-bold leading-none tracking-[-0.02em] text-foreground">{displayName}</h1>
            </div>
            <div className="flex flex-shrink-0 items-center gap-3 pb-0.5">
              <span className="text-[17px] font-bold leading-none tracking-tight text-foreground tabular-nums">{formatCurrency(deal.value ?? 0)}</span>
              <span className="h-3.5 w-px bg-border/50" />
              <span className="max-w-[200px] truncate text-[12px] font-medium ui-muted-readable">{ownerName}</span>
            </div>
          </div>

          {/* Linha 3: abas com underline rente à borda inferior do header */}
          <div className="mt-4 flex gap-6" role="tablist" aria-label="Detalhes do negócio">
            {DETAIL_TABS.map((t) => (
              <button
                id={`deal-tab-${t.key}`}
                key={t.key}
                type="button"
                role="tab"
                aria-selected={tab === t.key}
                aria-controls={`deal-panel-${t.key}`}
                tabIndex={tab === t.key ? 0 : -1}
                onKeyDown={(event) => handleTabKeyDown(event, t.key as Tab)}
                onClick={() => setTab(t.key as Tab)}
                className={cn(
                  '-mb-px border-b-2 pb-2.5 text-[13px] font-semibold transition-colors outline-none',
                  tab === t.key
                    ? 'border-canary text-foreground'
                    : 'border-transparent ui-muted-readable hover:text-foreground'
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex flex-1 overflow-hidden">
          {tab === 'messages' && deal.lead_id && (
            <div id="deal-panel-messages" role="tabpanel" aria-labelledby="deal-tab-messages" className="flex h-full w-full bg-background p-6">
              <MessagesPanel leadId={deal.lead_id} workspaceId={deal.workspace_id} dealId={deal.id} />
            </div>
          )}
          {tab === 'messages' && !deal.lead_id && (
            <div id="deal-panel-messages" role="tabpanel" aria-labelledby="deal-tab-messages" className="flex h-full w-full items-center justify-center text-muted-foreground bg-background">
              Este negócio não possui um contato vinculado.
            </div>
          )}
          {tab === 'activities' && (
            <div id="deal-panel-activities" role="tabpanel" aria-labelledby="deal-tab-activities" className="flex h-full w-full flex-col">
              {/* Journey Map — compact stage progression */}
              <div className="flex-shrink-0 border-b border-border/30 bg-muted/5 px-8 py-3">
                <JourneyMap stages={pipeline.stages} currentStageId={deal.stage_id} stageEnteredAt={deal.stage_entered_at} onMove={handleMove} />
              </div>

              {/* Layout: Activities List + Script Panel */}
              <div className="flex flex-1 overflow-hidden">

                {/* 1. Activities List */}
                <div className="flex w-[400px] flex-shrink-0 flex-col border-r border-border/20 bg-background">
                  <div className="flex items-center justify-between border-b border-border/10 px-5 pt-4 pb-3">
                    <h3 className="text-[15px] font-bold tracking-tight text-foreground">Atividades</h3>
                    <div className="flex items-center gap-1.5">
                      {activities.length > 0 && (
                        confirmClear ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10.5px] text-muted-foreground/60">Limpar tudo?</span>
                            <button
                              onClick={handleClearActivities}
                              className="rounded-md bg-red-500/15 px-2 py-1 text-[10.5px] font-bold text-red-400 hover:bg-red-500/25"
                            >
                              Confirmar
                            </button>
                            <button
                              onClick={() => setConfirmClear(false)}
                              className="rounded-md px-1.5 py-1 text-[10.5px] ui-muted-readable hover:text-foreground"
                            >
                              Cancelar
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmClear(true)}
                            title="Limpar todas as atividades"
                            className="rounded-lg bg-muted/40 p-1.5 text-muted-foreground/60 hover:bg-red-500/10 hover:text-red-400"
                          >
                            <Eraser className="h-4 w-4" />
                          </button>
                        )
                      )}
                      <button onClick={handleAddActivity} title="Nova atividade" className="rounded-lg bg-muted/40 p-1.5 text-muted-foreground/60 hover:bg-muted/80 hover:text-foreground">
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* Compact progress — lives inside the column, not stealing column height */}
                  {activities.length > 0 && (() => {
                    const done = activities.filter(a => a.completed_at).length
                    const total = activities.length
                    const pct = Math.round((done / total) * 100)
                    return (
                      <div className="flex-shrink-0 border-b border-border/10 px-5 py-3">
                        <div className="mb-1.5 flex items-center justify-between">
                          <span className="text-[12px] font-medium ui-muted-readable">
                            <span className="font-bold text-foreground">{done}</span> de {total} concluídas
                          </span>
                          <span className={cn('text-[12px] font-black', pct === 100 ? 'text-green-500' : pct >= 50 ? 'text-primary' : 'ui-muted-subtle')}>{pct}%</span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-border/40">
                          <div
                            className={cn('h-full rounded-full transition-all duration-500', pct === 100 ? 'bg-green-500' : 'bg-primary')}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    )
                  })()}

                  <div ref={activitiesListRef} className="flex-1 overflow-y-auto scrollbar-none">
                    {loading ? (
                      <div className="flex items-center justify-center py-10"><div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" /></div>
                    ) : activities.length === 0 ? (
                      <div className="flex flex-col items-center justify-center gap-4 p-8 text-center">
                        <BookTemplate className="h-12 w-12 text-muted-foreground/20" />
                        <p className="text-[15px] font-medium ui-muted-readable">Nenhuma atividade cadastrada para este negócio.</p>
                        <button onClick={handleOpenPlaybookSelector} className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-md transition-all hover:bg-primary/90">
                          Escolher template
                        </button>
                        <button onClick={handleAddActivity} className="text-xs font-bold ui-muted-subtle hover:text-foreground">
                          + Criar atividade manual
                        </button>
                      </div>
                    ) : (
                      <div className="pb-16">
                        {/* Botão de template compacto */}
                        <div className="px-4 py-3 border-b border-border/10">
                          <button onClick={handleOpenPlaybookSelector} className="flex w-full items-center justify-center gap-2 rounded-lg border border-border/30 bg-muted/20 px-3 py-2 text-[12px] font-bold ui-muted-readable transition-all hover:border-primary/40 hover:bg-primary/5 hover:text-primary">
                            <BookTemplate className="h-3.5 w-3.5" /> Escolher template
                          </button>
                        </div>

                        {/* Cabeçalho da coluna Dias */}
                        <div className="flex items-center gap-3 border-b border-border/10 px-4 py-2">
                          <span className="w-5 flex-shrink-0 text-center text-[10px] font-black uppercase tracking-wider ui-muted-subtle">Dia</span>
                          <span className="text-[10px] font-black uppercase tracking-wider ui-muted-subtle">Próximas atividades</span>
                        </div>

                        {/* Lista flat: pendentes + agendadas ordenadas por dia */}
                        {sortForList([...actGroups.scheduled, ...actGroups.pending]).map((act) => (
                          <ActivityRow
                            key={act.id}
                            act={act}
                            isSelected={selected?.id === act.id}
                            onToggle={handleToggle}
                            onSelect={setSelected}
                            onSchedule={(act) => setActiveActivity({ activity: act, tab: 'schedule' })}
                          />
                        ))}

                        {/* Concluídas colapsáveis */}
                        {actGroups.done.length > 0 && (
                          <div className="border-t border-border/10 mt-2">
                            <button
                              type="button"
                              onClick={() => setShowDone((v) => !v)}
                              className="flex w-full items-center gap-2 px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider ui-muted-subtle hover:text-foreground transition-colors"
                            >
                              {showDone ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                              Concluídas
                              <span className="ml-1 rounded-full bg-muted/60 px-1.5 py-0.5 text-[10px] font-black">{actGroups.done.length}</span>
                            </button>
                            {showDone && sortForList(actGroups.done).map((act) => (
                              <ActivityRow
                                key={act.id}
                                act={act}
                                isSelected={selected?.id === act.id}
                                onToggle={handleToggle}
                                onSelect={setSelected}
                                onSchedule={(act) => setActiveActivity({ activity: act, tab: 'schedule' })}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* 2. Script Panel (Takes remaining space) */}
                <div className="flex-1 overflow-y-auto bg-muted/5 px-8 py-6 scrollbar-none">
                  {activities.length > 0 && (
                    <ScriptPanel
                      activity={selected}
                      onEdit={() => selected && setActiveActivity({ activity: selected, tab: 'content' })}
                      onComplete={() => selected && handleToggle(selected)}
                    />
                  )}
                </div>

              </div>
            </div>
          )}

          {/* Other tabs remain simple */}
          {tab === 'contact' && (
            <div id="deal-panel-contact" role="tabpanel" aria-labelledby="deal-tab-contact" className="flex-1 overflow-hidden">
              <ContactTab
                contact={contact}
                contactOptions={contactOptions}
                customFields={customFields}
                fieldValues={fieldValues}
                expectsContact={!!deal.lead_id}
                suggestedName={deal.lead?.name ?? deal.title}
                suggestedCompanyName={company?.name ?? deal.lead?.company ?? null}
                onRefresh={loadData}
                onManageFields={() => setShowFieldsManager('contact')}
                onCreateContact={handleCreateContact}
                onLinkContact={handleLinkContact}
                onContactUpdated={handleContactUpdated}
              />
            </div>
          )}

          {tab === 'company' && (
            <div id="deal-panel-company" role="tabpanel" aria-labelledby="deal-tab-company" className="flex-1 overflow-hidden">
              <CompanyTab
                company={company}
                companies={companyOptions}
                customFields={customFields}
                fieldValues={fieldValues}
                expectsCompany={!!deal.company_id}
                onRefresh={loadData}
                onLinkCompany={async (id, companyName) => {
                  const res = await updateDeal(deal.id, { company_id: id })
                  if (res.error) {
                    toast.error(res.error)
                    throw new Error(res.error)
                  }

                  const selectedCompany = companyOptions.find((item) => item.id === id)
                  const syncedCompanyName = companyName ?? selectedCompany?.name
                  if (deal.lead_id && syncedCompanyName) {
                    const leadRes = await updateLead(deal.lead_id, {
                      company_id: id,
                      company: syncedCompanyName,
                    })
                    if (leadRes.error) {
                      toast.error(leadRes.error)
                      throw new Error(leadRes.error)
                    }
                  }

                  applyDealPatch({
                    company_id: id,
                    lead: deal.lead && syncedCompanyName
                      ? { ...deal.lead, company: syncedCompanyName }
                      : deal.lead,
                  })
                  loadData()
                }}
                onManageFields={() => setShowFieldsManager('company')}
              />
            </div>
          )}

          {tab === 'deal' && (
            <div id="deal-panel-deal" role="tabpanel" aria-labelledby="deal-tab-deal" className="flex-1 overflow-hidden">
              <DealInfoTab
                deal={deal}
                otherDeals={otherDeals}
                customFields={customFields}
                fieldValues={fieldValues}
                onRefresh={loadData}
                onDealPatch={applyDealPatch}
                onOpenDeal={handleOpenRelatedDeal}
                onManageFields={() => setShowFieldsManager('deal')}
              />
            </div>
          )}

          {tab === 'notes' && (
            <div id="deal-panel-notes" role="tabpanel" aria-labelledby="deal-tab-notes" className="flex-1 overflow-hidden">
              <NotesTab
                dealId={deal.id}
                history={history}
                onRefresh={loadData}
              />
            </div>
          )}

          {tab === 'history' && (
            <div id="deal-panel-history" role="tabpanel" aria-labelledby="deal-tab-history" className="flex-1 overflow-hidden">
              <HistoryTab 
                history={history}
              />
            </div>
          )}
        </div>
      </div>

      {/* Unified Activity Modal */}
      {activeActivity && (
        <ActivityUnifiedModal
          activity={activeActivity.activity}
          members={members}
          initialTab={activeActivity.tab}
          onClose={() => setActiveActivity(null)}
          onSaved={(updated) => {
            setActivities((prev) => prev.map((a) => a.id === updated.id ? updated : a))
            if (selected?.id === updated.id) setSelected(updated)
            setActiveActivity(null)
            loadData(true)
          }}
          onDeleted={(id) => {
            setActivities((prev) => prev.filter((a) => a.id !== id))
            setSelected((prev) => prev?.id === id ? null : prev)
            setActiveActivity(null)
            loadData(true)
          }}
        />
      )}

      {showSelector && (
        <PlaybookSelectorModal
          dealId={deal.id}
          hasExistingActivities={activities.length > 0}
          playbooks={playbooks}
          onClose={() => setShowSelector(false)}
          onApplied={() => {
            setShowSelector(false)
            loadData()
          }}
          onTemplatesChanged={() => {
            loadData(true)
          }}
        />
      )}

      {showFieldsManager && (
        <CustomFieldsManagerModal 
          entityType={showFieldsManager}
          onClose={() => setShowFieldsManager(null)}
          onUpdated={loadData}
        />
      )}
    </div>
  )
}
