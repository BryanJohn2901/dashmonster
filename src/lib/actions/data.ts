// ─── Adapter: lib/actions/data do PipeFlow original (export/import CSV) ────────
// Roda no client: exporta via getLeads e importa via createLead do adapter.
// ponytail: sem limite de plano (não há planos aqui) e import é 1 insert por
// linha — trocar por insert em lote se alguém importar milhares de leads.

import { getLeads, createLead } from '@/lib/actions/leads'
import type { DbLeadStatus } from '@/lib/actions/leads'

const VALID_STATUSES = ['new', 'contacted', 'proposal', 'negotiation', 'won', 'lost']

const CSV_HEADERS = ['nome', 'email', 'telefone', 'empresa', 'cargo', 'status', 'anotacoes', 'origem', 'website', 'instagram', 'whatsapp']

function escapeCSV(value: string | null | undefined): string {
  if (value == null) return ''
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"'
  }
  return str
}

export async function exportLeadsCSV(): Promise<
  { csv: string; count: number; error: null } | { error: string; csv?: never; count?: never }
> {
  try {
    const leads = await getLeads()
    const dataRows = leads.map((lead) =>
      [
        lead.name, lead.email, lead.phone, lead.company, lead.job_title ?? null,
        lead.status, lead.notes, lead.origin ?? null, lead.website ?? null,
        lead.instagram ?? null, lead.whatsapp ?? null,
      ].map(escapeCSV).join(','),
    )
    return { csv: [CSV_HEADERS.join(','), ...dataRows].join('\n'), count: leads.length, error: null }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao exportar' }
  }
}

export interface ParsedRow {
  name: string
  email?: string
  phone?: string
  company?: string
  job_title?: string
  status?: string
}

export interface ImportResult {
  imported: number
  skipped: number
  errors: Array<{ row: number; message: string }>
}

export async function importLeadsCSV(
  rows: ParsedRow[],
): Promise<{ data?: ImportResult; error: string | null }> {
  try {
    if (rows.length === 0) return { data: { imported: 0, skipped: 0, errors: [] }, error: null }
    if (rows.length > 500) return { error: 'Máximo de 500 leads por importação' }

    const existing = await getLeads()
    const existingEmails = new Set(existing.map((l) => l.email?.toLowerCase()).filter(Boolean))

    const result: ImportResult = { imported: 0, skipped: 0, errors: [] }
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      if (!row.name?.trim()) {
        result.errors.push({ row: i + 2, message: 'Nome obrigatório' })
        continue
      }
      if (row.email && existingEmails.has(row.email.toLowerCase())) {
        result.skipped++
        continue
      }
      const status = (VALID_STATUSES.includes(row.status ?? '') ? row.status : 'new') as DbLeadStatus
      const res = await createLead({
        name: row.name.trim(),
        email: row.email?.trim() || undefined,
        phone: row.phone?.trim() || undefined,
        company: row.company?.trim() || undefined,
        job_title: row.job_title?.trim() || undefined,
        status,
      })
      if (res.error) result.errors.push({ row: i + 2, message: res.error })
      else {
        result.imported++
        if (row.email) existingEmails.add(row.email.toLowerCase())
      }
    }
    return { data: result, error: null }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao importar' }
  }
}
