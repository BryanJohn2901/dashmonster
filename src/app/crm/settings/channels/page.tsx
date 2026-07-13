'use client'

// Canais de mensagens — conexão real.
// Instagram DM: 1 clique, reaproveita a conta já vinculada à empresa em Perfil.
// WhatsApp Cloud: conexão manual (Phone Number ID + token), validada na Graph API
// (sem Embedded Signup — exige config_id do App Dashboard que este ambiente não tem).
// Z-API: sem credenciais configuradas ainda.

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { CrmShell } from '@/components/crm/CrmShell'
import { ChannelCard } from '@/components/settings/ChannelCard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import {
  getChannelConnections, deleteChannelConnection, connectInstagramChannel, connectWhatsappCloudChannel,
} from '@/lib/actions/channels'
import type { ChannelConnectionSummary } from '@/types/channel-connections'

const PROVIDERS: ChannelConnectionSummary['provider'][] = ['whatsapp_zapi', 'whatsapp_cloud', 'instagram']

export default function ChannelsSettingsPage() {
  return <CrmShell>{() => <Content />}</CrmShell>
}

function Content() {
  const [connections, setConnections] = useState<ChannelConnectionSummary[] | null>(null)
  const [connecting, setConnecting] = useState<ChannelConnectionSummary['provider'] | null>(null)
  const [waOpen, setWaOpen] = useState(false)
  const [waPhoneNumberId, setWaPhoneNumberId] = useState('')
  const [waWabaId, setWaWabaId] = useState('')
  const [waToken, setWaToken] = useState('')

  const load = () => getChannelConnections().then(({ data }) => setConnections(data))

  useEffect(() => { void load() }, [])

  if (!connections) return null

  async function handleConnect(provider: ChannelConnectionSummary['provider']) {
    if (provider === 'whatsapp_zapi') {
      toast.info('WhatsApp via Z-API ainda não está configurado neste ambiente.')
      return
    }
    if (provider === 'whatsapp_cloud') {
      setWaOpen(true)
      return
    }
    setConnecting('instagram')
    const res = await connectInstagramChannel()
    setConnecting(null)
    if (res.error) toast.error(res.error)
    else { toast.success('Instagram conectado.'); void load() }
  }

  async function handleConnectWhatsapp() {
    if (!waPhoneNumberId.trim() || !waWabaId.trim() || !waToken.trim()) {
      toast.error('Preencha Phone Number ID, WABA ID e o token.')
      return
    }
    setConnecting('whatsapp_cloud')
    const res = await connectWhatsappCloudChannel({
      phoneNumberId: waPhoneNumberId.trim(), wabaId: waWabaId.trim(), accessToken: waToken.trim(),
    })
    setConnecting(null)
    if (res.error) { toast.error(res.error); return }
    toast.success('WhatsApp Cloud conectado.')
    setWaOpen(false)
    setWaPhoneNumberId(''); setWaWabaId(''); setWaToken('')
    void load()
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[20px] font-semibold tracking-[-0.02em] text-foreground">
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
            isConnecting={connecting === provider}
            onConnect={() => handleConnect(provider)}
            onDisconnect={async (id) => {
              const res = await deleteChannelConnection(id)
              if (res.error) toast.error(res.error)
              else void load()
            }}
          />
        ))}
      </div>

      <Dialog open={waOpen} onOpenChange={setWaOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Conectar WhatsApp Cloud</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-slate">
            Gere um token permanente em Meta Business Settings → System Users (permissões
            whatsapp_business_messaging + whatsapp_business_management) e informe o Phone
            Number ID / WABA ID do painel do WhatsApp no seu App Meta.
          </p>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="wa-phone-id">Phone Number ID</Label>
              <Input id="wa-phone-id" value={waPhoneNumberId} onChange={(e) => setWaPhoneNumberId(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="wa-waba-id">WABA ID</Label>
              <Input id="wa-waba-id" value={waWabaId} onChange={(e) => setWaWabaId(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="wa-token">Token de acesso permanente</Label>
              <Input id="wa-token" type="password" value={waToken} onChange={(e) => setWaToken(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWaOpen(false)}>Cancelar</Button>
            <Button onClick={handleConnectWhatsapp} disabled={connecting === 'whatsapp_cloud'}>
              {connecting === 'whatsapp_cloud' ? 'Conectando...' : 'Conectar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
