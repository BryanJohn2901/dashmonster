'use client'

import { useCallback, useRef, useState, useMemo, useTransition, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { TrendingUp, Briefcase, Settings, Search, SlidersHorizontal, Plus, X, Trophy, XCircle, ArrowUpDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { moveDeal, type DealRow } from '@/lib/actions/deals'
import type { PipelineWithStages } from '@/lib/actions/pipelines'
import { formatCurrency } from '@/lib/utils/formatters'
import { KanbanColumn } from './KanbanColumn'
import { DealCard } from './DealCard'
import { DealForm } from './DealForm'
import { PipelineSettingsModal } from './PipelineSettingsModal'
import { DealDetailSheet } from './DealDetailSheet'

interface KanbanBoardProps {
  pipelines: PipelineWithStages[]
  initialDeals: DealRow[]
  initialMembers?: { id: string; name: string }[]
  /** Página client refaz o fetch (o original usava router.refresh de RSC). */
  onRefresh?: () => void
}

type StatusFilter = 'all' | 'open' | 'won' | 'lost'
type TemperatureFilter = 'all' | 'cold' | 'warm' | 'hot'
type ActivityFilter = 'all' | 'pending' | 'done' | 'none'
type DealStatus = 'open' | 'won' | 'lost'
type QuickFilter = 'none' | 'closing_week' | 'stale' | 'no_activity'
type SortBy = 'created' | 'value' | 'close_date' | 'time_in_stage'

const QUICK_FILTERS: { value: Exclude<QuickFilter, 'none'>; label: string }[] = [
  { value: 'closing_week', label: 'Fecha esta semana' },
  { value: 'stale', label: 'Parado 7+ dias' },
  { value: 'no_activity', label: 'Sem atividade' },
]

const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: 'created', label: 'Criação' },
  { value: 'value', label: 'Maior valor' },
  { value: 'close_date', label: 'Prazo' },
  { value: 'time_in_stage', label: 'Mais parado' },
]

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'open', label: 'Aberto' },
  { value: 'won', label: 'Ganho' },
  { value: 'lost', label: 'Perdido' },
]

const TEMPERATURE_FILTERS: { value: TemperatureFilter; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'cold', label: 'Frio' },
  { value: 'warm', label: 'Morno' },
  { value: 'hot', label: 'Quente' },
]

const ACTIVITY_FILTERS: { value: ActivityFilter; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'pending', label: 'Pendentes' },
  { value: 'done', label: 'Concluidas' },
  { value: 'none', label: 'Sem atividade' },
]

function dealStatusForStage(statusKind?: string): DealStatus {
  if (statusKind === 'won') return 'won'
  if (statusKind === 'lost') return 'lost'
  return 'open'
}

export function KanbanBoard({ pipelines, initialDeals, initialMembers = [], onRefresh }: KanbanBoardProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [deals, setDeals] = useState<DealRow[]>(initialDeals)
  const members = initialMembers
  const activePipelineId = searchParams.get('id') || (pipelines[0]?.id ?? '')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [selectedDeal, setSelectedDeal] = useState<DealRow | null>(null)
  const [defaultStageId, setDefaultStageId] = useState<string>('')
  const [settingsModalOpen, setSettingsModalOpen] = useState(false)
  const [editingPipeline, setEditingPipeline] = useState<PipelineWithStages | null>(null)
  const [detailDeal, setDetailDeal] = useState<DealRow | null>(null)

  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open')
  const [showFilters, setShowFilters] = useState(false)
  const [temperatureFilter, setTemperatureFilter] = useState<TemperatureFilter>('all')
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>('all')
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('none')
  const [sortBy, setSortBy] = useState<SortBy>('created')

  const wasDragging = useRef(false)
  const [, startTransition] = useTransition()

  // Resync com o payload do servidor quando router.refresh()/revalidate traz
  // dados novos (ex.: negócio criado pelo formulário). Sem isso o estado local
  // ficava preso ao initialDeals do primeiro render.
  useEffect(() => {
    setDeals(initialDeals)
  }, [initialDeals])

  // Deep-link da busca global (?deal=): abre o card e limpa o parâmetro da URL
  // para que fechar o sheet não o reabra.
  useEffect(() => {
    const dealId = searchParams.get('deal')
    if (!dealId) return
    const target = deals.find((d) => d.id === dealId)
    if (target) setDetailDeal(target)
    const params = new URLSearchParams(searchParams.toString())
    params.delete('deal')
    router.replace(`/crm/pipeline?${params.toString()}`, { scroll: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, deals])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    // Acessibilidade: mover cards pelo teclado (focar o card, Enter/Espaço
    // para pegar, setas para mover, Enter para soltar).
    useSensor(KeyboardSensor),
  )

  const activePipeline = pipelines.find((p) => p.id === activePipelineId)
  const stages = useMemo(() => activePipeline?.stages ?? [], [activePipeline])
  const stageStatusMap = useMemo(
    () => new Map(stages.map((stage) => [stage.id, dealStatusForStage(stage.status_kind)])),
    [stages]
  )
  const terminalStageIds = useMemo(() => ({
    won: stages.find((stage) => stage.status_kind === 'won')?.id ?? null,
    lost: stages.find((stage) => stage.status_kind === 'lost')?.id ?? null,
  }), [stages])
  const getVisibleStageId = useCallback((deal: DealRow) => {
    if (deal.status === 'won' && terminalStageIds.won) return terminalStageIds.won
    if (deal.status === 'lost' && terminalStageIds.lost) return terminalStageIds.lost
    return deal.stage_id
  }, [terminalStageIds])
  const hasAdvancedFilters = temperatureFilter !== 'all' || activityFilter !== 'all' || sortBy !== 'created'

  // Deals for the current active pipeline — with search filter applied
  const pipelineDeals = useMemo(() => {
    let filtered = deals.filter((d) => {
      if (d.pipeline_id !== activePipelineId) return false
      if (statusFilter === 'all') return true
      return (stageStatusMap.get(getVisibleStageId(d)) ?? d.status) === statusFilter
    })
    const q = searchQuery.toLowerCase()

    if (q.trim()) {
      filtered = filtered.filter((d) =>
        d.title.toLowerCase().includes(q) ||
        (d.lead?.name ?? '').toLowerCase().includes(q) ||
        (d.lead?.company ?? '').toLowerCase().includes(q)
      )
    }

    if (temperatureFilter !== 'all') {
      filtered = filtered.filter((d) => d.temperature === temperatureFilter)
    }

    if (activityFilter === 'pending') {
      filtered = filtered.filter((d) => d.activities_total > 0 && d.activities_done < d.activities_total)
    } else if (activityFilter === 'done') {
      filtered = filtered.filter((d) => d.activities_total > 0 && d.activities_done === d.activities_total)
    } else if (activityFilter === 'none') {
      filtered = filtered.filter((d) => d.activities_total === 0)
    }

    // Filtros rápidos de 1 clique (padrão Pipedrive)
    if (quickFilter === 'closing_week') {
      const now = Date.now()
      const weekAhead = now + 7 * 86_400_000
      filtered = filtered.filter((d) => {
        const close = d.expected_close_date ?? d.due_date
        if (!close || d.status !== 'open') return false
        const t = new Date(close).getTime()
        return t <= weekAhead
      })
    } else if (quickFilter === 'stale') {
      const cutoff = Date.now() - 7 * 86_400_000
      filtered = filtered.filter(
        (d) => d.status === 'open' && d.stage_entered_at && new Date(d.stage_entered_at).getTime() < cutoff
      )
    } else if (quickFilter === 'no_activity') {
      filtered = filtered.filter((d) => d.activities_total === 0)
    }

    // Ordenação dentro das colunas
    const sorted = [...filtered]
    if (sortBy === 'value') {
      sorted.sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
    } else if (sortBy === 'close_date') {
      sorted.sort((a, b) => {
        const aClose = a.expected_close_date ?? a.due_date
        const bClose = b.expected_close_date ?? b.due_date
        if (!aClose && !bClose) return 0
        if (!aClose) return 1
        if (!bClose) return -1
        return new Date(aClose).getTime() - new Date(bClose).getTime()
      })
    } else if (sortBy === 'time_in_stage') {
      sorted.sort(
        (a, b) => new Date(a.stage_entered_at ?? a.updated_at).getTime() - new Date(b.stage_entered_at ?? b.updated_at).getTime()
      )
    }

    return sorted
  }, [deals, activePipelineId, searchQuery, statusFilter, temperatureFilter, activityFilter, quickFilter, sortBy, stageStatusMap, getVisibleStageId])

  const activeDeal = activeId ? deals.find((d) => d.id === activeId) : null

  const stats = useMemo(() => {
    const pipelineValue = pipelineDeals.reduce((s, d) => s + (d.value ?? 0), 0)
    return { total: pipelineDeals.length, pipelineValue }
  }, [pipelineDeals])

  // Totais reais de ganho/perdido (independentes do filtro de status) para as
  // pílulas compactas — antes as colunas terminais ficavam sempre "vazias" no
  // filtro padrão "Aberto", ocupando espaço e confundindo.
  const terminalStats = useMemo(() => {
    const inPipeline = deals.filter((d) => d.pipeline_id === activePipelineId)
    const won = inPipeline.filter((d) => d.status === 'won')
    const lost = inPipeline.filter((d) => d.status === 'lost')
    return {
      won: { count: won.length, value: won.reduce((s, d) => s + (d.value ?? 0), 0) },
      lost: { count: lost.length, value: lost.reduce((s, d) => s + (d.value ?? 0), 0) },
    }
  }, [deals, activePipelineId])

  // Etapas visíveis como coluna: no filtro "Aberto", ganho/perdido viram pílulas.
  const collapseTerminals = statusFilter === 'open'
  const visibleStages = useMemo(
    () => (collapseTerminals ? stages.filter((s) => s.status_kind !== 'won' && s.status_kind !== 'lost') : stages),
    [stages, collapseTerminals]
  )

  // Anúncios para leitores de tela durante o drag (pt-BR)
  const dealTitle = useCallback(
    (id: string | number) => deals.find((d) => d.id === id)?.title ?? 'negócio',
    [deals]
  )
  const stageName = useCallback(
    (id: string | number | undefined) => stages.find((s) => s.id === id)?.name ?? 'etapa',
    [stages]
  )
  const announcements = useMemo(() => ({
    onDragStart: ({ active }: { active: { id: string | number } }) =>
      `Negócio ${dealTitle(active.id)} selecionado. Use as setas para mover.`,
    onDragOver: ({ active, over }: { active: { id: string | number }; over: { id: string | number } | null }) =>
      over ? `${dealTitle(active.id)} sobre a etapa ${stageName(over.id)}.` : undefined,
    onDragEnd: ({ active, over }: { active: { id: string | number }; over: { id: string | number } | null }) =>
      over
        ? `${dealTitle(active.id)} solto na etapa ${stageName(over.id)}.`
        : `${dealTitle(active.id)} solto.`,
    onDragCancel: ({ active }: { active: { id: string | number } }) =>
      `Movimentação de ${dealTitle(active.id)} cancelada.`,
  }), [dealTitle, stageName])

  function handleDragStart({ active }: DragStartEvent) {
    wasDragging.current = true
    setActiveId(active.id as string)
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null)
    setTimeout(() => { wasDragging.current = false }, 0)

    if (!over || active.id === over.id) return
    const targetStageId = over.id as string
    const targetStage = stages.find((s) => s.id === targetStageId)
    if (!targetStage) return

    const dealId = active.id as string
    const previousDeals = deals

    const nextStatus = dealStatusForStage(targetStage.status_kind)
    setDeals((prev) => prev.map((d) => (d.id === dealId ? { ...d, stage_id: targetStageId, status: nextStatus } : d)))
    toast.success(`Movido para "${targetStage.name}"`)

    startTransition(async () => {
      const result = await moveDeal(dealId, targetStageId)
      if (result.error) {
        setDeals(previousDeals)
        toast.error('Erro ao mover negócio')
      }
    })
  }

  function handleAddDeal(stageId: string) {
    setSelectedDeal(null)
    setDefaultStageId(stageId)
    setFormOpen(true)
  }

  function handleOpenDetail(deal: DealRow) {
    setDetailDeal(deal)
  }

  function clearAdvancedFilters() {
    setTemperatureFilter('all')
    setActivityFilter('all')
    setSortBy('created')
  }

  if (!activePipeline) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-dashed text-muted-foreground">
        Nenhum funil encontrado. Crie um nas configurações.
      </div>
    )
  }

  return (
    <>
      {/* ── Toolbar ─────────────────────────────────────────────────── */}
      <div className="mb-3 flex flex-col gap-3">
        {/* Row 1: Title + actions */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-foreground">{activePipeline.name}</h2>
            <span className="rounded-full bg-muted/30 px-2 py-0.5 text-xs text-muted-foreground/60">
              {stats.total} negócios
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Stats pill */}
            <div className="flex items-center gap-3 rounded-xl border border-border/40 bg-card/60 px-3 py-1.5 text-xs backdrop-blur-sm">
              <div className="flex items-center gap-1.5">
                <TrendingUp className="h-3 w-3 text-primary/70" />
                <span className="text-muted-foreground/60">Total</span>
                <span className="font-bold text-foreground">{formatCurrency(stats.pipelineValue)}</span>
              </div>
              <div className="h-3 w-px bg-border/50" />
              <div className="flex items-center gap-1">
                <Briefcase className="h-3 w-3 text-blue-400/70" />
                <span className="text-muted-foreground/60">{stats.total}</span>
              </div>
            </div>

            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs text-muted-foreground"
              onClick={() => { setEditingPipeline(activePipeline); setSettingsModalOpen(true) }}
            >
              <Settings className="mr-1.5 h-3 w-3" />
              Configurar
            </Button>

            <Button
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => handleAddDeal(stages[0]?.id ?? '')}
            >
              <Plus className="h-3 w-3" />
              Negócio
            </Button>
          </div>
        </div>

        {/* Row 2: Filter bar */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Busca */}
          <div className="relative flex-1 max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60" />
            <input
              type="text"
              placeholder="Buscar negócio ou lead..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 w-full rounded-lg border border-border/40 bg-card/60 pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 backdrop-blur-sm"
            />
          </div>

          {/* Status — segmented control (selecionar a visão por status) */}
          <div className="flex items-center gap-0.5 rounded-lg bg-muted/25 p-0.5" role="group" aria-label="Filtrar por status">
            {STATUS_FILTERS.map((status) => (
              <button
                key={status.value}
                type="button"
                onClick={() => setStatusFilter(status.value)}
                className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-all ${
                  statusFilter === status.value
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground/70 hover:text-foreground'
                }`}
                aria-pressed={statusFilter === status.value}
              >
                {status.label}
              </button>
            ))}
          </div>

          {/* Atalhos — filtros rápidos de 1 clique, rotulados e visualmente distintos */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50">Atalhos</span>
            {QUICK_FILTERS.map((filter) => (
              <button
                key={filter.value}
                type="button"
                onClick={() => setQuickFilter((prev) => (prev === filter.value ? 'none' : filter.value))}
                className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-all ${
                  quickFilter === filter.value
                    ? 'border-amber-500/40 bg-amber-500/15 text-amber-400'
                    : 'border-border/40 text-muted-foreground/70 hover:border-border/70 hover:text-foreground'
                }`}
                aria-pressed={quickFilter === filter.value}
              >
                {filter.label}
              </button>
            ))}
          </div>

          {/* Filtros avançados — ancorado à direita, com indicador de ativo */}
          <button
            type="button"
            onClick={() => setShowFilters((open) => !open)}
            className={`ml-auto flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs transition-colors backdrop-blur-sm ${
              showFilters || hasAdvancedFilters
                ? 'border-primary/40 bg-primary/10 text-primary'
                : 'border-border/40 bg-card/60 text-muted-foreground/70 hover:border-border/70 hover:text-foreground'
            }`}
            aria-pressed={showFilters}
          >
            <SlidersHorizontal className="h-3 w-3" />
            Filtros
            {hasAdvancedFilters && <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-primary" />}
          </button>
        </div>

        {showFilters && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border/40 bg-card/50 px-3 py-2 text-xs backdrop-blur-sm">
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground/60">Temperatura</span>
              {TEMPERATURE_FILTERS.map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  onClick={() => setTemperatureFilter(filter.value)}
                  className={`rounded-md px-2 py-1 text-[11px] transition-colors ${
                    temperatureFilter === filter.value
                      ? 'bg-white/10 text-foreground'
                      : 'text-muted-foreground/60 hover:bg-white/5 hover:text-foreground'
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>

            <div className="h-4 w-px bg-border/50" />

            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground/60">Atividades</span>
              {ACTIVITY_FILTERS.map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  onClick={() => setActivityFilter(filter.value)}
                  className={`rounded-md px-2 py-1 text-[11px] transition-colors ${
                    activityFilter === filter.value
                      ? 'bg-white/10 text-foreground'
                      : 'text-muted-foreground/60 hover:bg-white/5 hover:text-foreground'
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>

            <div className="h-4 w-px bg-border/50" />

            <div className="flex items-center gap-1.5">
              <span className="flex items-center gap-1 text-muted-foreground/60">
                <ArrowUpDown className="h-3 w-3" />
                Ordenar
              </span>
              {SORT_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setSortBy(option.value)}
                  className={`rounded-md px-2 py-1 text-[11px] transition-colors ${
                    sortBy === option.value
                      ? 'bg-white/10 text-foreground'
                      : 'text-muted-foreground/60 hover:bg-white/5 hover:text-foreground'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>

            {hasAdvancedFilters && (
              <button
                type="button"
                onClick={clearAdvancedFilters}
                className="ml-auto flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground/60 transition-colors hover:bg-white/5 hover:text-foreground"
              >
                <X className="h-3 w-3" />
                Limpar
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Kanban board ─────────────────────────────────────────────── */}
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        accessibility={{ announcements }}
      >
        <div className="kanban-board flex gap-3 overflow-x-auto pb-4 pt-1">
          {visibleStages.map((stage, index) => {
            const stageDeals = pipelineDeals.filter((d) => getVisibleStageId(d) === stage.id)
            return (
              <KanbanColumn
                key={stage.id}
                stage={stage}
                deals={stageDeals}
                columnIndex={index}
                onAddDeal={handleAddDeal}
                onEditDeal={handleOpenDetail}
                wasDragging={wasDragging}
              />
            )
          })}

          {/* Pílulas compactas de Ganho/Perdido no filtro "Aberto": mostram os
              totais reais e expandem a coluna ao clicar. Arrastar um card até
              elas também funciona (são droppables). */}
          {collapseTerminals && (
            <div className="flex flex-shrink-0 flex-col gap-2">
              {terminalStageIds.won && (
                <TerminalStagePill
                  stageId={terminalStageIds.won}
                  kind="won"
                  count={terminalStats.won.count}
                  value={terminalStats.won.value}
                  onExpand={() => setStatusFilter('won')}
                />
              )}
              {terminalStageIds.lost && (
                <TerminalStagePill
                  stageId={terminalStageIds.lost}
                  kind="lost"
                  count={terminalStats.lost.count}
                  value={terminalStats.lost.value}
                  onExpand={() => setStatusFilter('lost')}
                />
              )}
            </div>
          )}
        </div>

        <DragOverlay dropAnimation={null}>
          {activeDeal ? (
            <DealCard
              deal={activeDeal}
              stageColor={stages.find((s) => s.id === getVisibleStageId(activeDeal))?.color ?? 'slate'}
              isOverlay
            />
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* ── Deal Form (create/edit) ───────────────────────────────────── */}
      <DealForm
        open={formOpen}
        onOpenChange={setFormOpen}
        onSaved={() => { router.refresh(); onRefresh?.() }}
        deal={selectedDeal}
        pipelineId={activePipelineId}
        defaultStageId={defaultStageId}
        stages={stages}
      />

      {/* ── Pipeline Settings Modal ───────────────────────────────────── */}
      <PipelineSettingsModal
        open={settingsModalOpen}
        onOpenChange={(open) => setSettingsModalOpen(open)}
        pipeline={editingPipeline}
        onSaveSuccess={() => { router.refresh(); onRefresh?.() }}
      />

      {/* ── Deal Detail Sheet ─────────────────────────────────────────── */}
      {detailDeal && (
        <DealDetailSheet
          deal={detailDeal}
          pipeline={activePipeline}
          allDeals={pipelineDeals}
          members={members}
          onClose={() => setDetailDeal(null)}
          onUpdate={(updated) => {
            setDeals((prev) => prev.map((d) => (d.id === updated.id ? updated : d)))
          }}
          onDelete={(dealId) => {
            setDeals((prev) => prev.filter((d) => d.id !== dealId))
            setDetailDeal(null)
          }}
        />
      )}
    </>
  )
}

/**
 * Pílula compacta para etapas terminais (Ganho/Perdido) quando o filtro é
 * "Aberto". Mostra os totais reais, expande a coluna ao clicar e continua
 * sendo um alvo de drop — soltar um card nela move o negócio normalmente.
 */
function TerminalStagePill({
  stageId,
  kind,
  count,
  value,
  onExpand,
}: {
  stageId: string
  kind: 'won' | 'lost'
  count: number
  value: number
  onExpand: () => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stageId })
  const isWon = kind === 'won'
  const Icon = isWon ? Trophy : XCircle
  const accent = isWon ? '34,197,94' : '244,63,94'

  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onExpand}
      title={`${isWon ? 'Ganhos' : 'Perdidos'}: ${count} negócio${count === 1 ? '' : 's'} · ${formatCurrency(value)} — clique para ver`}
      className="flex w-[120px] flex-col items-center gap-1.5 rounded-xl px-3 py-4 text-center transition-all"
      style={{
        background: isOver ? `rgba(${accent},0.12)` : `rgba(${accent},0.05)`,
        boxShadow: isOver
          ? `inset 0 0 0 2px rgba(${accent},0.45)`
          : `inset 0 0 0 1px rgba(${accent},0.18)`,
      }}
    >
      <Icon className="h-4 w-4" style={{ color: `rgba(${accent},0.85)` }} />
      <span className="text-[12px] font-bold text-foreground">{isWon ? 'Ganho' : 'Perdido'}</span>
      <span
        className="rounded-full px-2 py-0.5 text-[11px] font-bold"
        style={{ background: `rgba(${accent},0.15)`, color: `rgba(${accent},0.9)` }}
      >
        {count}
      </span>
      {count > 0 && (
        <span className="text-[10.5px] font-semibold" style={{ color: `rgba(${accent},0.75)` }}>
          {formatCurrency(value)}
        </span>
      )}
      <span className="mt-1 text-[9.5px] uppercase tracking-wide text-muted-foreground/60">
        {isOver ? 'Soltar aqui' : 'Ver coluna'}
      </span>
    </button>
  )
}
