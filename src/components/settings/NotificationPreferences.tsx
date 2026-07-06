'use client'

import { useCallback, useOptimistic, useState, useTransition } from 'react'
import { Bell, Mail } from 'lucide-react'
import { EVENT_TYPES } from '@/lib/constants/notifications'
import type { EventTypeKey } from '@/lib/constants/notifications'
import { updateNotificationPreference } from '@/lib/actions/notifications'

interface Props {
  preferences: Record<EventTypeKey, boolean>
}

// Derived from EVENT_TYPES to stay in sync automatically
const GROUPS = Array.from(new Set(EVENT_TYPES.map((e) => e.group)))

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean
  onChange: (val: boolean) => void
  disabled: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-all duration-200 disabled:opacity-40"
      style={{
        background: checked ? '#c6f432' : 'rgba(216,222,227,0.12)',
        border: checked ? '1px solid rgba(198,244,50,0.4)' : '1px solid rgba(216,222,227,0.12)',
      }}
    >
      <span
        className="inline-block h-3.5 w-3.5 transform rounded-full transition-transform duration-200"
        style={{
          background: checked ? '#0B0D11' : '#7B8793',
          transform: checked ? 'translateX(18px)' : 'translateX(2px)',
        }}
      />
    </button>
  )
}

export function NotificationPreferences({ preferences }: Props) {
  const [optimistic, setOptimistic] = useOptimistic(preferences)
  const [pending, setPending] = useState<EventTypeKey | null>(null)
  const [, startTransition] = useTransition()

  const handleToggle = useCallback(
    (eventType: EventTypeKey, emailEnabled: boolean) => {
      setPending(eventType)
      startTransition(async () => {
        setOptimistic((prev) => ({ ...prev, [eventType]: emailEnabled }))
        const result = await updateNotificationPreference({ eventType, emailEnabled })
        if (result.error) {
          // Revert optimistic update on failure
          setOptimistic((prev) => ({ ...prev, [eventType]: !emailEnabled }))
        }
        setPending(null)
      })
    },
    [setOptimistic]
  )

  return (
    <div className="flex flex-col gap-8">
      {/* Header card */}
      <div
        className="flex items-start gap-4 rounded-2xl p-5"
        style={{
          background: 'linear-gradient(180deg,#151A20 0%,#11151A 100%)',
          border: '1px solid rgba(216,222,227,0.06)',
        }}
      >
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
          style={{ background: 'rgba(198,244,50,0.08)', border: '1px solid rgba(198,244,50,0.16)' }}
        >
          <Bell className="h-5 w-5 text-canary" />
        </div>
        <div>
          <p className="text-sm font-medium text-geyser">E-mail de notificações</p>
          <p className="mt-0.5 text-sm text-slate">
            Controle quais eventos disparam um e-mail para você. As alterações são salvas automaticamente.
          </p>
        </div>
      </div>

      {/* Groups */}
      {GROUPS.map((group) => {
        const events = EVENT_TYPES.filter((e) => e.group === group)
        return (
          <div key={group} className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate/60">
                {group}
              </p>
              <div
                className="h-px flex-1"
                style={{ background: 'rgba(216,222,227,0.06)' }}
              />
            </div>

            <div
              className="overflow-hidden rounded-2xl"
              style={{ border: '1px solid rgba(216,222,227,0.06)' }}
            >
              {events.map((event, idx) => (
                <div
                  key={event.key}
                  className="flex items-center justify-between gap-4 px-5 py-4 transition-colors"
                  style={{
                    background: '#151A20',
                    borderTop: idx > 0 ? '1px solid rgba(216,222,227,0.04)' : undefined,
                  }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                      style={{ background: 'rgba(216,222,227,0.05)' }}
                    >
                      <Mail className="h-3.5 w-3.5 text-slate" />
                    </div>
                    <span className="truncate text-sm text-geyser">{event.label}</span>
                  </div>

                  <div className="flex shrink-0 items-center gap-2.5">
                    <span className="text-xs text-slate/60">E-mail</span>
                    <Toggle
                      checked={optimistic[event.key]}
                      onChange={(val) => handleToggle(event.key, val)}
                      disabled={pending === event.key}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
