'use client'

import React, { useState, useRef, useEffect, useMemo } from 'react'
import {
  FileText,
  Image as ImageIcon,
  Loader2,
  MoreVertical,
  Paperclip,
  Send,
  StickyNote,
  CheckSquare,
  MessageSquare,
  Clock,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MessageBubble } from './MessageBubble'
import { useChatTimeline, type TimelineItem } from './useChatTimeline'
import type { Conversation, Message } from '@/lib/actions/inbox'
import type { DealActivity, DealHistory } from '@/types/supabase'
import { cn } from '@/lib/utils/cn'

interface SmartChatTimelineProps {
  workspaceId: string
  conversation: Conversation | null
  leadId?: string | null
  dealId?: string | null
  onSendMessage?: (content: string) => Promise<void>
  onSendAttachment?: (file: File, caption: string) => Promise<void>
  onCreateNote?: (content: string) => Promise<void>
  onCreateTask?: (title: string) => Promise<void>
}

type InputMode = 'message' | 'note' | 'task'
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024

export function SmartChatTimeline({ 
  workspaceId, 
  conversation, 
  leadId: _leadId, 
  dealId,
  onSendMessage,
  onSendAttachment,
  onCreateNote,
  onCreateTask 
}: SmartChatTimelineProps) {
  const { items, loading, reloadTimeline } = useChatTimeline({
    workspaceId,
    conversationId: conversation?.id,
    dealId,
  })

  const [content, setContent] = useState('')
  const [sending, setSending] = useState(false)
  const [attachment, setAttachment] = useState<File | null>(null)
  const [attachmentError, setAttachmentError] = useState<string | null>(null)
  const [attachmentPreviewUrl, setAttachmentPreviewUrl] = useState<string | null>(null)
  const [inputMode, setInputMode] = useState<InputMode>('message')
  const hasDealContext = Boolean(dealId)

  // Janela de 24h (regra da Meta p/ WhatsApp Cloud): texto livre só é entregue
  // se o cliente respondeu nas últimas 24h. Fora dela, exige template aprovado.
  const isWhatsappCloud = conversation?.provider === 'whatsapp_cloud'
  const isSessionWindowOpen = useMemo(() => {
    const inbound = items
      .filter((it) => it.type === 'message' && (it.data as Message).direction === 'inbound')
      .map((it) => new Date((it.data as Message).provider_timestamp).getTime())
    if (inbound.length === 0) return false
    const lastInbound = Math.max(...inbound)
    return Date.now() - lastInbound < 24 * 60 * 60 * 1000
  }, [items])
  const showTemplateBanner = isWhatsappCloud && !loading && !isSessionWindowOpen && Boolean(conversation)
  
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [items])

  useEffect(() => {
    if (!hasDealContext && inputMode !== 'message') {
      setInputMode('message')
    }

    if (inputMode !== 'message') {
      setAttachment(null)
      setAttachmentError(null)
    }
  }, [hasDealContext, inputMode])

  useEffect(() => {
    if (!attachment || !attachment.type.startsWith('image/')) {
      setAttachmentPreviewUrl(null)
      return
    }

    const objectUrl = URL.createObjectURL(attachment)
    setAttachmentPreviewUrl(objectUrl)

    return () => {
      URL.revokeObjectURL(objectUrl)
    }
  }, [attachment])

  const adjustTextareaHeight = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`
    }
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file) return

    if (file.size > MAX_ATTACHMENT_BYTES) {
      setAttachment(null)
      setAttachmentError('Envie arquivos de ate 25 MB.')
      return
    }

    setAttachment(file)
    setAttachmentError(null)
  }

  const clearAttachment = () => {
    setAttachment(null)
    setAttachmentError(null)
  }

  const handleSend = async () => {
    if (sending) return
    if (inputMode === 'message' && !content.trim() && !attachment) return
    if (inputMode !== 'message' && !content.trim()) return
    if ((inputMode === 'note' || inputMode === 'task') && !hasDealContext) return
    
    const text = content.trim()
    const currentAttachment = inputMode === 'message' ? attachment : null
    setContent('')
    setAttachment(null)
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    
    setSending(true)
    try {
      if (inputMode === 'message' && onSendMessage) {
        if (currentAttachment && onSendAttachment) {
          await onSendAttachment(currentAttachment, text)
        } else if (text) {
          await onSendMessage(text)
        }
      } else if (inputMode === 'note' && onCreateNote) {
        await onCreateNote(text)
        await reloadTimeline()
      } else if (inputMode === 'task' && onCreateTask) {
        await onCreateTask(text)
        await reloadTimeline()
      }
    } catch (error) {
      setContent(text)
      setAttachment(currentAttachment)
      throw error
    } finally {
      setSending(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // Helper to render timeline items
  const renderItem = (item: TimelineItem) => {
    if (item.type === 'message') {
      const msg = item.data as Message
      return <MessageBubble key={item.id} message={msg} />
    }
    
    if (item.type === 'note') {
      const hist = item.data as DealHistory
      return (
        <div key={item.id} className="my-4 flex w-full justify-center px-4">
          <div className="w-full max-w-lg rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 shadow-sm">
            <div className="mb-2 flex items-center gap-2 text-amber-500">
              <StickyNote className="h-4 w-4" />
              <span className="text-[11px] font-bold uppercase tracking-wider">Nota Interna</span>
              <span className="ml-auto text-[10px] text-amber-500/60">
                {new Date(hist.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <p className="text-[13px] leading-relaxed text-amber-200/80">{hist.details}</p>
          </div>
        </div>
      )
    }

    if (item.type === 'activity') {
      const act = item.data as DealActivity
      const isDone = !!act.completed_at
      return (
        <div key={item.id} className="my-4 flex w-full justify-center px-4">
          <div className={cn(
            "w-full max-w-lg rounded-xl border p-4 shadow-sm",
            isDone ? "border-green-500/20 bg-green-500/5" : "border-blue-500/20 bg-blue-500/5"
          )}>
            <div className={cn("mb-2 flex items-center gap-2", isDone ? "text-green-500" : "text-blue-500")}>
              <CheckSquare className="h-4 w-4" />
              <span className="text-[11px] font-bold uppercase tracking-wider">
                {isDone ? 'Tarefa Concluída' : 'Tarefa Criada'}
              </span>
              <span className={cn("ml-auto text-[10px]", isDone ? "text-green-500/60" : "text-blue-500/60")}>
                {new Date(act.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <p className={cn("text-[13px] font-medium", isDone ? "text-green-200/80 line-through" : "text-blue-200/80")}>
              {act.title}
            </p>
          </div>
        </div>
      )
    }

    if (item.type === 'system') {
      const hist = item.data as DealHistory
      return (
        <div key={item.id} className="my-3 flex justify-center px-4">
          <div className="rounded-full border border-white/5 bg-white/[0.02] px-3 py-1 text-[11px] font-medium text-gray-400">
            {hist.details}
          </div>
        </div>
      )
    }
  }

  return (
    <div className="flex flex-col flex-1 h-full bg-[#0B0D11]">
      {/* Header */}
      {conversation ? (
        <div className="flex-shrink-0 h-[78px] border-b border-white/5 flex items-center justify-between px-6 bg-[#0B0D11]">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center overflow-hidden ring-1 ring-white/10">
              {conversation.contact_avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={conversation.contact_avatar_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-gray-300 font-bold text-lg">
                  {(conversation.contact_name || conversation.provider_thread_id).charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <div>
              <h2 className="font-bold text-gray-100 text-[16px] leading-snug">
                {conversation.contact_name || conversation.provider_thread_id}
              </h2>
              <p className="text-[12.5px] text-gray-500 font-semibold flex items-center gap-1.5 mt-0.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                {conversation.provider.includes('whatsapp') ? 'WhatsApp' : 'Instagram'}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="text-gray-400 hover:text-white rounded-full">
            <MoreVertical className="w-5 h-5" />
          </Button>
        </div>
      ) : (
        <div className="flex-shrink-0 h-[78px] border-b border-white/5 flex items-center justify-between px-6 bg-[#0B0D11]">
          <h2 className="font-bold text-gray-100 text-[16px]">Linha do Tempo</h2>
        </div>
      )}

      {/* Timeline Area */}
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
        {loading ? (
          <div className="h-full flex items-center justify-center text-gray-500 text-sm">
             <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : items.length === 0 ? (
          <div className="h-full flex items-center justify-center text-gray-500 text-sm">
            Nenhum histórico ou mensagem encontrado.
          </div>
        ) : (
          <div className="space-y-1">
            {items.map(renderItem)}
            <div ref={bottomRef} className="h-1" />
          </div>
        )}
      </div>

      {/* Smart Input Area */}
      <div className="flex-shrink-0 p-4 border-t border-white/5 bg-[#0B0D11]">
        {/* ponytail: TemplatePicker (modelos aprovados do WhatsApp Cloud) fica
            de fora até haver credenciais reais da Meta — o banner segue
            explicando a janela de 24h. */}
        {showTemplateBanner && inputMode === 'message' && (
          <div className="mb-3 flex flex-col gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 sm:flex-row sm:items-center">
            <Clock className="h-4 w-4 shrink-0 text-amber-400" />
            <p className="flex-1 text-[12px] leading-snug text-amber-200">
              Fora da janela de 24h. O cliente precisa responder para liberar texto livre —
              modelos aprovados chegam com a conexão oficial do WhatsApp Cloud.
            </p>
          </div>
        )}

        <div className="mb-2 flex items-center gap-1 px-1">
          <button
            onClick={() => setInputMode('message')}
            className={cn("flex items-center gap-1.5 rounded-t-lg px-3 py-1.5 text-xs font-bold transition-colors", inputMode === 'message' ? "bg-[#121214] text-white" : "text-gray-500 hover:text-gray-300")}
          >
            <MessageSquare className="h-3.5 w-3.5" /> Mensagem
          </button>
          <button
            onClick={() => hasDealContext && setInputMode('note')}
            disabled={!hasDealContext}
            title={!hasDealContext ? 'Associe a conversa a um negocio para criar notas internas.' : undefined}
            className={cn(
              "flex items-center gap-1.5 rounded-t-lg px-3 py-1.5 text-xs font-bold transition-colors",
              inputMode === 'note' ? "bg-amber-500/10 text-amber-500" : "text-gray-500 hover:text-gray-300",
              !hasDealContext && "cursor-not-allowed opacity-40 hover:text-gray-500"
            )}
          >
            <StickyNote className="h-3.5 w-3.5" /> Nota
          </button>
          <button
            onClick={() => hasDealContext && setInputMode('task')}
            disabled={!hasDealContext}
            title={!hasDealContext ? 'Associe a conversa a um negocio para criar tarefas.' : undefined}
            className={cn(
              "flex items-center gap-1.5 rounded-t-lg px-3 py-1.5 text-xs font-bold transition-colors",
              inputMode === 'task' ? "bg-blue-500/10 text-blue-500" : "text-gray-500 hover:text-gray-300",
              !hasDealContext && "cursor-not-allowed opacity-40 hover:text-gray-500"
            )}
          >
            <CheckSquare className="h-3.5 w-3.5" /> Tarefa
          </button>
        </div>

        {!hasDealContext && (
          <p className="mb-2 px-1 text-[11px] text-gray-500">
            Vincule esta conversa a um negocio para liberar notas internas e tarefas no timeline.
          </p>
        )}

        {inputMode === 'message' && attachment && (
          <div className="mb-2 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
            {attachmentPreviewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={attachmentPreviewUrl}
                alt={attachment.name}
                className="h-14 w-14 rounded-xl object-cover"
              />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-white/10 text-gray-300">
                {attachment.type.startsWith('image/') ? (
                  <ImageIcon className="h-6 w-6" />
                ) : (
                  <FileText className="h-6 w-6" />
                )}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-gray-200">{attachment.name}</p>
              <p className="text-xs text-gray-500">{(attachment.size / 1024 / 1024).toFixed(2)} MB</p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={clearAttachment}
              className="h-8 w-8 shrink-0 rounded-full text-gray-400 hover:text-white"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}

        {attachmentError && (
          <p className="mb-2 px-1 text-[11px] font-medium text-red-300">{attachmentError}</p>
        )}

        <div className={cn("flex items-end gap-2 border rounded-2xl p-2.5 shadow-sm transition-all focus-within:ring-1", 
          inputMode === 'message' ? "bg-[#121214] border-white/10 focus-within:border-white/20 focus-within:ring-white/10" : 
          inputMode === 'note' ? "bg-amber-500/5 border-amber-500/20 focus-within:border-amber-500/40 focus-within:ring-amber-500/20" :
          "bg-blue-500/5 border-blue-500/20 focus-within:border-blue-500/40 focus-within:ring-blue-500/20"
        )}>
          {inputMode === 'message' && (
            <div className="flex items-center gap-1 pb-0.5 px-1">
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv"
                onChange={handleFileChange}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => fileInputRef.current?.click()}
                className="h-9 w-9 text-gray-400 hover:text-gray-200 shrink-0 rounded-full"
              >
                <Paperclip className="w-[18px] h-[18px]" />
              </Button>
            </div>
          )}
          
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => {
              setContent(e.target.value)
              adjustTextareaHeight()
            }}
            onKeyDown={handleKeyDown}
            placeholder={
              inputMode === 'message' ? "Escreva sua mensagem..." :
              inputMode === 'note' ? "Adicione uma nota interna ao histórico..." :
              "Qual o título da nova tarefa?"
            }
            className={cn("flex-1 bg-transparent border-0 focus:ring-0 resize-none text-[15px] placeholder-opacity-50 py-2.5 px-2 overflow-y-auto",
              inputMode === 'message' ? "text-gray-200 placeholder-gray-500" :
              inputMode === 'note' ? "text-amber-200 placeholder-amber-500/50" :
              "text-blue-200 placeholder-blue-500/50"
            )}
            rows={1}
            style={{ minHeight: '44px' }}
          />
          
          <Button 
            onClick={handleSend} 
            disabled={(inputMode === 'message' ? !content.trim() && !attachment : !content.trim()) || sending} 
            size="icon" 
            className={cn("h-11 w-11 shrink-0 rounded-xl font-medium transition-all",
              inputMode === 'message' ? "bg-canary text-bunker hover:bg-canary/90 disabled:opacity-50" :
              inputMode === 'note' ? "bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50" :
              "bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50"
            )}
          >
            {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5 ml-1" />}
          </Button>
        </div>
      </div>
    </div>
  )
}
