'use client'

// Port fiel de app/(app)/calendar/page.tsx do original. Era RSC (auth.getUser +
// workspace_members); aqui é client: currentUserId via supabaseClient (ou
// "demo-user" no modo demo), isAdmin aproximado por isSuperAdmin/owner.

import { useCallback, useEffect, useState } from 'react'
import { CrmShell } from '@/components/crm/CrmShell'
import { CalendarView } from '@/components/calendar/CalendarView'
import { getCalendarActivities, getCalendarMembers, type CalendarActivity } from '@/lib/actions/calendar'
import { getCompanyContext } from '@/hooks/useCompany'
import { supabaseClient } from '@/lib/supabase'

function getWeekRange(): { from: string; to: string } {
  const now = new Date()
  const day = now.getUTCDay()
  const monday = new Date(now)
  monday.setUTCDate(now.getUTCDate() - ((day + 6) % 7))
  monday.setUTCHours(0, 0, 0, 0)
  const sunday = new Date(monday)
  sunday.setUTCDate(monday.getUTCDate() + 6)
  sunday.setUTCHours(23, 59, 59, 999)
  return { from: monday.toISOString(), to: sunday.toISOString() }
}

export default function CrmCalendarPage() {
  return (
    <CrmShell active="calendar">
      {() => <CalendarPageContent />}
    </CrmShell>
  )
}

function CalendarPageContent() {
  const [data, setData] = useState<{
    activities: CalendarActivity[]
    members: { id: string; name: string }[]
    currentUserId: string
    isAdmin: boolean
  } | null>(null)

  const load = useCallback(async () => {
    const [{ data: auth }, state] = await Promise.all([
      supabaseClient ? supabaseClient.auth.getUser() : Promise.resolve({ data: { user: null } }),
      getCompanyContext(),
    ])
    const currentUserId = auth.user?.id ?? 'demo-user'
    const { from, to } = getWeekRange()
    const [activitiesRes, membersRes] = await Promise.all([
      getCalendarActivities({ from, to }),
      getCalendarMembers(),
    ])
    setData({
      activities: activitiesRes.data ?? [],
      members: membersRes.data ?? [],
      currentUserId,
      isAdmin: state.isSuperAdmin || state.role === 'owner',
    })
  }, [])

  useEffect(() => { void load() }, [load])

  if (!data) return null

  return (
    <div className="flex flex-col gap-6 p-6 md:p-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Calendário</h1>
        <p className="mt-0.5 text-sm text-muted-foreground/60">
          Suas atividades e tarefas agendadas
        </p>
      </div>

      <CalendarView
        initialActivities={data.activities}
        members={data.members}
        currentUserId={data.currentUserId}
        isAdmin={data.isAdmin}
      />
    </div>
  )
}
