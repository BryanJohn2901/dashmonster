'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { Phone, Mail, MessageCircle, CheckSquare, Flame, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { startLeadConversation } from '@/lib/actions/inbox'
import { cn } from '@/lib/utils/cn'
import { STAGE_COLORS } from '@/lib/utils/constants'
import { formatCurrency } from '@/lib/utils/formatters'
import type { DealRow } from '@/lib/actions/deals'

interface DealCardProps {
  deal: DealRow
  index?: number
  isOverlay?: boolean
  stageColor?: string
  onClick?: () => void
}

function getInitials(name: string) {
  return name.split(' ').slice(0, 2).map((p) => p[0]).join('').toUpperCase()
}

// Map tag color name → tailwind bg/text classes
const TAG_COLOR_MAP: Record<string, string> = {
  slate:  'bg-slate-500/15 text-slate-300',
  red:    'bg-red-500/15 text-red-300',
  orange: 'bg-orange-500/15 text-orange-300',
  amber:  'bg-amber-500/15 text-amber-300',
  yellow: 'bg-yellow-500/15 text-yellow-300',
  green:  'bg-green-500/15 text-green-300',
  teal:   'bg-teal-500/15 text-teal-300',
  blue:   'bg-blue-500/15 text-blue-300',
  indigo: 'bg-indigo-500/15 text-indigo-300',
  violet: 'bg-violet-500/15 text-violet-300',
  pink:   'bg-pink-500/15 text-pink-300',
}

const TEMPERATURE_CONFIG: Record<string, { label: string; className: string }> = {
  hot:  { label: 'Quente', className: 'text-orange-400' },
  warm: { label: 'Morno',  className: 'text-amber-400' },
  cold: { label: 'Frio',   className: 'text-sky-400' },
}

export function DealCard({ deal, index = 0, isOverlay = false, stageColor = 'slate', onClick }: DealCardProps) {
  const router = useRouter()
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: deal.id })
  const [openingChat, setOpeningChat] = useState(false)

  const handleOpenChat = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (openingChat || !deal.lead_id) return
    setOpeningChat(true)
    try {
      const res = await startLeadConversation(deal.lead_id, deal.id)
      if (res.error) {
        toast.error(res.error)
        return
      }
      router.push(`/crm/inbox?leadId=${deal.lead_id}`)
    } finally {
      setOpeningChat(false)
    }
  }

  const cfg = STAGE_COLORS[stageColor] || STAGE_COLORS['slate']
  const rgb = cfg.colorClasses.shadow
  const ownerName = deal.owner_profile?.full_name ?? 'U'
  const displayName = deal.lead?.name ?? deal.title
  const company = deal.lead?.company

  const hasActivities = deal.activities_total > 0
  const allDone = hasActivities && deal.activities_done === deal.activities_total
  const temperature = deal.temperature ? TEMPERATURE_CONFIG[deal.temperature] : null


  const cardStyle: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    animationDelay: isOverlay ? '0ms' : `${index * 55}ms`,
  }

  return (
    <div
      ref={setNodeRef}
      style={cardStyle}
      onClick={onClick}
      className={cn(
        'deal-card-in group relative select-none rounded-xl',
        'ring-1 ring-white/8 bg-card',
        'transition-all duration-200 ease-out',
        !isDragging && 'cursor-grab hover:-translate-y-[2px] hover:ring-white/15',
        isDragging && !isOverlay && 'opacity-20 scale-[0.98]',
        isOverlay && 'cursor-grabbing rotate-[1.5deg] scale-[1.02] ring-2',
        isOverlay && cfg.colorClasses.border.replace('border-', 'ring-'),
      )}
      {...listeners}
      {...attributes}
    >
      {/* Left accent bar */}
      <div
        aria-hidden
        className="absolute inset-y-0 left-0 w-[3px] rounded-l-xl"
        style={{ background: `linear-gradient(to bottom, rgba(${rgb},1), rgba(${rgb},0.2))` }}
      />

      <div className="pl-4" style={{ paddingTop: 'var(--card-py)', paddingBottom: 'var(--card-py)', paddingRight: 'var(--card-px)' }}>
        {/* Tags row */}
        {deal.tags.length > 0 && (
          <div className="mb-1.5 flex flex-wrap gap-1">
            {deal.tags.slice(0, 3).map((tag) => (
              <span
                key={tag.id}
                className={cn(
                  'inline-block rounded-full px-1.5 py-px font-semibold',
                  TAG_COLOR_MAP[tag.color] ?? TAG_COLOR_MAP['slate']
                )}
                style={{ fontSize: 'var(--card-tag)' }}
              >
                {tag.name}
              </span>
            ))}
            {deal.tags.length > 3 && (
              <span
                className="inline-block rounded-full bg-white/8 px-1.5 py-px text-[10px] font-semibold text-muted-foreground/60"
                title={deal.tags.slice(3).map((tag) => tag.name).join(', ')}
              >
                +{deal.tags.length - 3}
              </span>
            )}
          </div>
        )}

        {/* Deal name */}
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 truncate font-semibold leading-snug text-foreground" style={{ fontSize: 'var(--card-name)' }}>
            {displayName}
          </p>
        </div>
        {company && (
          <p className="mt-0.5 truncate text-muted-foreground/55" style={{ fontSize: 'var(--card-sub)' }}>
            {company}
          </p>
        )}

        {/* Value + temperature */}
        <div className="mt-2 flex items-center justify-between gap-2">
          <p
            className="flex-shrink-0 text-[15px] font-bold tracking-tight"
            style={{ color: `rgba(${rgb},0.9)` }}
          >
            {formatCurrency(deal.value ?? 0)}
          </p>
          <div className="flex min-w-0 flex-shrink items-center justify-end gap-1.5">
            {temperature && (
              <span className="flex flex-shrink-0 items-center" title={`Temperatura: ${temperature.label}`}>
                <Flame className={cn('h-3.5 w-3.5', temperature.className)} />
              </span>
            )}
          </div>
        </div>

        {/* Bottom row: quick actions + meta */}
        <div className="mt-2 flex items-center justify-between">
          {/* Quick action icons — só aparecem quando a ação é possível */}
          <div className="flex items-center gap-1">
            {deal.lead?.phone && (
              <a
                href={`tel:${deal.lead.phone.replace(/[^\d+]/g, '')}`}
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-white/5 text-muted-foreground/60 transition-colors hover:bg-white/10 hover:text-foreground"
                title={`Ligar para ${deal.lead.phone}`}
              >
                <Phone className="h-3 w-3" />
              </a>
            )}
            {deal.lead_id && (
              <button
                onClick={handleOpenChat}
                onPointerDown={(e) => e.stopPropagation()}
                disabled={openingChat}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-white/5 text-muted-foreground/60 transition-colors hover:bg-green-500/20 hover:text-green-400 disabled:opacity-60"
                title="Abrir conversa no Inbox"
              >
                {openingChat ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <MessageCircle className="h-3 w-3" />
                )}
              </button>
            )}
            {deal.lead?.email && (
              <a
                href={`mailto:${deal.lead.email}`}
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-white/5 text-muted-foreground/60 transition-colors hover:bg-blue-500/20 hover:text-blue-400"
                title={`E-mail para ${deal.lead.email}`}
              >
                <Mail className="h-3 w-3" />
              </a>
            )}
          </div>

          {/* Right meta: activity counter + avatar */}
          <div className="flex items-center gap-1.5">
            {hasActivities && (
              <span
                className={cn(
                  'flex items-center gap-0.5 rounded-full px-1.5 py-px text-[10px] font-bold',
                  allDone
                    ? 'bg-green-500/15 text-green-400'
                    : deal.has_overdue_activity
                    ? 'bg-red-500/15 text-red-400'
                    : 'bg-white/8 text-muted-foreground/60'
                )}
                title={`${deal.activities_done} de ${deal.activities_total} atividades concluídas`}
              >
                <CheckSquare className="h-2.5 w-2.5" />
                {deal.activities_done}/{deal.activities_total}
              </span>
            )}

            {/* Owner avatar */}
            <div
              className="flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground ring-1 ring-white/10"
              title={ownerName}
            >
              {getInitials(ownerName)}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
