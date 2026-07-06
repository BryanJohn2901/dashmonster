// Shim do tipo do original (derivava do Database gerado).
export interface ChannelConnectionSummary {
  id: string
  provider: 'instagram' | 'whatsapp_zapi' | 'whatsapp_cloud'
  status: 'connected' | 'disconnected' | 'error' | 'pending'
  account_handle: string | null
  account_name: string | null
  account_avatar: string | null
  connected_at: string | null
  updated_at: string | null
  error_message: string | null
}
