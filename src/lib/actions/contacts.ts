// ─── Adapter: lib/actions/contacts do PipeFlow original ───────────────────────
// Contact = crm_leads (snake_case, como o original). company_id do contato no
// original era a conta B2B — aqui mapeia crm_company_id.

import { getCompanyContext } from '@/hooks/useCompany'
import { fetchLead, fetchLeads, updateLead as crmUpdateLead, type CrmLead } from '@/lib/crm'
import type { Contact } from '@/types/supabase'

export type ContactOption = Pick<Contact, 'id' | 'name' | 'email' | 'phone' | 'company' | 'crm_company_id'> & {
  /** Alias do original (company_id = conta B2B). */
  company_id: string | null
}

async function activeCompanyId(): Promise<string> {
  const state = await getCompanyContext()
  if (!state.company) throw new Error('Nenhuma empresa ativa.')
  return state.company.id
}

export function leadToContact(l: CrmLead): Contact {
  return {
    id: l.id,
    owner_id: l.ownerId,
    name: l.name,
    email: l.email,
    phone: l.phone,
    whatsapp: l.whatsapp,
    instagram: l.instagram,
    company: l.company,
    job_title: l.jobTitle,
    status: l.status,
    notes: l.notes,
    created_at: l.createdAt,
    crm_company_id: l.crmCompanyId,
    estimated_value: l.estimatedValue,
  }
}

export async function getContact(id: string): Promise<Contact | null> {
  const lead = await fetchLead(id)
  return lead ? leadToContact(lead) : null
}

export async function getContactsForSelect(search?: string): Promise<ContactOption[]> {
  const companyId = await activeCompanyId()
  const leads = await fetchLeads(companyId, search ? { search } : undefined)
  return leads.slice(0, 20).map((l) => ({
    id: l.id,
    name: l.name,
    email: l.email,
    phone: l.phone,
    company: l.company,
    crm_company_id: l.crmCompanyId,
    company_id: l.crmCompanyId,
  }))
}

export async function updateContact(
  id: string,
  input: Partial<Pick<Contact, 'name' | 'email' | 'phone' | 'whatsapp' | 'instagram' | 'company' | 'job_title' | 'status' | 'notes'>>,
): Promise<{ data?: Contact; error?: string }> {
  try {
    const companyId = await activeCompanyId()
    const patch: Parameters<typeof crmUpdateLead>[2] = {}
    if ('name' in input) patch.name = input.name ?? undefined
    if ('email' in input) patch.email = input.email ?? null
    if ('phone' in input) patch.phone = input.phone ?? null
    if ('whatsapp' in input) patch.whatsapp = input.whatsapp ?? null
    if ('instagram' in input) patch.instagram = input.instagram ?? null
    if ('company' in input) patch.company = input.company ?? null
    if ('job_title' in input) patch.jobTitle = input.job_title ?? null
    if ('status' in input && input.status) patch.status = input.status as CrmLead['status']
    if ('notes' in input) patch.notes = input.notes ?? null
    await crmUpdateLead(id, companyId, patch)
    const updated = await fetchLead(id)
    return { data: updated ? leadToContact(updated) : undefined }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao atualizar contato' }
  }
}
