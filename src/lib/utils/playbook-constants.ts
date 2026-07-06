import type { PlaybookActivityType } from '@/types/supabase'

export const ACTIVITY_TYPE_DEFAULTS: Record<PlaybookActivityType, { icon: string; label: string; actionLabel: string }> = {
  call:      { icon: 'phone',       label: 'Ligação',     actionLabel: 'Ligar' },
  email:     { icon: 'mail',        label: 'E-mail',      actionLabel: 'Enviar E-mail' },
  whatsapp:  { icon: 'whatsapp',    label: 'WhatsApp',    actionLabel: 'Enviar WhatsApp' },
  instagram: { icon: 'instagram',   label: 'Instagram',   actionLabel: 'Abrir Instagram' },
  social:    { icon: 'share',       label: 'Social',      actionLabel: 'Interagir' },
  meeting:   { icon: 'calendar',    label: 'Reunião',     actionLabel: 'Agendar Reunião' },
  task:      { icon: 'check',       label: 'Tarefa',      actionLabel: 'Concluir' },
  proposal:  { icon: 'file-text',   label: 'Proposta',    actionLabel: 'Enviar Proposta' },
  closure:   { icon: 'flag',        label: 'Encerramento',actionLabel: 'Encerrar' },
}
