// ─── Adapter: lib/actions/playbook-templates do PipeFlow original ─────────────
// Playbooks nomeados (tabelas da 073) via fachada. O original sincronizava
// edições de template com deals já aplicados (syncedDeals/syncedActivities);
// aqui isso não existe ainda — os campos ficam undefined (UI trata como opcional).

import { getCompanyContext } from '@/hooks/useCompany'
import {
  fetchPlaybooks, applyPlaybookToDeal as crmApplyPlaybookToDeal,
  createPlaybook as crmCreatePlaybook, deletePlaybook as crmDeletePlaybook,
  addPlaybookActivity as crmAddPlaybookActivity,
  updatePlaybookActivity as crmUpdatePlaybookActivity,
  deletePlaybookActivity as crmDeletePlaybookActivity,
  type CrmActivityKind, type CrmPlaybookActivity,
} from '@/lib/crm'
import type { Playbook, PlaybookActivity, PlaybookActivityType } from '@/types/supabase'

async function activeCompanyId(): Promise<string> {
  const state = await getCompanyContext()
  if (!state.company) throw new Error('Nenhuma empresa ativa.')
  return state.company.id
}

function toActivityRow(playbookId: string, a: CrmPlaybookActivity): PlaybookActivity {
  return {
    id: a.id,
    playbook_id: playbookId,
    title: a.title,
    activity_type: a.activityType as PlaybookActivityType,
    day_offset: a.dayOffset,
    order_index: a.orderIndex,
    icon_key: a.iconKey,
    action_label: a.actionLabel,
    script: a.script,
    created_at: '',
  }
}

export async function getPlaybooks(): Promise<(Playbook & { activities: PlaybookActivity[] })[]> {
  const companyId = await activeCompanyId()
  const books = await fetchPlaybooks(companyId)
  return books.map((b) => ({
    id: b.id,
    name: b.name,
    description: b.description,
    activities: b.activities.map((a) => toActivityRow(b.id, a)),
  }))
}

export async function createPlaybook(input: { name: string; description?: string | null }): Promise<{ error?: string; data?: Playbook }> {
  try {
    const companyId = await activeCompanyId()
    const created = await crmCreatePlaybook(companyId, input)
    return { data: { id: created.id, name: created.name, description: created.description } }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao criar template' }
  }
}

export async function deletePlaybook(playbookId: string): Promise<{ error?: string }> {
  try {
    await crmDeletePlaybook(playbookId, await activeCompanyId())
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao excluir template' }
  }
}

export async function addPlaybookActivity(input: {
  playbook_id: string
  title: string
  activity_type: PlaybookActivityType
  day_offset?: number
  order_index?: number
  icon_key?: string | null
  action_label?: string | null
  script?: string | null
}): Promise<{ error?: string; data?: PlaybookActivity; syncError?: string; syncedDeals?: number }> {
  try {
    const companyId = await activeCompanyId()
    const created = await crmAddPlaybookActivity(companyId, input.playbook_id, {
      title: input.title,
      activityType: input.activity_type as CrmActivityKind,
      dayOffset: input.day_offset,
      orderIndex: input.order_index,
      iconKey: input.icon_key,
      actionLabel: input.action_label,
      script: input.script,
    })
    return { data: toActivityRow(input.playbook_id, created) }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao criar atividade' }
  }
}

export async function updatePlaybookActivity(
  activityId: string,
  input: Partial<{
    title: string; activity_type: PlaybookActivityType; day_offset: number; order_index: number
    icon_key: string | null; action_label: string | null; script: string | null
  }>,
): Promise<{ error?: string; data?: PlaybookActivity; syncError?: string; syncedActivities?: number }> {
  try {
    const companyId = await activeCompanyId()
    const updated = await crmUpdatePlaybookActivity(activityId, companyId, {
      title: input.title,
      activityType: input.activity_type as CrmActivityKind | undefined,
      dayOffset: input.day_offset,
      orderIndex: input.order_index,
      iconKey: input.icon_key,
      actionLabel: input.action_label,
      script: input.script,
    })
    return { data: toActivityRow('', updated) }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao atualizar atividade' }
  }
}

export async function deletePlaybookActivity(activityId: string): Promise<{ error?: string; syncError?: string; syncedActivities?: number }> {
  try {
    await crmDeletePlaybookActivity(activityId, await activeCompanyId())
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao excluir atividade' }
  }
}

export async function applyPlaybookToDeal(input: {
  deal_id: string
  playbook_id: string
  mode?: 'replace' | 'append'
  startDate?: string
}): Promise<{ error?: string; created?: number }> {
  try {
    const companyId = await activeCompanyId()
    const created = await crmApplyPlaybookToDeal(input.deal_id, companyId, input.playbook_id)
    return { created }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao aplicar playbook' }
  }
}

/** ponytail: seed de playbooks default era server-side; no-op até a Onda 5. */
export async function seedPlaybooksIfEmpty(): Promise<{ error?: string; seeded: boolean }> {
  return { seeded: false }
}
