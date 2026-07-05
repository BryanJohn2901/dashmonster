'use client'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { AlertTriangle } from 'lucide-react'

export interface DuplicateItem {
  id: string
  label: string
  sublabel?: string
}

interface DuplicateWarningDialogProps {
  open: boolean
  entityLabel: string
  duplicates: DuplicateItem[]
  onUpdate: (id: string) => void
  onCreateAnyway: () => void
  onCancel: () => void
}

export function DuplicateWarningDialog({
  open,
  entityLabel,
  duplicates,
  onUpdate,
  onCreateAnyway,
  onCancel,
}: DuplicateWarningDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Possível duplicata encontrada
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <p className="text-sm text-muted-foreground">
            Já existe {duplicates.length === 1 ? 'um' : 'alguns'} {entityLabel.toLowerCase()}
            {duplicates.length === 1 ? '' : 's'} com nome similar:
          </p>

          <div className="space-y-1.5 rounded-xl border border-border/40 bg-muted/20 p-3">
            {duplicates.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{item.label}</p>
                  {item.sublabel && (
                    <p className="truncate text-xs text-muted-foreground">{item.sublabel}</p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0 text-xs"
                  onClick={() => onUpdate(item.id)}
                >
                  Usar este
                </Button>
              </div>
            ))}
          </div>

          <p className="text-xs text-muted-foreground/70">
            Deseja usar um existente, criar mesmo assim ou cancelar?
          </p>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancelar
          </Button>
          <Button variant="outline" onClick={onCreateAnyway}>
            Criar mesmo assim
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
