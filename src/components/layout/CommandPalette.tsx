'use client'

// Port fiel de pipeflow-crm/components/layout/CommandPalette.tsx.
// globalSearch vem de crm.ts (client-side) e recebe companyId; rotas /crm/*.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Briefcase, Building2, Loader2, Search, UserRound } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils/cn'
import { formatCurrency } from '@/lib/utils/formatters'
import { globalSearch, type GlobalSearchResult } from '@/lib/crm'

interface CommandPaletteProps {
  companyId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

type FlatItem =
  | { kind: 'lead'; id: string; label: string; sublabel: string | null }
  | { kind: 'deal'; id: string; label: string; sublabel: string | null; pipelineId: string }
  | { kind: 'company'; id: string; label: string; sublabel: string | null }

const EMPTY_RESULT: GlobalSearchResult = { leads: [], deals: [], companies: [] }

export function CommandPalette({ companyId, open, onOpenChange }: CommandPaletteProps) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<GlobalSearchResult>(EMPTY_RESULT)
  const [isSearching, setIsSearching] = useState(false)
  const [highlighted, setHighlighted] = useState(0)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Sequência da última busca despachada: respostas fora de ordem são descartadas.
  const searchSeq = useRef(0)

  // Reset ao abrir
  useEffect(() => {
    if (open) {
      setQuery('')
      setResults(EMPTY_RESULT)
      setHighlighted(0)
    }
  }, [open])

  // Busca com debounce de 250ms
  useEffect(() => {
    if (!open) return
    if (debounceRef.current) clearTimeout(debounceRef.current)

    const trimmed = query.trim()
    if (trimmed.length < 2) {
      setResults(EMPTY_RESULT)
      setIsSearching(false)
      return
    }

    setIsSearching(true)
    const seq = ++searchSeq.current
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await globalSearch(companyId, trimmed)
        if (seq === searchSeq.current) {
          setResults(res)
          setHighlighted(0)
        }
      } catch {
        if (seq === searchSeq.current) setResults(EMPTY_RESULT)
      } finally {
        if (seq === searchSeq.current) setIsSearching(false)
      }
    }, 250)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, open, companyId])

  const flatItems = useMemo<FlatItem[]>(() => {
    const items: FlatItem[] = []
    for (const lead of results.leads) {
      items.push({ kind: 'lead', id: lead.id, label: lead.name, sublabel: lead.email ?? lead.company })
    }
    for (const deal of results.deals) {
      items.push({
        kind: 'deal',
        id: deal.id,
        label: deal.title,
        sublabel: deal.value != null ? formatCurrency(deal.value) : null,
        pipelineId: deal.pipeline_id,
      })
    }
    for (const company of results.companies) {
      items.push({ kind: 'company', id: company.id, label: company.name, sublabel: null })
    }
    return items
  }, [results])

  const navigate = useCallback(
    (item: FlatItem) => {
      onOpenChange(false)
      if (item.kind === 'lead') {
        router.push(`/crm/leads/${item.id}`)
      } else if (item.kind === 'deal') {
        router.push(`/crm/pipeline?id=${item.pipelineId}&deal=${item.id}`)
      } else {
        router.push(`/crm/leads?search=${encodeURIComponent(item.label)}`)
      }
    },
    [onOpenChange, router]
  )

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setHighlighted((prev) => Math.min(prev + 1, flatItems.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlighted((prev) => Math.max(prev - 1, 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const item = flatItems[highlighted]
      if (item) navigate(item)
    }
  }

  const hasQuery = query.trim().length >= 2
  const hasResults = flatItems.length > 0

  function renderGroup(title: string, icon: React.ReactNode, items: FlatItem[], offset: number) {
    if (items.length === 0) return null
    return (
      <div className="py-1.5">
        <p className="flex items-center gap-1.5 px-3 pb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/60">
          {icon}
          {title}
        </p>
        {items.map((item, i) => {
          const index = offset + i
          return (
            <button
              key={`${item.kind}-${item.id}`}
              type="button"
              onClick={() => navigate(item)}
              onMouseEnter={() => setHighlighted(index)}
              className={cn(
                'flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                index === highlighted ? 'bg-white/8 text-foreground' : 'text-muted-foreground hover:bg-white/5'
              )}
            >
              <span className="min-w-0 truncate font-medium">{item.label}</span>
              {item.sublabel && (
                <span className="flex-shrink-0 truncate text-xs text-muted-foreground/60">{item.sublabel}</span>
              )}
            </button>
          )
        })}
      </div>
    )
  }

  const leadItems = flatItems.filter((i) => i.kind === 'lead')
  const dealItems = flatItems.filter((i) => i.kind === 'deal')
  const companyItems = flatItems.filter((i) => i.kind === 'company')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="top-[18%] translate-y-0 gap-0 p-0 sm:max-w-xl"
      >
        <DialogTitle className="sr-only">Busca global</DialogTitle>

        {/* Input */}
        <div className="flex items-center gap-2.5 border-b border-border/20 px-4 py-3.5">
          {isSearching ? (
            <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin text-muted-foreground/60" />
          ) : (
            <Search className="h-4 w-4 flex-shrink-0 text-muted-foreground/60" />
          )}
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Buscar leads, negócios ou empresas..."
            className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/60"
          />
          <kbd className="hidden flex-shrink-0 rounded border border-border/30 bg-white/5 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground/60 sm:block">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-[50vh] overflow-y-auto p-1.5">
          {!hasQuery && (
            <p className="px-3 py-8 text-center text-xs text-muted-foreground/60">
              Digite pelo menos 2 caracteres para buscar.
            </p>
          )}

          {hasQuery && !isSearching && !hasResults && (
            <p className="px-3 py-8 text-center text-xs text-muted-foreground/60">
              Nada encontrado para “{query.trim()}”.
            </p>
          )}

          {hasResults && (
            <>
              {renderGroup('Leads', <UserRound className="h-3 w-3" />, leadItems, 0)}
              {renderGroup('Negócios', <Briefcase className="h-3 w-3" />, dealItems, leadItems.length)}
              {renderGroup(
                'Empresas',
                <Building2 className="h-3 w-3" />,
                companyItems,
                leadItems.length + dealItems.length
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
