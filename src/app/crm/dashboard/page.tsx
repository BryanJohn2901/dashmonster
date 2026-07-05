'use client'

// Port fiel de app/(app)/dashboard/page.tsx do original. Era RSC; aqui é
// client: adapters resolvem a empresa ativa sozinhos (mesmo padrão da /pipeline).

import { useCallback, useEffect, useState } from 'react'
import { CrmShell } from '@/components/crm/CrmShell'
import { DashboardBuilder } from '@/components/dashboard/DashboardBuilder'
import { DashboardSkeleton } from '@/components/dashboard/DashboardSkeleton'
import { getDashboardBuilderData, type DashboardBuilderData } from '@/lib/actions/dashboard'

export default function CrmDashboardPage() {
  return (
    <CrmShell active="dashboard">
      {() => <DashboardContent />}
    </CrmShell>
  )
}

function DashboardContent() {
  const [data, setData] = useState<DashboardBuilderData | null>(null)

  const load = useCallback(async () => {
    setData(await getDashboardBuilderData())
  }, [])

  useEffect(() => { void load() }, [load])

  if (!data) return <DashboardSkeleton />

  return <DashboardBuilder data={data} onRefresh={() => void load()} />
}
