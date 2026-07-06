// Port fiel de components/inbox/useChatTimeline.ts do original.
// ponytail: sem subscriptions realtime (o original usava postgres_changes) —
// reloadTimeline é chamado após cada ação; realtime entra com os canais reais.

import { useState, useEffect, useCallback } from 'react'
import { getMessages, markConversationAsRead, type Message } from '@/lib/actions/inbox'
import { getDealActivities } from '@/lib/actions/playbook'
import { getDealHistory } from '@/lib/actions/history'
import type { DealActivity, DealHistory } from '@/types/supabase'

export type TimelineItemType = 'message' | 'activity' | 'note' | 'system'

export interface TimelineItem {
  id: string
  type: TimelineItemType
  timestamp: string
  data: Message | DealActivity | DealHistory
}

interface UseChatTimelineProps {
  workspaceId: string
  conversationId?: string | null
  dealId?: string | null
}

export function useChatTimeline({ workspaceId, conversationId, dealId }: UseChatTimelineProps) {
  const [items, setItems] = useState<TimelineItem[]>([])
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    if (!workspaceId) {
      setLoading(false)
      return
    }
    setLoading(true)

    if (conversationId) {
      markConversationAsRead(conversationId).catch(() => {})
    }

    const [msgRes, actsRes, histRes] = await Promise.all([
      conversationId ? getMessages(conversationId) : Promise.resolve({ data: [] as Message[] }),
      dealId ? getDealActivities(dealId) : Promise.resolve([] as DealActivity[]),
      dealId ? getDealHistory(dealId) : Promise.resolve([] as DealHistory[]),
    ])

    const timelineItems: TimelineItem[] = []

    for (const m of (msgRes?.data ?? []) as Message[]) {
      timelineItems.push({ id: m.id, type: 'message', timestamp: m.provider_timestamp, data: m })
    }
    for (const a of (actsRes ?? []) as DealActivity[]) {
      timelineItems.push({ id: a.id, type: 'activity', timestamp: a.created_at, data: a })
    }
    for (const h of (histRes ?? []) as DealHistory[]) {
      timelineItems.push({
        id: h.id,
        type: h.event_type === 'note_added' ? 'note' : 'system',
        timestamp: h.created_at,
        data: h,
      })
    }

    timelineItems.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    setItems(timelineItems)
    setLoading(false)
  }, [workspaceId, conversationId, dealId])

  useEffect(() => { void loadData() }, [loadData])

  return { items, loading, reloadTimeline: loadData }
}
