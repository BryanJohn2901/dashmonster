// ─── Adapter: lib/actions/api-tokens do PipeFlow original ──────────────────────

import { getCompanyContext } from '@/hooks/useCompany'
import { fetchApiTokens, createApiToken as crmCreateApiToken, revokeApiToken as crmRevokeApiToken } from '@/lib/crm'

export interface ApiTokenListItem {
  id: string
  name: string
  scopes: string[]
  last_used_at: string | null
  expires_at: string | null
  revoked_at: string | null
  created_at: string
}

async function activeCompanyId(): Promise<string> {
  const state = await getCompanyContext()
  if (!state.company) throw new Error('Nenhuma empresa ativa.')
  return state.company.id
}

export async function listApiTokens(): Promise<ApiTokenListItem[]> {
  const companyId = await activeCompanyId()
  const tokens = await fetchApiTokens(companyId)
  return tokens.map((t) => ({
    id: t.id, name: t.name, scopes: t.scopes,
    last_used_at: t.lastUsedAt, expires_at: null, revoked_at: t.revokedAt, created_at: t.createdAt,
  }))
}

// ponytail: a fachada gera token com scopes fixos ["read","write"] — os scopes
// finos e expires_at do original entram quando a API pública nascer (Onda 5).
export async function createApiToken(input: {
  name: string
  scopes: string[]
  expires_at?: string | null
}): Promise<{ token?: string; id?: string; error?: string }> {
  try {
    const companyId = await activeCompanyId()
    const { token, record } = await crmCreateApiToken(companyId, input.name)
    return { token, id: record.id }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao criar token' }
  }
}

export async function revokeApiToken(id: string): Promise<{ error?: string }> {
  try {
    await crmRevokeApiToken(id, await activeCompanyId())
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao revogar token' }
  }
}

// ponytail: delete = revoke — a fachada não apaga a linha (auditoria barata).
export async function deleteApiToken(id: string): Promise<{ error?: string }> {
  return revokeApiToken(id)
}
