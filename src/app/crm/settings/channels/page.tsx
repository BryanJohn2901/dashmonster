'use client'

// Canais de mensagens — versão enxuta do original.
// ponytail: o ChannelsSettingsClient original é 100% OAuth real da Meta
// (FB SDK, embedded signup, callbacks). Aqui: lista real via fachada +
// ChannelCard fiel; conectar avisa que depende de credenciais reais.

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { CrmShell } from '@/components/crm/CrmShell'
import { ChannelCard } from '@/components/settings/ChannelCard'
import { getChannelConnections, deleteChannelConnection } from '@/lib/actions/channels'
import type { ChannelConnectionSummary } from '@/types/channel-connections'

const PROVIDERS: ChannelConnectionSummary['provider'][] = ['whatsapp_zapi', 'whatsapp_cloud', 'instagram']

export default function ChannelsSettingsPage() {
  return <CrmShell>{() => <Content />}</CrmShell>
}

function Content() {
  const [connections, setConnections] = useState<ChannelConnectionSummary[] | null>(null)

  const load = () =>
    getChannelConnections().then(({ data }) => setConnections(data))

  useEffect(() => { void load() }, [])

  if (!connections) return null

  const notReady = () =>
    toast.info('Conexão real de canal (OAuth Meta / Z-API) chega quando as credenciais estiverem configuradas.')

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[20px] font-semibold tracking-[-0.02em] text-[#F7F9FA]">
          Canais de Mensagens
        </h1>
        <p className="mt-1 text-sm text-slate">
          Conecte WhatsApp e Instagram para receber e responder conversas direto no Inbox.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {PROVIDERS.map((provider) => (
          <ChannelCard
            key={provider}
            provider={provider}
            connection={connections.find((c) => c.provider === provider)}
            onConnect={notReady}
            onDisconnect={async (id) => {
              const res = await deleteChannelConnection(id)
              if (res.error) toast.error(res.error)
              else void load()
            }}
          />
        ))}
      </div>
    </div>
  )
}
