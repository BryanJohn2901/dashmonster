// ─── Adapter: lib/actions/inbox do PipeFlow original ───────────────────────────
// O original enviava mensagens de verdade via Z-API/WhatsApp Cloud/Instagram
// (chamadas HTTP reais pras APIs do provedor). ponytail: sem canal conectado,
// sendMessage só grava a linha (mesmo comportamento que o original tem quando
// nenhum provedor está configurado) — disparo real chega com as integrações
// de canal (Onda 5). media_url não existe na fachada ainda: anexos não
// renderizam (UnsupportedMedia cobre esse caso no MessageBubble).

import { getCompanyContext } from '@/hooks/useCompany'
import {
  fetchConversations, fetchMessages, sendMessage as crmSendMessage,
  markConversationRead, type CrmConversation, type CrmMessage,
} from '@/lib/crm'
import { createLead } from './leads'
import { createDealFromLead } from './deals'

export interface Conversation {
  id: string
  provider: CrmConversation['provider']
  contact_name: string | null
  contact_avatar_url: string | null
  provider_thread_id: string | null
  unread_count: number
  last_message_at: string
  last_message_preview: string | null
  lead_id: string | null
  deal_id: string | null
  status: CrmConversation['status']
}

export interface Message {
  id: string
  conversation_id: string
  direction: 'inbound' | 'outbound'
  content: string | null
  content_type: string
  status: string
  provider_timestamp: string
  media_url: string | null
}

async function activeCompanyId(): Promise<string> {
  const state = await getCompanyContext()
  if (!state.company) throw new Error('Nenhuma empresa ativa.')
  return state.company.id
}

function toConversation(c: CrmConversation): Conversation {
  return {
    id: c.id,
    provider: c.provider,
    contact_name: c.contactName,
    contact_avatar_url: null,
    provider_thread_id: c.contactHandle,
    unread_count: c.unreadCount,
    last_message_at: c.lastMessageAt,
    last_message_preview: c.lastMessagePreview,
    lead_id: c.leadId,
    deal_id: c.dealId,
    status: c.status,
  }
}

function toMessage(m: CrmMessage): Message {
  return {
    id: m.id,
    conversation_id: m.conversationId,
    direction: m.direction,
    content: m.content,
    content_type: m.contentType,
    status: m.status,
    provider_timestamp: m.createdAt,
    media_url: null,
  }
}

export async function getConversations(): Promise<{ data: Conversation[]; error: string | null }> {
  try {
    const companyId = await activeCompanyId()
    const conversations = await fetchConversations(companyId)
    return { data: conversations.map(toConversation), error: null }
  } catch (e) {
    return { data: [], error: e instanceof Error ? e.message : 'Erro ao carregar inbox' }
  }
}

export async function getConversationsByLead(leadId: string): Promise<{ data: Conversation[]; error: string | null }> {
  try {
    const companyId = await activeCompanyId()
    const conversations = await fetchConversations(companyId)
    return { data: conversations.filter((c) => c.leadId === leadId).map(toConversation), error: null }
  } catch (e) {
    return { data: [], error: e instanceof Error ? e.message : 'Erro ao carregar conversas' }
  }
}

export async function getMessages(conversationId: string): Promise<{ data: Message[]; error: string | null }> {
  try {
    const companyId = await activeCompanyId()
    const messages = await fetchMessages(conversationId, companyId)
    return { data: messages.map(toMessage), error: null }
  } catch (e) {
    return { data: [], error: e instanceof Error ? e.message : 'Erro ao carregar mensagens' }
  }
}

export async function sendMessage(conversationId: string, content: string): Promise<{ error: string | null }> {
  try {
    const companyId = await activeCompanyId()
    await crmSendMessage(conversationId, companyId, content)
    return { error: null }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao enviar mensagem' }
  }
}

export async function markConversationAsRead(conversationId: string): Promise<{ error: string | null }> {
  try {
    await markConversationRead(conversationId, await activeCompanyId())
    return { error: null }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao atualizar conversa' }
  }
}

/**
 * Abre (ou localiza) a conversa de um contato. No original criava a conversa
 * via provedor conectado; aqui localiza a existente — criação real de conversa
 * chega com as integrações de canal (Onda 5).
 */
export async function startLeadConversation(
  leadId: string,
  _dealId?: string,
): Promise<{ error?: string; conversationId?: string }> {
  try {
    const companyId = await activeCompanyId()
    const conversations = await fetchConversations(companyId)
    const existing = conversations.find((c) => c.leadId === leadId)
    if (existing) return { conversationId: existing.id }
    // ponytail: sem canal conectado não há como iniciar conversa nova ainda
    return { error: 'Nenhuma conversa com este contato. Conecte um canal no Inbox.' }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao abrir conversa' }
  }
}

/** Cria lead + negócio a partir de uma conversa sem contato vinculado (LeadLinker). */
export async function createInboxContact(params: {
  conversationId: string
  name: string
  phone: string
}): Promise<{ leadId?: string; dealId?: string; error?: string }> {
  try {
    const created = await createLead({ name: params.name, phone: params.phone, status: 'new' })
    if (created.error || !created.id) return { error: created.error ?? 'Erro ao criar lead' }
    const dealResult = await createDealFromLead({ title: params.name, lead_id: created.id })
    if (dealResult.error) return { leadId: created.id, error: dealResult.error }
    return { leadId: created.id }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao criar contato' }
  }
}
