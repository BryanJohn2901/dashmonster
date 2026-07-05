// ─── Adapter: lib/actions/history do PipeFlow original ────────────────────────

import { getCompanyContext } from '@/hooks/useCompany'
import { fetchDealHistory, addDealNote } from '@/lib/crm'
import type { DealHistory } from '@/types/supabase'

async function activeCompanyId(): Promise<string> {
  const state = await getCompanyContext()
  if (!state.company) throw new Error('Nenhuma empresa ativa.')
  return state.company.id
}

export async function getDealHistory(dealId: string): Promise<DealHistory[]> {
  const companyId = await activeCompanyId()
  const events = await fetchDealHistory(dealId, companyId)
  return events.map((e) => ({
    id: e.id,
    deal_id: dealId,
    event_type: e.eventType,
    details: e.details,
    old_value: e.oldValue,
    new_value: e.newValue,
    user_name: e.userName,
    created_at: e.createdAt,
  }))
}

export async function addHistoryNote(dealId: string, details: string): Promise<{ error?: string }> {
  try {
    await addDealNote(dealId, await activeCompanyId(), details)
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao salvar nota' }
  }
}
