// ─── Adapter: lib/actions/dashboard do PipeFlow original ──────────────────────
// O original tinha um "dashboard builder" completo (widgets custom, templates,
// dashboards persistidos) mas o componente real (DashboardBuilder.tsx) só usa
// overview + pipelines + metas — nada de widgets/templates chega a renderizar.
// ponytail: porta só o que a tela consome; sem tabela dashboards/dashboard_widgets,
// os filtros de período persistem em localStorage (mesmo padrão do funil-view).

import { getCompanyContext } from '@/hooks/useCompany'
import {
  fetchGoal, saveGoal, fetchGoals,
  fetchCompanyDealActivities, fetchCompanyDealHistory,
} from '@/lib/crm'
import { getDeals, type DealRow } from './deals'
import { getLeads, type LeadRow } from './leads'
import { getPipelines, type PipelineWithStages } from './pipelines'

export type DashboardPeriod = 'today' | '7d' | '30d' | '90d' | 'month' | 'last_month' | 'quarter' | 'year' | 'all' | 'custom'

export interface DashboardFilters {
  period?: DashboardPeriod
  customStart?: string
  customEnd?: string
  pipelineIds?: string[]
  statuses?: string[]
}

export interface DashboardFunnelDeal {
  id: string
  title: string
  contact: string
  owner: string
  value: number
  daysInStage: number
  nextActivity: string
}

export interface DashboardOverviewStage {
  stageId: string
  name: string
  leads: number
  value: number
  enteredInPeriod: number
  openValue: number
  percentOfFunnel: number
  nextConversion: number | null
  avgDays: number
  noNextActivity: number
  overdueActivities: number
  losses: number
  lossRate: number
  mainLossReason: string
  bottleneckDeals: DashboardFunnelDeal[]
}

export interface DashboardOverviewData {
  totalLeads: number
  totalSales: number
  revenue: number
  avgTicket: number
  historicalConversionRate: number
  historicalAvgTicket: number
  conversionRate: number
  avgSalesCycle: number
  openPipeline: number
  forecast: number
  funnel: DashboardOverviewStage[]
}

export interface DashboardGoal {
  leads: number
  sales: number
  revenue: number
  annualRevenue: number
}

export interface DashboardGoalEntry extends DashboardGoal {
  month: number
  year: number
  pipelineId: string | null
  pipelineName?: string
}

export interface DashboardBuilderData {
  activeDashboard: { id: string; default_filters: DashboardFilters; pipeline_ids: string[] }
  overview: DashboardOverviewData
  pipelines: PipelineWithStages[]
  users: { id: string; name: string; role: string }[]
}

async function activeCompanyId(): Promise<string> {
  const state = await getCompanyContext()
  if (!state.company) throw new Error('Nenhuma empresa ativa.')
  return state.company.id
}

// ─── Filtros persistidos (substitui a tabela dashboards do original) ──────────

const FILTERS_KEY = 'pipeflow-dashboard-filters'
const DEFAULT_FILTERS: DashboardFilters = { period: '30d', statuses: ['open', 'won', 'lost'] }

function loadPersistedFilters(): DashboardFilters {
  if (typeof window === 'undefined') return DEFAULT_FILTERS
  try {
    const raw = window.localStorage.getItem(FILTERS_KEY)
    return raw ? { ...DEFAULT_FILTERS, ...JSON.parse(raw) } : DEFAULT_FILTERS
  } catch {
    return DEFAULT_FILTERS
  }
}

function persistFilters(filters: DashboardFilters) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(FILTERS_KEY, JSON.stringify(filters))
}

export async function getDashboardBuilderData(): Promise<DashboardBuilderData> {
  const companyId = await activeCompanyId()
  const [deals, leads, pipelines, activities, history] = await Promise.all([
    getDeals(),
    getLeads(),
    getPipelines(),
    fetchCompanyDealActivities(companyId),
    fetchCompanyDealHistory(companyId),
  ])

  const filters = loadPersistedFilters()
  const users = buildUsers(deals)
  const source: MetricSource = {
    deals, leads,
    activities: activities.map((a) => ({ dealId: a.dealId, title: a.title, completedAt: a.completedAt, dueDate: a.dueDate, createdAt: a.createdAt })),
    history: history.map((h) => ({ dealId: h.dealId, eventType: h.eventType, newValue: h.newValue, createdAt: h.createdAt })),
    users,
  }

  return {
    activeDashboard: { id: 'default', default_filters: filters, pipeline_ids: [] },
    overview: calculateOverview(filters, source, pipelines),
    pipelines,
    users,
  }
}

function buildUsers(deals: DealRow[]): { id: string; name: string; role: string }[] {
  const map = new Map<string, string>()
  for (const deal of deals) map.set(deal.owner_id, deal.owner_profile?.full_name ?? 'Usuário')
  return Array.from(map.entries()).map(([id, name]) => ({ id, name, role: 'sales' }))
}

export async function updateDashboard(
  _id: string,
  input: { defaultFilters?: DashboardFilters; pipelineIds?: string[] },
): Promise<{ error?: string }> {
  if (input.defaultFilters) persistFilters(input.defaultFilters)
  return {}
}

export async function getDashboardGoal(pipelineId: string | null, month: number, year: number): Promise<DashboardGoal | null> {
  const g = await fetchGoal(await activeCompanyId(), month, year, pipelineId)
  return g ? { leads: g.leads, sales: g.sales, revenue: g.revenue, annualRevenue: g.annualRevenue ?? 0 } : null
}

export async function saveDashboardGoal(
  pipelineId: string | null, month: number, year: number, goal: DashboardGoal,
): Promise<{ error?: string }> {
  try {
    await saveGoal(await activeCompanyId(), { month, year, leads: goal.leads, sales: goal.sales, revenue: goal.revenue, annualRevenue: goal.annualRevenue }, pipelineId)
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao salvar meta' }
  }
}

export async function listDashboardGoals(): Promise<DashboardGoalEntry[]> {
  const entries = await fetchGoals(await activeCompanyId())
  return entries.map((e) => ({
    month: e.month, year: e.year, pipelineId: e.pipelineId,
    leads: e.leads, sales: e.sales, revenue: e.revenue, annualRevenue: e.annualRevenue ?? 0,
  }))
}

// ─── Cálculo do overview / funil (portado de lib/actions/dashboard.ts original) ─
// Sem tabela dashboard_widgets: overview é recalculado direto sobre deals/leads/
// activities/history já carregados pelos adapters existentes.

interface ActivityRow { dealId: string; title: string; completedAt: string | null; dueDate: string | null; createdAt: string }
interface HistoryRow { dealId: string; eventType: string; newValue: string | null; createdAt: string }

interface MetricSource {
  deals: DealRow[]
  leads: LeadRow[]
  activities: ActivityRow[]
  history: HistoryRow[]
  users: { id: string; name: string; role: string }[]
}

function calculateOverview(
  filters: DashboardFilters,
  source: MetricSource,
  pipelines: PipelineWithStages[],
): DashboardOverviewData {
  const range = getPeriodRange(filters.period ?? '30d', filters.customStart, filters.customEnd)
  const selectedPipelineId = filters.pipelineIds?.[0] ?? pipelines[0]?.id ?? null
  const selectedPipeline = selectedPipelineId ? pipelines.find((p) => p.id === selectedPipelineId) : pipelines[0]

  const dealsInPipeline = selectedPipeline
    ? source.deals.filter((d) => d.pipeline_id === selectedPipeline.id)
    : source.deals
  const dealsCreatedInPeriod = dealsInPipeline.filter((deal) => inDateRange(deal.created_at, range))
  const wonDealsInPeriod = dealsCreatedInPeriod.filter((deal) => deal.status === 'won')
  const openDeals = dealsInPipeline.filter((deal) => deal.status === 'open')
  const revenue = wonDealsInPeriod.reduce((sum, deal) => sum + (deal.value ?? 0), 0)
  const totalSales = wonDealsInPeriod.length
  const totalLeads = dealsCreatedInPeriod.length
  const avgTicket = totalSales > 0 ? revenue / totalSales : 0
  const conversionRate = totalLeads > 0 ? (totalSales / totalLeads) * 100 : 0

  const historicalStart = getHistoricalStart(range.start ?? new Date())
  const historicalEnd = range.end ?? new Date()
  const historicalCreatedDeals = dealsInPipeline.filter((deal) =>
    inDateRange(deal.created_at, { start: historicalStart, end: historicalEnd }))
  const historicalWonDeals = historicalCreatedDeals.filter((deal) => deal.status === 'won')
  const historicalRevenue = historicalWonDeals.reduce((sum, deal) => sum + (deal.value ?? 0), 0)
  const historicalConversionRate = historicalCreatedDeals.length > 0
    ? (historicalWonDeals.length / historicalCreatedDeals.length) * 100
    : conversionRate
  const historicalAvgTicket = historicalWonDeals.length > 0 ? historicalRevenue / historicalWonDeals.length : avgTicket

  // ponytail: sem evento "won" dedicado no histórico — usa updated_at como proxy
  // do fechamento (é o mesmo fallback que o original usava quando faltava o evento).
  const avgSalesCycle = average(
    wonDealsInPeriod.map((deal) => daysBetween(deal.created_at, deal.updated_at)).filter((d) => d >= 0),
  )

  const openPipeline = openDeals.reduce((sum, deal) => sum + (deal.value ?? 0), 0)
  const forecast = openDeals
    .filter((deal) => {
      const stageIndex = selectedPipeline?.stages.findIndex((s) => s.id === deal.stage_id) ?? -1
      return stageIndex >= Math.max(0, Math.floor((selectedPipeline?.stages.length ?? 0) / 2))
    })
    .reduce((sum, deal) => sum + (deal.value ?? 0), 0)

  return {
    totalLeads, totalSales, revenue, avgTicket,
    historicalConversionRate, historicalAvgTicket, conversionRate, avgSalesCycle,
    openPipeline, forecast: forecast || openPipeline * 0.3,
    funnel: buildOverviewFunnel(selectedPipeline, dealsInPipeline, source, range),
  }
}

function buildOverviewFunnel(
  pipeline: PipelineWithStages | undefined,
  deals: DealRow[],
  source: MetricSource,
  range: { start: Date | null; end: Date | null },
): DashboardOverviewStage[] {
  const stages = pipeline?.stages ?? []
  const nameToStageId = new Map(stages.map((s) => [s.name, s.id]))
  const openDeals = deals.filter((deal) => deal.status === 'open')
  const totalOpenDeals = openDeals.length
  const leadMap = new Map(source.leads.map((lead) => [lead.id, lead]))
  const userMap = new Map(source.users.map((u) => [u.id, u.name]))
  const now = new Date()
  const activitiesByDeal = groupBy(source.activities, (a) => a.dealId)
  const historyByDeal = groupBy(source.history.filter((h) => h.eventType === 'stage_change'), (h) => h.dealId)
  const stageEntriesInPeriod = new Map(stages.map((s) => [s.id, 0]))

  for (const deal of deals) {
    if (inDateRange(deal.created_at, range)) {
      stageEntriesInPeriod.set(deal.stage_id, (stageEntriesInPeriod.get(deal.stage_id) ?? 0) + 1)
    }
    for (const event of historyByDeal.get(deal.id) ?? []) {
      const targetStageId = event.newValue ? nameToStageId.get(event.newValue) : undefined
      if (targetStageId && inDateRange(event.createdAt, range)) {
        stageEntriesInPeriod.set(targetStageId, (stageEntriesInPeriod.get(targetStageId) ?? 0) + 1)
      }
    }
  }

  return stages.map((stage, index) => {
    const stageDeals = openDeals.filter((deal) => deal.stage_id === stage.id)
    const allLostInStage = deals.filter((deal) => deal.status === 'lost' && deal.stage_id === stage.id)
    const lossReasons = countBy(allLostInStage.map((deal) => deal.lost_reason).filter((r): r is string => Boolean(r)))
    const currentEntries = stageEntriesInPeriod.get(stage.id) ?? 0
    const nextStage = stages[index + 1]
    const nextEntries = nextStage ? stageEntriesInPeriod.get(nextStage.id) ?? 0 : 0
    const nextConversion = nextStage && currentEntries > 0 ? (nextEntries / currentEntries) * 100 : null

    const rowsWithActivity = stageDeals.map((deal) => {
      const acts = activitiesByDeal.get(deal.id) ?? []
      const pending = acts
        .filter((a) => !a.completedAt)
        .sort((a, b) => new Date(a.dueDate ?? a.createdAt).getTime() - new Date(b.dueDate ?? b.createdAt).getTime())
      const overdueCount = pending.filter((a) => a.dueDate && new Date(a.dueDate) < now).length
      const lead = deal.lead_id ? leadMap.get(deal.lead_id) : null
      return {
        deal, pending, overdueCount,
        daysInStage: daysBetween(deal.stage_entered_at, now.toISOString()),
        contact: lead?.name ?? '-',
        owner: userMap.get(deal.owner_id) ?? '-',
      }
    })
    const noNextActivity = rowsWithActivity.filter((row) => row.pending.length === 0).length
    const overdueActivities = rowsWithActivity.reduce((sum, row) => sum + row.overdueCount, 0)
    const openValue = stageDeals.reduce((sum, deal) => sum + (deal.value ?? 0), 0)

    return {
      stageId: stage.id,
      name: stage.name,
      leads: stageDeals.length,
      value: openValue,
      enteredInPeriod: currentEntries,
      openValue,
      percentOfFunnel: totalOpenDeals > 0 ? (stageDeals.length / totalOpenDeals) * 100 : 0,
      nextConversion,
      avgDays: average(rowsWithActivity.map((row) => row.daysInStage)),
      noNextActivity,
      overdueActivities,
      losses: allLostInStage.length,
      lossRate: stageDeals.length > 0 ? (allLostInStage.length / stageDeals.length) * 100 : 0,
      mainLossReason: lossReasons[0]?.label ?? '-',
      bottleneckDeals: rowsWithActivity
        .sort((a, b) => b.daysInStage - a.daysInStage)
        .slice(0, 8)
        .map((row) => ({
          id: row.deal.id,
          title: row.deal.title,
          contact: row.contact,
          owner: row.owner,
          value: row.deal.value ?? 0,
          daysInStage: row.daysInStage,
          nextActivity: row.pending[0]?.title ?? 'Sem próxima atividade',
        })),
    }
  })
}

function groupBy<T, K>(rows: T[], getKey: (row: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>()
  for (const row of rows) {
    const key = getKey(row)
    map.set(key, [...(map.get(key) ?? []), row])
  }
  return map
}

function getHistoricalStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() - 3, 1)
}

function inDateRange(value: string | null, range: { start: Date | null; end: Date | null }): boolean {
  if (!value) return false
  if (!range.start || !range.end) return true
  const date = new Date(value)
  return date >= range.start && date <= range.end
}

function getPeriodRange(period: DashboardPeriod, customStart?: string, customEnd?: string): { start: Date | null; end: Date | null } {
  const end = new Date()
  end.setHours(23, 59, 59, 999)
  if (period === 'all') return { start: null, end: null }
  if (period === 'custom' && customStart && customEnd) {
    const s = new Date(customStart); s.setHours(0, 0, 0, 0)
    const e = new Date(customEnd); e.setHours(23, 59, 59, 999)
    return { start: s, end: e }
  }
  const start = new Date(end)
  if (period === '7d') start.setDate(end.getDate() - 6)
  if (period === '30d') start.setDate(end.getDate() - 29)
  if (period === '90d') start.setDate(end.getDate() - 89)
  if (period === 'month') start.setDate(1)
  if (period === 'last_month') { start.setMonth(end.getMonth() - 1, 1); end.setDate(0) }
  if (period === 'quarter') start.setMonth(Math.floor(end.getMonth() / 3) * 3, 1)
  if (period === 'year') start.setMonth(0, 1)
  if (period === 'custom') start.setDate(end.getDate() - 29)
  start.setHours(0, 0, 0, 0)
  return { start, end }
}

function average(values: number[]) {
  const valid = values.filter((v) => Number.isFinite(v) && v >= 0)
  return valid.length ? valid.reduce((sum, v) => sum + v, 0) / valid.length : 0
}

function countBy(values: string[]) {
  const counts = new Map<string, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  return Array.from(counts.entries()).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value)
}

function daysBetween(start: string, end: string): number {
  return Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86_400_000))
}
