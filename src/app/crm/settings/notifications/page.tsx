'use client'

// Port fiel de app/(app)/settings/notifications/page.tsx (era RSC; aqui client).

import { useEffect, useState } from 'react'
import { CrmShell } from '@/components/crm/CrmShell'
import { getNotificationPreferences } from '@/lib/actions/notifications'
import { NotificationPreferences } from '@/components/settings/NotificationPreferences'
import type { EventTypeKey } from '@/lib/constants/notifications'

export default function NotificationsSettingsPage() {
  return <CrmShell>{() => <Content />}</CrmShell>
}

function Content() {
  const [preferences, setPreferences] = useState<Record<EventTypeKey, boolean> | null>(null)

  useEffect(() => { void getNotificationPreferences().then(setPreferences) }, [])

  if (!preferences) return null

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[20px] font-semibold tracking-[-0.02em] text-[#F7F9FA]">
          Notificações
        </h1>
        <p className="mt-1 text-sm text-slate">
          Gerencie como e quando você recebe alertas por e-mail.
        </p>
      </div>

      {/* Banner: email dispatch not yet implemented */}
      <div
        className="flex items-start gap-3 rounded-xl px-4 py-3 text-sm"
        style={{
          background: 'rgba(251,191,36,0.08)',
          border: '1px solid rgba(251,191,36,0.20)',
        }}
      >
        <span className="mt-0.5 shrink-0 text-amber-400">⚠</span>
        <p className="text-amber-200/80">
          <span className="font-semibold text-amber-300">Em breve:</span> o envio de e-mails de notificação está em desenvolvimento. Suas preferências já estão sendo salvas e serão aplicadas quando o recurso for ativado.
        </p>
      </div>

      <NotificationPreferences preferences={preferences} />
    </div>
  )
}
