'use client'

import { useState } from 'react'
import { MessagesPanel } from '@/components/inbox/MessagesPanel'
import { ActivityTimeline } from './ActivityTimeline'
import type { ActivityRow } from '@/lib/actions/activities'

interface LeadContentTabsProps {
  leadId: string
  companyId: string
  activities: ActivityRow[]
  onRefresh?: () => void
}

export function LeadContentTabs({ leadId, companyId, activities, onRefresh }: LeadContentTabsProps) {
  const [tab, setTab] = useState<'timeline' | 'messages'>('timeline')

  return (
    <div className="flex flex-col gap-5 h-full">
      <div className="flex items-center gap-2 border-b border-border/40 pb-1">
        <button
          onClick={() => setTab('timeline')}
          className={`px-4 py-2 text-[13px] font-bold rounded-lg transition-all ${
            tab === 'timeline'
              ? 'bg-foreground text-background shadow-md'
              : 'text-muted-foreground/60 hover:bg-white/5 hover:text-foreground'
          }`}
        >
          Timeline
        </button>
        <button
          onClick={() => setTab('messages')}
          className={`px-4 py-2 text-[13px] font-bold rounded-lg transition-all ${
            tab === 'messages'
              ? 'bg-foreground text-background shadow-md'
              : 'text-muted-foreground/60 hover:bg-white/5 hover:text-foreground'
          }`}
        >
          Mensagens (Inbox)
        </button>
      </div>

      <div className="flex-1">
        {tab === 'timeline' ? (
          <ActivityTimeline activities={activities} leadId={leadId} onRefresh={onRefresh} />
        ) : (
          <MessagesPanel leadId={leadId} workspaceId={companyId} />
        )}
      </div>
    </div>
  )
}
