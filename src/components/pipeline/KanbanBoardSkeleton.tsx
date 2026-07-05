import { Skeleton } from '@/components/ui/skeleton'

function KanbanColumnSkeleton({ cardCount = 3 }: { cardCount?: number }) {
  return (
    <div className="flex w-[272px] flex-shrink-0 flex-col gap-3">
      {/* Column header */}
      <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-5 w-7 rounded-full" />
        </div>
        <Skeleton className="h-7 w-7 rounded-md" />
      </div>

      {/* Cards */}
      <div className="flex flex-col gap-2">
        {Array.from({ length: cardCount }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border bg-card p-3 space-y-2.5">
            <div className="flex items-start justify-between gap-2">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-6 w-6 rounded-md flex-shrink-0" />
            </div>
            <Skeleton className="h-5 w-20 rounded-full" />
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Skeleton className="h-3 w-3 rounded-full" />
                <Skeleton className="h-3 w-24" />
              </div>
              <div className="flex items-center gap-1.5">
                <Skeleton className="h-3 w-3 rounded-full" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function KanbanBoardSkeleton() {
  const columnCards = [2, 3, 1, 2, 1, 0]

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-end justify-between">
        <Skeleton className="h-7 w-40" />
      </div>

      <div className="flex gap-3 overflow-x-auto pb-4">
        {columnCards.map((count, i) => (
          <KanbanColumnSkeleton key={i} cardCount={count} />
        ))}
      </div>
    </div>
  )
}
