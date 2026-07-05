// ─── Adapter: lib/actions/webhook-subscriptions do PipeFlow original ───────────

import { getCompanyContext } from '@/hooks/useCompany'
import {
  fetchWebhooks, createWebhook, setWebhookActive, deleteWebhook,
  type CrmWebhook,
} from '@/lib/crm'

export interface WebhookSubscriptionListItem {
  id: string
  name: string
  url: string
  events: string[]
  is_active: boolean
  last_triggered_at: string | null
  last_status_code: number | null
  created_at?: string
}

async function activeCompanyId(): Promise<string> {
  const state = await getCompanyContext()
  if (!state.company) throw new Error('Nenhuma empresa ativa.')
  return state.company.id
}

function toRow(w: CrmWebhook): WebhookSubscriptionListItem {
  return {
    id: w.id, name: w.name, url: w.url, events: w.events,
    is_active: w.isActive, last_triggered_at: w.lastTriggeredAt, last_status_code: w.lastStatusCode,
  }
}

export async function listWebhookSubscriptions(): Promise<{ data?: WebhookSubscriptionListItem[]; error?: string }> {
  try {
    const companyId = await activeCompanyId()
    return { data: (await fetchWebhooks(companyId)).map(toRow) }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao listar webhooks' }
  }
}

export async function createWebhookSubscription(input: {
  name: string
  url: string
  events: string[]
}): Promise<{ data?: WebhookSubscriptionListItem; rawSecret?: string; error?: string }> {
  try {
    const companyId = await activeCompanyId()
    const created = await createWebhook(companyId, input)
    return { data: toRow(created), rawSecret: created.secret }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao criar webhook' }
  }
}

export async function updateWebhookSubscription(
  id: string,
  input: { name?: string; url?: string; events?: string[]; is_active?: boolean },
): Promise<{ data?: WebhookSubscriptionListItem; error?: string }> {
  try {
    const companyId = await activeCompanyId()
    // ponytail: a UI só alterna is_active — a fachada não edita nome/url/events.
    if (typeof input.is_active === 'boolean') await setWebhookActive(id, companyId, input.is_active)
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao atualizar webhook' }
  }
}

export async function deleteWebhookSubscription(id: string): Promise<{ error?: string }> {
  try {
    await deleteWebhook(id, await activeCompanyId())
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao excluir webhook' }
  }
}
