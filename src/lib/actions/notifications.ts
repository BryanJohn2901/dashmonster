// ─── Adapter: lib/actions/notifications do PipeFlow original ───────────────────
// ponytail: preferências em localStorage por empresa — não há tabela
// notification_preferences nas migrations 072/073 e o disparo de e-mail nem
// existe (banner "em breve" na tela). Migrar pro banco quando o e-mail nascer.

import { getCompanyContext } from '@/hooks/useCompany'
import { EVENT_TYPES, type EventTypeKey } from '@/lib/constants/notifications'

const KEY = 'pf_notification_prefs_v1'

function buildDefaults(): Record<EventTypeKey, boolean> {
  return Object.fromEntries(EVENT_TYPES.map((e) => [e.key, true])) as Record<EventTypeKey, boolean>
}

function readAll(): Record<string, Record<EventTypeKey, boolean>> {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') } catch { return {} }
}

export async function getNotificationPreferences(): Promise<Record<EventTypeKey, boolean>> {
  const state = await getCompanyContext()
  const companyId = state.company?.id ?? 'default'
  return { ...buildDefaults(), ...(readAll()[companyId] ?? {}) }
}

export async function updateNotificationPreference({ eventType, emailEnabled }: {
  eventType: EventTypeKey
  emailEnabled: boolean
}): Promise<{ error: string | null }> {
  try {
    const state = await getCompanyContext()
    const companyId = state.company?.id ?? 'default'
    const all = readAll()
    all[companyId] = { ...buildDefaults(), ...(all[companyId] ?? {}), [eventType]: emailEnabled }
    localStorage.setItem(KEY, JSON.stringify(all))
    return { error: null }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao salvar preferência' }
  }
}
