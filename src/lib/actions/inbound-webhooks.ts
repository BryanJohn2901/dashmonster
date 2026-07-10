// ─── Adapter: lib/actions/inbound-webhooks do PipeFlow original ────────────────
// Onda 5: captação pública de leads via POST /api/v1/inbound/webhooks/[key].

import { getCompanyContext } from '@/hooks/useCompany'
import {
  fetchInboundWebhooks, createInboundWebhook as crmCreateInboundWebhook,
  updateInboundWebhook as crmUpdateInboundWebhook, deleteInboundWebhook as crmDeleteInboundWebhook,
  regenerateInboundWebhookKey as crmRegenerateInboundWebhookKey,
  type CrmInboundWebhook,
} from '@/lib/crm'

export interface InboundWebhookListItem {
  id: string
  name: string
  webhook_key: string
  pipeline_id: string | null
  default_stage_id: string | null
  default_owner_id: string | null
  default_tags: string[]
  default_product: string | null
  field_map: Record<string, string>
  is_active: boolean
  created_at: string
}

function toRow(w: CrmInboundWebhook): InboundWebhookListItem {
  return {
    id: w.id, name: w.name, webhook_key: w.webhookKey, pipeline_id: w.pipelineId,
    default_stage_id: w.defaultStageId, default_owner_id: w.defaultOwnerId, default_tags: w.defaultTags,
    default_product: w.defaultProduct, field_map: w.fieldMap, is_active: w.isActive, created_at: w.createdAt,
  }
}

async function activeCompanyId(): Promise<string> {
  const state = await getCompanyContext()
  if (!state.company) throw new Error('Nenhuma empresa ativa.')
  return state.company.id
}

export async function listInboundWebhooks(): Promise<{ data?: InboundWebhookListItem[]; error?: string }> {
  try {
    const companyId = await activeCompanyId()
    return { data: (await fetchInboundWebhooks(companyId)).map(toRow) }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao listar webhooks de entrada' }
  }
}

export async function createInboundWebhook(input: {
  name: string
  pipeline_id?: string | null
  default_stage_id?: string | null
  default_owner_id?: string | null
  default_tags?: string[]
  default_product?: string | null
  field_map?: Record<string, string>
}): Promise<{ data?: InboundWebhookListItem; error?: string }> {
  try {
    const companyId = await activeCompanyId()
    const created = await crmCreateInboundWebhook(companyId, {
      name: input.name, pipelineId: input.pipeline_id, defaultStageId: input.default_stage_id,
    })
    return { data: toRow(created) }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao criar webhook de entrada' }
  }
}

export async function updateInboundWebhook(
  id: string,
  input: Partial<{ name: string; is_active: boolean }>,
): Promise<{ data?: InboundWebhookListItem; error?: string }> {
  try {
    const companyId = await activeCompanyId()
    await crmUpdateInboundWebhook(id, companyId, { name: input.name, isActive: input.is_active })
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao atualizar webhook de entrada' }
  }
}

export async function deleteInboundWebhook(id: string): Promise<{ error?: string }> {
  try {
    await crmDeleteInboundWebhook(id, await activeCompanyId())
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao excluir webhook de entrada' }
  }
}

export async function regenerateInboundWebhookKey(id: string): Promise<{ data?: { webhook_key: string }; error?: string }> {
  try {
    const webhook_key = await crmRegenerateInboundWebhookKey(id, await activeCompanyId())
    return { data: { webhook_key } }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao regenerar chave' }
  }
}
