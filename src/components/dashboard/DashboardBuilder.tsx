'use client'

import React, { useMemo, useState, useTransition } from 'react'
import { Settings2, CalendarIcon, ChevronDown, ArrowRight, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { ptBR } from 'date-fns/locale'
import { updateDashboard, getDashboardGoal, saveDashboardGoal, listDashboardGoals, type DashboardBuilderData, type DashboardFilters, type DashboardOverviewData, type DashboardGoal, type DashboardGoalEntry } from '@/lib/actions/dashboard'
import { formatCurrency } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils/cn'

interface DashboardBuilderProps {
  data: DashboardBuilderData
  /** Sem RSC aqui: troca do router.refresh() original — refaz o fetch client-side. */
  onRefresh?: () => void
}

type TabKey = 'overview' | 'funnel'
type DateFilter = 'today' | '7d' | '30d' | 'month' | 'last_month' | 'year' | 'custom'
type FunnelView = 'bars' | 'funnel' | 'pipeline'

type GoalSettings = DashboardGoal

const TABS: { key: TabKey; label: string }[] = [
  { key: 'overview', label: 'Visão geral' },
  { key: 'funnel', label: 'Funil de vendas' },
]

const DATE_OPTIONS: { value: DateFilter; label: string }[] = [
  { value: 'today', label: 'Hoje' },
  { value: '7d', label: 'Últimos 7 dias' },
  { value: '30d', label: 'Últimos 30 dias' },
  { value: 'month', label: 'Este mês' },
  { value: 'last_month', label: 'Mês passado' },
  { value: 'year', label: 'Este ano' },
  { value: 'custom', label: 'Período personalizado' },
]

const DEFAULT_GOALS: GoalSettings = {
  leads: 500,
  sales: 40,
  revenue: 100000,
  annualRevenue: 1200000,
}

export function DashboardBuilder({ data, onRefresh }: DashboardBuilderProps) {
  const [isPending, startTransition] = useTransition()
  const initialFilters = normalizeFilters(data.activeDashboard.default_filters as DashboardFilters)
  const [activeTab, setActiveTab] = useState<TabKey>('overview')
  const [funnelView, setFunnelViewState] = useState<FunnelView>('bars')
  const [dateFilter, setDateFilter] = useState<DateFilter>(toDateFilter(initialFilters.period))
  const [customRange, setCustomRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
    from: initialFilters.customStart ? new Date(initialFilters.customStart) : undefined,
    to: initialFilters.customEnd ? new Date(initialFilters.customEnd) : undefined,
  })
  const [pipelineId, setPipelineId] = useState(initialFilters.pipelineIds?.[0] ?? data.pipelines[0]?.id ?? 'all')
  const now = new Date()
  const [goals, setGoals] = useState<GoalSettings>(DEFAULT_GOALS)
  const [goalsOpen, setGoalsOpen] = useState(false)
  const [goalMonth, setGoalMonth] = useState(now.getMonth() + 1)
  const [goalYear, setGoalYear] = useState(now.getFullYear())
  const [goalPipelineId, setGoalPipelineId] = useState<string | null>(
    pipelineId !== 'all' ? pipelineId : null
  )

  const overview = useMemo(() => buildOverview(data, goals), [data, goals])

  React.useEffect(() => {
    const saved = window.localStorage.getItem('pipeflow-dashboard-funnel-view')
    if (saved === 'bars' || saved === 'funnel' || saved === 'pipeline') {
      setFunnelViewState(saved)
    }
  }, [])

  React.useEffect(() => {
    void loadGoalsForFilter(dateFilter, pipelineId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function setFunnelView(value: FunnelView) {
    setFunnelViewState(value)
    window.localStorage.setItem('pipeflow-dashboard-funnel-view', value)
  }

  // Derive {month, year} from a DateFilter so we can auto-load goals
  function getMonthYearForFilter(filter: DateFilter, range?: { from: Date | undefined; to: Date | undefined }): { month: number; year: number } {
    const n = new Date()
    if (filter === 'last_month') {
      const d = new Date(n.getFullYear(), n.getMonth() - 1, 1)
      return { month: d.getMonth() + 1, year: d.getFullYear() }
    }
    if (filter === 'custom' && range?.from) {
      return { month: range.from.getMonth() + 1, year: range.from.getFullYear() }
    }
    return { month: n.getMonth() + 1, year: n.getFullYear() }
  }

  const goalsSeqRef = React.useRef(0)

  async function loadGoalsForFilter(filter: DateFilter, pid: string, range?: { from: Date | undefined; to: Date | undefined }) {
    const seq = ++goalsSeqRef.current
    const { month, year } = getMonthYearForFilter(filter, range)
    const pipId = pid !== 'all' ? pid : null
    const saved = await getDashboardGoal(pipId, month, year)
    if (goalsSeqRef.current !== seq) return
    setGoals(saved ?? DEFAULT_GOALS)
    setGoalMonth(month)
    setGoalYear(year)
    setGoalPipelineId(pipId)
  }

  function applyFilters(nextDate: DateFilter, nextPipelineId: string, nextRange?: { from: Date | undefined; to: Date | undefined }) {
    setDateFilter(nextDate)
    setPipelineId(nextPipelineId)
    if (nextRange) setCustomRange(nextRange)

    const range = nextRange ?? customRange
    startTransition(async () => {
      const result = await updateDashboard(data.activeDashboard.id, {
        defaultFilters: {
          ...initialFilters,
          period: fromDateFilter(nextDate),
          customStart: nextDate === 'custom' && range.from ? range.from.toISOString().slice(0, 10) : undefined,
          customEnd: nextDate === 'custom' && range.to ? range.to.toISOString().slice(0, 10) : undefined,
          pipelineIds: nextPipelineId === 'all' ? [] : [nextPipelineId],
        },
        pipelineIds: nextPipelineId === 'all' ? [] : [nextPipelineId],
      })

      if (result.error) {
        toast.error(result.error)
        return
      }

      await loadGoalsForFilter(nextDate, nextPipelineId, nextRange ?? customRange)
      onRefresh?.()
    })
  }

  return (
    <div className="-m-5 min-h-[calc(100vh-4rem)] overflow-auto bg-bunker px-5 py-6 text-geyser lg:-m-8 lg:px-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-canary">Indicadores</p>
          <h1 className="mt-1 text-[28px] font-bold tracking-[-0.03em] text-[#F7F9FA]">Dashboard</h1>
          <p className="mt-1 text-sm text-slate">Acompanhe suas métricas comerciais em tempo real.</p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setGoalsOpen(true)}>
          <Settings2 className="h-4 w-4" />
          Configurar metas
        </Button>
      </header>

      <nav className="mb-6 flex gap-0.5 overflow-x-auto pb-1" style={{ borderBottom: '1px solid rgba(216,222,227,0.08)' }}>
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'whitespace-nowrap rounded-xl px-3.5 py-2 text-sm font-medium transition-all duration-200 mb-[-1px]',
              activeTab === tab.key
                ? 'text-canary border-b-2 border-canary rounded-b-none'
                : 'text-slate hover:text-geyser hover:bg-[rgba(216,222,227,0.05)] rounded-b-xl'
            )}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {activeTab === 'overview' ? (
        <OverviewTab
          data={data}
          overview={overview}
          dateFilter={dateFilter}
          customRange={customRange}
          pipelineId={pipelineId}
          goalMonth={goalMonth}
          goalYear={goalYear}
          isPending={isPending}
          onDateChange={(value, range) => applyFilters(value, pipelineId, range)}
          onPipelineChange={(value) => applyFilters(dateFilter, value)}
        />
      ) : (
        <FunnelTab
          data={data}
          overview={overview}
          dateFilter={dateFilter}
          customRange={customRange}
          pipelineId={pipelineId}
          funnelView={funnelView}
          isPending={isPending}
          onFunnelViewChange={setFunnelView}
          onDateChange={(value, range) => applyFilters(value, pipelineId, range)}
          onPipelineChange={(value) => applyFilters(dateFilter, value)}
        />
      )}

      <GoalsModal
        open={goalsOpen}
        onOpenChange={setGoalsOpen}
        goals={goals}
        pipelines={data.pipelines}
        month={goalMonth}
        year={goalYear}
        pipelineId={goalPipelineId}
        onMonthChange={setGoalMonth}
        onYearChange={setGoalYear}
        onPipelineChange={setGoalPipelineId}
        onSave={(g, savedMonth, savedYear) => {
          setGoals(g)
          setGoalMonth(savedMonth)
          setGoalYear(savedYear)
        }}
        onApplyPeriod={(m, y, pid) => {
          // Build a custom range for the exact month
          const from = new Date(y, m - 1, 1)
          const to = new Date(y, m, 0)
          const range = { from, to }
          const targetPipeline = pid ?? (pipelineId !== 'all' ? pipelineId : 'all')
          applyFilters('custom', targetPipeline, range)
        }}
      />
    </div>
  )
}

function OverviewTab({
  data,
  overview,
  dateFilter,
  customRange,
  pipelineId,
  goalMonth,
  goalYear,
  isPending,
  onDateChange,
  onPipelineChange,
}: {
  data: DashboardBuilderData
  overview: DashboardOverviewData & {
    revenueGoal: number
    leadsProgress: number
    salesProgress: number
    revenueProgress: number
    goals: GoalSettings
    summary: { label: string; value: string }[]
  }
  dateFilter: DateFilter
  customRange: { from: Date | undefined; to: Date | undefined }
  pipelineId: string
  goalMonth: number
  goalYear: number
  isPending: boolean
  onDateChange: (value: DateFilter, range?: { from: Date | undefined; to: Date | undefined }) => void
  onPipelineChange: (value: string) => void
}) {
  const goalPace = useMemo(
    () => buildGoalPace(overview, data.users, goalMonth, goalYear),
    [overview, data.users, goalMonth, goalYear]
  )

  return (
    <div className="space-y-5">
      <section className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[20px] font-semibold tracking-[-0.02em] text-[#F7F9FA]">Visão geral</h2>
          <p className="mt-1 text-sm text-slate">Resumo comercial do período selecionado.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Data">
            <DatePickerPopover value={dateFilter} customRange={customRange} disabled={isPending} onChange={onDateChange} />
          </Field>
          <Field label="Pipeline">
            <select value={pipelineId} disabled={isPending} onChange={(event) => onPipelineChange(event.target.value)} className="h-11 min-w-[220px] rounded-xl border border-[rgba(216,222,227,0.12)] bg-[#11151A] px-3.5 text-sm text-geyser outline-none transition-colors focus:border-[rgba(198,244,50,0.60)]">
              <option value="all">Todas as pipelines</option>
              {data.pipelines.map((pipeline) => <option key={pipeline.id} value={pipeline.id}>{pipeline.name}</option>)}
            </select>
          </Field>
        </div>
      </section>

      <section>
        <SectionTitle title="Métricas principais" />
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <MetricCard title="Total de leads" value={formatNumber(overview.totalLeads)} goal={overview.goals.leads} progress={overview.leadsProgress} />
          <MetricCard title="Total de vendas" value={formatNumber(overview.totalSales)} goal={overview.goals.sales} progress={overview.salesProgress} />
          <MetricCard title="Faturamento" value={formatCurrency(overview.revenue)} goal={overview.revenueGoal} progress={overview.revenueProgress} isCurrency />
          <MetricCard title="Ticket médio" value={formatCurrency(overview.avgTicket)} />
          <MetricCard title="Taxa de conversão geral" value={`${formatNumber(overview.conversionRate)}%`} />
          <MetricCard title="Tempo médio de fechamento" value={`${formatNumber(overview.avgSalesCycle)} dias`} />
        </div>
      </section>

      <GoalPaceSection pace={goalPace} />

      <SalesFunnelOverview stages={overview.funnel} view="pipeline" compact />
    </div>
  )
}

function FunnelTab({
  data,
  overview,
  dateFilter,
  customRange,
  pipelineId,
  funnelView,
  isPending,
  onFunnelViewChange,
  onDateChange,
  onPipelineChange,
}: {
  data: DashboardBuilderData
  overview: ReturnType<typeof buildOverview>
  dateFilter: DateFilter
  customRange: { from: Date | undefined; to: Date | undefined }
  pipelineId: string
  funnelView: FunnelView
  isPending: boolean
  onFunnelViewChange: (value: FunnelView) => void
  onDateChange: (value: DateFilter, range?: { from: Date | undefined; to: Date | undefined }) => void
  onPipelineChange: (value: string) => void
}) {
  const openDeals = overview.funnel.reduce((sum, stage) => sum + stage.leads, 0)
  const bottleneck = getBottleneckStage(overview.funnel)

  return (
    <div className="space-y-5">
      <section className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[20px] font-semibold tracking-[-0.02em] text-[#F7F9FA]">Funil de vendas</h2>
          <p className="mt-1 text-sm text-slate">Veja onde os negócios estão concentrados e onde o funil está travando.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Data">
            <DatePickerPopover value={dateFilter} customRange={customRange} disabled={isPending} onChange={onDateChange} />
          </Field>
          <Field label="Pipeline">
            <select value={pipelineId} disabled={isPending} onChange={(event) => onPipelineChange(event.target.value)} className="h-11 min-w-[220px] rounded-xl border border-[rgba(216,222,227,0.12)] bg-[#11151A] px-3.5 text-sm text-geyser outline-none transition-colors focus:border-[rgba(198,244,50,0.60)]">
              <option value="all">Pipeline principal</option>
              {data.pipelines.map((pipeline) => <option key={pipeline.id} value={pipeline.id}>{pipeline.name}</option>)}
            </select>
          </Field>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <FunnelKpi title="Leads" value={formatNumber(overview.totalLeads)} description="Negócios criados no período" />
        <FunnelKpi title="Vendas" value={formatNumber(overview.totalSales)} description="Negócios ganhos no período" />
        <FunnelKpi title="Faturamento" value={formatCurrency(overview.revenue)} description="Receita ganha no período" />
        <FunnelKpi title="Negócios em aberto" value={formatNumber(openDeals)} description="Ainda abertos na pipeline" />
        <FunnelKpi title="Valor em aberto" value={formatCurrency(overview.openPipeline)} description="Soma dos negócios abertos" />
      </section>

      <SalesFunnelOverview
        stages={overview.funnel}
        view={funnelView}
        onViewChange={onFunnelViewChange}
        showDescription
      />

      <FunnelDiagnosis stages={overview.funnel} />

      <FunnelStageTable stages={overview.funnel} />

      <BottleneckDeals stage={bottleneck} />
    </div>
  )
}

function FunnelKpi({ title, value, description }: { title: string; value: string; description: string }) {
  return (
    <article
      className="rounded-[18px] p-5 transition-all duration-200"
      style={{
        background: 'linear-gradient(180deg, #151A20 0%, #11151A 100%)',
        border: '1px solid rgba(216,222,227,0.09)',
      }}
    >
      <p className="text-[13px] font-medium text-slate">{title}</p>
      <p className="mt-2.5 text-[26px] font-bold tracking-[-0.04em] text-[#F7F9FA]">{value}</p>
      <p className="mt-2 text-xs leading-relaxed text-slate/70">{description}</p>
    </article>
  )
}

interface GoalPace {
  remainingDays: number
  remainingSales: number
  remainingRevenue: number
  salesPerDay: number
  revenuePerDay: number
  leadsNeeded: number
  leadsPerDay: number
  conversionRateUsed: number
  avgTicketUsed: number
  sellers: {
    id: string
    name: string
    salesNeeded: number
    revenueNeeded: number
    leadsNeeded: number
  }[]
}

function GoalPaceSection({ pace }: { pace: GoalPace }) {
  return (
    <section>
      <SectionTitle title="Ritmo para bater as metas" />
      <div className="mt-3 grid gap-3 xl:grid-cols-[1.1fr_1.4fr]">
        <div className="grid gap-3 sm:grid-cols-3">
          <PaceCard
            title="Vendas por dia"
            value={formatNumber(pace.salesPerDay)}
            detail={`${formatNumber(pace.remainingSales)} vendas restantes em ${pace.remainingDays} dias`}
          />
          <PaceCard
            title="Faturamento por dia"
            value={formatCurrency(pace.revenuePerDay)}
            detail={`${formatCurrency(pace.remainingRevenue)} restantes no mês`}
          />
          <PaceCard
            title="Leads necessários"
            value={formatNumber(pace.leadsNeeded)}
            detail={`${formatNumber(pace.leadsPerDay)} leads/dia usando ${formatNumber(pace.conversionRateUsed)}% de conversão`}
          />
        </div>

        <div className="overflow-hidden rounded-[20px]" style={{ background: '#151A20', border: '1px solid rgba(216,222,227,0.09)' }}>
          <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(216,222,227,0.07)' }}>
            <div>
              <p className="text-[15px] font-semibold text-[#F7F9FA]">Meta por vendedor</p>
              <p className="text-[12px] text-slate">
                Distribuição automática com ticket médio de {formatCurrency(pace.avgTicketUsed)}.
              </p>
            </div>
          </div>
          <div className="max-h-[240px] overflow-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate/70" style={{ background: 'rgba(216,222,227,0.025)' }}>
                <tr>
                  <th className="px-5 py-3 text-left">Vendedor</th>
                  <th className="px-5 py-3 text-right">Vendas</th>
                  <th className="px-5 py-3 text-right">Faturamento</th>
                  <th className="px-5 py-3 text-right">Leads</th>
                </tr>
              </thead>
              <tbody>
                {pace.sellers.map((seller) => (
                  <tr key={seller.id} className="transition-colors" style={{ borderBottom: '1px solid rgba(216,222,227,0.06)' }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(198,244,50,0.025)' }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                  >
                    <td className="px-5 py-3.5 font-medium text-[#F7F9FA]">{seller.name}</td>
                    <td className="px-5 py-3.5 text-right text-geyser">{formatNumber(seller.salesNeeded)}</td>
                    <td className="px-5 py-3.5 text-right text-geyser">{formatCurrency(seller.revenueNeeded)}</td>
                    <td className="px-5 py-3.5 text-right text-geyser">{formatNumber(seller.leadsNeeded)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  )
}

function PaceCard({ title, value, detail }: { title: string; value: string; detail: string }) {
  return (
    <article
      className="rounded-[18px] p-5 transition-all duration-200"
      style={{
        background: 'linear-gradient(180deg, #151A20 0%, #11151A 100%)',
        border: '1px solid rgba(216,222,227,0.09)',
      }}
    >
      <p className="text-[13px] font-medium text-slate">{title}</p>
      <p className="mt-2.5 text-[26px] font-bold tracking-[-0.04em] text-[#F7F9FA]">{value}</p>
      <p className="mt-2 text-xs leading-relaxed text-slate/70">{detail}</p>
    </article>
  )
}

function SalesFunnelOverview({
  stages,
  view,
  onViewChange,
  compact = false,
  showDescription = false,
}: {
  stages: DashboardOverviewData['funnel']
  view: FunnelView
  onViewChange?: (value: FunnelView) => void
  compact?: boolean
  showDescription?: boolean
}) {
  const maxLeads = Math.max(1, ...stages.map((stage) => stage.leads))
  const bottleneck = getBottleneckStage(stages)

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <SectionTitle title="Distribuição por etapa" />
          {showDescription && (
            <p className="mt-1 text-sm text-slate">Quantidade de negócios em cada etapa da pipeline selecionada.</p>
          )}
        </div>
        {onViewChange && (
          <div className="flex rounded-xl p-1" style={{ background: '#151A20', border: '1px solid rgba(216,222,227,0.09)' }}>
            {[
              { key: 'bars', label: 'Barras' },
              { key: 'funnel', label: 'Funil' },
              { key: 'pipeline', label: 'Pipeline' },
            ].map((option) => (
              <button
                key={option.key}
                onClick={() => onViewChange(option.key as FunnelView)}
                className={cn(
                  'rounded-[10px] px-3 py-1.5 text-xs font-semibold transition-all duration-200',
                  view === option.key
                    ? 'bg-canary text-bunker'
                    : 'text-slate hover:text-geyser hover:bg-[rgba(216,222,227,0.06)]'
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className={cn('mt-3 rounded-[20px] p-5', compact ? 'min-h-[190px]' : 'min-h-[260px]')} style={{ background: '#151A20', border: '1px solid rgba(216,222,227,0.09)' }}>
        {view === 'bars' && (
          <div className="space-y-3">
            {stages.map((stage) => {
              const width = Math.max(5, (stage.leads / maxLeads) * 100)
              const isBottleneck = stage.stageId === bottleneck?.stageId
              return (
                <div key={stage.stageId} className="grid gap-2 lg:grid-cols-[180px_1fr_180px] lg:items-center">
                  <div>
                    <p className="truncate text-sm font-semibold text-geyser">{stage.name}</p>
                    <p className="text-xs text-slate/80">{formatNumber(stage.percentOfFunnel)}% do funil</p>
                  </div>
                  <div className="h-8 overflow-hidden rounded-lg" style={{ background: 'rgba(216,222,227,0.05)' }}>
                    <div
                      className={cn('flex h-full items-center justify-end rounded-lg px-3 text-xs font-bold', isBottleneck ? 'text-bunker' : 'text-bunker')}
                      style={{ width: `${width}%`, background: isBottleneck ? '#FFD166' : '#c6f432' }}
                    >
                      {formatNumber(stage.leads)}
                    </div>
                  </div>
                  <div className="text-left text-xs text-slate lg:text-right">
                    <span className="font-semibold text-geyser">{formatCurrency(stage.openValue)}</span>
                    {isBottleneck && <span className="ml-2 text-amber-400">gargalo</span>}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {view === 'funnel' && (
          <div className="mx-auto flex max-w-4xl flex-col items-center gap-2">
            {stages.map((stage) => {
              const width = Math.max(42, (stage.leads / maxLeads) * 100)
              return (
                <div key={stage.stageId} className="rounded-xl px-4 py-3 text-center text-bunker font-bold" style={{ width: `${width}%`, background: '#c6f432' }}>
                  <p className="text-sm font-bold">{stage.name}</p>
                  <p className="text-xs opacity-80">{formatNumber(stage.leads)} negócios · {formatNumber(stage.percentOfFunnel)}% · {formatCurrency(stage.openValue)}</p>
                </div>
              )
            })}
          </div>
        )}

        {view === 'pipeline' && (
          <div className="flex flex-col gap-3 lg:flex-row lg:items-stretch">
            {stages.map((stage, index) => (
              <div key={stage.stageId} className="flex min-w-0 flex-1 flex-col gap-2">
                <div
                  className="rounded-[16px] p-3.5"
                  style={stage.stageId === bottleneck?.stageId
                    ? { background: 'rgba(255,209,102,0.08)', border: '1px solid rgba(255,209,102,0.22)' }
                    : { background: 'rgba(216,222,227,0.04)', border: '1px solid rgba(216,222,227,0.08)' }
                  }
                >
                  <p className="truncate text-[10px] font-semibold uppercase tracking-[0.08em] text-slate/70">{stage.name}</p>
                  <p className="mt-2 text-[22px] font-bold tracking-[-0.04em] text-[#F7F9FA]">{formatNumber(stage.leads)}</p>
                  <p className="mt-1 text-xs text-slate">{formatCurrency(stage.openValue)}</p>
                </div>
                {index < stages.length - 1 && (
                  <div className="flex items-center justify-center gap-1 text-center text-xs font-semibold text-canary lg:min-h-8">
                    <ArrowRight className="h-3.5 w-3.5" />
                    {stage.nextConversion != null ? `${formatNumber(stage.nextConversion)}% próxima` : '-'}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

function FunnelDiagnosis({ stages }: { stages: DashboardOverviewData['funnel'] }) {
  const concentration = getBottleneckStage(stages)
  const highestValue = [...stages].sort((a, b) => b.openValue - a.openValue)[0]
  const biggestDrop = stages
    .filter((stage) => stage.nextConversion != null)
    .sort((a, b) => (a.nextConversion ?? 100) - (b.nextConversion ?? 100))[0]
  const slowest = [...stages].sort((a, b) => b.avgDays - a.avgDays)[0]
  const noActivity = [...stages].sort((a, b) => b.noNextActivity - a.noNextActivity)[0]

  const items = [
    concentration && {
      title: `Maior concentração: ${concentration.name}`,
      text: `${formatNumber(concentration.leads)} negócios estão nesta etapa.`,
      hint: 'Sugestão: revisar follow-up e cadência de contato.',
    },
    highestValue && {
      title: `Maior valor em aberto: ${highestValue.name}`,
      text: `${formatCurrency(highestValue.openValue)} concentrados nesta etapa.`,
      hint: 'Sugestão: priorizar oportunidades com maior valor.',
    },
    biggestDrop && {
      title: `Maior queda: ${biggestDrop.name}`,
      text: `${formatNumber(biggestDrop.nextConversion ?? 0)}% avançam para a próxima etapa.`,
      hint: 'Sugestão: revisar critérios e abordagem de avanço.',
    },
    slowest && {
      title: `Maior tempo médio: ${slowest.name}`,
      text: `${formatNumber(slowest.avgDays)} dias em média nesta etapa.`,
      hint: 'Sugestão: reduzir bloqueios e definir próxima ação.',
    },
    noActivity && {
      title: `Sem próxima atividade: ${noActivity.name}`,
      text: `${formatNumber(noActivity.noNextActivity)} negócios sem atividade pendente.`,
      hint: 'Sugestão: criar tarefas de follow-up.',
    },
  ].filter(Boolean)

  return (
    <section>
      <SectionTitle title="Diagnóstico do funil" />
      <div className="mt-3 grid gap-3 lg:grid-cols-5">
        {items.map((item) => item && (
          <article
            key={item.title}
            className="rounded-[18px] p-4"
            style={{ background: 'rgba(255,209,102,0.06)', border: '1px solid rgba(255,209,102,0.18)' }}
          >
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <div>
                <p className="text-[13px] font-semibold text-[#F7F9FA]">{item.title}</p>
                <p className="mt-2 text-xs text-slate">{item.text}</p>
                <p className="mt-2 text-xs text-slate/70">{item.hint}</p>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function FunnelStageTable({ stages }: { stages: DashboardOverviewData['funnel'] }) {
  return (
    <section>
      <SectionTitle title="Detalhe por etapa" />
      <div className="mt-3 overflow-x-auto rounded-[20px]" style={{ background: '#151A20', border: '1px solid rgba(216,222,227,0.09)' }}>
        <table className="w-full min-w-[1120px] text-sm">
          <thead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate/70" style={{ background: 'rgba(216,222,227,0.025)', borderBottom: '1px solid rgba(216,222,227,0.07)' }}>
            <tr>
              <th className="px-5 py-3 text-left">Etapa</th>
              <th className="px-5 py-3 text-right">Negócios</th>
              <th className="px-5 py-3 text-right">Entraram</th>
              <th className="px-5 py-3 text-right">Valor aberto</th>
              <th className="px-5 py-3 text-right">% funil</th>
              <th className="px-5 py-3 text-right">Conv. próxima</th>
              <th className="px-5 py-3 text-right">Tempo médio</th>
              <th className="px-5 py-3 text-right">Sem ativ.</th>
              <th className="px-5 py-3 text-right">Atrasadas</th>
              <th className="px-5 py-3 text-right">Perdas</th>
              <th className="px-5 py-3 text-left">Motivo principal</th>
            </tr>
          </thead>
          <tbody>
            {stages.map((stage) => (
              <tr
                key={stage.stageId}
                className="transition-colors"
                style={{ borderBottom: '1px solid rgba(216,222,227,0.06)' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(198,244,50,0.025)' }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
              >
                <td className="px-5 py-3.5 font-semibold text-[#F7F9FA]">{stage.name}</td>
                <td className="px-5 py-3.5 text-right text-geyser">{formatNumber(stage.leads)}</td>
                <td className="px-5 py-3.5 text-right text-geyser">{formatNumber(stage.enteredInPeriod)}</td>
                <td className="px-5 py-3.5 text-right text-geyser">{formatCurrency(stage.openValue)}</td>
                <td className="px-5 py-3.5 text-right text-geyser">{formatNumber(stage.percentOfFunnel)}%</td>
                <td className="px-5 py-3.5 text-right text-geyser">{stage.nextConversion != null ? `${formatNumber(stage.nextConversion)}%` : '-'}</td>
                <td className="px-5 py-3.5 text-right text-geyser">{stage.avgDays > 0 ? `${formatNumber(stage.avgDays)} dias` : '-'}</td>
                <td className="px-5 py-3.5 text-right text-geyser">{formatNumber(stage.noNextActivity)}</td>
                <td className="px-5 py-3.5 text-right text-geyser">{formatNumber(stage.overdueActivities)}</td>
                <td className="px-5 py-3.5 text-right text-geyser">{formatNumber(stage.losses)}</td>
                <td className="px-5 py-3.5 text-slate">{stage.mainLossReason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function BottleneckDeals({ stage }: { stage: DashboardOverviewData['funnel'][number] | null }) {
  if (!stage) return null

  return (
    <section>
      <SectionTitle title={`Negócios parados em ${stage.name}`} />
      <div className="mt-3 overflow-x-auto rounded-[20px]" style={{ background: '#151A20', border: '1px solid rgba(216,222,227,0.09)' }}>
        <table className="w-full min-w-[860px] text-sm">
          <thead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate/70" style={{ background: 'rgba(216,222,227,0.025)', borderBottom: '1px solid rgba(216,222,227,0.07)' }}>
            <tr>
              <th className="px-5 py-3 text-left">Negócio</th>
              <th className="px-5 py-3 text-left">Contato</th>
              <th className="px-5 py-3 text-left">Responsável</th>
              <th className="px-5 py-3 text-right">Valor</th>
              <th className="px-5 py-3 text-right">Dias na etapa</th>
              <th className="px-5 py-3 text-left">Próxima atividade</th>
              <th className="px-5 py-3 text-left">Ação</th>
            </tr>
          </thead>
          <tbody>
            {stage.bottleneckDeals.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-sm text-slate">Nenhum negócio aberto nesta etapa.</td>
              </tr>
            ) : stage.bottleneckDeals.map((deal) => (
              <tr
                key={deal.id}
                className="transition-colors"
                style={{ borderBottom: '1px solid rgba(216,222,227,0.06)' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(198,244,50,0.025)' }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
              >
                <td className="px-5 py-3.5 font-semibold text-[#F7F9FA]">{deal.title}</td>
                <td className="px-5 py-3.5 text-geyser">{deal.contact}</td>
                <td className="px-5 py-3.5 text-geyser">{deal.owner}</td>
                <td className="px-5 py-3.5 text-right font-semibold text-canary">{formatCurrency(deal.value)}</td>
                <td className="px-5 py-3.5 text-right text-geyser">{formatNumber(deal.daysInStage)}</td>
                <td className="px-5 py-3.5 text-slate">{deal.nextActivity}</td>
                <td className="px-5 py-3.5 text-xs font-semibold text-canary cursor-pointer hover:text-tidal transition-colors">Abrir negócio</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function getBottleneckStage(stages: DashboardOverviewData['funnel']) {
  if (stages.length === 0) return null
  return [...stages].sort((a, b) => {
    const concentration = b.leads - a.leads
    if (concentration !== 0) return concentration
    return b.avgDays - a.avgDays
  })[0]
}

function MetricCard({ title, value, goal, progress, isCurrency = false }: { title: string; value: string; goal?: number; progress?: number; isCurrency?: boolean }) {
  return (
    <article
      className="card-glow relative rounded-[20px] p-[22px] transition-all duration-200 min-h-[144px]"
      style={{
        background: 'linear-gradient(180deg, #151A20 0%, #11151A 100%)',
        border: '1px solid rgba(216,222,227,0.09)',
        boxShadow: '0 12px 32px rgba(0,0,0,0.14)',
      }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-medium text-slate">{title}</p>
          <p className="mt-3 text-[32px] font-bold leading-10 tracking-[-0.04em] text-[#F7F9FA]">{value}</p>
          {goal != null && (
            <p className="mt-2 text-xs text-slate">
              Meta: <span className="font-semibold text-geyser">{isCurrency ? formatCurrency(goal) : formatNumber(goal)}</span>
            </p>
          )}
        </div>
        {progress != null && <SemiCircleProgress value={progress} />}
      </div>
    </article>
  )
}

function SemiCircleProgress({ value }: { value: number }) {
  const normalized = Math.max(0, Math.min(100, value))
  const radius = 34
  const circumference = Math.PI * radius
  const offset = circumference - (normalized / 100) * circumference

  return (
    <div className="flex flex-col items-center">
      <svg width="92" height="54" viewBox="0 0 92 54" aria-hidden="true">
        <path d="M12 46a34 34 0 0 1 68 0" fill="none" stroke="rgba(255,255,255,.1)" strokeWidth="10" strokeLinecap="round" />
        <path
          d="M12 46a34 34 0 0 1 68 0"
          fill="none"
          stroke="#c6f432"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <span className="-mt-2 text-xs font-semibold text-geyser">{formatNumber(normalized)}%</span>
    </div>
  )
}

function DatePickerPopover({
  value,
  customRange,
  disabled,
  onChange,
}: {
  value: DateFilter
  customRange: { from: Date | undefined; to: Date | undefined }
  disabled: boolean
  onChange: (value: DateFilter, range?: { from: Date | undefined; to: Date | undefined }) => void
}) {
  const [open, setOpen] = useState(false)
  const [range, setRange] = useState(customRange)
  const [activePreset, setActivePreset] = useState<DateFilter>(value)

  const label = value === 'custom' && customRange.from && customRange.to
    ? `${customRange.from.toLocaleDateString('pt-BR')} – ${customRange.to.toLocaleDateString('pt-BR')}`
    : DATE_OPTIONS.find((o) => o.value === value)?.label ?? 'Selecionar período'

  function handlePreset(preset: DateFilter) {
    setActivePreset(preset)
    if (preset !== 'custom') {
      onChange(preset)
      setOpen(false)
    }
  }

  function applyCustom() {
    if (!range.from || !range.to) return
    onChange('custom', range)
    setOpen(false)
  }

  function handleOpenChange(next: boolean) {
    if (next) {
      setActivePreset(value)
      setRange(customRange)
    }
    setOpen(next)
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        disabled={disabled}
        className="flex h-11 min-w-[210px] items-center gap-2 rounded-xl px-3.5 text-sm text-geyser outline-none transition-all duration-200 hover:border-[rgba(216,222,227,0.20)] focus:border-[rgba(198,244,50,0.60)] disabled:opacity-50"
        style={{ background: '#11151A', border: '1px solid rgba(216,222,227,0.12)' }}
      >
        <CalendarIcon className="h-3.5 w-3.5 shrink-0 text-slate" />
        <span className="flex-1 truncate text-left">{label}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate" />
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 rounded-[20px] overflow-hidden" align="end" style={{ background: '#1B222A', border: '1px solid rgba(216,222,227,0.12)', boxShadow: '0 24px 64px rgba(0,0,0,0.42)' }}>
        <div className="flex">
          {/* Presets */}
          <div className="flex w-44 flex-col py-2" style={{ borderRight: '1px solid rgba(216,222,227,0.08)' }}>
            {DATE_OPTIONS.map((p) => (
              <label key={p.value} className="flex cursor-pointer items-center gap-2.5 px-4 py-2 text-sm transition-colors" style={activePreset === p.value ? { background: 'rgba(198,244,50,0.08)' } : undefined}>
                <input
                  type="radio"
                  name="date-preset"
                  checked={activePreset === p.value}
                  onChange={() => handlePreset(p.value)}
                  className="accent-canary"
                />
                <span className={cn('select-none', activePreset === p.value ? 'text-canary font-semibold' : 'text-slate')}>
                  {p.label}
                </span>
              </label>
            ))}
          </div>

          {/* Calendar */}
          <div className="flex flex-col">
            <Calendar
              mode="range"
              selected={{ from: range.from, to: range.to }}
              onSelect={(r) => {
                setRange({ from: r?.from, to: r?.to })
                setActivePreset('custom')
              }}
              numberOfMonths={2}
              className="p-3"
              locale={ptBR}
            />
            <div className="flex justify-end gap-2 p-3" style={{ borderTop: '1px solid rgba(216,222,227,0.08)' }}>
              <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button size="sm" disabled={activePreset === 'custom' && (!range.from || !range.to)} onClick={applyCustom}>Aplicar</Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

function GoalsModal({
  open, onOpenChange, goals, pipelines, month, year, pipelineId,
  onMonthChange, onYearChange, onPipelineChange, onSave, onApplyPeriod,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  goals: GoalSettings
  pipelines: { id: string; name: string }[]
  month: number
  year: number
  pipelineId: string | null
  onMonthChange: (m: number) => void
  onYearChange: (y: number) => void
  onPipelineChange: (id: string | null) => void
  onSave: (goals: GoalSettings, month: number, year: number) => void
  onApplyPeriod: (month: number, year: number, pipelineId: string | null) => void
}) {
  const [tab, setTab] = useState<'edit' | 'list'>('edit')
  const [draft, setDraft] = useState(goals)
  const [loading, setLoading] = useState(false)
  const [allGoals, setAllGoals] = useState<DashboardGoalEntry[]>([])
  const [listLoading, setListLoading] = useState(false)

  // Sync draft when goals prop changes (e.g. loaded from parent)
  React.useEffect(() => { setDraft(goals) }, [goals])

  async function loadGoal(m: number, y: number, pid: string | null) {
    const saved = await getDashboardGoal(pid, m, y)
    if (saved) setDraft(saved)
    else setDraft(DEFAULT_GOALS)
  }

  async function loadAllGoals() {
    setListLoading(true)
    const entries = await listDashboardGoals()
    setAllGoals(entries)
    setListLoading(false)
  }

  function handleTabChange(t: 'edit' | 'list') {
    setTab(t)
    if (t === 'list') void loadAllGoals()
  }

  function handleMonthChange(m: number) {
    onMonthChange(m)
    void loadGoal(m, year, pipelineId)
  }

  function handleYearChange(y: number) {
    onYearChange(y)
    void loadGoal(month, y, pipelineId)
  }

  function handlePipelineChange(pid: string | null) {
    onPipelineChange(pid)
    void loadGoal(month, year, pid)
  }

  async function save() {
    setLoading(true)
    const result = await saveDashboardGoal(pipelineId, month, year, draft)
    setLoading(false)
    if (result.error) { toast.error(result.error); return }
    onSave(draft, month, year)
    toast.success('Metas salvas')
    // Refresh list if it was loaded
    if (tab === 'list') void loadAllGoals()
  }

  function selectGoalEntry(entry: DashboardGoalEntry) {
    onMonthChange(entry.month)
    onYearChange(entry.year)
    onPipelineChange(entry.pipelineId)
    setDraft({ leads: entry.leads, sales: entry.sales, revenue: entry.revenue, annualRevenue: entry.annualRevenue })
    onSave(entry, entry.month, entry.year)
    // Apply the month as a date range filter on the dashboard
    onApplyPeriod(entry.month, entry.year, entry.pipelineId)
    onOpenChange(false)
    toast.success(`Filtro aplicado: ${MONTHS[entry.month - 1]} ${entry.year}`)
  }

  const currentYear = new Date().getFullYear()
  const years = [currentYear - 1, currentYear, currentYear + 1]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[min(calc(100vw-2rem),32rem)] overflow-hidden">
        <DialogHeader>
          <DialogTitle>Metas do dashboard</DialogTitle>
          <DialogDescription>Configure metas mensais ou veja e aplique metas salvas.</DialogDescription>
        </DialogHeader>

        {/* Tab bar */}
        <div className="flex gap-1 rounded-xl p-1" style={{ background: '#11151A', border: '1px solid rgba(216,222,227,0.09)' }}>
          <button
            onClick={() => handleTabChange('edit')}
            className={cn('flex-1 rounded-[10px] px-3 py-1.5 text-sm font-medium transition-all duration-200', tab === 'edit' ? 'text-bunker font-semibold' : 'text-slate hover:text-geyser')}
            style={tab === 'edit' ? { background: '#c6f432' } : undefined}
          >
            Configurar
          </button>
          <button
            onClick={() => handleTabChange('list')}
            className={cn('flex-1 rounded-[10px] px-3 py-1.5 text-sm font-medium transition-all duration-200', tab === 'list' ? 'text-bunker font-semibold' : 'text-slate hover:text-geyser')}
            style={tab === 'list' ? { background: '#c6f432' } : undefined}
          >
            Todas as metas
          </button>
        </div>

        {tab === 'edit' ? (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <span className="text-[12px] font-medium uppercase tracking-[0.08em] text-slate/60">Mês</span>
                <select
                  value={month}
                  onChange={(e) => handleMonthChange(Number(e.target.value))}
                  className="h-11 w-full rounded-xl px-3.5 text-sm text-geyser outline-none transition-all duration-200"
                  style={{ background: '#11151A', border: '1px solid rgba(216,222,227,0.12)' }}
                >
                  {MONTHS.map((name, i) => (
                    <option key={i + 1} value={i + 1}>{name}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-[12px] font-medium uppercase tracking-[0.08em] text-slate/60">Ano</span>
                <select
                  value={year}
                  onChange={(e) => handleYearChange(Number(e.target.value))}
                  className="h-11 w-full rounded-xl px-3.5 text-sm text-geyser outline-none transition-all duration-200"
                  style={{ background: '#11151A', border: '1px solid rgba(216,222,227,0.12)' }}
                >
                  {years.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <div className="col-span-2 flex flex-col gap-1.5 sm:col-span-1">
                <span className="text-[12px] font-medium uppercase tracking-[0.08em] text-slate/60">Pipeline</span>
                <select
                  value={pipelineId ?? 'all'}
                  onChange={(e) => handlePipelineChange(e.target.value === 'all' ? null : e.target.value)}
                  className="h-11 w-full rounded-xl px-3.5 text-sm text-geyser outline-none transition-all duration-200"
                  style={{ background: '#11151A', border: '1px solid rgba(216,222,227,0.12)' }}
                >
                  <option value="all">Todos</option>
                  {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            </div>

            <div className="grid gap-3 pt-1">
              <NumberField label="Meta de leads" value={draft.leads} onChange={(leads) => setDraft({ ...draft, leads })} />
              <NumberField label="Meta de vendas" value={draft.sales} onChange={(sales) => setDraft({ ...draft, sales })} />
              <NumberField label="Meta de faturamento (mês)" value={draft.revenue} onChange={(revenue) => setDraft({ ...draft, revenue })} />
              <NumberField label="Meta anual de faturamento" value={draft.annualRevenue} onChange={(annualRevenue) => setDraft({ ...draft, annualRevenue })} />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button onClick={save} disabled={loading}>{loading ? 'Salvando...' : 'Salvar metas'}</Button>
            </div>
          </>
        ) : (
          <div className="min-h-[200px] min-w-0">
            {listLoading ? (
              <p className="py-10 text-center text-sm text-slate">Carregando...</p>
            ) : allGoals.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate">Nenhuma meta salva ainda.</p>
            ) : (
              <div className="w-full min-w-0 max-h-[340px] overflow-auto rounded-[16px]" style={{ border: '1px solid rgba(216,222,227,0.09)' }}>
                  <table className="w-full min-w-[380px] text-sm">
                    <thead className="sticky top-0 text-[11px] font-semibold uppercase tracking-[0.06em] text-slate/70" style={{ background: '#1B222A', borderBottom: '1px solid rgba(216,222,227,0.07)' }}>
                      <tr>
                        <th className="px-4 py-2.5 text-left">Período</th>
                        <th className="px-4 py-2.5 text-left">Pipeline</th>
                        <th className="px-4 py-2.5 text-right">Leads</th>
                        <th className="px-4 py-2.5 text-right">Vendas</th>
                        <th className="px-4 py-2.5 text-right">Fat. mês</th>
                        <th className="px-4 py-2.5"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {allGoals.map((entry, i) => {
                        const pName = entry.pipelineId ? (pipelines.find((p) => p.id === entry.pipelineId)?.name ?? '-') : 'Todos'
                        return (
                          <tr
                            key={i}
                            className="cursor-pointer transition-colors"
                            style={{ borderBottom: '1px solid rgba(216,222,227,0.06)' }}
                            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(198,244,50,0.04)' }}
                            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                            onClick={() => selectGoalEntry(entry)}
                          >
                            <td className="whitespace-nowrap px-4 py-3 font-semibold text-[#F7F9FA]">{MONTHS[entry.month - 1]} {entry.year}</td>
                            <td className="max-w-[100px] truncate px-4 py-3 text-slate">{pName}</td>
                            <td className="px-4 py-3 text-right text-geyser">{formatNumber(entry.leads)}</td>
                            <td className="px-4 py-3 text-right text-geyser">{formatNumber(entry.sales)}</td>
                            <td className="whitespace-nowrap px-4 py-3 text-right text-geyser">{formatCurrency(entry.revenue)}</td>
                            <td className="px-4 py-3 text-right">
                              <span className="whitespace-nowrap text-xs font-semibold text-canary hover:text-tidal transition-colors">Aplicar</span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
              </div>
            )}
            <div className="mt-4 flex justify-end">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="text-[13px] font-medium text-geyser">{label}</span>
      <input
        type="number"
        min="0"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-11 w-full rounded-xl px-3.5 text-sm text-[#F7F9FA] outline-none transition-all duration-200 placeholder:text-slate/60"
        style={{ background: '#11151A', border: '1px solid rgba(216,222,227,0.12)' }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = 'rgba(198,244,50,0.60)'
          e.currentTarget.style.boxShadow = '0 0 0 4px rgba(198,244,50,0.12)'
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = 'rgba(216,222,227,0.12)'
          e.currentTarget.style.boxShadow = 'none'
        }}
      />
    </label>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12px] font-medium uppercase tracking-[0.08em] text-slate/60">{label}</span>
      {children}
    </label>
  )
}

function SectionTitle({ title }: { title: string }) {
  return (
    <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate/70">
      {title}
    </h3>
  )
}

function buildOverview(data: DashboardBuilderData, goals: GoalSettings) {
  const { totalLeads, totalSales, revenue, avgTicket, historicalConversionRate, historicalAvgTicket, conversionRate, avgSalesCycle, openPipeline, forecast, funnel } = data.overview
  const revenueGoal = goals.revenue || goals.annualRevenue / 12

  return {
    totalLeads,
    totalSales,
    revenue,
    avgTicket,
    historicalConversionRate,
    historicalAvgTicket,
    conversionRate,
    avgSalesCycle,
    openPipeline,
    forecast,
    revenueGoal,
    leadsProgress: percent(totalLeads, goals.leads),
    salesProgress: percent(totalSales, goals.sales),
    revenueProgress: percent(revenue, revenueGoal),
    goals,
    summary: [
      { label: 'Receita mês', value: formatCurrency(revenue) },
      { label: 'Meta atingida', value: `${formatNumber(percent(revenue, revenueGoal))}%` },
      { label: 'Conversão', value: `${formatNumber(conversionRate)}%` },
      { label: 'Ticket médio', value: formatCurrency(avgTicket) },
      { label: 'Pipeline aberto', value: formatCurrency(openPipeline) },
      { label: 'Forecast', value: formatCurrency(forecast) },
    ],
    funnel,
  }
}

function buildGoalPace(
  overview: ReturnType<typeof buildOverview>,
  users: DashboardBuilderData['users'],
  month: number,
  year: number
): GoalPace {
  const today = new Date()
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month - 1
  const monthEnd = new Date(year, month, 0)
  const remainingDays = isCurrentMonth
    ? Math.max(1, monthEnd.getDate() - today.getDate() + 1)
    : monthEnd.getDate()
  const remainingSales = Math.max(0, overview.goals.sales - overview.totalSales)
  const remainingRevenue = Math.max(0, overview.revenueGoal - overview.revenue)
  const avgTicketUsed = Math.max(1, overview.historicalAvgTicket || overview.avgTicket || (overview.revenueGoal / Math.max(1, overview.goals.sales)))
  const conversionRateUsed = Math.max(1, overview.historicalConversionRate || overview.conversionRate || 10)
  const salesFromRevenue = Math.ceil(remainingRevenue / avgTicketUsed)
  const salesNeeded = Math.max(remainingSales, salesFromRevenue)
  const leadsNeeded = Math.ceil(salesNeeded / (conversionRateUsed / 100))
  const sellerList = users.length > 0 ? users : [{ id: 'default', name: 'Time comercial', role: 'sales' }]
  const sellerCount = Math.max(1, sellerList.length)

  return {
    remainingDays,
    remainingSales: salesNeeded,
    remainingRevenue,
    salesPerDay: salesNeeded / remainingDays,
    revenuePerDay: remainingRevenue / remainingDays,
    leadsNeeded,
    leadsPerDay: leadsNeeded / remainingDays,
    conversionRateUsed,
    avgTicketUsed,
    sellers: sellerList.map((user) => ({
      id: user.id,
      name: user.name,
      salesNeeded: salesNeeded / sellerCount,
      revenueNeeded: remainingRevenue / sellerCount,
      leadsNeeded: leadsNeeded / sellerCount,
    })),
  }
}

function percent(value: number, total: number) {
  if (!total) return 0
  return (value / total) * 100
}

function normalizeFilters(value: DashboardFilters): DashboardFilters {
  return {
    period: value.period ?? '30d',
    pipelineIds: value.pipelineIds ?? [],
    statuses: value.statuses ?? ['open', 'won', 'lost'],
  }
}

function toDateFilter(period?: DashboardFilters['period']): DateFilter {
  if (period === 'today' || period === '7d' || period === '30d' || period === 'month' || period === 'last_month' || period === 'year' || period === 'custom') return period
  return '30d'
}

function fromDateFilter(value: DateFilter): DashboardFilters['period'] {
  return value
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(value)
}

