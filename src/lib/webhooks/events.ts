export const WEBHOOK_EVENTS = {
  CONTACT_CREATED: 'contact.created',
  CONTACT_UPDATED: 'contact.updated',
  CONTACT_DELETED: 'contact.deleted',
  COMPANY_CREATED: 'company.created',
  COMPANY_UPDATED: 'company.updated',
  DEAL_CREATED: 'deal.created',
  DEAL_UPDATED: 'deal.updated',
  DEAL_STAGE_CHANGED: 'deal.stage_changed',
  DEAL_WON: 'deal.won',
  DEAL_LOST: 'deal.lost',
  DEAL_DELETED: 'deal.deleted',
  NOTE_ADDED: 'note.added',
  ACTIVITY_CREATED: 'activity.created',
  ACTIVITY_COMPLETED: 'activity.completed',
} as const

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[keyof typeof WEBHOOK_EVENTS]

export const ALL_WEBHOOK_EVENTS: WebhookEvent[] = Object.values(WEBHOOK_EVENTS)

export const WEBHOOK_EVENT_LABELS: Record<WebhookEvent, string> = {
  'contact.created': 'Contato criado',
  'contact.updated': 'Contato atualizado',
  'contact.deleted': 'Contato excluído',
  'company.created': 'Empresa criada',
  'company.updated': 'Empresa atualizada',
  'deal.created': 'Negócio criado',
  'deal.updated': 'Negócio atualizado',
  'deal.stage_changed': 'Negócio movido de etapa',
  'deal.won': 'Negócio ganho',
  'deal.lost': 'Negócio perdido',
  'deal.deleted': 'Negócio excluído',
  'note.added': 'Nota adicionada',
  'activity.created': 'Atividade criada',
  'activity.completed': 'Atividade concluída',
}
