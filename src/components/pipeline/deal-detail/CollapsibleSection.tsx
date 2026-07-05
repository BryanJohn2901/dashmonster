'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CollapsibleSectionProps {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
  className?: string
  headerActions?: React.ReactNode
}

export function CollapsibleSection({
  title,
  children,
  defaultOpen = true,
  className,
  headerActions,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <div className={cn('border-b border-border/5', className)}>
      <div 
        className="flex cursor-pointer items-center justify-between bg-muted/5 px-5 py-2.5 hover:bg-muted/10 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-2">
          {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/60" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" />}
          <h4 className="text-[11px] font-black uppercase tracking-wider text-muted-foreground/70">{title}</h4>
        </div>
        {headerActions && <div onClick={(e) => e.stopPropagation()}>{headerActions}</div>}
      </div>
      
      {isOpen && (
        <div className="p-1">
          {children}
        </div>
      )}
    </div>
  )
}
