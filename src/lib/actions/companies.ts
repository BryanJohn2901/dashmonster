// ─── Adapter: lib/actions/companies do PipeFlow original ──────────────────────
// Company = crm_companies (contas B2B dos leads), snake_case como o original.

import { getCompanyContext } from '@/hooks/useCompany'
import {
  fetchCrmCompany, searchCrmCompanies, createCrmCompany, updateCrmCompany,
  fetchLeads,
  type CrmCompany,
} from '@/lib/crm'
import type { Company } from '@/types/supabase'

export type CompanyWithStats = Company & {
  leads_count: number
  deals_count: number
}

async function activeCompanyId(): Promise<string> {
  const state = await getCompanyContext()
  if (!state.company) throw new Error('Nenhuma empresa ativa.')
  return state.company.id
}

function toRow(c: CrmCompany): Company {
  return {
    id: c.id,
    name: c.name,
    website: c.website,
    cnpj: c.cnpj,
    city: c.city,
    state: c.state,
    segment: c.segment,
    notes: c.notes,
  }
}

export async function getCompany(id: string): Promise<Company | null> {
  const company = await fetchCrmCompany(id)
  return company ? toRow(company) : null
}

export async function getCompanies(): Promise<CompanyWithStats[]> {
  const companyId = await activeCompanyId()
  // ponytail: busca vazia lista as recentes (fachada limita a 8) — os stats
  // vêm de leads/deals já carregados; suficiente pro seletor do sheet.
  const [companies, leads] = await Promise.all([
    searchCrmCompanies(companyId, ''),
    fetchLeads(companyId).catch(() => []),
  ])
  return companies.map((c) => ({
    ...toRow(c),
    leads_count: leads.filter((l) => l.crmCompanyId === c.id).length,
    // ponytail: CrmDeal não carrega crm_company_id; contar deals exige coluna
    // extra no fetchDeals — adicionar quando alguma tela exibir esse número.
    deals_count: 0,
  }))
}

export async function findDuplicateCompanies(name: string): Promise<Company[]> {
  const companyId = await activeCompanyId()
  const term = name.trim()
  if (!term) return []
  const found = await searchCrmCompanies(companyId, term)
  return found.slice(0, 5).map(toRow)
}

export async function createCompany(input: Partial<Company> & { name: string }): Promise<{ data?: Company; error?: string }> {
  try {
    const companyId = await activeCompanyId()
    const created = await createCrmCompany(companyId, { name: input.name })
    // Campos extras além do nome
    const patch: Parameters<typeof updateCrmCompany>[2] = {}
    if (input.website != null) patch.website = input.website
    if (input.cnpj != null) patch.cnpj = input.cnpj
    if (input.city != null) patch.city = input.city
    if (input.state != null) patch.state = input.state
    if (input.segment != null) patch.segment = input.segment
    if (input.notes != null) patch.notes = input.notes
    if (Object.keys(patch).length > 0) await updateCrmCompany(created.id, companyId, patch)
    return { data: { ...toRow(created), ...patch as Partial<Company> } }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao criar empresa' }
  }
}

export async function updateCompany(
  id: string,
  input: Partial<Omit<Company, 'id'>>,
): Promise<{ data?: Company; error?: string }> {
  try {
    const companyId = await activeCompanyId()
    const patch: Parameters<typeof updateCrmCompany>[2] = {}
    if ('name' in input && input.name) patch.name = input.name
    if ('website' in input) patch.website = input.website ?? null
    if ('cnpj' in input) patch.cnpj = input.cnpj ?? null
    if ('city' in input) patch.city = input.city ?? null
    if ('state' in input) patch.state = input.state ?? null
    if ('segment' in input) patch.segment = input.segment ?? null
    if ('notes' in input) patch.notes = input.notes ?? null
    await updateCrmCompany(id, companyId, patch)
    const updated = await fetchCrmCompany(id)
    return { data: updated ? toRow(updated) : undefined }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao atualizar empresa' }
  }
}
