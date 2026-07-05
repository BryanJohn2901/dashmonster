// ─── Adapter: lib/actions/activities do PipeFlow original ─────────────────────
// Timeline legada do lead (tabela activities: ligação/e-mail/reunião/nota),
// distinta de deal_activities (playbook/cadência do negócio).

import { getCompanyContext } from '@/hooks/useCompany'
import {
  fetchLeadActivities, createLeadActivity as crmCreateLeadActivity,
  type CrmLegacyActivity, type CrmLegacyActivityType,
} from '@/lib/crm'
import type { ActivityRow as ActivityRowShim } from '@/types/supabase'

export type DbActivityType = CrmLegacyActivityType

export type ActivityRow = ActivityRowShim & { author_profile: { full_name: string | null } | null }

async function activeCompanyId(): Promise<string> {
  const state = await getCompanyContext()
  if (!state.company) throw new Error('Nenhuma empresa ativa.')
  return state.company.id
}

function toRow(a: CrmLegacyActivity): ActivityRow {
  return {
    id: a.id,
    lead_id: a.leadId,
    author_id: a.authorId,
    type: a.type,
    title: a.title,
    description: a.description,
    occurred_at: a.occurredAt,
    created_at: a.createdAt,
    author_profile: { full_name: a.authorName },
  }
}

export async function getActivities(leadId: string): Promise<ActivityRow[]> {
  const activities = await fetchLeadActivities(leadId, await activeCompanyId())
  return activities.map(toRow)
}

export async function createActivity(
  leadId: string,
  input: { type: DbActivityType; title: string; description?: string },
): Promise<{ error?: string }> {
  return crmCreateLeadActivity(leadId, await activeCompanyId(), input)
}
