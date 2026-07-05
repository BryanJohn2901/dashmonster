'use client'

// Port fiel de app/(app)/leads/[leadId]/page.tsx do original. Era RSC (notFound,
// params assíncrono); aqui é client: useParams + fetch próprio.

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { CrmShell } from '@/components/crm/CrmShell'
import { LeadProfile } from '@/components/leads/LeadProfile'
import { LeadContentTabs } from '@/components/leads/LeadContentTabs'
import { LeadDetailClient } from '@/components/leads/LeadDetailClient'
import { getLead, type LeadRow } from '@/lib/actions/leads'
import { getActivities, type ActivityRow } from '@/lib/actions/activities'
import { getCompanies, type CompanyWithStats } from '@/lib/actions/companies'

export default function LeadDetailPage() {
  return (
    <CrmShell active="leads">
      {({ companyId }) => <LeadDetailContent companyId={companyId} />}
    </CrmShell>
  )
}

function LeadDetailContent({ companyId }: { companyId: string }) {
  const params = useParams<{ leadId: string }>()
  const leadId = params?.leadId ?? ''
  const [data, setData] = useState<{ lead: LeadRow | null; activities: ActivityRow[]; companies: CompanyWithStats[] } | null>(null)

  const load = useCallback(async () => {
    const [lead, activities, companies] = await Promise.all([
      getLead(leadId), getActivities(leadId), getCompanies(),
    ])
    setData({ lead, activities, companies })
  }, [leadId])

  useEffect(() => { void load() }, [load])

  if (!data) return null

  if (!data.lead) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-slate">Lead não encontrado.</p>
        <Link href="/crm/leads" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), '-ml-2 text-muted-foreground hover:text-foreground')}>
          <ArrowLeft className="h-4 w-4" />
          Leads
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <Link
        href="/crm/leads"
        className={cn(
          buttonVariants({ variant: 'ghost', size: 'sm' }),
          '-ml-2 text-muted-foreground hover:text-foreground',
        )}
      >
        <ArrowLeft className="h-4 w-4" />
        Leads
      </Link>

      <div className="grid items-start gap-5 lg:grid-cols-[288px_1fr]">
        <LeadDetailClient
          lead={data.lead}
          companies={data.companies}
          onSaved={() => void load()}
        >
          <LeadProfile lead={data.lead} companies={data.companies} onRefresh={() => void load()} />
        </LeadDetailClient>

        <LeadContentTabs
          activities={data.activities}
          leadId={leadId}
          companyId={companyId}
          onRefresh={() => void load()}
        />
      </div>
    </div>
  )
}
