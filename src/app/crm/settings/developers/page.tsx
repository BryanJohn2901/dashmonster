'use client'

// Port fiel de app/(app)/settings/developers/page.tsx (era RSC; aqui client).

import { useEffect, useState } from 'react'
import { CrmShell } from '@/components/crm/CrmShell'
import { DeveloperSettingsClient } from '@/components/settings/DeveloperSettingsClient'
import { listApiTokens, type ApiTokenListItem } from '@/lib/actions/api-tokens'
import { listInboundWebhooks, type InboundWebhookListItem } from '@/lib/actions/inbound-webhooks'
import { listWebhookSubscriptions, type WebhookSubscriptionListItem } from '@/lib/actions/webhook-subscriptions'
import { getPipelines } from '@/lib/actions/pipelines'

interface Loaded {
  tokens: ApiTokenListItem[]
  inbound: InboundWebhookListItem[]
  webhooks: WebhookSubscriptionListItem[]
  pipelines: { id: string; name: string }[]
}

export default function DevelopersPage() {
  return <CrmShell>{() => <Content />}</CrmShell>
}

function Content() {
  const [data, setData] = useState<Loaded | null>(null)

  useEffect(() => {
    void Promise.all([listApiTokens(), listInboundWebhooks(), listWebhookSubscriptions(), getPipelines()])
      .then(([tokens, inbound, webhooks, pipelines]) =>
        setData({
          tokens,
          inbound: inbound.data ?? [],
          webhooks: webhooks.data ?? [],
          pipelines: pipelines.map((p) => ({ id: p.id, name: p.name })),
        }))
      .catch(() => setData({ tokens: [], inbound: [], webhooks: [], pipelines: [] }))
  }, [])

  if (!data) return null

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">Desenvolvedores</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Gerencie tokens de API, webhooks e integrações externas.
        </p>
      </div>

      <DeveloperSettingsClient
        initialTokens={data.tokens}
        initialInboundWebhooks={data.inbound}
        initialWebhooks={data.webhooks}
        pipelines={data.pipelines}
      />
    </div>
  )
}
