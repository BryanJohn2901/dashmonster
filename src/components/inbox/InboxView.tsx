'use client'

// Port fiel de components/inbox/InboxView.tsx do original, agora COMPLETO:
// lista + SmartChatTimeline (mensagens/notas/tarefas na mesma linha do tempo)
// + LeadLinker (painel CRM lateral: criar lead+negócio, status do negócio).
// ponytail: anexos avisam que dependem do canal real (rota de upload é
// integração externa); TemplatePicker segue de fora (credenciais Meta).

import { useEffect, useRef, useState } from 'react'
import { ConversationList } from './ConversationList'
import { SmartChatTimeline } from './SmartChatTimeline'
import { LeadLinker } from './LeadLinker'
import { ResizableDivider } from './ResizableDivider'
import type { Conversation } from '@/lib/actions/inbox'
import { sendMessage } from '@/lib/actions/inbox'
import { addHistoryNote } from '@/lib/actions/history'
import { createDealActivity } from '@/lib/actions/playbook'
import { toast } from 'sonner'

interface InboxViewProps {
  workspaceId: string
  initialConversations: Conversation[]
  initialLeadId?: string
}

const LIST_MIN = 260
const LIST_MAX = 520
const LIST_DEFAULT = 330
const CRM_MIN = 280
const CRM_MAX = 480
const CRM_DEFAULT = 330
const KEY_LIST = 'pf_inbox_list_w'
const KEY_CRM = 'pf_inbox_crm_w'

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function InboxView({ workspaceId, initialConversations, initialLeadId }: InboxViewProps) {
  const [conversations, setConversations] = useState<Conversation[]>(initialConversations)
  const [activeId, setActiveId] = useState<string | null>(() => {
    if (!initialLeadId) return null
    return initialConversations.find((c) => c.lead_id === initialLeadId)?.id ?? null
  })
  const [searchQuery, setSearchQuery] = useState('')
  const [listWidth, setListWidth] = useState(LIST_DEFAULT)
  const [crmWidth, setCrmWidth] = useState(CRM_DEFAULT)
  const dragStart = useRef(0)
  const listWidthRef = useRef(LIST_DEFAULT)
  const crmWidthRef = useRef(CRM_DEFAULT)

  useEffect(() => {
    const storedList = Number(localStorage.getItem(KEY_LIST))
    if (storedList) { setListWidth(clamp(storedList, LIST_MIN, LIST_MAX)); listWidthRef.current = clamp(storedList, LIST_MIN, LIST_MAX) }
    const storedCrm = Number(localStorage.getItem(KEY_CRM))
    if (storedCrm) { setCrmWidth(clamp(storedCrm, CRM_MIN, CRM_MAX)); crmWidthRef.current = clamp(storedCrm, CRM_MIN, CRM_MAX) }
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

  function applyListWidth(w: number) {
    const v = clamp(w, LIST_MIN, LIST_MAX)
    setListWidth(v); listWidthRef.current = v
  }
  function applyCrmWidth(w: number) {
    const v = clamp(w, CRM_MIN, CRM_MAX)
    setCrmWidth(v); crmWidthRef.current = v
  }

  async function handleSendMessage(content: string) {
    if (!activeId) return
    const { error } = await sendMessage(activeId, content)
    if (error) {
      toast.error('Erro ao enviar mensagem')
      throw new Error(error)
    }
    setConversations((prev) =>
      prev.map((c) => (c.id === activeId ? { ...c, last_message_preview: content, last_message_at: new Date().toISOString() } : c)),
    )
  }

  // ponytail: upload real de anexo exige canal conectado (rota externa).
  async function handleSendAttachment(_file: File, _caption: string) {
    toast.info('Envio de anexos chega com a conexão real do canal (WhatsApp/Instagram).')
  }

  const handleCreateNote = async (content: string) => {
    const dealId = activeConversation?.deal_id
    if (!dealId) {
      toast.error('Nenhum negócio associado para criar notas')
      return
    }
    const res = await addHistoryNote(dealId, content)
    if (res.error) {
      toast.error(res.error)
      throw new Error(res.error)
    }
    toast.success('Nota interna adicionada')
  }

  const handleCreateTask = async (title: string) => {
    const dealId = activeConversation?.deal_id
    if (!dealId) {
      toast.error('Nenhum negócio associado para criar tarefas')
      return
    }
    const todayIso = new Date().toISOString().slice(0, 10) + 'T09:00:00'
    const execIso = new Date(todayIso).toISOString()
    const res = await createDealActivity({
      deal_id: dealId,
      title,
      activity_type: 'task',
      day_offset: 1,
      due_date: execIso,
      scheduled_start_at: execIso,
      priority: 'normal',
    })
    if (res.error) {
      toast.error(res.error)
      throw new Error(res.error)
    }
    toast.success('Tarefa criada')
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

      {/* Divisória lista ↔ chat */}
      <ResizableDivider
        ariaLabel="Redimensionar lista de conversas"
        onResizeStart={() => { dragStart.current = listWidthRef.current }}
        onResize={(dx) => applyListWidth(dragStart.current + dx)}
        onResizeEnd={() => localStorage.setItem(KEY_LIST, String(listWidthRef.current))}
      />

      {activeConversation ? (
        <div className="flex-1 flex min-w-0 overflow-hidden">
          <SmartChatTimeline
            workspaceId={workspaceId}
            conversation={activeConversation}
            leadId={activeConversation.lead_id}
            dealId={activeConversation.deal_id}
            onSendMessage={handleSendMessage}
            onSendAttachment={handleSendAttachment}
            onCreateNote={handleCreateNote}
            onCreateTask={handleCreateTask}
          />

          {/* Divisória chat ↔ painel CRM */}
          <ResizableDivider
            ariaLabel="Redimensionar painel do CRM"
            onResizeStart={() => { dragStart.current = crmWidthRef.current }}
            onResize={(dx) => applyCrmWidth(dragStart.current - dx)}
            onResizeEnd={() => localStorage.setItem(KEY_CRM, String(crmWidthRef.current))}
          />

          <div className="flex-shrink-0" style={{ width: `${crmWidth}px` }}>
            <LeadLinker
              conversation={activeConversation}
              onLinked={(leadId, dealId) => {
                setConversations((prev) =>
                  prev.map((conversation) =>
                    conversation.id === activeConversation.id
                      ? { ...conversation, lead_id: leadId, deal_id: dealId ?? conversation.deal_id }
                      : conversation
                  )
                )
              }}
            />
          </div>
        </div>
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
