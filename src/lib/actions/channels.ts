// ─── Adapter: lib/actions/channels do PipeFlow original ────────────────────────
// ponytail: leitura real via fachada; conectar/desconectar exigem OAuth da Meta
// ou Z-API server-side — entram quando houver credenciais reais configuradas.

import { getCompanyContext } from '@/hooks/useCompany'
import { fetchChannels } from '@/lib/crm'
import type { ChannelConnectionSummary } from '@/types/channel-connections'

const NOT_READY = 'Conexão real de canal (OAuth Meta / Z-API) ainda não está configurada neste ambiente.'

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

export async function deleteChannelConnection(_connectionId: string): Promise<{ error: string | null }> {
  return { error: NOT_READY }
}
