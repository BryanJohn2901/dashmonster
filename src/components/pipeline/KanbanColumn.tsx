'use client'

import { useDroppable } from '@dnd-kit/core'
import { Plus, CircleDot, Trophy, XCircle, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { formatCurrency } from '@/lib/utils/formatters'
import { STAGE_COLORS } from '@/lib/utils/constants'
import type { DealRow } from '@/lib/actions/deals'
import type { PipelineStage } from '@/types/supabase'
import { DealCard } from './DealCard'

interface KanbanColumnProps {
  stage: PipelineStage
  deals: DealRow[]
  columnIndex: number
  onAddDeal: (stageId: string) => void
  onEditDeal: (deal: DealRow) => void
  wasDragging: React.MutableRefObject<boolean>
}

// Ícone com significado real: troféu só em etapa de ganho, X só em perda.
// (Antes era sorteado pelo índice da coluna — a 6ª etapa sempre ganhava um X
// de "perdido" mesmo sendo outra coisa.)
function stageIcon(statusKind: PipelineStage['status_kind']): LucideIcon {
  if (statusKind === 'won') return Trophy
  if (statusKind === 'lost') return XCircle
  return CircleDot
}

export function KanbanColumn({
  stage,
  deals,
  columnIndex,
  onAddDeal,
  onEditDeal,
  wasDragging,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id })
  const cfg = STAGE_COLORS[stage.color] || STAGE_COLORS['slate']
  const rgb = cfg.colorClasses.shadow
  const total = deals.reduce((sum, d) => sum + (d.value ?? 0), 0)
  
  const Icon = stageIcon(stage.status_kind)

  return (
    <div
      className="kanban-col-enter flex flex-shrink-0 flex-col gap-2"
      style={{ width: 'var(--col-w)', animationDelay: `${columnIndex * 80}ms` }}
    >
      {/* Column header */}
      <div
        className="overflow-hidden rounded-xl"
        style={{
          background: `linear-gradient(145deg, rgba(${rgb},0.10) 0%, rgba(${rgb},0.04) 100%)`,
          boxShadow: `inset 0 0 0 1px rgba(${rgb},0.20)`,
        }}
      >
        <div
          className="h-[3px] w-full"
          style={{ background: `linear-gradient(to right, rgba(${rgb},1), rgba(${rgb},0.35))` }}
        />

        <div className="px-3 py-2.5">
          <div className="flex items-center gap-2">
            <Icon
              className="h-3.5 w-3.5 flex-shrink-0"
              style={{ color: `rgba(${rgb},0.85)` }}
            />
            <span className="min-w-0 truncate text-[12.5px] font-semibold text-foreground">
              {stage.name}
            </span>
            <span
              className="ml-auto flex-shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold"
              style={{
                background: `rgba(${rgb},0.15)`,
                color: `rgba(${rgb},0.9)`,
              }}
            >
              {deals.length}
            </span>
          </div>

          <p
            className="mt-1 text-[12px] font-bold tracking-tight"
            style={{ color: deals.length > 0 ? `rgba(${rgb},0.75)` : 'transparent' }}
          >
            {deals.length > 0 ? formatCurrency(total) : '—'}
          </p>
        </div>
      </div>

      {/* Droppable card area */}
      <div
        ref={setNodeRef}
        className={cn(
          'flex flex-1 flex-col gap-2 overflow-y-auto rounded-xl p-2',
          'min-h-[400px] max-h-[calc(100vh-270px)]',
          'transition-all duration-150',
          // Scrollbar visível de propósito: com scrollbar-none o usuário não
          // tinha nenhuma pista de que havia mais cards abaixo.
        )}
        style={{
          background: isOver ? `rgba(${rgb},0.05)` : 'rgba(255,255,255,0.01)',
          boxShadow: isOver
            ? `inset 0 0 0 2px rgba(${rgb},0.35)`
            : 'inset 0 0 0 1px rgba(255,255,255,0.04)',
        }}
      >
        {deals.map((deal, i) => (
          <DealCard
            key={deal.id}
            deal={deal}
            index={i}
            stageColor={stage.color}
            onClick={() => {
              if (!wasDragging.current) onEditDeal(deal)
            }}
          />
        ))}

        {isOver && (
          <div
            className="rounded-lg border-2 border-dashed py-5 opacity-60"
            style={{ borderColor: `rgba(${rgb},0.5)`, background: `rgba(${rgb},0.04)` }}
          />
        )}

        {deals.length === 0 && !isOver && (
          <div className="flex flex-1 flex-col items-center justify-center gap-1 rounded-lg py-8 text-center">
            <div
              className="mb-1 flex h-8 w-8 items-center justify-center rounded-full"
              style={{ background: `rgba(${rgb},0.08)` }}
            >
              <Icon className="h-4 w-4" style={{ color: `rgba(${rgb},0.4)` }} />
            </div>
            <p className="text-[11px] text-muted-foreground/60">Nenhum negócio</p>
          </div>
        )}
      </div>

      {/* Add deal button */}
      <button
        onClick={() => onAddDeal(stage.id)}
        className="group flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border/40 py-2 text-[11px] font-medium text-muted-foreground/60 transition-all duration-200"
        onMouseEnter={(e) => {
          const el = e.currentTarget
          el.style.borderColor = `rgba(${rgb},0.35)`
          el.style.color = `rgba(${rgb},0.8)`
          el.style.background = `rgba(${rgb},0.04)`
        }}
        onMouseLeave={(e) => {
          const el = e.currentTarget
          el.style.borderColor = ''
          el.style.color = ''
          el.style.background = ''
        }}
      >
        <Plus className="h-3 w-3" />
        Adicionar negócio
      </button>
    </div>
  )
}
