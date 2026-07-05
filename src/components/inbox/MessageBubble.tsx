'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  AlertCircle,
  Check,
  CheckCheck,
  Download,
  FileText,
  Headphones,
  Image as ImageIcon,
} from 'lucide-react'
import type { Message } from '@/lib/actions/inbox'

interface MessageBubbleProps {
  message: Message
}

const MEDIA_FALLBACK_LABELS = new Set(['[imagem]', '[audio]', '[video]', '[documento]'])

function getMediaUrl(message: Message) {
  return message.media_url ? `/api/messages/${message.id}/media` : null
}

function getDownloadUrl(message: Message) {
  return message.media_url ? `/api/messages/${message.id}/media?download=1` : null
}

function shouldShowText(message: Message) {
  const content = message.content?.trim()
  if (!content) return false

  if (message.content_type !== 'text' && MEDIA_FALLBACK_LABELS.has(content.toLowerCase())) {
    return false
  }

  return true
}

function mediaLabel(type: Message['content_type']) {
  switch (type) {
    case 'image':
      return 'Imagem'
    case 'audio':
      return 'Audio'
    case 'video':
      return 'Video'
    case 'document':
      return 'Documento'
    default:
      return 'Midia'
  }
}

const FAILED_HINT =
  'Não entregue. Provável motivo: fora da janela de 24h — o cliente precisa enviar uma mensagem primeiro, ou use um modelo (template) aprovado para reabrir a conversa.'

function StatusIcon({ status }: { status: Message['status'] }) {
  if (status === 'failed') {
    return <AlertCircle className="h-3 w-3 text-red-300" aria-label={FAILED_HINT} />
  }

  if (status === 'read') {
    return <CheckCheck className="h-3.5 w-3.5 text-sky-300" />
  }

  if (status === 'delivered') {
    return <CheckCheck className="h-3.5 w-3.5" />
  }

  return <Check className="h-3.5 w-3.5" />
}

function UnsupportedMedia({ type }: { type: Message['content_type'] }) {
  return (
    <div className="mb-2 flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-gray-300">
      <AlertCircle className="h-4 w-4 text-amber-300" />
      <span>{mediaLabel(type)} nao disponivel</span>
    </div>
  )
}

function MediaPreview({ message }: { message: Message }) {
  const [failed, setFailed] = useState(false)
  const mediaUrl = getMediaUrl(message)
  const downloadUrl = getDownloadUrl(message)

  if (!mediaUrl || failed) {
    return <UnsupportedMedia type={message.content_type} />
  }

  if (message.content_type === 'image') {
    return (
      <a
        href={mediaUrl}
        target="_blank"
        rel="noreferrer"
        className="mb-2 block overflow-hidden rounded-2xl border border-white/10 bg-black/20"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={mediaUrl}
          alt={message.content && !MEDIA_FALLBACK_LABELS.has(message.content.toLowerCase()) ? message.content : 'Imagem recebida'}
          className="max-h-[360px] w-full max-w-[340px] object-cover"
          loading="lazy"
          onError={() => setFailed(true)}
        />
      </a>
    )
  }

  if (message.content_type === 'video') {
    return (
      <div className="mb-2 overflow-hidden rounded-2xl border border-white/10 bg-black/20">
        <video
          src={mediaUrl}
          controls
          preload="metadata"
          className="max-h-[360px] w-full max-w-[360px] bg-black"
          onError={() => setFailed(true)}
        />
      </div>
    )
  }

  if (message.content_type === 'audio') {
    return (
      <div className="mb-2 flex min-w-[260px] items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-3 py-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10">
          <Headphones className="h-4 w-4" />
        </div>
        <audio
          src={mediaUrl}
          controls
          preload="metadata"
          className="h-9 w-full min-w-0"
          onError={() => setFailed(true)}
        />
      </div>
    )
  }

  if (message.content_type === 'document') {
    return (
      <a
        href={downloadUrl ?? mediaUrl}
        className="mb-2 flex min-w-[240px] items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-3 py-3 transition hover:bg-white/10"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10">
          <FileText className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-current">
            {message.content && !MEDIA_FALLBACK_LABELS.has(message.content.toLowerCase())
              ? message.content
              : 'Documento recebido'}
          </p>
          <p className="text-[11px] opacity-60">Clique para baixar</p>
        </div>
        <Download className="h-4 w-4 shrink-0 opacity-70" />
      </a>
    )
  }

  return (
    <div className="mb-2 flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm">
      <ImageIcon className="h-4 w-4" />
      <span>{mediaLabel(message.content_type)}</span>
    </div>
  )
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isInbound = message.direction === 'inbound'
  const isMedia = message.content_type !== 'text'

  return (
    <div className={cn('flex w-full mb-3', isInbound ? 'justify-start' : 'justify-end')}>
      <div
        className={cn(
          'relative max-w-[88%] rounded-2xl px-3 py-2 text-[15px] leading-relaxed shadow-sm sm:max-w-[72%]',
          isMedia ? 'min-w-[150px]' : '',
          isInbound
            ? 'rounded-tl-sm border border-gray-800/50 bg-[#1E1E24] text-gray-200'
            : 'rounded-tr-sm border border-[#214D44] bg-[#1A3D36] text-emerald-50'
        )}
      >
        {isMedia && <MediaPreview message={message} />}

        {shouldShowText(message) && (
          <div className="whitespace-pre-wrap break-words px-1">{message.content}</div>
        )}

        <div
          className={cn(
            'mt-1.5 flex items-center gap-1 px-1 text-[10px] opacity-60',
            isInbound ? 'justify-start' : 'justify-end'
          )}
        >
          {format(new Date(message.provider_timestamp), 'HH:mm', { locale: ptBR })}
          {!isInbound && <StatusIcon status={message.status} />}
        </div>

        {!isInbound && message.status === 'failed' && (
          <div className="mt-1.5 flex items-start gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-[11px] leading-snug text-red-200">
            <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
            <span>{FAILED_HINT}</span>
          </div>
        )}
      </div>
    </div>
  )
}
