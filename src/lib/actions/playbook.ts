// ─── Adapter: lib/actions/playbook do PipeFlow original ───────────────────────
// Atividades do negócio + templates de etapa, sobre a fachada crm.ts.

import { getCompanyContext } from '@/hooks/useCompany'
import {
  fetchDealActivities, createDealActivity as crmCreateDealActivity,
  setActivityDone, deleteDealActivity as crmDeleteDealActivity,
  updateDealActivity as crmUpdateDealActivity, clearDealActivities as crmClearDealActivities,
  fetchStageTemplates, instantiateStagePlaybook as crmInstantiateStagePlaybook,
  type CrmActivity, type CrmActivityKind,
} from '@/lib/crm'
import type { DealActivity, PlaybookActivityType } from '@/types/supabase'

async function activeCompanyId(): Promise<string> {
  const state = await getCompanyContext()
  if (!state.company) throw new Error('Nenhuma empresa ativa.')
  return state.company.id
}

function toRow(a: CrmActivity): DealActivity {
  return {
    id: a.id,
    deal_id: a.dealId,
    title: a.title,
    activity_type: a.activityType as PlaybookActivityType,
    action_label: a.actionLabel,
    icon_key: a.iconKey,
    script: a.script,
    scheduled_start_at: a.scheduledStartAt,
    due_date: a.dueDate,
    completed_at: a.completedAt,
    notes: a.notes,
    source_template_id: a.sourceTemplateId,
    created_at: a.createdAt,
    day_offset: a.dayOffset,
    order_index: a.orderIndex,
    priority: a.priority,
  } as DealActivity
}

// Título por atividade (cache do último fetch) — o toggle original buscava o
// título no servidor pra gravar o histórico; aqui evita um fetch extra.
const titleCache = new Map<string, { dealId: string; title: string }>()

export async function getDealActivities(dealId: string): Promise<DealActivity[]> {
  const companyId = await activeCompanyId()
  const acts = await fetchDealActivities(dealId, companyId)
  for (const a of acts) titleCache.set(a.id, { dealId: a.dealId, title: a.title })
  return acts
    .sort((a, b) => (a.dayOffset ?? 0) - (b.dayOffset ?? 0) || a.orderIndex - b.orderIndex)
    .map(toRow)
}

export async function toggleDealActivity(activityId: string, complete: boolean): Promise<{ error?: string }> {
  try {
    const companyId = await activeCompanyId()
    const known = titleCache.get(activityId) ?? { dealId: '', title: 'Atividade' }
    await setActivityDone({ id: activityId, dealId: known.dealId, title: known.title }, companyId, complete)
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao atualizar atividade' }
  }
}

export async function createDealActivity(input: {
  deal_id: string
  title: string
  activity_type: PlaybookActivityType
  icon_key?: string
  script?: string
  due_date?: string
  scheduled_start_at?: string
  scheduled_end_at?: string
  assigned_to?: string | null
  reminder_at?: string | null
  priority?: string
  notes?: string
  day_offset?: number
  order_index?: number
  is_custom?: boolean
  source_template_id?: string
}): Promise<{ error?: string }> {
  try {
    const companyId = await activeCompanyId()
    // Igual ao original: com prazo mas sem agendamento, espelha no calendário.
    const scheduledStartAt = input.scheduled_start_at ?? input.due_date ?? null
    const created = await crmCreateDealActivity({
      dealId: input.deal_id,
      companyId,
      title: input.title,
      activityType: input.activity_type as CrmActivityKind,
      scheduledStartAt,
      assignedTo: input.assigned_to,
      reminderAt: input.reminder_at,
    })
    const extras: Parameters<typeof crmUpdateDealActivity>[2] = {}
    if (input.due_date) extras.dueDate = input.due_date
    if (input.notes) extras.notes = input.notes
    if (input.script) extras.script = input.script
    if (input.priority) extras.priority = input.priority
    if (Object.keys(extras).length > 0) await crmUpdateDealActivity(created.id, companyId, extras)
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao criar atividade' }
  }
}

export async function updateDealActivity(
  id: string,
  input: {
    title?: string
    activity_type?: PlaybookActivityType
    icon_key?: string | null
    script?: string | null
    action_label?: string | null
    day_offset?: number
    due_date?: string
    order_index?: number
    scheduled_start_at?: string | null
    scheduled_end_at?: string | null
    assigned_to?: string | null
    reminder_at?: string | null
    priority?: string
    notes?: string | null
  },
): Promise<{ error?: string }> {
  try {
    const companyId = await activeCompanyId()
    const patch: Parameters<typeof crmUpdateDealActivity>[2] = {}
    if ('title' in input) patch.title = input.title
    if ('notes' in input) patch.notes = input.notes ?? null
    if ('scheduled_start_at' in input) patch.scheduledStartAt = input.scheduled_start_at ?? null
    if ('due_date' in input) patch.dueDate = input.due_date ?? null
    if ('activity_type' in input && input.activity_type) patch.activityType = input.activity_type as CrmActivityKind
    if ('script' in input) patch.script = input.script ?? null
    if ('priority' in input && input.priority) patch.priority = input.priority
    if ('assigned_to' in input) patch.assignedTo = input.assigned_to ?? null
    if ('reminder_at' in input) patch.reminderAt = input.reminder_at ?? null
    // ponytail: icon_key/action_label/day_offset/order_index só mudam via
    // templates — fachada não expõe; adicionar quando alguma tela editar.
    await crmUpdateDealActivity(id, companyId, patch)
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao atualizar atividade' }
  }
}

export async function deleteDealActivity(id: string): Promise<{ error?: string }> {
  try {
    await crmDeleteDealActivity(id, await activeCompanyId())
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao excluir atividade' }
  }
}

export async function clearDealActivities(dealId: string): Promise<{ error?: string }> {
  try {
    await crmClearDealActivities(dealId, await activeCompanyId())
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao limpar atividades' }
  }
}

export async function getPipelineStageActivities(stageId: string) {
  const companyId = await activeCompanyId()
  const templates = await fetchStageTemplates(stageId, companyId)
  return templates
    .filter((t) => t.isActive)
    .map((t) => ({
      id: t.id,
      stage_id: t.stageId,
      title: t.title,
      activity_type: t.activityType as PlaybookActivityType,
      day_offset: t.dayOffset,
      order_index: t.orderIndex,
      script: t.script,
      is_active: t.isActive,
    }))
}

export async function instantiateStagePlaybook(dealId: string, stageId: string): Promise<{ error?: string }> {
  try {
    await crmInstantiateStagePlaybook(dealId, stageId, await activeCompanyId())
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao aplicar cadência' }
  }
}
