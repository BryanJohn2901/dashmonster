'use client'

// Port fiel (parcial) de components/inbox/InboxView.tsx do original: lista +
// chat faithful (ConversationList/ConversationItem/ChatWindow/MessageBubble/
// ResizableDivider). SmartChatTimeline (nota/tarefa/timeline unificada),
// LeadLinker (painel CRM lateral) e TemplatePicker (modelos WhatsApp Cloud
// aprovados) ficam de fora — dependem de integração real de canal ou de uma
// segunda onda de trabalho; usar ChatWindow simples aqui não perde fidelidade
// do que já funciona (lista + composer).

import { useEffect, useRef, useState } from 'react'
import { ConversationList } from './ConversationList'
import { ChatWindow } from './ChatWindow'
import { ResizableDivider } from './ResizableDivider'
import type { Conversation, Message } from '@/lib/actions/inbox'
import { getConversations, getMessages, sendMessage, markConversationAsRead } from '@/lib/actions/inbox'
import { toast } from 'sonner'

interface InboxViewProps {
  initialConversations: Conversation[]
  initialLeadId?: string
}

const LIST_MIN = 260
const LIST_MAX = 520
const LIST_DEFAULT = 330
const KEY_LIST = 'pf_inbox_list_w'

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function InboxView({ initialConversations, initialLeadId }: InboxViewProps) {
  const [conversations, setConversations] = useState<Conversation[]>(initialConversations)
  const [activeId, setActiveId] = useState<string | null>(() => {
    if (!initialLeadId) return null
    return initialConversations.find((c) => c.lead_id === initialLeadId)?.id ?? null
  })
  const [searchQuery, setSearchQuery] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [listWidth, setListWidth] = useState(LIST_DEFAULT)
  const dragStart = useRef(0)

  useEffect(() => {
    const stored = Number(localStorage.getItem(KEY_LIST))
    if (stored) setListWidth(clamp(stored, LIST_MIN, LIST_MAX))
  }, [])

  const filteredConversations = conversations.filter((c) =>
    (c.contact_name || c.provider_thread_id || '').toLowerCase().includes(searchQuery.toLowerCase()),
  )
  const scopedConversations = searchQuery ? filteredConversations : conversations
  const activeConversation = scopedConversations.find((c) => c.id === activeId) ?? null

  useEffect(() => {
    if (scopedConversations.length === 0) {
      if (activeId !== null) setActiveId(null)
      return
    }
    if (!activeId || !scopedConversations.some((c) => c.id === activeId)) {
      setActiveId(scopedConversations[0].id)
    }
  }, [activeId, scopedConversations])

  useEffect(() => {
    if (!activeId) { setMessages([]); return }
    let cancelled = false
    getMessages(activeId).then(({ data }) => { if (!cancelled) setMessages(data) })
    if (activeConversation && activeConversation.unread_count > 0) {
      setConversations((prev) => prev.map((c) => (c.id === activeId ? { ...c, unread_count: 0 } : c)))
      void markConversationAsRead(activeId)
    }
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId])

  async function handleSendMessage(content: string) {
    if (!activeId) return
    const { error } = await sendMessage(activeId, content)
    if (error) {
      toast.error('Erro ao enviar mensagem')
      throw new Error(error)
    }
    const { data } = await getMessages(activeId)
    setMessages(data)
    setConversations((prev) =>
      prev.map((c) => (c.id === activeId ? { ...c, last_message_preview: content, last_message_at: new Date().toISOString() } : c)),
    )
  }

  function applyListWidth(w: number) {
    setListWidth(clamp(w, LIST_MIN, LIST_MAX))
  }

  return (
    <div className="flex h-full w-full bg-[#0B0D11] text-gray-200">
      <ConversationList
        conversations={filteredConversations}
        activeConversationId={activeId}
        onSelect={setActiveId}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        width={listWidth}
      />

      <ResizableDivider
        ariaLabel="Redimensionar lista de conversas"
        onResizeStart={() => { dragStart.current = listWidth }}
        onResize={(dx) => applyListWidth(dragStart.current + dx)}
        onResizeEnd={() => localStorage.setItem(KEY_LIST, String(listWidth))}
      />

      {activeConversation ? (
        <ChatWindow conversation={activeConversation} messages={messages} onSendMessage={handleSendMessage} />
      ) : (
        <div className="flex-1 flex items-center justify-center text-gray-500 bg-[#0B0D11]">
          <div className="text-center max-w-sm">
            <div className="w-20 h-20 bg-white/[0.02] border border-white/5 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-10 h-10 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-200 mb-2">Sua Caixa de Entrada</h3>
            <p className="text-sm leading-relaxed">
              Selecione uma conversa ao lado para visualizar as mensagens e responder aos seus clientes.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
