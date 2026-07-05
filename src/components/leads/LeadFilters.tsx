'use client'

// Port fiel: original lia/escrevia searchParams (RSC refetch server-side no
// pathname). Sem RSC aqui — vira componente controlado (search/status/onChange).

import { useEffect, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { LEAD_STATUS_LABELS } from './LeadStatusBadge'
import type { DbLeadStatus } from '@/lib/actions/leads'

interface LeadFiltersProps {
  search: string
  status: DbLeadStatus | 'all'
  onSearchChange: (value: string) => void
  onStatusChange: (value: DbLeadStatus | 'all') => void
}

export function LeadFilters({ search, status, onSearchChange, onStatusChange }: LeadFiltersProps) {
  const [searchInput, setSearchInput] = useState(search)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { setSearchInput(search) }, [search])

  const hasActiveFilters = search !== '' || status !== 'all'

  function handleSearchChange(event: React.ChangeEvent<HTMLInputElement>) {
    const value = event.target.value
    setSearchInput(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => onSearchChange(value), 350)
  }

  function handleClear() {
    setSearchInput('')
    onSearchChange('')
    onStatusChange('all')
  }

  return (
    <div
      className="flex flex-wrap items-center gap-3 rounded-[18px] p-3"
      style={{
        background: '#151A20',
        border: '1px solid rgba(216,222,227,0.09)',
      }}
    >
      {/* Search input */}
      <div className="relative min-w-[240px] flex-1">
        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate/60 pointer-events-none" />
        <Input
          placeholder="Buscar por nome ou empresa..."
          className="pl-10 h-11"
          value={searchInput}
          onChange={handleSearchChange}
        />
      </div>

      {/* Status filter */}
      <Select value={status} onValueChange={(value) => onStatusChange((value ?? 'all') as DbLeadStatus | 'all')}>
        <SelectTrigger className="w-full sm:w-[200px]">
          <SelectValue placeholder="Todos os status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos os status</SelectItem>
          {(Object.entries(LEAD_STATUS_LABELS) as [DbLeadStatus, string][]).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Clear button */}
      {hasActiveFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleClear}
          className="gap-1.5 text-slate hover:text-danger"
        >
          <X className="h-3.5 w-3.5" />
          Limpar
        </Button>
      )}
    </div>
  )
}
