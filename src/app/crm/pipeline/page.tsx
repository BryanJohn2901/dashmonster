'use client'

// Port fiel de app/(app)/pipeline/page.tsx do original. Era RSC (server
// actions); aqui é client: adapters resolvem a empresa ativa sozinhos.

import { useCallback, useEffect, useState } from 'react'
import { KanbanBoard } from '@/components/pipeline/KanbanBoard'
import { KanbanBoardSkeleton } from '@/components/pipeline/KanbanBoardSkeleton'
import { getDeals, type DealRow } from '@/lib/actions/deals'
import { getPipelines, type PipelineWithStages } from '@/lib/actions/pipelines'
import { CrmShell } from '@/components/crm/CrmShell'
import { ensureDefaultPipeline } from '@/lib/crm'

export default function PipelinePage() {
  return (
    <CrmShell active="pipeline">
      {({ companyId, canWrite }) => <PipelineContent companyId={companyId} canWrite={canWrite} />}
    </CrmShell>
  )
}

function PipelineContent({ companyId, canWrite }: { companyId: string; canWrite: boolean }) {
  const [data, setData] = useState<{ deals: DealRow[]; pipelines: PipelineWithStages[] } | null>(null)

  const load = useCallback(async () => {
    // "Funil Principal" nasce no primeiro acesso de quem pode escrever
    if (canWrite) await ensureDefaultPipeline(companyId).catch(() => {})
    const [deals, pipelines] = await Promise.all([getDeals(), getPipelines()])
    setData({ deals, pipelines })
  }, [companyId, canWrite])

  useEffect(() => { void load() }, [load])

  if (!data) return <KanbanBoardSkeleton />

  return (
    <div className="flex h-full flex-col">
      <KanbanBoard
        initialDeals={data.deals}
        pipelines={data.pipelines}
        initialMembers={[]}
        onRefresh={() => void load()}
      />
    </div>
  )
}
