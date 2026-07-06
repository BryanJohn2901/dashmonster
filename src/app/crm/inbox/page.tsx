'use client'

// Port fiel de app/(app)/inbox/page.tsx do original. Era RSC; aqui é client:
// adapters resolvem a empresa ativa sozinhos (mesmo padrão das outras rotas).

import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { CrmShell } from '@/components/crm/CrmShell'
import { InboxView } from '@/components/inbox/InboxView'
import { getConversations, type Conversation } from '@/lib/actions/inbox'

export default function CrmInboxPage() {
  return (
    <CrmShell active="inbox">
      {({ companyId }) => <InboxPageContent companyId={companyId} />}
    </CrmShell>
  )
}

function InboxPageContent({ companyId }: { companyId: string }) {
  const searchParams = useSearchParams()
  const initialLeadId = searchParams.get('leadId') ?? undefined
  const [conversations, setConversations] = useState<Conversation[] | null>(null)

  const load = useCallback(async () => {
    const { data } = await getConversations()
    setConversations(data)
  }, [])

  useEffect(() => { void load() }, [load])

  if (!conversations) return null

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-64px)] overflow-hidden">
      <InboxView workspaceId={companyId} initialConversations={conversations} initialLeadId={initialLeadId} />
    </div>
  )
}
