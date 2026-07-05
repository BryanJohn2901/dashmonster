'use client'

import { Settings, EyeOff, Eye } from 'lucide-react'
import { cn } from '@/lib/utils'

interface TabHeaderProps {
  title: string
  hideEmpty: boolean
  onToggleHideEmpty: () => void
  onManageFields: () => void
  className?: string
}

export function TabHeader({
  title,
  hideEmpty,
  onToggleHideEmpty,
  onManageFields,
  className
}: TabHeaderProps) {
  return (
    <div className={cn('flex items-center justify-between border-b border-border/10 bg-primary/5 px-6 py-3', className)}>
      <h3 className="text-[13px] font-bold text-primary/80 uppercase tracking-widest">{title}</h3>
      
      <div className="flex items-center gap-4">
        <button 
          onClick={onToggleHideEmpty}
          className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground/60 hover:text-primary transition-colors"
        >
          {hideEmpty ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          {hideEmpty ? 'Mostrar vazios' : 'Ocultar vazios'}
        </button>
        
        <button 
          onClick={onManageFields}
          className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground/60 hover:text-primary transition-colors"
        >
          <Settings className="h-3.5 w-3.5" />
          Gerenciar campos
        </button>
      </div>
    </div>
  )
}
