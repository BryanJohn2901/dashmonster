// ─── Adapter: lib/actions/deals do PipeFlow original ──────────────────────────
// Mesmos nomes/shapes (snake_case) das server actions originais, no client,
// sobre a fachada crm.ts (real/demo). Webhooks out ficam pra Onda 5.

import { getCompanyContext } from '@/hooks/useCompany'
import {
  fetchDeals, createDeal as crmCreateDeal, updateDeal as crmUpdateDeal,
  moveDeal as crmMoveDeal, deleteDeal as crmDeleteDeal,
  createDealFromLead as crmCreateDealFromLead,
  findDuplicateDeals as crmFindDuplicateDeals,
  fetchPipelines, linkDealCrmCompany,
  type CrmDeal,
} from '@/lib/crm'

export type DbDealStage = string

export type DealRow = {
  id: string
  title: string
  value: number | null
  status: string
  pipeline_id: string
  stage_id: string
  owner_id: string
  lead_id: string | null
  /** Conta B2B vinculada (era company_id no original; = crm_company_id no banco). */
  company_id: string | null
  /** Tenant (empresa do hub) — o original chamava de workspace_id. */
  workspace_id: string
  temperature: string | null
  expected_close_date: string | null
  due_date: string | null
  product_name: string | null
  lost_reason: string | null
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  utm_content: string | null
  acquisition_channel: string | null
  landing_page_url: string | null
  proposal_url: string | null
  payment_url: string | null
  scheduling_url: string | null
  contract_url: string | null
  stage_entered_at: string
  created_at: string
  updated_at: string
  owner_profile: { full_name: string | null } | null
  lead: { name: string; company: string | null; phone: string | null; email: string | null } | null
  activities_total: number
  activities_done: number
  /** Data/hora da atividade pendente mais próxima (null = nada planejado). */
  next_activity_at: string | null
  /** true quando existe atividade pendente com data no passado. */
  has_overdue_activity: boolean
  tags: { id: string; name: string; color: string }[]
}

export interface CreateDealInput {
  title: string
  value?: number
  pipeline_id: string
  stage_id: string
  lead_id?: string
  company_id?: string | null
  status?: string
  due_date?: string
  product_name?: string | null
  temperature?: string | null
  lost_reason?: string | null
  expected_close_date?: string | null
  utm_source?: string | null
  utm_medium?: string | null
  utm_campaign?: string | null
  utm_content?: string | null
  acquisition_channel?: string | null
  landing_page_url?: string | null
  proposal_url?: string | null
  payment_url?: string | null
  scheduling_url?: string | null
  contract_url?: string | null
}

async function activeCompanyId(): Promise<string> {
  const state = await getCompanyContext()
  if (!state.company) throw new Error('Nenhuma empresa ativa.')
  return state.company.id
}

// Etapa atual por deal (preenchido a cada getDeals): permite ao moveDeal saber
// a etapa de origem sem novo fetch — o board sempre lista antes de mover.
const lastKnownStage = new Map<string, string>()

function toRow(d: CrmDeal, tenantId: string): DealRow {
  lastKnownStage.set(d.id, d.stageId)
  return {
    id: d.id,
    title: d.title,
    value: d.value,
    status: d.status,
    pipeline_id: d.pipelineId,
    stage_id: d.stageId,
    owner_id: d.ownerId,
    lead_id: d.leadId,
    company_id: d.crmCompanyId,
    workspace_id: tenantId,
    temperature: d.temperature,
    expected_close_date: d.expectedCloseDate,
    due_date: d.dueDate,
    product_name: d.productName,
    lost_reason: d.lostReason,
    utm_source: d.utmSource,
    utm_medium: d.utmMedium,
    utm_campaign: d.utmCampaign,
    utm_content: d.utmContent,
    acquisition_channel: d.acquisitionChannel,
    landing_page_url: d.landingPageUrl,
    proposal_url: d.proposalUrl,
    payment_url: d.paymentUrl,
    scheduling_url: d.schedulingUrl,
    contract_url: d.contractUrl,
    stage_entered_at: d.stageEnteredAt,
    created_at: d.createdAt,
    updated_at: d.updatedAt,
    owner_profile: { full_name: d.ownerName },
    lead: d.leadName != null || d.leadId != null
      ? { name: d.leadName ?? '', company: d.leadCompany, phone: d.leadPhone, email: d.leadEmail }
      : null,
    activities_total: d.activitiesTotal,
    activities_done: d.activitiesDone,
    next_activity_at: d.nextActivityAt,
    has_overdue_activity: d.hasOverdueActivity,
    tags: d.tags,
  }
}

export async function getDeals(pipelineId?: string): Promise<DealRow[]> {
  const companyId = await activeCompanyId()
  const deals = await fetchDeals(companyId, pipelineId)
  return deals.map((d) => toRow(d, companyId))
}

export type DealForSelect = { id: string; title: string; lead_name: string | null }

/** Negócios abertos p/ selects (ex.: criação rápida de atividade no calendário). */
export async function getDealsForSelect(): Promise<DealForSelect[]> {
  const deals = await getDeals()
  return deals
    .filter((d) => d.status === 'open')
    .map((d) => ({ id: d.id, title: d.title, lead_name: d.lead?.name ?? null }))
}

export async function findDuplicateDeals(
  title: string,
  pipelineId: string,
): Promise<{ id: string; title: string; status: string; stage_id: string }[]> {
  const companyId = await activeCompanyId()
  const found = await crmFindDuplicateDeals(companyId, pipelineId, title)
  // status/stage_id não vêm da fachada; o diálogo de duplicados só usa id+title.
  return found.map((d) => ({ id: d.id, title: d.title, status: 'open', stage_id: '' }))
}

async function findStage(companyId: string, stageId: string) {
  const pipelines = await fetchPipelines(companyId)
  for (const p of pipelines) {
    const stage = p.stages.find((s) => s.id === stageId)
    if (stage) return stage
  }
  return null
}

export async function createDeal(input: CreateDealInput): Promise<{ error?: string }> {
  try {
    const companyId = await activeCompanyId()
    const created = await crmCreateDeal({
      companyId,
      pipelineId: input.pipeline_id,
      stageId: input.stage_id,
      title: input.title,
      value: input.value ?? null,
    })
    // Campos extras do original que a criação da fachada não cobre.
    const extras: Parameters<typeof crmUpdateDeal>[2] = {}
    if (input.lead_id) extras.leadId = input.lead_id
    if (input.due_date) extras.dueDate = input.due_date
    if (input.product_name != null) extras.productName = input.product_name
    if (input.temperature != null) extras.temperature = input.temperature
    if (input.expected_close_date != null) extras.expectedCloseDate = input.expected_close_date
    if (Object.keys(extras).length > 0) await crmUpdateDeal(created.id, companyId, extras)
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao criar negócio' }
  }
}

export async function createDealFromLead(input: {
  title: string
  value?: number
  lead_id: string
}): Promise<{ error?: string }> {
  try {
    const companyId = await activeCompanyId()
    await crmCreateDealFromLead({ id: input.lead_id, name: input.title }, companyId)
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao criar negócio' }
  }
}

export async function updateDeal(id: string, input: Partial<CreateDealInput>): Promise<{ error?: string }> {
  try {
    const companyId = await activeCompanyId()

    // Troca de etapa via edição (DealForm): usa a semântica do moveDeal
    // (status sync + stage_entered_at + histórico).
    if (input.stage_id && input.stage_id !== lastKnownStage.get(id)) {
      const result = await moveDeal(id, input.stage_id)
      if (result.error) return result
    }

    const patch: Parameters<typeof crmUpdateDeal>[2] = {}
    if ('title' in input) patch.title = input.title
    if ('value' in input) patch.value = input.value ?? null
    if ('due_date' in input) patch.dueDate = input.due_date || null
    if ('product_name' in input) patch.productName = input.product_name ?? null
    if ('temperature' in input) patch.temperature = input.temperature ?? null
    if ('expected_close_date' in input) patch.expectedCloseDate = input.expected_close_date ?? null
    if ('lost_reason' in input) patch.lostReason = input.lost_reason ?? null
    if ('proposal_url' in input) patch.proposalUrl = input.proposal_url ?? null
    if ('payment_url' in input) patch.paymentUrl = input.payment_url ?? null
    if ('scheduling_url' in input) patch.schedulingUrl = input.scheduling_url ?? null
    if ('contract_url' in input) patch.contractUrl = input.contract_url ?? null
    if ('lead_id' in input) patch.leadId = input.lead_id ?? null
    if ('utm_source' in input) patch.utmSource = input.utm_source ?? null
    if ('utm_medium' in input) patch.utmMedium = input.utm_medium ?? null
    if ('utm_campaign' in input) patch.utmCampaign = input.utm_campaign ?? null
    if ('utm_content' in input) patch.utmContent = input.utm_content ?? null
    if ('acquisition_channel' in input) patch.acquisitionChannel = input.acquisition_channel ?? null
    if ('landing_page_url' in input) patch.landingPageUrl = input.landing_page_url ?? null
    if (Object.keys(patch).length > 0) await crmUpdateDeal(id, companyId, patch)
    if ('company_id' in input) await linkDealCrmCompany(id, companyId, input.company_id ?? null)
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao atualizar negócio' }
  }
}

export async function deleteDeal(id: string): Promise<{ error?: string }> {
  try {
    await crmDeleteDeal(id, await activeCompanyId())
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao excluir negócio' }
  }
}

/** Outros negócios do mesmo contato (aba Negócio do sheet). */
export async function getOtherDealsOfContact(contactId: string, currentDealId: string) {
  const companyId = await activeCompanyId()
  const deals = await fetchDeals(companyId)
  return deals
    .filter((d) => d.leadId === contactId && d.id !== currentDealId)
    .map((d) => toRow(d, companyId))
}

/** Painel lateral do Inbox (LeadLinker): resumo do negócio vinculado. */
export interface DealPanelData {
  title: string
  value: number | null
  status: string
  stage_name: string | null
  pipeline_name: string | null
}

export async function getDealForPanel(dealId: string): Promise<DealPanelData | null> {
  const companyId = await activeCompanyId()
  const [deals, pipelines] = await Promise.all([fetchDeals(companyId), fetchPipelines(companyId)])
  const deal = deals.find((d) => d.id === dealId)
  if (!deal) return null
  const pipeline = pipelines.find((p) => p.id === deal.pipelineId)
  return {
    title: deal.title,
    value: deal.value,
    status: deal.status,
    stage_name: pipeline?.stages.find((s) => s.id === deal.stageId)?.name ?? null,
    pipeline_name: pipeline?.name ?? null,
  }
}

export async function moveDeal(id: string, newStageId: string): Promise<{ error?: string }> {
  try {
    const companyId = await activeCompanyId()
    const stage = await findStage(companyId, newStageId)
    if (!stage) return { error: 'Estágio inválido.' }
    const currentStageId = lastKnownStage.get(id) ?? ''
    await crmMoveDeal(
      { id, stageId: currentStageId },
      { id: stage.id, name: stage.name, statusKind: stage.statusKind },
      companyId,
    )
    lastKnownStage.set(id, newStageId)
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao mover negócio' }
  }
}
