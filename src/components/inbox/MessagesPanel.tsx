'use client'

// Port fiel de components/inbox/MessagesPanel.tsx do original — agora com o
// SmartChatTimeline (mensagens + notas internas + tarefas na mesma linha do
// tempo). Embutido na aba Mensagens do DealDetailSheet e do LeadContentTabs.

import { useCallback, useEffect, useState } from 'react'
import { SmartChatTimeline } from './SmartChatTimeline'
import type { Conversation } from '@/lib/actions/inbox'
import { getConversationsByLead, sendMessage, startLeadConversation } from '@/lib/actions/inbox'
import { addHistoryNote } from '@/lib/actions/history'
import { createDealActivity } from '@/lib/actions/playbook'
import { Button } from '@/components/ui/button'
import { MessageSquare, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

interface MessagesPanelProps {
  leadId?: string | null
  workspaceId?: string | null
  dealId?: string | null
  compact?: boolean
}

export function MessagesPanel({ leadId, workspaceId, dealId }: MessagesPanelProps) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)

  const activeConversation = conversations.find((c) => c.id === activeId)

  const loadConversations = useCallback(async () => {
    if (!leadId) { setLoading(false); return }
    setLoading(true)
    const { data } = await getConversationsByLead(leadId)
    setConversations(data)
    setActiveId((prev) => prev ?? data[0]?.id ?? null)
    setLoading(false)
  }, [leadId])

  useEffect(() => { void loadConversations() }, [loadConversations])

  async function handleStartConversation() {
    if (!leadId) return
    setStarting(true)
    try {
      const res = await startLeadConversation(leadId, dealId ?? undefined)
      if (res.error) { toast.error(res.error); return }
      const { data } = await getConversationsByLead(leadId)
      setConversations(data)
      if (res.conversationId) setActiveId(res.conversationId)
      toast.success('Conversa iniciada — envie a primeira mensagem')
    } finally {
      setStarting(false)
    }
  }

  async function handleSendMessage(content: string) {
    if (!activeId) return
    const { error } = await sendMessage(activeId, content)
    if (error) {
      toast.error('Erro ao enviar mensagem')
      throw new Error(error)
    }
  }

  async function handleCreateNote(content: string) {
    if (!dealId) { toast.error('Nenhum negócio associado'); return }
    const res = await addHistoryNote(dealId, content)
    if (res.error) { toast.error(res.error); throw new Error(res.error) }
    toast.success('Nota interna adicionada')
  }

  async function handleCreateTask(title: string) {
    if (!dealId) { toast.error('Nenhum negócio associado'); return }
    const execIso = new Date(new Date().toISOString().slice(0, 10) + 'T09:00:00').toISOString()
    const res = await createDealActivity({
      deal_id: dealId, title, activity_type: 'task', day_offset: 1,
      due_date: execIso, scheduled_start_at: execIso, priority: 'normal',
    })
    if (res.error) { toast.error(res.error); throw new Error(res.error) }
    toast.success('Tarefa criada')
  }

  if (loading) {
    return (
      <div className="flex h-full min-h-[400px] w-full items-center justify-center rounded-2xl border border-border/30 bg-card/30">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground/30" />
      </div>
    )
  }

  if (conversations.length === 0) {
    return (
      <div className="flex h-full min-h-[400px] w-full flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-border/30 bg-card/30 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted/20 text-muted-foreground/60 shadow-inner">
          <MessageSquare className="h-8 w-8" />
        </div>
        <div>
          <h3 className="text-[15px] font-bold tracking-tight text-foreground">Nenhuma conversa vinculada</h3>
          <p className="mt-1 text-sm text-muted-foreground/70 max-w-sm">Este lead ainda não interagiu através do WhatsApp ou Instagram configurados no Inbox.</p>
        </div>
        <Button onClick={handleStartConversation} disabled={starting || !leadId} className="h-10 rounded-lg font-bold shadow-sm">
          {starting ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <MessageSquare className="mr-2 h-4 w-4" />}
          Iniciar conversa no WhatsApp
        </Button>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-[600px] w-full flex-col rounded-2xl border border-border/40 overflow-hidden shadow-sm bg-background">
      {conversations.length > 1 && (
        <div className="flex items-center gap-2 border-b border-border/40 bg-muted/10 px-4 py-3 overflow-x-auto scrollbar-none">
          {conversations.map((conv) => (
            <Button
              key={conv.id}
              variant={activeId === conv.id ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveId(conv.id)}
              className="whitespace-nowrap h-9 text-xs font-bold rounded-lg shadow-sm"
            >
              <MessageSquare className="mr-2 h-3.5 w-3.5 opacity-70" />
              {conv.provider === 'instagram' ? 'Instagram' : 'WhatsApp'}
              {conv.unread_count > 0 && (
                <span className="ml-2 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] text-white">
                  {conv.unread_count}
                </span>
              )}
            </Button>
          ))}
        </div>
      )}

      {activeConversation ? (
        <SmartChatTimeline
          workspaceId={workspaceId ?? ''}
          conversation={activeConversation}
          leadId={leadId}
          dealId={dealId ?? activeConversation.deal_id}
          onSendMessage={handleSendMessage}
          onCreateNote={handleCreateNote}
          onCreateTask={handleCreateTask}
        />
      ) : (
        <div className="flex-1 flex items-center justify-center text-muted-foreground font-medium text-sm">
          Selecione uma conversa acima
        </div>
      )}
    </div>
  )
}
