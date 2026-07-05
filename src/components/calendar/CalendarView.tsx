'use client'

import { useState, useTransition, useMemo, useEffect, useCallback, useRef } from 'react'
import {
  ChevronLeft, ChevronRight, CalendarDays, CheckCircle2,
  Circle, Clock, User, Building2, Phone, Mail, MessageCircle,
  FileText, Share2, Flag, Zap, CheckSquare, Calendar, Plus,
  ExternalLink,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CalendarActivity } from '@/lib/actions/calendar'
import { getCalendarActivities } from '@/lib/actions/calendar'
import { toggleDealActivity } from '@/lib/actions/playbook'
import { getDeals, type DealRow } from '@/lib/actions/deals'
import { getPipelines, type PipelineWithStages } from '@/lib/actions/pipelines'
import { toast } from 'sonner'
import { QuickCreateActivityModal } from '@/components/calendar/QuickCreateActivityModal'
import { DealDetailSheet } from '@/components/pipeline/DealDetailSheet'

const ICON_MAP: Record<string, React.ElementType> = {
  call: Phone,
  email: Mail,
  whatsapp: MessageCircle,
  instagram: FileText,
  social: Share2,
  meeting: Calendar,
  task: CheckSquare,
  proposal: Flag,
  closure: Zap,
}

function ActivityTypeIcon({ type, className }: { type: string; className?: string }) {
  const Icon = ICON_MAP[type] ?? Zap
  return <Icon className={className} />
}

const TYPE_COLORS: Record<string, string> = {
  call: 'text-blue-400 bg-blue-500/10',
  email: 'text-indigo-400 bg-indigo-500/10',
  whatsapp: 'text-green-400 bg-green-500/10',
  instagram: 'text-pink-400 bg-pink-500/10',
  social: 'text-cyan-400 bg-cyan-500/10',
  meeting: 'text-violet-400 bg-violet-500/10',
  task: 'text-amber-400 bg-amber-500/10',
  proposal: 'text-orange-400 bg-orange-500/10',
  closure: 'text-rose-400 bg-rose-500/10',
}

function formatTime(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function formatDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

function isOverdue(activity: CalendarActivity, now: Date): boolean {
  if (activity.completed_at) return false
  const ref = activity.scheduled_start_at ?? activity.due_date
  if (!ref) return false
  return new Date(ref) < now
}

type View = 'today' | 'week' | 'month' | 'list'

interface CalendarViewProps {
  initialActivities: CalendarActivity[]
  members: { id: string; name: string }[]
  currentUserId: string
  isAdmin: boolean
}

export function CalendarView({ initialActivities, members, currentUserId, isAdmin }: CalendarViewProps) {
  const [view, setView] = useState<View>('week')
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
  const [activities, setActivities] = useState(initialActivities)
  const [isPending, startTransition] = useTransition()
  const [isFetching, setIsFetching] = useState(false)
  const [selectedAssignee, setSelectedAssignee] = useState<string | null>(currentUserId)
  const [now, setNow] = useState(() => new Date())

  // Quick create modal
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createInitialDate, setCreateInitialDate] = useState<string | undefined>()

  // Deal detail sheet
  const [sheetDeal, setSheetDeal] = useState<DealRow | null>(null)
  const [sheetPipeline, setSheetPipeline] = useState<PipelineWithStages | null>(null)
  const [allDeals, setAllDeals] = useState<DealRow[]>([])
  const [sheetLoading, setSheetLoading] = useState(false)

  // Popover
  const [popoverActivity, setPopoverActivity] = useState<CalendarActivity | null>(null)
  const popoverAnchorRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  function getWeekDays(from: string): string[] {
    const d = new Date(from + 'T12:00:00')
    const day = d.getDay()
    const monday = new Date(d)
    monday.setDate(d.getDate() - ((day + 6) % 7))
    return Array.from({ length: 7 }, (_, i) => {
      const dt = new Date(monday)
      dt.setDate(monday.getDate() + i)
      return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
    })
  }

  function getMonthDays(dateStr: string): (string | null)[] {
    const d = new Date(dateStr + 'T12:00:00')
    const year = d.getFullYear()
    const month = d.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const startPad = (firstDay.getDay() + 6) % 7
    const days: (string | null)[] = Array(startPad).fill(null)
    for (let i = 1; i <= lastDay.getDate(); i++) {
      days.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`)
    }
    while (days.length % 7 !== 0) days.push(null)
    return days
  }

  function getDateRange(anchorDate: string, currentView: View): { from: string; to: string } {
    const d = new Date(anchorDate + 'T12:00:00Z')
    if (currentView === 'today') {
      const from = new Date(d); from.setUTCHours(0, 0, 0, 0)
      const to = new Date(d); to.setUTCHours(23, 59, 59, 999)
      return { from: from.toISOString(), to: to.toISOString() }
    } else if (currentView === 'week') {
      const day = d.getUTCDay()
      const monday = new Date(d)
      monday.setUTCDate(d.getUTCDate() - ((day + 6) % 7))
      monday.setUTCHours(0, 0, 0, 0)
      const sunday = new Date(monday)
      sunday.setUTCDate(monday.getUTCDate() + 6)
      sunday.setUTCHours(23, 59, 59, 999)
      return { from: monday.toISOString(), to: sunday.toISOString() }
    } else {
      const year = d.getUTCFullYear(); const month = d.getUTCMonth()
      const from = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0))
      const to = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999))
      return { from: from.toISOString(), to: to.toISOString() }
    }
  }

  const fetchActivities = useCallback(async (anchorDate: string, currentView: View, assigneeId: string | null) => {
    setIsFetching(true)
    const range = getDateRange(anchorDate, currentView)
    const res = await getCalendarActivities({ ...range, assignedTo: assigneeId })
    if (res.data) setActivities(res.data)
    setIsFetching(false)
  }, [])

  function navigateDate(delta: number) {
    const d = new Date(selectedDate + 'T12:00:00')
    if (view === 'today') {
      d.setDate(d.getDate() + delta)
    } else if (view === 'week') {
      d.setDate(d.getDate() + delta * 7)
    } else {
      d.setMonth(d.getMonth() + delta)
    }
    const next = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    setSelectedDate(next)
    fetchActivities(next, view, selectedAssignee)
  }

  function changeView(newView: View) {
    setView(newView)
    fetchActivities(selectedDate, newView, selectedAssignee)
  }

  function changeAssignee(assigneeId: string | null) {
    setSelectedAssignee(assigneeId)
    fetchActivities(selectedDate, view, assigneeId)
  }

  function getActivitiesForDate(dateStr: string) {
    return activities.filter((a) => {
      const ref = a.scheduled_start_at ?? a.due_date
      if (!ref) return false
      return ref.slice(0, 10) === dateStr
    })
  }

  function handleToggle(activityId: string, complete: boolean) {
    setActivities((prev) =>
      prev.map((a) =>
        a.id === activityId
          ? { ...a, completed_at: complete ? new Date().toISOString() : null }
          : a
      )
    )
    startTransition(async () => {
      const res = await toggleDealActivity(activityId, complete)
      if (res.error) {
        toast.error(res.error)
        setActivities((prev) =>
          prev.map((a) =>
            a.id === activityId
              ? { ...a, completed_at: complete ? null : new Date().toISOString() }
              : a
          )
        )
      }
    })
  }

  async function handleOpenDeal(dealId: string) {
    if (sheetLoading) return
    setSheetLoading(true)
    try {
      const [dealsRes, pipelinesRes] = await Promise.all([getDeals(), getPipelines()])
      const deal = dealsRes.find((d) => d.id === dealId)
      if (!deal) { toast.error('Negócio não encontrado'); return }
      const pipeline = pipelinesRes.find((p) => p.id === deal.pipeline_id)
      if (!pipeline) { toast.error('Pipeline não encontrado'); return }
      setAllDeals(dealsRes)
      setSheetPipeline(pipeline)
      setSheetDeal(deal)
    } catch {
      toast.error('Erro ao carregar negócio')
    } finally {
      setSheetLoading(false)
    }
  }

  function handleActivityClick(activity: CalendarActivity, anchor: HTMLElement) {
    if (popoverActivity?.id === activity.id) {
      setPopoverActivity(null)
      return
    }
    popoverAnchorRef.current = anchor
    setPopoverActivity(activity)
  }

  function openCreateForDate(dateStr: string) {
    const iso = new Date(dateStr + 'T09:00:00').toISOString()
    setCreateInitialDate(iso)
    setShowCreateModal(true)
  }

  const weekDays = getWeekDays(selectedDate)
  const monthDays = getMonthDays(selectedDate)

  const selectedMonthLabel = new Date(selectedDate + 'T12:00:00').toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
  })

  const stats = useMemo(() => {
    const total = activities.length
    const done = activities.filter((a) => a.completed_at).length
    const overdue = activities.filter((a) => isOverdue(a, now)).length
    const todayCount = activities.filter((a) => {
      const ref = a.scheduled_start_at ?? a.due_date
      return ref && ref.slice(0, 10) === todayStr && !a.completed_at
    }).length
    return { total, done, overdue, today: todayCount }
  }, [activities, todayStr, now])

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigateDate(-1)}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/30 text-muted-foreground/60 hover:bg-white/5 hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[160px] text-center text-sm font-semibold text-foreground capitalize">
            {view === 'today'
              ? new Date(selectedDate + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
              : view === 'week'
              ? `${formatDate(weekDays[0])} – ${formatDate(weekDays[6])}`
              : selectedMonthLabel}
          </span>
          <button
            onClick={() => navigateDate(1)}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/30 text-muted-foreground/60 hover:bg-white/5 hover:text-foreground"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            onClick={() => {
              setSelectedDate(todayStr)
              changeView('today')
            }}
            className="ml-1 rounded-lg border border-border/30 px-3 py-1.5 text-xs font-medium text-muted-foreground/60 hover:bg-white/5 hover:text-foreground"
          >
            Hoje
          </button>
        </div>

        <div className="flex items-center gap-2">
          {/* Nova atividade */}
          <button
            onClick={() => { setCreateInitialDate(undefined); setShowCreateModal(true) }}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-white transition-all hover:bg-primary/90"
          >
            <Plus className="h-3.5 w-3.5" /> Nova atividade
          </button>

          {isAdmin && members.length > 0 && (
            <select
              value={selectedAssignee ?? ''}
              onChange={(e) => changeAssignee(e.target.value || null)}
              className="h-8 rounded-lg border border-border/30 bg-card/40 px-2 text-xs text-foreground focus:outline-none"
            >
              <option value="">Todos os membros</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          )}
          <div className="flex items-center gap-1 rounded-xl border border-border/30 p-1">
            {([
              { value: 'today', label: 'Dia' },
              { value: 'week', label: 'Semana' },
              { value: 'month', label: 'Mês' },
              { value: 'list', label: 'Lista' },
            ] as const).map((v) => (
              <button
                key={v.value}
                onClick={() => changeView(v.value)}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-xs font-medium transition-all',
                  view === v.value
                    ? 'bg-white/10 text-foreground'
                    : 'text-muted-foreground/60 hover:text-foreground'
                )}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Stats strip */}
      <div className={cn('grid grid-cols-4 gap-2 transition-opacity', (isFetching || isPending) && 'opacity-50')}>
        {[
          { label: 'Total', value: stats.total, color: 'text-foreground' },
          { label: 'Hoje', value: stats.today, color: 'text-blue-400' },
          { label: 'Concluídas', value: stats.done, color: 'text-green-400' },
          { label: 'Atrasadas', value: stats.overdue, color: 'text-red-400' },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-border/30 bg-card/40 px-4 py-2.5 text-center"
          >
            <div className={cn('text-xl font-bold', s.color)}>{s.value}</div>
            <div className="text-[10px] text-muted-foreground/60">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Calendar body */}
      {view === 'month' && (
        <div className="rounded-xl border border-border/30 bg-card/30 p-3">
          <div className="mb-2 grid grid-cols-7 gap-1">
            {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((d) => (
              <div key={d} className="py-1 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {monthDays.map((dayStr, idx) => {
              if (!dayStr) return <div key={idx} />
              const dayActs = getActivitiesForDate(dayStr)
              const isSelected = dayStr === selectedDate
              const isTodayDay = dayStr === todayStr
              return (
                <div
                  key={dayStr}
                  className={cn(
                    'group relative flex min-h-[56px] flex-col rounded-lg border p-1.5 transition-all',
                    isSelected
                      ? 'border-primary/40 bg-primary/10'
                      : isTodayDay
                      ? 'border-primary/20 bg-primary/5'
                      : 'border-transparent hover:border-border/30 hover:bg-white/3'
                  )}
                >
                  <div className="mb-1 flex items-center justify-between">
                    <button
                      onClick={() => { setSelectedDate(dayStr); setView('today') }}
                      className={cn(
                        'flex h-5 w-5 items-center justify-center rounded-full text-xs font-medium',
                        isTodayDay ? 'bg-primary text-black font-bold' : 'text-muted-foreground/60'
                      )}
                    >
                      {parseInt(dayStr.slice(8), 10)}
                    </button>
                    <button
                      onClick={() => openCreateForDate(dayStr)}
                      className="hidden h-4 w-4 items-center justify-center rounded text-muted-foreground/30 hover:text-primary group-hover:flex"
                      title="Nova atividade"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-0.5">
                    {dayActs.slice(0, 3).map((a) => (
                      <span
                        key={a.id}
                        className={cn(
                          'h-1.5 w-1.5 cursor-pointer rounded-full',
                          a.completed_at ? 'bg-green-500/50' : isOverdue(a, now) ? 'bg-red-500' : 'bg-primary/70'
                        )}
                        title={a.title}
                        onClick={(e) => { e.stopPropagation(); handleActivityClick(a, e.currentTarget as HTMLElement) }}
                      />
                    ))}
                    {dayActs.length > 3 && (
                      <span className="text-[8px] text-muted-foreground/60">+{dayActs.length - 3}</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {view === 'week' && (
        <div className="grid grid-cols-7 gap-1.5">
          {weekDays.map((dayStr) => {
            const dayActs = getActivitiesForDate(dayStr)
            const isTodayDay = dayStr === todayStr
            const isSelected = dayStr === selectedDate
            const dayNum = parseInt(dayStr.slice(8), 10)
            const weekDay = new Date(dayStr + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short' })
            return (
              <div
                key={dayStr}
                className={cn(
                  'group/day min-h-[140px] rounded-xl border p-2',
                  isSelected ? 'border-primary/40 bg-primary/5' : isTodayDay ? 'border-primary/20 bg-primary/5' : 'border-border/20 bg-card/20'
                )}
              >
                <div className="mb-2 flex w-full items-center justify-between">
                  <button
                    onClick={() => { setSelectedDate(dayStr); setView('today') }}
                    className="flex items-center gap-1"
                  >
                    <span className="text-[10px] font-semibold uppercase text-muted-foreground/60 capitalize">{weekDay}</span>
                    <span className={cn(
                      'flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold',
                      isTodayDay ? 'bg-primary text-black' : 'text-foreground'
                    )}>
                      {dayNum}
                    </span>
                  </button>
                  <button
                    onClick={() => openCreateForDate(dayStr)}
                    className="hidden h-5 w-5 items-center justify-center rounded text-muted-foreground/30 hover:text-primary group-hover/day:flex"
                    title="Nova atividade"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="flex flex-col gap-1">
                  {dayActs.map((a) => (
                    <ActivityChip
                      key={a.id}
                      activity={a}
                      onToggle={handleToggle}
                      onClick={handleActivityClick}
                      compact
                      now={now}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {(view === 'today' || view === 'list') && (
        <ActivityList
          activities={view === 'today' ? getActivitiesForDate(selectedDate) : activities}
          onToggle={handleToggle}
          onClick={handleActivityClick}
          emptyLabel={view === 'today' ? 'Nenhuma atividade neste dia' : 'Nenhuma atividade no período'}
          onCreateForDate={view === 'today' ? () => openCreateForDate(selectedDate) : undefined}
          now={now}
        />
      )}

      {/* Popover */}
      {popoverActivity && (
        <div className="fixed inset-0 z-40" onClick={() => setPopoverActivity(null)}>
          <div
            className="absolute"
            style={{
              top: popoverAnchorRef.current
                ? popoverAnchorRef.current.getBoundingClientRect().top + window.scrollY
                : 0,
              left: popoverAnchorRef.current
                ? popoverAnchorRef.current.getBoundingClientRect().right + window.scrollX + 8
                : 0,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-64 rounded-xl border border-border/50 bg-background shadow-2xl">
              <div className="p-4 space-y-3">
                <div className="flex items-start gap-2">
                  <span className={cn('mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md', TYPE_COLORS[popoverActivity.activity_type] ?? 'text-primary bg-primary/10')}>
                    <ActivityTypeIcon type={popoverActivity.activity_type} className="h-3.5 w-3.5" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-foreground leading-snug">{popoverActivity.title}</p>
                    {popoverActivity.scheduled_start_at && (
                      <p className={cn('text-[11px] font-medium mt-0.5', isOverdue(popoverActivity, now) ? 'text-red-400' : 'text-muted-foreground/60')}>
                        <Clock className="mr-1 inline h-2.5 w-2.5" />
                        {new Date(popoverActivity.scheduled_start_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        {isOverdue(popoverActivity, now) && ' · Atrasada'}
                      </p>
                    )}
                  </div>
                </div>
                {(popoverActivity.deal_title || popoverActivity.lead_name) && (
                  <div className="space-y-1 text-[11px] text-muted-foreground/60">
                    {popoverActivity.deal_title && (
                      <p className="flex items-center gap-1.5"><Building2 className="h-3 w-3" />{popoverActivity.deal_title}</p>
                    )}
                    {popoverActivity.lead_name && (
                      <p className="flex items-center gap-1.5"><User className="h-3 w-3" />{popoverActivity.lead_name}</p>
                    )}
                  </div>
                )}
                {popoverActivity.notes && (
                  <p className="text-[11px] leading-relaxed text-muted-foreground/60 line-clamp-3 italic">{popoverActivity.notes}</p>
                )}
                {popoverActivity.deal_id && (
                  <button
                    onClick={() => { handleOpenDeal(popoverActivity.deal_id!); setPopoverActivity(null) }}
                    disabled={sheetLoading}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary/10 px-3 py-2 text-[11px] font-bold text-primary transition-all hover:bg-primary/20 disabled:opacity-50"
                  >
                    <ExternalLink className="h-3 w-3" />
                    {sheetLoading ? 'Carregando...' : 'Abrir negócio'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quick create modal */}
      {showCreateModal && (
        <QuickCreateActivityModal
          initialDate={createInitialDate}
          members={members}
          currentUserId={currentUserId}
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            setShowCreateModal(false)
            fetchActivities(selectedDate, view, selectedAssignee)
          }}
        />
      )}

      {/* Deal detail sheet */}
      {sheetDeal && sheetPipeline && (
        <DealDetailSheet
          deal={sheetDeal}
          pipeline={sheetPipeline}
          allDeals={allDeals}
          members={members}
          onClose={() => { setSheetDeal(null); fetchActivities(selectedDate, view, selectedAssignee) }}
          onUpdate={(updated) => setSheetDeal(updated)}
          onDelete={() => { setSheetDeal(null); fetchActivities(selectedDate, view, selectedAssignee) }}
        />
      )}
    </div>
  )
}

function ActivityChip({
  activity,
  onToggle,
  onClick,
  compact = false,
  now,
}: {
  activity: CalendarActivity
  onToggle: (id: string, complete: boolean) => void
  onClick: (activity: CalendarActivity, anchor: HTMLElement) => void
  compact?: boolean
  now: Date
}) {
  const done = !!activity.completed_at
  const overdue = isOverdue(activity, now)
  const color = done
    ? 'bg-green-500/10 border-green-500/20 text-green-400'
    : overdue
    ? 'bg-red-500/10 border-red-500/20 text-red-400'
    : TYPE_COLORS[activity.activity_type] ?? 'text-primary bg-primary/10'

  if (compact) {
    return (
      <div className="flex w-full items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium transition-all cursor-pointer group/chip"
        style={{ borderColor: 'transparent' }}
        onClick={(e) => { e.stopPropagation(); onClick(activity, e.currentTarget as HTMLElement) }}
      >
        <button
          onClick={(e) => { e.stopPropagation(); onToggle(activity.id, !done) }}
          className={cn('shrink-0 transition-colors', done ? 'text-green-400' : 'text-muted-foreground/30 hover:text-green-400')}
        >
          {done ? <CheckCircle2 className="h-2.5 w-2.5" /> : <Circle className="h-2.5 w-2.5" />}
        </button>
        <span
          className={cn(
            'truncate flex-1 rounded border px-1 py-0.5',
            color,
            'group-hover/chip:opacity-80'
          )}
        >
          {activity.title}
        </span>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'group flex items-start gap-3 rounded-xl border p-3 transition-all cursor-pointer',
        done ? 'border-border/20 bg-card/20 opacity-60' : overdue ? 'border-red-500/20 bg-red-500/5' : 'border-border/30 bg-card/30 hover:bg-card/50'
      )}
      onClick={(e) => { e.stopPropagation(); onClick(activity, e.currentTarget as HTMLElement) }}
    >
      <button
        onClick={(e) => { e.stopPropagation(); onToggle(activity.id, !done) }}
        className={cn('mt-0.5 shrink-0 transition-colors', done ? 'text-green-400' : 'text-muted-foreground/30 hover:text-green-400')}
      >
        {done ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className={cn(
              'flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[10px]',
              TYPE_COLORS[activity.activity_type] ?? 'text-primary bg-primary/10'
            )}>
              <ActivityTypeIcon type={activity.activity_type} className="h-3 w-3" />
            </span>
            <span className={cn('text-sm font-medium', done && 'line-through text-muted-foreground/60')}>
              {activity.title}
            </span>
          </div>
          {activity.scheduled_start_at && (
            <span className={cn(
              'shrink-0 flex items-center gap-1 text-[10px] font-medium',
              overdue ? 'text-red-400' : 'text-muted-foreground/60'
            )}>
              <Clock className="h-2.5 w-2.5" />
              {formatTime(activity.scheduled_start_at)}
            </span>
          )}
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
          {activity.deal_title && (
            <span className="flex items-center gap-1 text-[10.5px] text-muted-foreground/60">
              <Building2 className="h-3 w-3" />
              {activity.deal_title}
            </span>
          )}
          {activity.lead_name && (
            <span className="flex items-center gap-1 text-[10.5px] text-muted-foreground/60">
              <User className="h-3 w-3" />
              {activity.lead_name}
            </span>
          )}
          {activity.assignee_name && (
            <span className="flex items-center gap-1 text-[10.5px] text-muted-foreground/60">
              <User className="h-3 w-3" />
              {activity.assignee_name}
            </span>
          )}
        </div>

        {activity.notes && (
          <p className="mt-1 text-[10.5px] leading-relaxed text-muted-foreground/60 line-clamp-2">
            {activity.notes}
          </p>
        )}
      </div>
    </div>
  )
}

function ActivityList({
  activities,
  onToggle,
  onClick,
  emptyLabel,
  onCreateForDate,
  now,
}: {
  activities: CalendarActivity[]
  onToggle: (id: string, complete: boolean) => void
  onClick: (activity: CalendarActivity, anchor: HTMLElement) => void
  emptyLabel: string
  onCreateForDate?: () => void
  now: Date
}) {
  if (activities.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-border/20 bg-card/20 py-16 text-center">
        <CalendarDays className="mb-3 h-10 w-10 text-muted-foreground/20" />
        <p className="text-sm text-muted-foreground/60">{emptyLabel}</p>
        {onCreateForDate && (
          <button
            onClick={onCreateForDate}
            className="mt-4 flex items-center gap-1.5 rounded-lg bg-primary/10 px-4 py-2 text-xs font-bold text-primary hover:bg-primary/20 transition-all"
          >
            <Plus className="h-3.5 w-3.5" /> Criar atividade para este dia
          </button>
        )}
      </div>
    )
  }

  const pending = activities.filter((a) => !a.completed_at)
  const done = activities.filter((a) => a.completed_at)

  return (
    <div className="flex flex-col gap-4">
      {pending.length > 0 && (
        <div className="flex flex-col gap-2">
          {pending.map((a) => (
            <ActivityChip key={a.id} activity={a} onToggle={onToggle} onClick={onClick} now={now} />
          ))}
        </div>
      )}
      {done.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 px-1">
            <div className="h-px flex-1 bg-border/20" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/30">
              Concluídas ({done.length})
            </span>
            <div className="h-px flex-1 bg-border/20" />
          </div>
          {done.map((a) => (
            <ActivityChip key={a.id} activity={a} onToggle={onToggle} onClick={onClick} now={now} />
          ))}
        </div>
      )}
    </div>
  )
}
