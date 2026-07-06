// ─── Adapter: lib/actions/leads do PipeFlow original ──────────────────────────
// LeadRow = crm_leads snake_case. Sem limites de plano (billing morreu no hub).

import { getCompanyContext } from '@/hooks/useCompany'
import {
  fetchLead, fetchLeads, createLead as crmCreateLead, updateLead as crmUpdateLead,
  deleteLead as crmDeleteLead, findDuplicateLeads as crmFindDuplicateLeads,
  type CrmLead, type CrmLeadStatus,
} from '@/lib/crm'
import { leadToContact } from './contacts'
import type { Contact, LeadStatus } from '@/types/supabase'

export type DbLeadStatus = CrmLeadStatus

export type LeadRow = Omit<Contact, 'company_id' | 'status'> & {
  status: LeadStatus
  /** Alias do original (company_id = conta B2B vinculada, não o tenant). */
  company_id: string | null
  owner_profile: { full_name: string | null } | null
  /** ponytail: sem join de nome da empresa vinculada — cai no `company` texto livre. */
  company_record: { name: string } | null
}

export interface LeadFilters {
  search?: string
  status?: DbLeadStatus | 'all'
}

export interface CreateLeadInput {
  name: string
  email?: string
  phone?: string
  company?: string
  company_id?: string | null
  job_title?: string
  status: DbLeadStatus
  estimated_value?: number
  notes?: string
  instagram?: string
  google_business?: string
}

async function activeCompanyId(): Promise<string> {
  const state = await getCompanyContext()
  if (!state.company) throw new Error('Nenhuma empresa ativa.')
  return state.company.id
}

function toLeadRow(l: CrmLead): LeadRow {
  return {
    ...leadToContact(l),
    status: l.status as LeadStatus,
    company_id: l.crmCompanyId,
    owner_profile: { full_name: l.ownerName },
    company_record: null,
  }
}

export async function getLeads(filters?: LeadFilters): Promise<LeadRow[]> {
  const companyId = await activeCompanyId()
  const leads = await fetchLeads(companyId, {
    search: filters?.search,
    status: filters?.status,
  })
  return leads.map(toLeadRow)
}

export async function getLead(id: string): Promise<LeadRow | null> {
  const lead = await fetchLead(id)
  return lead ? toLeadRow(lead) : null
}

export async function findDuplicateLeads(
  name: string,
  email?: string,
): Promise<{ id: string; name: string; email: string | null; company: string | null; status: string }[]> {
  const companyId = await activeCompanyId()
  const found = await crmFindDuplicateLeads(companyId, name, email)
  return found.map((l) => ({ id: l.id, name: l.name, email: l.email ?? null, company: null, status: 'new' }))
}

export async function createLead(input: CreateLeadInput): Promise<{ error?: string; id?: string }> {
  try {
    const companyId = await activeCompanyId()
    const created = await crmCreateLead(companyId, {
      name: input.name,
      email: input.email,
      phone: input.phone,
      crmCompanyId: input.company_id,
      estimatedValue: input.estimated_value,
    })
    const patch: Parameters<typeof crmUpdateLead>[2] = {}
    if (input.company) patch.company = input.company
    if (input.job_title) patch.jobTitle = input.job_title
    if (input.status && input.status !== 'new') patch.status = input.status
    if (input.notes) patch.notes = input.notes
    if (input.instagram) patch.instagram = input.instagram
    if (Object.keys(patch).length > 0) await crmUpdateLead(created.id, companyId, patch)
    return { id: created.id }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao criar contato' }
  }
}

export async function updateLead(id: string, input: Partial<CreateLeadInput>): Promise<{ error?: string }> {
  try {
    const companyId = await activeCompanyId()
    const patch: Parameters<typeof crmUpdateLead>[2] = {}
    if ('name' in input && input.name) patch.name = input.name
    if ('email' in input) patch.email = input.email ?? null
    if ('phone' in input) patch.phone = input.phone ?? null
    if ('company' in input) patch.company = input.company ?? null
    if ('company_id' in input) patch.crmCompanyId = input.company_id ?? null
    if ('job_title' in input) patch.jobTitle = input.job_title ?? null
    if ('status' in input && input.status) patch.status = input.status
    if ('estimated_value' in input) patch.estimatedValue = input.estimated_value ?? null
    if ('notes' in input) patch.notes = input.notes ?? null
    if ('instagram' in input) patch.instagram = input.instagram ?? null
    await crmUpdateLead(id, companyId, patch)
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao atualizar contato' }
  }
}

export async function deleteLead(id: string): Promise<{ error?: string }> {
  try {
    await crmDeleteLead(id, await activeCompanyId())
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao excluir contato' }
  }
}
