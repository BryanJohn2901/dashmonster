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
import { createLead, updateLead, deleteLead, findDuplicateLeads, type CreateLeadInput } from '@/lib/actions/leads'
import { createDealFromLead } from '@/lib/actions/deals'
import { DuplicateWarningDialog, type DuplicateItem } from '@/components/ui/DuplicateWarningDialog'
import { LEAD_STATUS_LABELS } from './LeadStatusBadge'
import type { Database } from '@/types/supabase'
import type { LeadRow } from '@/lib/actions/leads'
import type { CompanyWithStats } from '@/lib/actions/companies'

type DbLeadStatus = Database['public']['Enums']['lead_status']

const leadSchema = z.object({
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  email: z.string().email('E-mail inválido').or(z.literal('')),
  phone: z.string(),
  companyId: z.string(),
  company: z.string().min(1, 'Empresa é obrigatória'),
  job_title: z.string(),
  status: z.enum(['new', 'contacted', 'proposal', 'negotiation', 'won', 'lost']),
  estimatedValue: z.string(),
  notes: z.string(),
  dealTitle: z.string(),
})

export type LeadFormValues = z.infer<typeof leadSchema>

interface LeadFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  lead?: LeadRow | null
  companies?: CompanyWithStats[]
  startWithDelete?: boolean
  /** Sem RSC/revalidatePath aqui: quem chama refaz o fetch client-side. */
  onSaved?: () => void
}

export function LeadForm({ open, onOpenChange, lead, companies = [], startWithDelete = false, onSaved }: LeadFormProps) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [duplicates, setDuplicates] = useState<DuplicateItem[]>([])
  const [pendingCreate, setPendingCreate] = useState<{ input: CreateLeadInput; dealTitle: string } | null>(null)
  const [isPending, startTransition] = useTransition()
  const isEditing = !!lead

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<LeadFormValues>({
    resolver: zodResolver(leadSchema),
    defaultValues: {
      name: '',
      email: '',
      phone: '',
      companyId: 'new',
      company: '',
      job_title: '',
      status: 'new',
      estimatedValue: '',
      notes: '',
      dealTitle: '',
    },
  })

  const nameValue = watch('name')
  const dealTitleValue = watch('dealTitle')

  useEffect(() => {
    if (!isEditing && open && dealTitleValue === '') {
      setValue('dealTitle', nameValue ? `Negócio - ${nameValue}` : '')
    }
  }, [nameValue]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (open) {
      setConfirmDelete(startWithDelete)
      if (lead) {
        reset({
          name: lead.name,
          email: lead.email ?? '',
          phone: lead.phone ?? '',
          companyId: lead.company_id ?? 'new',
          company: lead.company_record?.name ?? lead.company ?? '',
          job_title: lead.job_title ?? '',
          status: lead.status,
          estimatedValue: lead.estimated_value != null ? String(lead.estimated_value) : '',
          notes: lead.notes ?? '',
          dealTitle: '',
        })
      } else {
        reset({
          name: '',
          email: '',
          phone: '',
      companyId: 'new',
          company: '',
          job_title: '',
          status: 'new',
          estimatedValue: '',
          notes: '',
          dealTitle: '',
        })
      }
    }
  }, [open, lead, startWithDelete, reset])

  async function doCreateLead(input: CreateLeadInput, dealTitle: string) {
    const result = await createLead(input)
    if (result.error) { toast.error(result.error); return }

    if (result.id && dealTitle.trim()) {
      const dealResult = await createDealFromLead({
        title: dealTitle.trim(),
        lead_id: result.id,
        value: input.estimated_value,
      })
      if (dealResult.error) {
        toast.warning(`Lead criado, mas o negócio no pipeline falhou: ${dealResult.error}`)
        onOpenChange(false)
        return
      }
    }

    toast.success('Lead criado e adicionado ao pipeline')
    onOpenChange(false)
    onSaved?.()
  }

  function onSubmit(data: LeadFormValues) {
    const input: CreateLeadInput = {
      name: data.name,
      email: data.email || undefined,
      phone: data.phone || undefined,
      company_id: data.companyId !== 'new' ? data.companyId : null,
      company: data.company || undefined,
      job_title: data.job_title || undefined,
      status: data.status as DbLeadStatus,
      estimated_value: data.estimatedValue ? Number(data.estimatedValue) : undefined,
      notes: data.notes || undefined,
    }

    startTransition(async () => {
      if (isEditing) {
        const result = await updateLead(lead!.id, input)
        if (result.error) { toast.error(result.error); return }
        toast.success('Lead atualizado')
        onOpenChange(false)
        onSaved?.()
        return
      }

      const found = await findDuplicateLeads(data.name, data.email || undefined)
      if (found.length > 0) {
        setDuplicates(found.map((l) => ({
          id: l.id,
          label: l.name,
          sublabel: [l.email, l.company].filter(Boolean).join(' · ') || undefined,
        })))
        setPendingCreate({ input, dealTitle: data.dealTitle })
        return
      }

      await doCreateLead(input, data.dealTitle)
    })
  }

  function handleDelete() {
    if (!lead) return
    startTransition(async () => {
      const result = await deleteLead(lead.id)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success('Lead excluído')
        onOpenChange(false)
        onSaved?.()
      }
    })
  }

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        {!confirmDelete ? (
          <>
            <DialogHeader>
              <DialogTitle>{isEditing ? 'Editar Lead' : 'Novo Lead'}</DialogTitle>
            </DialogHeader>

            <form id="lead-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-1">
              <div className="grid grid-cols-2 gap-x-4 gap-y-4">
                <div className="col-span-2 space-y-1.5">
                  <Label htmlFor="lf-name">Nome *</Label>
                  <Input id="lf-name" placeholder="Carlos Mendonça" {...register('name')} />
                  {errors.name && (
                    <p className="text-xs text-destructive">{errors.name.message}</p>
                  )}
                </div>

                {!isEditing && (
                  <div className="col-span-2 space-y-1.5">
                    <Label htmlFor="lf-deal-title">Nome do negócio no pipeline</Label>
                    <Input
                      id="lf-deal-title"
                      placeholder="Ex: Proposta para Carlos Mendonça"
                      {...register('dealTitle')}
                    />
                    <p className="text-xs text-muted-foreground">
                      Deixe em branco para não criar negócio no pipeline agora.
                    </p>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="lf-phone">Telefone</Label>
                  <Input id="lf-phone" placeholder="(11) 99999-9999" {...register('phone')} />
                </div>

                <div className="space-y-1.5">
                  <Label>Empresa *</Label>
                  <select
                    className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/30"
                    value={watch('companyId')}
                    onChange={(event) => {
                      const value = event.target.value
                      setValue('companyId', value)
                      if (value !== 'new') {
                        const selected = companies.find((company) => company.id === value)
                        setValue('company', selected?.name ?? '')
                      } else {
                        setValue('company', '')
                      }
                    }}
                  >
                    <option value="new">Nova empresa</option>
                    {companies.map((company) => (
                      <option key={company.id} value={company.id}>
                        {company.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="lf-company">{watch('companyId') === 'new' ? 'Nome da empresa *' : 'Empresa vinculada'}</Label>
                  <Input id="lf-company" placeholder="Tech LTDA" disabled={watch('companyId') !== 'new'} {...register('company')} />
                  {errors.company && (
                    <p className="text-xs text-destructive">{errors.company.message}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="lf-job_title">Cargo</Label>
                  <Input id="lf-job_title" placeholder="CEO" {...register('job_title')} />
                </div>

                <div className="space-y-1.5">
                  <Label>Status *</Label>
                  <Select
                    value={watch('status')}
                    onValueChange={(v) => setValue('status', (v ?? 'new') as DbLeadStatus)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.entries(LEAD_STATUS_LABELS) as [DbLeadStatus, string][]).map(
                        ([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div className="col-span-2 space-y-1.5">
                  <Label htmlFor="lf-value">Valor estimado (R$)</Label>
                  <Input
                    id="lf-value"
                    type="number"
                    min="0"
                    placeholder="0"
                    {...register('estimatedValue')}
                  />
                </div>

                <div className="col-span-2 space-y-1.5">
                  <Label htmlFor="lf-email">E-mail</Label>
                  <Input
                    id="lf-email"
                    type="email"
                    placeholder="carlos@empresa.com"
                    {...register('email')}
                  />
                  {errors.email && (
                    <p className="text-xs text-destructive">{errors.email.message}</p>
                  )}
                </div>

                <div className="col-span-2 space-y-1.5">
                  <Label htmlFor="lf-notes">Notas</Label>
                  <Textarea
                    id="lf-notes"
                    placeholder="Observações sobre este lead⬦"
                    className="min-h-[80px] resize-none text-sm"
                    {...register('notes')}
                  />
                </div>
              </div>
            </form>

            <DialogFooter className="flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              {isEditing && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive sm:mr-auto"
                  onClick={() => setConfirmDelete(true)}
                >
                  Excluir Lead
                </Button>
              )}
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Cancelar
                </Button>
                <Button type="submit" form="lead-form" disabled={isPending}>
                  {isPending ? 'Salvando⬦' : isEditing ? 'Salvar' : 'Criar Lead'}
                </Button>
              </div>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Excluir Lead</DialogTitle>
            </DialogHeader>
            <div className="py-2">
              <p className="text-sm text-muted-foreground">
                Tem certeza que deseja excluir{' '}
                <span className="font-medium text-foreground">{lead?.name}</span>? Esta ação não
                pode ser desfeita.
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmDelete(false)}>
                Cancelar
              </Button>
              <Button variant="destructive" onClick={handleDelete} disabled={isPending}>
                {isPending ? 'Excluindo⬦' : 'Excluir'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>

    <DuplicateWarningDialog
      open={duplicates.length > 0}
      entityLabel="Lead"
      duplicates={duplicates}
      onUpdate={(id) => {
        setDuplicates([])
        setPendingCreate(null)
        toast.info('Abra o lead existente para editá-lo.')
        onOpenChange(false)
        void id
      }}
      onCreateAnyway={() => {
        const pending = pendingCreate
        setDuplicates([])
        setPendingCreate(null)
        if (pending) startTransition(() => doCreateLead(pending.input, pending.dealTitle))
      }}
      onCancel={() => {
        setDuplicates([])
        setPendingCreate(null)
      }}
    />
    </>
  )
}
