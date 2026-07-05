'use client'

import { useState, useTransition } from 'react'
import { Phone, Mail, Video, FileText } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { createActivity, type DbActivityType } from '@/lib/actions/activities'

interface ActivityFormProps {
  leadId: string
  onSuccess: () => void
}

const ACTIVITY_TYPES: { value: DbActivityType; label: string; icon: React.ElementType }[] = [
  { value: 'call', label: 'Ligação', icon: Phone },
  { value: 'email', label: 'E-mail', icon: Mail },
  { value: 'meeting', label: 'Reunião', icon: Video },
  { value: 'note', label: 'Nota', icon: FileText },
]

export function ActivityForm({ leadId, onSuccess }: ActivityFormProps) {
  const [type, setType] = useState<DbActivityType>('call')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return

    startTransition(async () => {
      const result = await createActivity(leadId, {
        type,
        title: title.trim(),
        description: description.trim() || undefined,
      })

      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success('Atividade registrada')
        setTitle('')
        setDescription('')
        onSuccess()
      }
    })
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {ACTIVITY_TYPES.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => setType(value)}
              className={cn(
                'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                type === value
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background text-muted-foreground hover:border-border/80 hover:text-foreground',
              )}
            >
              <Icon className="h-3 w-3 shrink-0" />
              {label}
            </button>
          ))}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="activity-title" className="text-xs font-medium text-muted-foreground">
            Título
          </Label>
          <Input
            id="activity-title"
            placeholder="Ex: Ligação de prospecção"
            className="font-medium"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="activity-desc" className="text-xs font-medium text-muted-foreground">
            Descrição <span className="font-normal">(opcional)</span>
          </Label>
          <Textarea
            id="activity-desc"
            placeholder="Detalhes adicionais…"
            className="min-h-[80px] resize-none text-sm"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <Button type="submit" className="w-full" disabled={!title.trim() || isPending}>
          {isPending ? 'Salvando…' : 'Salvar atividade'}
        </Button>
      </form>
    </div>
  )
}
