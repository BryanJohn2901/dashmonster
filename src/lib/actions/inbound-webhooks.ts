// ─── Adapter: lib/actions/inbound-webhooks do PipeFlow original ────────────────
// ponytail: stub — webhooks de ENTRADA (captação de lead via URL pública) exigem
// endpoint server-side que ainda não existe aqui. A tela lista vazio e o criar
// explica. Implementar junto com a API pública (Onda 5).

export interface InboundWebhookListItem {
  id: string
  name: string
  webhook_key: string
  pipeline_id: string | null
  default_stage_id: string | null
  default_owner_id: string | null
  default_tags: string[]
  default_product: string | null
  field_map: Record<string, string>
  is_active: boolean
  created_at: string
}

const NOT_READY = 'Webhooks de entrada chegam com a API pública — em desenvolvimento.'

export async function listInboundWebhooks(): Promise<{ data?: InboundWebhookListItem[]; error?: string }> {
  return { data: [] }
}

export async function createInboundWebhook(_input: {
  name: string
  pipeline_id?: string | null
  default_stage_id?: string | null
  default_owner_id?: string | null
  default_tags?: string[]
  default_product?: string | null
  field_map?: Record<string, string>
}): Promise<{ data?: InboundWebhookListItem; error?: string }> {
  return { error: NOT_READY }
}

export async function updateInboundWebhook(
  _id: string,
  _input: Partial<{ name: string; is_active: boolean }>,
): Promise<{ data?: InboundWebhookListItem; error?: string }> {
  return { error: NOT_READY }
}

export async function deleteInboundWebhook(_id: string): Promise<{ error?: string }> {
  return { error: NOT_READY }
}

export async function regenerateInboundWebhookKey(_id: string): Promise<{ data?: { webhook_key: string }; error?: string }> {
  return { error: NOT_READY }
}
