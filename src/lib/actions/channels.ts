// ─── Adapter: lib/actions/channels do PipeFlow original ────────────────────────
// Instagram DM reaproveita a conta já vinculada à empresa (Perfil/onboarding);
// WhatsApp Cloud é conexão manual validada na Graph API. Z-API segue sem
// credenciais configuradas neste ambiente.

import { getCompanyContext } from '@/hooks/useCompany'
import { supabaseClient } from '@/lib/supabase'
import { fetchChannels, deleteChannelConnection as crmDeleteChannelConnection } from '@/lib/crm'
import type { ChannelConnectionSummary } from '@/types/channel-connections'

async function authedFetch(path: string, body: Record<string, unknown>): Promise<{ error?: string }> {
  const { data } = (await supabaseClient?.auth.getSession()) ?? { data: { session: null } }
  const accessToken = data.session?.access_token
  if (!accessToken) return { error: 'Não autenticado.' }
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({})) as { error?: string }
  if (!res.ok) return { error: json.error ?? 'Falha ao conectar.' }
  return {}
}

export async function getChannelConnections(): Promise<{ data: ChannelConnectionSummary[]; error: string | null }> {
  try {
    const state = await getCompanyContext()
    if (!state.company) return { data: [], error: null }
    const channels = await fetchChannels(state.company.id)
    return {
      data: channels.map((c) => ({
        id: c.id,
        provider: c.provider as ChannelConnectionSummary['provider'],
        status: c.status as ChannelConnectionSummary['status'],
        account_handle: c.accountHandle,
        account_name: c.accountName,
        account_avatar: null,
        connected_at: null,
        updated_at: null,
        error_message: null,
      })),
      error: null,
    }
  } catch (e) {
    return { data: [], error: e instanceof Error ? e.message : 'Erro ao listar canais' }
  }
}

export async function connectInstagramChannel(): Promise<{ error?: string }> {
  const state = await getCompanyContext()
  if (!state.company) return { error: 'Nenhuma empresa ativa.' }
  return authedFetch('/api/crm/channels/connect-instagram', { companyId: state.company.id })
}

export async function connectWhatsappCloudChannel(input: {
  phoneNumberId: string
  wabaId: string
  accessToken: string
}): Promise<{ error?: string }> {
  const state = await getCompanyContext()
  if (!state.company) return { error: 'Nenhuma empresa ativa.' }
  return authedFetch('/api/crm/channels/connect-whatsapp-cloud', { companyId: state.company.id, ...input })
}

export async function deleteChannelConnection(connectionId: string): Promise<{ error: string | null }> {
  try {
    const state = await getCompanyContext()
    if (!state.company) throw new Error('Nenhuma empresa ativa.')
    await crmDeleteChannelConnection(connectionId, state.company.id)
    return { error: null }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao desconectar' }
  }
}
