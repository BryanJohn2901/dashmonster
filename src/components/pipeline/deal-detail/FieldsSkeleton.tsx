'use client'

/**
 * Loading placeholder for the Contact/Company field tabs. Shown while an
 * already-linked entity is being fetched, so the "create/link" empty state
 * never flashes before the real data arrives.
 */
export function FieldsSkeleton({ title, rows = 8 }: { title: string; rows?: number }) {
  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header band — mirrors TabHeader height */}
      <div className="flex items-center justify-between border-b border-border/10 bg-primary/5 px-6 py-3">
        <h3 className="text-[13px] font-bold uppercase tracking-widest text-primary/80">{title}</h3>
        <div className="h-3 w-24 animate-pulse rounded bg-muted/40" />
      </div>

      {/* Section header */}
      <div className="border-b border-border/5 bg-muted/5 px-5 py-2.5">
        <div className="h-3 w-32 animate-pulse rounded bg-muted/40" />
      </div>

      {/* Field rows */}
      <div className="flex-1 overflow-hidden p-1">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="flex items-center justify-between border-b border-border/5 px-5 py-3"
            style={{ opacity: 1 - i * 0.07 }}
          >
            <div className="h-3 w-24 animate-pulse rounded bg-muted/40" />
            <div className="h-3 w-40 animate-pulse rounded bg-muted/30" />
          </div>
        ))}
      </div>
    </div>
  )
}
