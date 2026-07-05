'use client'

import { useEffect, useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  createDeal,
  updateDeal,
  deleteDeal,
  findDuplicateDeals,
  type DealRow,
  type CreateDealInput,
} from '@/lib/actions/deals'
import { DuplicateWarningDialog, type DuplicateItem } from '@/components/ui/DuplicateWarningDialog'
import type { PipelineStage } from '@/types/supabase'

const dealSchema = z.object({
  title: z.string().min(1, 'Título é obrigatório'),
  value: z.string(),
  stage_id: z.string().uuid('Estágio inválido'),
  due_date: z.string(),
  notes: z.string(),
})

export type DealFormValues = z.infer<typeof dealSchema>

interface DealFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Chamado apenas quando algo foi de fato criado/alterado/excluído — cancelar não dispara. */
  onSaved?: () => void
  deal?: DealRow | null
  pipelineId: string
  defaultStageId: string
  stages: PipelineStage[]
}

export function DealForm({
  open,
  onOpenChange,
  onSaved,
  deal,
  pipelineId,
  defaultStageId,
  stages,
}: DealFormProps) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [duplicates, setDuplicates] = useState<DuplicateItem[]>([])
  const [pendingInput, setPendingInput] = useState<CreateDealInput | null>(null)
  const [isPending, startTransition] = useTransition()
  const isEditing = !!deal

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<DealFormValues>({
    resolver: zodResolver(dealSchema),
    defaultValues: {
      title: '',
      value: '',
      stage_id: defaultStageId,
      due_date: '',
      notes: '',
    },
  })

  useEffect(() => {
    if (open) {
      setConfirmDelete(false)
      if (deal) {
        reset({
          title: deal.title,
          value: deal.value != null ? String(deal.value) : '',
          stage_id: deal.stage_id,
          due_date: deal.due_date ?? '',
          notes: '',
        })
      } else {
        reset({
          title: '',
          value: '',
          stage_id: defaultStageId || (stages[0]?.id ?? ''),
          due_date: '',
          notes: '',
        })
      }
    }
  }, [open, deal, defaultStageId, stages, reset])

  async function doCreate(input: CreateDealInput) {
    const result = await createDeal(input)
    if (result.error) { toast.error(result.error); return }
    toast.success('Negócio criado')
    onOpenChange(false)
    onSaved?.()
  }

  function onSubmit(data: DealFormValues) {
    if (!pipelineId) {
      toast.error('Nenhum funil ativo')
      return
    }

    const input: CreateDealInput = {
      title: data.title,
      value: data.value ? Number(data.value) : undefined,
      pipeline_id: pipelineId,
      stage_id: data.stage_id,
      due_date: data.due_date || undefined,
    }

    if (isEditing) {
      startTransition(async () => {
        const result = await updateDeal(deal!.id, input)
        if (result.error) { toast.error(result.error); return }
        toast.success('Negócio atualizado')
        onOpenChange(false)
        onSaved?.()
      })
      return
    }

    startTransition(async () => {
      const found = await findDuplicateDeals(data.title, pipelineId)
      if (found.length > 0) {
        setDuplicates(found.map((d) => ({ id: d.id, label: d.title, sublabel: d.status === 'open' ? 'Em aberto' : d.status === 'won' ? 'Ganho' : 'Perdido' })))
        setPendingInput(input)
        return
      }
      await doCreate(input)
    })
  }

  function handleDelete() {
    if (!deal) return
    startTransition(async () => {
      const result = await deleteDeal(deal.id)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success('Negócio excluído')
        onOpenChange(false)
        onSaved?.()
      }
    })
  }

  const stageValue = watch('stage_id')
  const selectedStage = stages.find((stage) => stage.id === stageValue)

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Editar negócio' : 'Novo negócio'}</DialogTitle>
        </DialogHeader>

        {confirmDelete ? (
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Tem certeza que deseja excluir o negócio{' '}
              <span className="font-semibold text-foreground">{deal?.title}</span>? Esta ação não
              pode ser desfeita.
            </p>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setConfirmDelete(false)}>
                Cancelar
              </Button>
              <Button variant="destructive" onClick={handleDelete} disabled={isPending}>
                {isPending ? 'Excluindo...' : 'Excluir'}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-1">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="df-title">Título *</Label>
                <Input id="df-title" {...register('title')} placeholder="Ex: Proposta para Acme" />
                {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="df-value">Valor (R$)</Label>
                <Input
                  id="df-value"
                  type="number"
                  min={0}
                  step={100}
                  {...register('value')}
                  placeholder="45000"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="df-due">Prazo</Label>
                <Input id="df-due" type="date" {...register('due_date')} />
              </div>

              <div className="col-span-2 space-y-1.5">
                <Label>Estágio</Label>
                <Select
                  value={stageValue}
                  onValueChange={(value) => {
                    if (value) setValue('stage_id', value)
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um estágio">
                      {selectedStage?.name}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {stages.map((stage) => (
                      <SelectItem key={stage.id} value={stage.id}>
                        {stage.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="df-notes">Notas</Label>
                <Textarea
                  id="df-notes"
                  {...register('notes')}
                  placeholder="Observações sobre o negócio..."
                  className="min-h-[80px] resize-none"
                />
              </div>
            </div>

            <DialogFooter className="gap-2 pt-2">
              {isEditing && (
                <Button
                  type="button"
                  variant="outline"
                  className="text-destructive hover:text-destructive sm:mr-auto"
                  onClick={() => setConfirmDelete(true)}
                >
                  Excluir
                </Button>
              )}
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? 'Salvando...' : isEditing ? 'Salvar' : 'Criar negócio'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>

    <DuplicateWarningDialog
      open={duplicates.length > 0}
      entityLabel="Negócio"
      duplicates={duplicates}
      onUpdate={(id) => {
        setDuplicates([])
        setPendingInput(null)
        toast.info('Abra o negócio existente para editá-lo.')
        onOpenChange(false)
        // Notify parent if needed — for now just close and inform
        void id
      }}
      onCreateAnyway={() => {
        const input = pendingInput
        setDuplicates([])
        setPendingInput(null)
        if (input) startTransition(() => doCreate(input))
      }}
      onCancel={() => {
        setDuplicates([])
        setPendingInput(null)
      }}
    />
    </>
  )
}
