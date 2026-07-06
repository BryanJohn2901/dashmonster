'use client'

import { useState } from 'react'
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { ChannelConnectionSummary } from '@/types/channel-connections'

interface Props {
  provider: 'instagram' | 'whatsapp_zapi' | 'whatsapp_cloud'
  connection?: ChannelConnectionSummary
  onConnect: () => void
  onDisconnect: (connectionId: string) => Promise<void>
  isConnecting?: boolean
}

export function ChannelCard({ provider, connection, onConnect, onDisconnect, isConnecting = false }: Props) {
  const [isPending, setIsPending] = useState(false)

  const isConnected = connection && connection.status === 'connected'
  const isError = connection && connection.status === 'error'

  const providerNames = {
    whatsapp_zapi: 'WhatsApp (Z-API)',
    whatsapp_cloud: 'WhatsApp Cloud (Oficial)',
    instagram: 'Instagram DM',
  }

  const providerDescriptions = {
    whatsapp_zapi: 'Conecte seu WhatsApp pessoal ou comercial via escaneamento de QR Code.',
    whatsapp_cloud: 'Conexao oficial da Meta para usar seu numero Business no CRM com operacao homologada.',
    instagram: 'Receba e responda mensagens diretas do seu perfil do Instagram Business.',
  }

  const getFriendlyErrorMessage = () => {
    const message = connection?.error_message
    if (!message) return null

    if (provider !== 'whatsapp_cloud') return message

    if (/\/me\?fields=id,name,businesses|missing permission/i.test(message)) {
      return 'A Meta conectou a conta, mas o PipeFlow nao conseguiu identificar o numero do WhatsApp. Desconecte e conecte novamente para capturarmos o WABA ID e Phone Number ID pelo fluxo oficial.'
    }

    if (/subscribed_apps|webhook/i.test(message)) {
      return 'A conta foi identificada, mas nao conseguimos ativar os webhooks da WABA. Revise as permissoes do WhatsApp Business e tente conectar novamente.'
    }

    if (/Nenhum numero|numero do WhatsApp Business/i.test(message)) {
      return 'A Meta nao retornou um numero do WhatsApp Business acessivel. Selecione uma WABA com numero verificado durante a conexao.'
    }

    if (/mais de um numero/i.test(message)) {
      return 'A Meta retornou mais de um numero. Refaca a conexao escolhendo exatamente o numero que este workspace deve usar.'
    }

    return message
  }

  const handleDisconnect = async () => {
    if (!connection) return
    setIsPending(true)
    try {
      await onDisconnect(connection.id)
    } catch (error) {
      console.error(error)
    } finally {
      setIsPending(false)
    }
  }

  const renderIcon = () => {
    if (provider === 'instagram') {
      return (
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-pink-500/10 border border-pink-500/20 text-pink-400">
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
            <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
            <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
          </svg>
        </div>
      )
    }

    return (
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
        <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24">
          <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.724-1.455L0 24zm6.59-4.846c1.6.95 3.188 1.449 4.725 1.451 5.486 0 9.95-4.46 9.954-9.94.002-2.656-1.033-5.153-2.915-7.034C16.53 1.75 14.037.716 11.382.716 5.892.716 1.43 5.176 1.428 10.66c-.001 1.636.43 3.23 1.248 4.634l-.989 3.613 3.702-.971c1.378.75 2.91 1.15 4.46 1.151zM17.07 14.5c-.274-.138-1.62-.8-1.872-.892-.252-.093-.437-.138-.62.138-.184.276-.712.892-.871 1.077-.16.184-.319.208-.593.07a8.497 8.497 0 0 1-3.528-3.08c-.76-1.3-1.27-2.9-1.27-2.9.2-.34.4-.64.5-.8.1-.16.16-.32.08-.48-.08-.16-.712-1.714-.975-2.345-.257-.618-.518-.535-.712-.545-.184-.01-.397-.01-.61-.01s-.56.08-.853.4c-.293.32-1.12 1.092-1.12 2.664s1.144 3.09 1.304 3.3c.16.212 2.25 3.435 5.45 4.82.76.329 1.354.526 1.815.672.763.242 1.46.208 2.01.126.613-.092 1.62-.663 1.85-1.302.23-.64.23-1.186.16-1.302-.07-.116-.253-.184-.527-.322z" />
        </svg>
      </div>
    )
  }

  return (
    <Card className="flex flex-col h-full">
      <CardHeader className="flex-row items-start gap-4 space-y-0 pb-3">
        {renderIcon()}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <CardTitle>{providerNames[provider]}</CardTitle>
            {isConnected && (
              <Badge className="bg-emerald-500/10 border-emerald-500/20 text-emerald-400 gap-1 select-none font-medium hover:bg-emerald-500/10 py-0 h-5">
                <CheckCircle2 className="h-3 w-3" />
                Conectado
              </Badge>
            )}
            {isError && (
              <Badge variant="destructive" className="gap-1 select-none font-medium py-0 h-5">
                <AlertCircle className="h-3 w-3" />
                Erro
              </Badge>
            )}
          </div>
          <CardDescription className="mt-1.5 text-xs text-slate line-clamp-2">
            {providerDescriptions[provider]}
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col justify-end pt-4 gap-4">
        {connection && (isConnected || isError) && (
          <div className="flex items-center gap-3 rounded-xl bg-surface/50 border border-slate/10 p-3">
            <Avatar className="h-10 w-10 border border-slate/10">
              <AvatarImage src={connection.account_avatar || undefined} />
              <AvatarFallback className="bg-surface-elevated text-slate text-sm font-semibold uppercase">
                {(connection.account_name || connection.account_handle || 'U').substring(0, 2)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-geyser truncate">
                {connection.account_name || (isError ? 'Conexao incompleta' : 'Conta Conectada')}
              </p>
              {connection.account_handle && (
                <p className="text-xs text-slate truncate">
                  {provider === 'instagram' ? `@${connection.account_handle}` : connection.account_handle}
                </p>
              )}
            </div>
          </div>
        )}

        {isError && getFriendlyErrorMessage() && (
          <div className="rounded-xl border border-red-500/10 bg-red-500/5 p-3 flex gap-2 text-xs text-red-400 items-start">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <p className="leading-5">{getFriendlyErrorMessage()}</p>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 mt-auto">
          {connection && isConnected ? (
            <Button
              variant="destructive"
              size="sm"
              className="w-full"
              onClick={handleDisconnect}
              disabled={isPending}
            >
              {isPending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Desconectando...
                </>
              ) : (
                'Desconectar'
              )}
            </Button>
          ) : connection && isError ? (
            <>
              <Button
                variant="default"
                size="sm"
                className="w-full"
                onClick={onConnect}
                disabled={isPending || isConnecting}
              >
                {isConnecting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Conectando...
                  </>
                ) : (
                  'Tentar novamente'
                )}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className="w-full"
                onClick={handleDisconnect}
                disabled={isPending || isConnecting}
              >
                {isPending ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Removendo...
                  </>
                ) : (
                  'Desconectar'
                )}
              </Button>
            </>
          ) : (
            <Button
              variant="default"
              size="sm"
              className="w-full"
              onClick={onConnect}
              disabled={isPending || isConnecting}
            >
              {isPending || isConnecting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Conectando...
                </>
              ) : (
                'Conectar Canal'
              )}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
