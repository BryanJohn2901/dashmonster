'use client'

import { useState, useTransition } from 'react'
import { Copy, Check, Plus, Trash2, RotateCcw, Key, Webhook, ArrowUpRight, Eye, EyeOff, RefreshCw, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  createApiToken, revokeApiToken, deleteApiToken,
  type ApiTokenListItem,
} from '@/lib/actions/api-tokens'
import {
  createInboundWebhook, deleteInboundWebhook, regenerateInboundWebhookKey,
  updateInboundWebhook,
  type InboundWebhookListItem,
} from '@/lib/actions/inbound-webhooks'
import {
  createWebhookSubscription, deleteWebhookSubscription, updateWebhookSubscription,
  type WebhookSubscriptionListItem,
} from '@/lib/actions/webhook-subscriptions'
import { ALL_SCOPES, type Scope } from '@/lib/api/scopes'
import { ALL_WEBHOOK_EVENTS, WEBHOOK_EVENT_LABELS, type WebhookEvent } from '@/lib/webhooks/events'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'

interface Props {
  initialTokens: ApiTokenListItem[]
  initialInboundWebhooks: InboundWebhookListItem[]
  initialWebhooks?: WebhookSubscriptionListItem[]
  pipelines: { id: string; name: string }[]
}

type Tab = 'tokens' | 'webhooks' | 'inbound'

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'tokens', label: 'Tokens de API', icon: Key },
  { id: 'webhooks', label: 'Webhooks', icon: Webhook },
  { id: 'inbound', label: 'Webhooks de Entrada', icon: ArrowUpRight },
]

export function DeveloperSettingsClient({ initialTokens, initialInboundWebhooks, initialWebhooks = [], pipelines }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('tokens')

  // --- Outbound webhook state ---
  const [webhooks, setWebhooks] = useState<WebhookSubscriptionListItem[]>(initialWebhooks)
  const [webhookCreateOpen, setWebhookCreateOpen] = useState(false)
  const [webhookName, setWebhookName] = useState('')
  const [webhookUrl, setWebhookUrl] = useState('')
  const [webhookEvents, setWebhookEvents] = useState<WebhookEvent[]>([])
  const [newWebhookSecret, setNewWebhookSecret] = useState<string | null>(null)
  const [copiedSecret, setCopiedSecret] = useState(false)

  // --- Token state ---
  const [tokens, setTokens] = useState<ApiTokenListItem[]>(initialTokens)
  const [createOpen, setCreateOpen] = useState(false)
  const [newToken, setNewToken] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [tokenName, setTokenName] = useState('')
  const [selectedScopes, setSelectedScopes] = useState<Scope[]>([])
  const [expiresAt, setExpiresAt] = useState('')
  const [showRevoked, setShowRevoked] = useState(false)

  // --- Inbound webhook state ---
  const [inboundWebhooks, setInboundWebhooks] = useState<InboundWebhookListItem[]>(initialInboundWebhooks)
  const [inboundCreateOpen, setInboundCreateOpen] = useState(false)
  const [inboundName, setInboundName] = useState('')
  const [inboundPipelineId, setInboundPipelineId] = useState('')
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  const [, startTransition] = useTransition()

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? (typeof window !== 'undefined' ? window.location.origin : '')

  // ── Token helpers ──────────────────────────────────────────────
  function toggleScope(scope: Scope) {
    setSelectedScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    )
  }

  function selectAllScopes() { setSelectedScopes([...ALL_SCOPES]) }
  function clearAllScopes() { setSelectedScopes([]) }

  async function handleCreate() {
    if (!tokenName.trim()) return toast.error('Nome obrigatório')
    if (!selectedScopes.length) return toast.error('Selecione pelo menos um escopo')

    const res = await createApiToken({
      name: tokenName.trim(),
      scopes: selectedScopes,
      expires_at: expiresAt || null,
    })

    if (res.error) return toast.error(res.error)
    setNewToken(res.token ?? null)
    setTokens((prev) => [
      {
        id: res.id!,
        name: tokenName.trim(),
        scopes: selectedScopes,
        last_used_at: null,
        expires_at: expiresAt || null,
        revoked_at: null,
        created_at: new Date().toISOString(),
      },
      ...prev,
    ])
    setTokenName('')
    setSelectedScopes([])
    setExpiresAt('')
  }

  function handleCopy(text: string, key?: string) {
    navigator.clipboard.writeText(text).then(() => {
      if (key) {
        setCopiedKey(key)
        setTimeout(() => setCopiedKey(null), 2000)
      } else {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }
    })
  }

  function handleCloseCreate() {
    setCreateOpen(false)
    setNewToken(null)
    setTokenName('')
    setSelectedScopes([])
    setExpiresAt('')
  }

  async function handleRevoke(id: string) {
    startTransition(async () => {
      const res = await revokeApiToken(id)
      if (res.error) { toast.error(res.error); return }
      setTokens((prev) =>
        prev.map((t) => (t.id === id ? { ...t, revoked_at: new Date().toISOString() } : t))
      )
      toast.success('Token revogado')
    })
  }

  async function handleDeleteToken(id: string) {
    startTransition(async () => {
      const res = await deleteApiToken(id)
      if (res.error) { toast.error(res.error); return }
      setTokens((prev) => prev.filter((t) => t.id !== id))
      toast.success('Token removido')
    })
  }

  const visibleTokens = showRevoked ? tokens : tokens.filter((t) => !t.revoked_at)

  // ── Outbound webhook helpers ───────────────────────────────────
  function toggleWebhookEvent(event: WebhookEvent) {
    setWebhookEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]
    )
  }

  async function handleCreateWebhook() {
    if (!webhookName.trim()) return toast.error('Nome obrigatório')
    if (!webhookUrl.trim()) return toast.error('URL obrigatória')
    if (!webhookEvents.length) return toast.error('Selecione pelo menos um evento')

    const res = await createWebhookSubscription({
      name: webhookName.trim(),
      url: webhookUrl.trim(),
      events: webhookEvents,
    })

    if (res.error) return toast.error(res.error)
    if (res.data) setWebhooks((prev) => [res.data!, ...prev])
    setNewWebhookSecret(res.rawSecret ?? null)
    setWebhookName('')
    setWebhookUrl('')
    setWebhookEvents([])
  }

  function handleCloseWebhookCreate() {
    setWebhookCreateOpen(false)
    setNewWebhookSecret(null)
    setWebhookName('')
    setWebhookUrl('')
    setWebhookEvents([])
    setCopiedSecret(false)
  }

  async function handleDeleteWebhook(id: string) {
    startTransition(async () => {
      const res = await deleteWebhookSubscription(id)
      if (res.error) { toast.error(res.error); return }
      setWebhooks((prev) => prev.filter((w) => w.id !== id))
      toast.success('Webhook removido')
    })
  }

  async function handleToggleWebhook(id: string, is_active: boolean) {
    startTransition(async () => {
      const res = await updateWebhookSubscription(id, { is_active: !is_active })
      if (res.error) { toast.error(res.error); return }
      setWebhooks((prev) => prev.map((w) => (w.id === id ? { ...w, is_active: !is_active } : w)))
    })
  }

  // ── Inbound webhook helpers ────────────────────────────────────
  async function handleCreateInbound() {
    if (!inboundName.trim()) return toast.error('Nome obrigatório')
    if (!inboundPipelineId) return toast.error('Selecione um pipeline')

    const res = await createInboundWebhook({
      name: inboundName.trim(),
      pipeline_id: inboundPipelineId,
    })

    if (res.error) return toast.error(res.error)
    if (res.data) setInboundWebhooks((prev) => [res.data!, ...prev])
    setInboundName('')
    setInboundPipelineId('')
    setInboundCreateOpen(false)
    toast.success('Webhook de entrada criado')
  }

  async function handleDeleteInbound(id: string) {
    startTransition(async () => {
      const res = await deleteInboundWebhook(id)
      if (res.error) { toast.error(res.error); return }
      setInboundWebhooks((prev) => prev.filter((w) => w.id !== id))
      toast.success('Webhook removido')
    })
  }

  async function handleToggleInbound(id: string, is_active: boolean) {
    startTransition(async () => {
      const res = await updateInboundWebhook(id, { is_active: !is_active })
      if (res.error) { toast.error(res.error); return }
      setInboundWebhooks((prev) =>
        prev.map((w) => (w.id === id ? { ...w, is_active: !is_active } : w))
      )
    })
  }

  async function handleRegenerateKey(id: string) {
    startTransition(async () => {
      const res = await regenerateInboundWebhookKey(id)
      if (res.error) { toast.error(res.error); return }
      setInboundWebhooks((prev) =>
        prev.map((w) => (w.id === id ? { ...w, webhook_key: res.data!.webhook_key } : w))
      )
      toast.success('Chave regenerada')
    })
  }

  return (
    <div>
      {/* Tabs */}
      <div className="mb-6 flex gap-1 border-b border-border/30">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 border-b-2 px-4 pb-3 pt-2 text-sm font-medium transition-colors ${
              activeTab === id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Tokens Tab */}
      {activeTab === 'tokens' && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Tokens de API</h2>
              <p className="text-xs text-muted-foreground">
                Use tokens para autenticar chamadas à API. O token é exibido apenas na criação.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowRevoked(!showRevoked)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                {showRevoked ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                {showRevoked ? 'Ocultar revogados' : 'Mostrar revogados'}
              </button>
              <Button size="sm" className="gap-1.5 text-xs" onClick={() => setCreateOpen(true)}>
                <Plus className="h-3.5 w-3.5" />
                Criar token
              </Button>
            </div>
          </div>

          {visibleTokens.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/40 p-10 text-center">
              <Key className="mx-auto mb-3 h-8 w-8 text-muted-foreground/30" />
              <p className="text-sm font-medium text-muted-foreground">Nenhum token criado ainda</p>
              <p className="mt-1 text-xs text-muted-foreground/60">
                Crie um token para integrar sistemas externos com sua conta.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border/30">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/30 bg-muted/5">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Nome</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Escopos</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Último uso</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {visibleTokens.map((token, i) => (
                    <tr
                      key={token.id}
                      className={`${i > 0 ? 'border-t border-border/20' : ''} ${token.revoked_at ? 'opacity-50' : ''}`}
                    >
                      <td className="px-4 py-3 font-medium text-foreground">{token.name}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {token.scopes.slice(0, 3).map((s) => (
                            <span key={s} className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                              {s}
                            </span>
                          ))}
                          {token.scopes.length > 3 && (
                            <span className="text-[10px] text-muted-foreground">+{token.scopes.length - 3}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {token.last_used_at
                          ? formatDistanceToNow(new Date(token.last_used_at), { addSuffix: true, locale: ptBR })
                          : 'Nunca'}
                      </td>
                      <td className="px-4 py-3">
                        {token.revoked_at ? (
                          <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive">
                            Revogado
                          </span>
                        ) : (
                          <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] font-medium text-green-600">
                            Ativo
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {!token.revoked_at && (
                            <button
                              onClick={() => handleRevoke(token.id)}
                              title="Revogar token"
                              className="rounded-md p-1.5 text-muted-foreground hover:bg-amber-500/10 hover:text-amber-600"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => handleDeleteToken(token.id)}
                            title="Excluir token"
                            className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Webhooks Tab */}
      {activeTab === 'webhooks' && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Webhooks de Saída</h2>
              <p className="text-xs text-muted-foreground">
                Receba notificações automáticas via HTTP quando eventos ocorrerem no CRM.
              </p>
            </div>
            <Button size="sm" className="gap-1.5 text-xs" onClick={() => setWebhookCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              Criar webhook
            </Button>
          </div>

          {webhooks.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/40 p-10 text-center">
              <Webhook className="mx-auto mb-3 h-8 w-8 text-muted-foreground/30" />
              <p className="text-sm font-medium text-muted-foreground">Nenhum webhook criado ainda</p>
              <p className="mt-1 text-xs text-muted-foreground/60">
                Crie webhooks para integrar o CRM com sistemas externos.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {webhooks.map((wh) => (
                <div key={wh.id} className="rounded-xl border border-border/30 p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-foreground">{wh.name}</span>
                      {wh.is_active ? (
                        <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] font-medium text-green-600">Ativo</span>
                      ) : (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">Inativo</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleToggleWebhook(wh.id, wh.is_active)}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-muted/10 hover:text-foreground"
                        title={wh.is_active ? 'Desativar' : 'Ativar'}
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteWebhook(wh.id)}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        title="Excluir webhook"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground font-mono">{wh.url as string}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {((wh.events as string[]) ?? []).slice(0, 5).map((ev) => (
                      <span key={ev} className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">{ev}</span>
                    ))}
                    {((wh.events as string[]) ?? []).length > 5 && (
                      <span className="text-[10px] text-muted-foreground">+{((wh.events as string[]) ?? []).length - 5}</span>
                    )}
                  </div>
                  {wh.last_triggered_at && (
                    <p className="mt-2 text-[11px] text-muted-foreground/60">
                      Último disparo: {formatDistanceToNow(new Date(wh.last_triggered_at), { addSuffix: true, locale: ptBR })}
                      {wh.last_status_code && ` · ${wh.last_status_code}`}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Inbound Webhooks Tab */}
      {activeTab === 'inbound' && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Webhooks de Entrada</h2>
              <p className="text-xs text-muted-foreground">
                Receba leads automaticamente de formulários, landing pages e automações.
              </p>
            </div>
            <Button size="sm" className="gap-1.5 text-xs" onClick={() => setInboundCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              Criar webhook
            </Button>
          </div>

          {inboundWebhooks.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/40 p-10 text-center">
              <ArrowUpRight className="mx-auto mb-3 h-8 w-8 text-muted-foreground/30" />
              <p className="text-sm font-medium text-muted-foreground">Nenhum webhook de entrada criado</p>
              <p className="mt-1 text-xs text-muted-foreground/60">
                Crie um endpoint para receber leads de formulários ou plataformas externas.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {inboundWebhooks.map((wh) => {
                const webhookUrl = `${appUrl}/api/v1/inbound/webhooks/${wh.webhook_key}`
                const isCopied = copiedKey === wh.id
                return (
                  <div key={wh.id} className="rounded-xl border border-border/30 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm text-foreground">{wh.name}</span>
                        {wh.is_active ? (
                          <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] font-medium text-green-600">Ativo</span>
                        ) : (
                          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">Inativo</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleToggleInbound(wh.id, wh.is_active)}
                          title={wh.is_active ? 'Desativar' : 'Ativar'}
                          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted/10 hover:text-foreground"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleRegenerateKey(wh.id)}
                          title="Regenerar chave"
                          className="rounded-md p-1.5 text-muted-foreground hover:bg-amber-500/10 hover:text-amber-600"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteInbound(wh.id)}
                          title="Excluir webhook"
                          className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 overflow-x-auto rounded-lg bg-muted/10 px-3 py-2 text-xs font-mono text-foreground/80 border border-border/20">
                        POST {webhookUrl}
                      </code>
                      <button
                        onClick={() => handleCopy(webhookUrl, wh.id)}
                        className="flex-shrink-0 rounded-lg border border-border/40 p-2 hover:bg-muted/10"
                        title="Copiar URL"
                      >
                        {isCopied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4 text-muted-foreground" />}
                      </button>
                      <a
                        href="/developers"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-shrink-0 rounded-lg border border-border/40 p-2 hover:bg-muted/10"
                        title="Ver documentação"
                      >
                        <ExternalLink className="h-4 w-4 text-muted-foreground" />
                      </a>
                    </div>
                    {wh.pipeline_id && (
                      <p className="mt-2 text-[11px] text-muted-foreground/60">
                        Pipeline: {pipelines.find((p) => p.id === wh.pipeline_id)?.name ?? wh.pipeline_id}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Create Token Modal */}
      <Dialog open={createOpen} onOpenChange={(open) => { if (!open) handleCloseCreate() }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{newToken ? 'Token criado com sucesso' : 'Criar token de API'}</DialogTitle>
          </DialogHeader>

          {newToken ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
                <p className="mb-3 text-xs font-semibold text-amber-600">
                  Copie agora — este token não será exibido novamente.
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 overflow-x-auto rounded-lg bg-zinc-900 px-3 py-2 text-xs text-green-400 font-mono">
                    {newToken}
                  </code>
                  <button
                    onClick={() => handleCopy(newToken)}
                    className="flex-shrink-0 rounded-lg border border-border/40 p-2 hover:bg-muted/10"
                  >
                    {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={handleCloseCreate}>Fechar</Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-5">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">
                  Nome do token
                </label>
                <input
                  autoFocus
                  value={tokenName}
                  onChange={(e) => setTokenName(e.target.value)}
                  placeholder="ex: Webhook Landing Page"
                  className="w-full rounded-lg border border-border/40 bg-background px-3 py-2 text-sm focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/20"
                />
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="text-xs font-semibold text-muted-foreground">Permissões (escopos)</label>
                  <div className="flex gap-2 text-[10px]">
                    <button onClick={selectAllScopes} className="text-primary hover:underline">Selecionar todos</button>
                    <span className="text-muted-foreground/60">·</span>
                    <button onClick={clearAllScopes} className="text-muted-foreground hover:text-foreground hover:underline">Limpar</button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-border/30 p-3">
                  {ALL_SCOPES.map((scope) => (
                    <label key={scope} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/10">
                      <input
                        type="checkbox"
                        checked={selectedScopes.includes(scope)}
                        onChange={() => toggleScope(scope)}
                        className="h-3.5 w-3.5 accent-primary"
                      />
                      <span className="text-xs text-foreground">{scope}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">
                  Expiração (opcional)
                </label>
                <input
                  type="date"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value ? new Date(e.target.value).toISOString() : '')}
                  className="w-full rounded-lg border border-border/40 bg-background px-3 py-2 text-sm focus:border-primary/50 focus:outline-none"
                />
                <p className="mt-1 text-[10px] text-muted-foreground/60">Deixe em branco para nunca expirar</p>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={handleCloseCreate}>Cancelar</Button>
                <Button onClick={handleCreate} disabled={!tokenName.trim() || !selectedScopes.length}>
                  Criar token
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Create Webhook Modal */}
      <Dialog open={webhookCreateOpen} onOpenChange={(open) => { if (!open) handleCloseWebhookCreate() }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{newWebhookSecret ? 'Webhook criado com sucesso' : 'Criar webhook de saída'}</DialogTitle>
          </DialogHeader>

          {newWebhookSecret ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
                <p className="mb-3 text-xs font-semibold text-amber-600">
                  Copie o segredo agora — ele não será exibido novamente.
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 overflow-x-auto rounded-lg bg-zinc-900 px-3 py-2 text-xs text-green-400 font-mono">
                    {newWebhookSecret}
                  </code>
                  <button
                    onClick={() => { navigator.clipboard.writeText(newWebhookSecret); setCopiedSecret(true); setTimeout(() => setCopiedSecret(false), 2000) }}
                    className="flex-shrink-0 rounded-lg border border-border/40 p-2 hover:bg-muted/10"
                  >
                    {copiedSecret ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>
                <p className="mt-2 text-[10px] text-muted-foreground/60">
                  Use este segredo para validar a assinatura HMAC-SHA256 no header <code>X-CRM-Signature</code>.
                </p>
              </div>
              <DialogFooter>
                <Button onClick={handleCloseWebhookCreate}>Fechar</Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Nome</label>
                <input
                  autoFocus
                  value={webhookName}
                  onChange={(e) => setWebhookName(e.target.value)}
                  placeholder="ex: Integração Zapier"
                  className="w-full rounded-lg border border-border/40 bg-background px-3 py-2 text-sm focus:border-primary/50 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">URL (HTTPS)</label>
                <input
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  placeholder="https://hooks.exemplo.com/crm"
                  className="w-full rounded-lg border border-border/40 bg-background px-3 py-2 text-sm focus:border-primary/50 focus:outline-none"
                />
              </div>
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="text-xs font-semibold text-muted-foreground">Eventos</label>
                  <button
                    onClick={() => setWebhookEvents([...ALL_WEBHOOK_EVENTS])}
                    className="text-[10px] text-primary hover:underline"
                  >
                    Selecionar todos
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-1 rounded-xl border border-border/30 p-3 max-h-48 overflow-y-auto">
                  {ALL_WEBHOOK_EVENTS.map((event) => (
                    <label key={event} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 hover:bg-muted/10">
                      <input
                        type="checkbox"
                        checked={webhookEvents.includes(event)}
                        onChange={() => toggleWebhookEvent(event)}
                        className="h-3.5 w-3.5 accent-primary"
                      />
                      <span className="text-[11px] text-foreground">{WEBHOOK_EVENT_LABELS[event]}</span>
                    </label>
                  ))}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={handleCloseWebhookCreate}>Cancelar</Button>
                <Button
                  onClick={handleCreateWebhook}
                  disabled={!webhookName.trim() || !webhookUrl.trim() || !webhookEvents.length}
                >
                  Criar webhook
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Create Inbound Webhook Modal */}
      <Dialog open={inboundCreateOpen} onOpenChange={setInboundCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Criar webhook de entrada</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">
                Nome do webhook
              </label>
              <input
                autoFocus
                value={inboundName}
                onChange={(e) => setInboundName(e.target.value)}
                placeholder="ex: Formulário do site"
                className="w-full rounded-lg border border-border/40 bg-background px-3 py-2 text-sm focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/20"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">
                Pipeline de destino
              </label>
              <select
                value={inboundPipelineId}
                onChange={(e) => setInboundPipelineId(e.target.value)}
                className="w-full rounded-lg border border-border/40 bg-background px-3 py-2 text-sm focus:border-primary/50 focus:outline-none"
              >
                <option value="">Selecione um pipeline…</option>
                {pipelines.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <p className="text-[11px] text-muted-foreground/60">
              Leads recebidos neste endpoint serão criados automaticamente no pipeline selecionado.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setInboundCreateOpen(false); setInboundName(''); setInboundPipelineId('') }}>
              Cancelar
            </Button>
            <Button onClick={handleCreateInbound} disabled={!inboundName.trim() || !inboundPipelineId}>
              Criar webhook
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
