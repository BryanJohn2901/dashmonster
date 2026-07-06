'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  Plus,
  Trash2,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils/cn'
import {
  createPipeline,
  deletePipeline,
  updatePipeline,
  type PipelineWithStages,
  type SavePipelineInput,
} from '@/lib/actions/pipelines'

type StageStatusKind = 'open' | 'won' | 'lost'

interface StageFormData {
  id?: string
  name: string
  color?: string
  order_index: number
  status_kind: StageStatusKind
}

interface PipelineFormData {
  id?: string
  name: string
  stages: StageFormData[]
}

const DEFAULT_STAGES: StageFormData[] = [
  { name: 'Novo Lead', color: 'blue', order_index: 0, status_kind: 'open' },
  { name: 'Contato Realizado', color: 'cyan', order_index: 1, status_kind: 'open' },
  { name: 'Ganho', color: 'emerald', order_index: 2, status_kind: 'won' },
  { name: 'Perdido', color: 'rose', order_index: 3, status_kind: 'lost' },
]

const STATUS_OPTIONS: {
  value: StageStatusKind
  label: string
  description: string
  icon: typeof Circle
  className: string
}[] = [
  {
    value: 'open',
    label: 'Aberta',
    description: 'Em andamento',
    icon: Circle,
    className:
      'data-[active=true]:border-geyser/30 data-[active=true]:bg-geyser/10 data-[active=true]:text-geyser',
  },
  {
    value: 'won',
    label: 'Ganha',
    description: 'Venda ganha',
    icon: CheckCircle2,
    className:
      'data-[active=true]:border-success/35 data-[active=true]:bg-success/10 data-[active=true]:text-success',
  },
  {
    value: 'lost',
    label: 'Perdida',
    description: 'Venda perdida',
    icon: XCircle,
    className:
      'data-[active=true]:border-danger/35 data-[active=true]:bg-danger/10 data-[active=true]:text-danger',
  },
]

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  pipeline?: PipelineWithStages | null
  onSaveSuccess?: () => void
}

function normalizeStatusKind(stage: {
  status_kind?: string
  name: string
  color?: string
}): StageStatusKind {
  if (stage.status_kind === 'won' || stage.status_kind === 'lost' || stage.status_kind === 'open') {
    return stage.status_kind
  }

  const lowerName = stage.name.toLowerCase()
  if (lowerName.includes('ganho') || stage.color === 'emerald') return 'won'
  if (lowerName.includes('perdido') || stage.color === 'rose') return 'lost'
  return 'open'
}

function getValidationMessage(stages: StageFormData[]) {
  const wonCount = stages.filter((stage) => stage.status_kind === 'won').length
  const lostCount = stages.filter((stage) => stage.status_kind === 'lost').length

  if (stages.length < 2) return 'Crie pelo menos duas etapas.'
  if (wonCount !== 1 && lostCount !== 1) return 'Escolha uma etapa ganha e uma etapa perdida.'
  if (wonCount !== 1) return 'Escolha exatamente uma etapa como venda ganha.'
  if (lostCount !== 1) return 'Escolha exatamente uma etapa como venda perdida.'
  return null
}

export function PipelineSettingsModal({ open, onOpenChange, pipeline, onSaveSuccess }: Props) {
  const router = useRouter()
  const [formData, setFormData] = useState<PipelineFormData>({ name: '', stages: [] })
  const [isPending, startTransition] = useTransition()

  const validationMessage = useMemo(() => getValidationMessage(formData.stages), [formData.stages])
  const canSave = Boolean(formData.name.trim()) && !validationMessage && !isPending
  const openStagesCount = formData.stages.filter((stage) => stage.status_kind === 'open').length
  const wonStage = formData.stages.find((stage) => stage.status_kind === 'won')
  const lostStage = formData.stages.find((stage) => stage.status_kind === 'lost')

  function handleDelete() {
    if (!formData.id) return
    if (!window.confirm('Tem certeza de que deseja excluir este funil? Esta ação não pode ser desfeita.')) {
      return
    }

    startTransition(async () => {
      const res = await deletePipeline(formData.id!)
      if (res.error) {
        toast.error(res.error)
      } else {
        toast.success('Funil excluído com sucesso')
        onOpenChange(false)

        const params = new URLSearchParams(window.location.search)
        if (params.get('id') === formData.id) {
          router.push('/crm/pipeline')
        } else {
          router.refresh()
        }

        onSaveSuccess?.()
      }
    })
  }

  useEffect(() => {
    if (!open) return

    if (pipeline) {
      setFormData({
        id: pipeline.id,
        name: pipeline.name,
        stages: [...pipeline.stages]
          .sort((a, b) => a.order_index - b.order_index)
          .map((stage) => ({
            id: stage.id,
            name: stage.name,
            color: stage.color,
            order_index: stage.order_index,
            status_kind: normalizeStatusKind(stage),
          })),
      })
      return
    }

    setFormData({
      name: 'Novo Funil',
      stages: DEFAULT_STAGES.map((stage) => ({ ...stage })),
    })
  }, [open, pipeline])

  function handleSave() {
    const message = getValidationMessage(formData.stages)
    if (message) {
      toast.error(message)
      return
    }

    const payload: SavePipelineInput = {
      name: formData.name.trim(),
      stages: formData.stages.map((stage, index) => ({
        id: stage.id,
        name: stage.name.trim(),
        color: stage.color,
        status_kind: stage.status_kind,
        order_index: index,
      })),
    }

    startTransition(async () => {
      const res = formData.id ? await updatePipeline(formData.id, payload) : await createPipeline(payload)

      if (res.error) {
        toast.error(res.error)
      } else {
        toast.success(formData.id ? 'Funil atualizado' : 'Funil criado')
        onOpenChange(false)
        onSaveSuccess?.()
      }
    })
  }

  function addStage() {
    setFormData((prev) => ({
      ...prev,
      stages: [
        ...prev.stages,
        {
          name: 'Novo Estágio',
          color: 'slate',
          order_index: prev.stages.length,
          status_kind: 'open',
        },
      ],
    }))
  }

  function removeStage(index: number) {
    setFormData((prev) => ({
      ...prev,
      stages: prev.stages.filter((_, stageIndex) => stageIndex !== index),
    }))
  }

  function moveStage(index: number, direction: 'up' | 'down') {
    if (direction === 'up' && index === 0) return
    if (direction === 'down' && index === formData.stages.length - 1) return

    const newStages = [...formData.stages]
    const swapIndex = direction === 'up' ? index - 1 : index + 1
    ;[newStages[index], newStages[swapIndex]] = [newStages[swapIndex], newStages[index]]
    setFormData((prev) => ({ ...prev, stages: newStages }))
  }

  function updateStageName(index: number, name: string) {
    setFormData((prev) => {
      const stages = [...prev.stages]
      stages[index] = { ...stages[index], name }
      return { ...prev, stages }
    })
  }

  function updateStageStatus(index: number, statusKind: StageStatusKind) {
    setFormData((prev) => ({
      ...prev,
      stages: prev.stages.map((stage, stageIndex) => {
        if (stageIndex === index) return { ...stage, status_kind: statusKind }
        if (statusKind !== 'open' && stage.status_kind === statusKind) return { ...stage, status_kind: 'open' }
        return stage
      }),
    }))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[calc(100dvh-24px)] overflow-hidden rounded-[24px] p-0"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 0,
          padding: 0,
          width: 'min(960px, calc(100vw - 24px))',
          maxWidth: 'none',
        }}
      >
        <DialogHeader className="border-b border-white/8 px-5 pb-4 pt-6 sm:px-7">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <DialogTitle>{formData.id ? 'Editar Funil' : 'Novo Funil'}</DialogTitle>
              <DialogDescription className="max-w-[640px]">
                Configure as etapas e defina onde o funil considera venda ganha ou perdida.
              </DialogDescription>
            </div>

            {validationMessage ? (
              <span className="inline-flex w-fit rounded-full border border-warning/20 bg-warning/10 px-3 py-1 text-xs font-semibold text-warning">
                Ajuste necessário
              </span>
            ) : (
              <span className="inline-flex w-fit rounded-full border border-success/20 bg-success/10 px-3 py-1 text-xs font-semibold text-success">
                Pronto para salvar
              </span>
            )}
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-2">
              <Label htmlFor="pipeline-name">Nome do Funil</Label>
              <Input
                id="pipeline-name"
                value={formData.name}
                onChange={(event) => setFormData((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Ex: Funil Comercial Principal"
                className="h-12 text-[15px]"
              />
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2">
              <SummaryTile label="Etapas" value={formData.stages.length} />
              <SummaryTile label="Abertas" value={openStagesCount} />
              <SummaryTile label="Ganha" value={wonStage?.name ?? '-'} tone="success" />
              <SummaryTile label="Perdida" value={lostStage?.name ?? '-'} tone="danger" />
            </div>
          </div>

          {validationMessage && (
            <div className="mt-4 rounded-2xl border border-warning/20 bg-warning/10 px-4 py-3 text-sm text-warning">
              {validationMessage}
            </div>
          )}

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <Label>Etapas do funil</Label>
              <p className="mt-1 text-xs leading-5 text-slate">
                Reordene, renomeie e escolha o papel de cada etapa no cálculo do dashboard.
              </p>
            </div>

            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={addStage}
              className="h-10 w-full border-dashed sm:w-auto"
            >
              <Plus className="h-4 w-4" />
              Adicionar Etapa
            </Button>
          </div>

          <div className="mt-3 space-y-3">
            {formData.stages.map((stage, index) => (
              <div
                key={stage.id ?? `new-${index}`}
                className="rounded-2xl border border-white/10 bg-[rgba(255,255,255,0.025)] p-3 sm:p-4"
              >
                <div className="grid gap-3 lg:grid-cols-[44px_minmax(180px,1fr)_minmax(330px,420px)_108px] lg:items-end">
                  <div className="flex items-center justify-between lg:block">
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-xs font-bold text-geyser">
                      {index + 1}
                    </span>
                    <div className="flex gap-1 lg:hidden">
                      <StageMoveButtons
                        index={index}
                        stagesLength={formData.stages.length}
                        moveStage={moveStage}
                        removeStage={removeStage}
                      />
                    </div>
                  </div>

                  <div className="min-w-0 space-y-1.5">
                    <Label className="text-xs text-slate">Nome da etapa</Label>
                    <Input
                      value={stage.name}
                      onChange={(event) => updateStageName(index, event.target.value)}
                      placeholder="Nome do estágio"
                      className="h-11"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs text-slate">Tipo da etapa</Label>
                    <div className="grid grid-cols-3 gap-1.5 rounded-xl border border-white/8 bg-bunker/70 p-1">
                      {STATUS_OPTIONS.map((option) => {
                        const Icon = option.icon
                        const active = stage.status_kind === option.value

                        return (
                          <button
                            key={option.value}
                            type="button"
                            data-active={active}
                            onClick={() => updateStageStatus(index, option.value)}
                            className={cn(
                              'flex h-12 min-w-0 items-center justify-center gap-1.5 rounded-lg border border-transparent px-2 text-xs font-semibold text-slate transition-colors hover:bg-surface hover:text-geyser sm:h-11',
                              option.className
                            )}
                            title={option.description}
                          >
                            <Icon className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{option.label}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <div className="hidden justify-end gap-1 lg:flex">
                    <StageMoveButtons
                      index={index}
                      stagesLength={formData.stages.length}
                      moveStage={moveStage}
                      removeStage={removeStage}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-white/8 bg-[rgba(11,13,17,0.80)] px-5 py-4 sm:flex-row sm:items-center sm:justify-end sm:px-7">
          {formData.id && (
            <Button
              variant="destructive"
              type="button"
              onClick={handleDelete}
              disabled={isPending}
              className="w-full sm:mr-auto sm:w-auto"
            >
              {isPending ? 'Excluindo...' : 'Excluir Funil'}
            </Button>
          )}

          <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
            <Button
              variant="outline"
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
              className="flex-1 sm:flex-none"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={!canSave}
              className="flex-1 sm:flex-none"
            >
              {isPending ? 'Salvando...' : 'Salvar Funil'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function SummaryTile({
  label,
  value,
  tone = 'neutral',
}: {
  label: string
  value: number | string
  tone?: 'neutral' | 'success' | 'danger'
}) {
  return (
    <div
      className={cn(
        'min-w-0 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5',
        tone === 'success' && 'border-success/20 bg-success/5',
        tone === 'danger' && 'border-danger/20 bg-danger/5'
      )}
    >
      <p className="text-[11px] font-semibold uppercase text-slate">{label}</p>
      <p
        className={cn(
          'mt-1 truncate text-sm font-bold text-geyser',
          tone === 'success' && 'text-success',
          tone === 'danger' && 'text-danger'
        )}
      >
        {value}
      </p>
    </div>
  )
}

function StageMoveButtons({
  index,
  stagesLength,
  moveStage,
  removeStage,
}: {
  index: number
  stagesLength: number
  moveStage: (index: number, direction: 'up' | 'down') => void
  removeStage: (index: number) => void
}) {
  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        type="button"
        onClick={() => moveStage(index, 'up')}
        disabled={index === 0}
        title="Mover para cima"
      >
        <ChevronUp className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        type="button"
        onClick={() => moveStage(index, 'down')}
        disabled={index === stagesLength - 1}
        title="Mover para baixo"
      >
        <ChevronDown className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        type="button"
        className="text-danger hover:text-danger"
        onClick={() => removeStage(index)}
        disabled={stagesLength <= 2}
        title="Remover estágio"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </>
  )
}
