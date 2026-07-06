export const EVENT_TYPES = [
  { key: 'lead_assigned', label: 'Lead atribuído a mim', group: 'Leads' },
  { key: 'deal_stage_changed', label: 'Negócio mudou de etapa', group: 'Negócios' },
  { key: 'deal_due_soon', label: 'Negócio vence em menos de 3 dias', group: 'Negócios' },
  { key: 'activity_reminder', label: 'Atividade pendente no dia', group: 'Negócios' },
  { key: 'member_invited', label: 'Novo membro convidado', group: 'Workspace' },
  { key: 'member_joined', label: 'Convite aceito por novo membro', group: 'Workspace' },
] as const

export type EventTypeKey = (typeof EVENT_TYPES)[number]['key']
