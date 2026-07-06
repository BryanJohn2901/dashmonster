'use client'

import { useState } from 'react'
import { Phone, Mail, Video, FileText, Plus } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'
import { ActivityForm } from './ActivityForm'
import type { ActivityRow } from '@/lib/actions/activities'

interface ActivityTimelineProps {
  activities: ActivityRow[]
  leadId: string
  /** Sem RSC/revalidatePath aqui: quem chama refaz o fetch client-side. */
  onRefresh?: () => void
}

type DbActivityType = 'call' | 'email' | 'meeting' | 'note'

const ACTIVITY_CONFIG: Record<
  DbActivityType,
  { label: string; icon: React.ElementType; iconClass: string; dotClass: string }
> = {
  call: {
    label: 'Ligação',
    icon: Phone,
    iconClass: 'text-blue-600 dark:text-blue-400',
    dotClass: 'bg-blue-100 dark:bg-blue-900/60',
  },
  email: {
    label: 'E-mail',
    icon: Mail,
    iconClass: 'text-violet-600 dark:text-violet-400',
    dotClass: 'bg-violet-100 dark:bg-violet-900/60',
  },
  meeting: {
    label: 'Reunião',
    icon: Video,
    iconClass: 'text-emerald-600 dark:text-emerald-400',
    dotClass: 'bg-emerald-100 dark:bg-emerald-900/60',
  },
  note: {
    label: 'Nota',
    icon: FileText,
    iconClass: 'text-amber-600 dark:text-amber-400',
    dotClass: 'bg-amber-100 dark:bg-amber-900/60',
  },
}

function getInitials(name: string) {
  return name
    .split(' ')
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase()
}

export function ActivityTimeline({ activities, leadId, onRefresh }: ActivityTimelineProps) {
  const [showForm, setShowForm] = useState(false)

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-sm font-semibold text-foreground">
            Atividades
            <span className="ml-1.5 font-normal text-muted-foreground">({activities.length})</span>
          </h2>
          <button
            onClick={() => setShowForm((v) => !v)}
            className={cn(
              buttonVariants({ variant: showForm ? 'outline' : 'default', size: 'sm' }),
              'gap-1.5',
            )}
          >
            <Plus className="h-3.5 w-3.5" />
            {showForm ? 'Cancelar' : 'Registrar atividade'}
          </button>
        </div>

        {activities.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center gap-2 text-center">
            <FileText className="h-7 w-7 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">Nenhuma atividade registrada</p>
            <p className="text-xs text-muted-foreground/60">
              Clique em &quot;Registrar atividade&quot; para começar
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {activities.map((activity) => {
              const config = ACTIVITY_CONFIG[activity.type as DbActivityType]
              const Icon = config.icon
              const date = format(parseISO(activity.occurred_at), "d 'de' MMM 'de' yyyy", {
                locale: ptBR,
              })
              const authorName = activity.author_profile?.full_name ?? 'Usuário'

              return (
                <li key={activity.id} className="flex gap-4 px-6 py-5">
                  <div
                    className={cn(
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
                      config.dotClass,
                    )}
                  >
                    <Icon className={cn('h-4 w-4', config.iconClass)} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {config.label}
                      </p>
                      <time className="shrink-0 text-xs text-muted-foreground">{date}</time>
                    </div>
                    <p className="mt-1.5 text-sm font-semibold text-foreground">{activity.title}</p>
                    {activity.description && (
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                        {activity.description}
                      </p>
                    )}
                    <div className="mt-2.5 flex items-center gap-1.5">
                      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-muted text-[9px] font-semibold text-muted-foreground">
                        {getInitials(authorName)}
                      </span>
                      <span className="text-xs text-muted-foreground">{authorName}</span>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {showForm && (
        <ActivityForm leadId={leadId} onSuccess={() => { setShowForm(false); onRefresh?.() }} />
      )}
    </div>
  )
}
