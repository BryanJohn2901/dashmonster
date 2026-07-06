'use client'

// Port fiel de app/(app)/leads/page.tsx do original. Era RSC lendo searchParams;
// aqui é client: filtros viram estado local que refaz o fetch (mesmo padrão
// da /pipeline e /dashboard).

import { useCallback, useEffect, useState } from 'react'
import { CrmShell } from '@/components/crm/CrmShell'
import { LeadsView } from '@/components/leads/LeadsView'
import { LeadListSkeleton } from '@/components/leads/LeadListSkeleton'
import { getLeads, type LeadRow, type DbLeadStatus } from '@/lib/actions/leads'
import { getCompanies, type CompanyWithStats } from '@/lib/actions/companies'

export default function CrmLeadsPage() {
  return (
    <CrmShell active="leads">
      {() => <LeadsPageContent />}
    </CrmShell>
  )
}

function LeadsPageContent() {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<DbLeadStatus | 'all'>('all')
  const [data, setData] = useState<{ leads: LeadRow[]; companies: CompanyWithStats[] } | null>(null)

  const load = useCallback(async () => {
    const [leads, companies] = await Promise.all([getLeads({ search, status }), getCompanies()])
    setData({ leads, companies })
  }, [search, status])

  useEffect(() => { void load() }, [load])

  if (!data) return <LeadListSkeleton />

  return (
    <LeadsView
      leads={data.leads}
      companies={data.companies}
      search={search}
      status={status}
      onSearchChange={setSearch}
      onStatusChange={setStatus}
      onRefresh={() => void load()}
    />
  )
}
