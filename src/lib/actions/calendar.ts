// ─── Adapter: lib/actions/calendar do PipeFlow original ───────────────────────
// getCalendarMembers original lia workspace_members (todos os membros do
// tenant); sem essa tabela na fachada, ponytail: deriva de quem já é dono de
// negócio (mesmo padrão do dashboard.ts). getActiveWorkspaceId vira companyId.

import { getCompanyContext } from '@/hooks/useCompany'
import { fetchCompanyDealActivities } from '@/lib/crm'
import { getDeals } from './deals'
import { getLeads } from './leads'

export interface CalendarActivity {
  id: string
  title: string
  activity_type: string
  scheduled_start_at: string | null
  due_date: string | null
  completed_at: string | null
  assigned_to: string | null
  reminder_at: string | null
  notes: string | null
  script: string | null
  priority: string
  deal_id: string
  deal_title: string | null
  lead_name: string | null
  lead_id: string | null
  assignee_name: string | null
}

export interface CalendarFilters {
  from: string
  to: string
  assignedTo?: string | null
}

async function activeCompanyId(): Promise<string> {
  const state = await getCompanyContext()
  if (!state.company) throw new Error('Nenhuma empresa ativa.')
  return state.company.id
}

function inRange(value: string, from: string, to: string): boolean {
  return value >= from && value <= to
}

export async function getCalendarActivities(
  filters: CalendarFilters,
): Promise<{ data?: CalendarActivity[]; error?: string }> {
  try {
    const companyId = await activeCompanyId()
    const [activities, deals, leads] = await Promise.all([
      fetchCompanyDealActivities(companyId), getDeals(), getLeads(),
    ])
    const dealMap = new Map(deals.map((d) => [d.id, d]))
    const leadMap = new Map(leads.map((l) => [l.id, l.name]))
    const assigneeMap = new Map(
      deals.filter((d) => d.owner_profile?.full_name).map((d) => [d.owner_id, d.owner_profile!.full_name]),
    )

    const rows = activities
      .filter((a) => {
        if (a.scheduledStartAt) return inRange(a.scheduledStartAt, filters.from, filters.to)
        if (a.dueDate) return inRange(a.dueDate, filters.from, filters.to)
        return false
      })
      .filter((a) => filters.assignedTo === undefined || filters.assignedTo === null || a.assignedTo === filters.assignedTo)
      .map((a) => {
        const deal = dealMap.get(a.dealId)
        return {
          id: a.id,
          title: a.title,
          activity_type: a.activityType,
          scheduled_start_at: a.scheduledStartAt,
          due_date: a.dueDate,
          completed_at: a.completedAt,
          assigned_to: a.assignedTo,
          reminder_at: a.reminderAt,
          notes: a.notes,
          script: a.script,
          priority: a.priority,
          deal_id: a.dealId,
          deal_title: deal?.title ?? null,
          lead_id: deal?.lead_id ?? null,
          lead_name: deal?.lead_id ? leadMap.get(deal.lead_id) ?? null : null,
          assignee_name: a.assignedTo ? assigneeMap.get(a.assignedTo) ?? null : null,
        }
      })
    return { data: rows }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao carregar calendário' }
  }
}

export async function getCalendarMembers(): Promise<{ data?: { id: string; name: string }[]; error?: string }> {
  try {
    const deals = await getDeals()
    const map = new Map<string, string>()
    for (const d of deals) map.set(d.owner_id, d.owner_profile?.full_name ?? 'Usuário')
    return { data: Array.from(map.entries()).map(([id, name]) => ({ id, name })) }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao carregar membros' }
  }
}
