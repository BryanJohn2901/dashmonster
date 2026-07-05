// ─── Adapter: lib/actions/tags do PipeFlow original ────────────────────────────

import { getCompanyContext } from '@/hooks/useCompany'
import { fetchTags, createTag as crmCreateTag, updateTag as crmUpdateTag, deleteTag as crmDeleteTag } from '@/lib/crm'

export interface Tag {
  id: string
  name: string
  color: string
}

// ponytail: usageCount fixo em 0 — a fachada não expõe contagem de deal_tags.
// Plugar contagem real quando a tela precisar dela de verdade.
export interface TagWithCount extends Tag {
  usageCount: number
}

async function activeCompanyId(): Promise<string> {
  const state = await getCompanyContext()
  if (!state.company) throw new Error('Nenhuma empresa ativa.')
  return state.company.id
}

export async function getTags(): Promise<TagWithCount[]> {
  const companyId = await activeCompanyId()
  const tags = await fetchTags(companyId)
  return tags.map((t) => ({ id: t.id, name: t.name, color: t.color, usageCount: 0 }))
}

export async function createTag({ name, color }: { name: string; color: string }): Promise<{ error: string | null; data?: Tag }> {
  try {
    const companyId = await activeCompanyId()
    const created = await crmCreateTag(companyId, name, color)
    return { error: null, data: { id: created.id, name: created.name, color: created.color } }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao criar tag' }
  }
}

export async function updateTag(id: string, input: { name?: string; color?: string }): Promise<{ error: string | null }> {
  try {
    await crmUpdateTag(id, await activeCompanyId(), input)
    return { error: null }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao atualizar tag' }
  }
}

export async function deleteTag(id: string): Promise<{ error: string | null }> {
  try {
    await crmDeleteTag(id, await activeCompanyId())
    return { error: null }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao excluir tag' }
  }
}
