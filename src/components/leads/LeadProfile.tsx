'use client'

import { useState, useTransition, type ElementType } from 'react'
import {
  Mail,
  Phone,
  Building2,
  Briefcase,
  CalendarDays,
  UserCircle2,
  DollarSign,
  FileText,
  ChevronsUpDown,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toast } from 'sonner'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { LeadStatusBadge } from './LeadStatusBadge'
import { updateLead, type LeadRow } from '@/lib/actions/leads'
import type { CompanyWithStats } from '@/lib/actions/companies'

interface LeadProfileProps {
  lead: LeadRow
  companies?: CompanyWithStats[]
  onRefresh?: () => void
}

function getInitials(name: string) {
  return name
    .split(' ')
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase()
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: ElementType
  label: string
  value: string
}) {
  return (
    <div className="flex items-start gap-3 px-5 py-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-medium text-foreground">{value || '-'}</p>
      </div>
    </div>
  )
}

function CompanyRow({ lead, companies, onRefresh }: { lead: LeadRow; companies: CompanyWithStats[]; onRefresh?: () => void }) {
  const [open, setOpen] = useState(false)
  const [selectedCompanyId, setSelectedCompanyId] = useState(lead.company_id ?? 'new')
  const [newCompanyName, setNewCompanyName] = useState(lead.company_record?.name ?? lead.company ?? '')
  const [isPending, startTransition] = useTransition()
  const companyName = lead.company_record?.name ?? lead.company ?? ''

  function handleSave() {
    const selectedCompany = companies.find((company) => company.id === selectedCompanyId)
    const trimmedName = newCompanyName.trim()

    if (selectedCompanyId === 'new' && !trimmedName) {
      toast.error('Informe o nome da empresa.')
      return
    }

    startTransition(async () => {
      const result = await updateLead(lead.id, {
        company_id: selectedCompany?.id ?? null,
        company: selectedCompany?.name ?? trimmedName,
      })

      if (result.error) {
        toast.error(result.error)
        return
      }

      toast.success(selectedCompany ? 'Empresa vinculada ao lead.' : 'Empresa cadastrada e vinculada ao lead.')
      setOpen(false)
      onRefresh?.()
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-start gap-3 px-5 py-3 text-left transition-colors hover:bg-muted/30"
      >
        <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Empresa</p>
          <p className="flex items-center gap-2 truncate text-sm font-medium text-foreground">
            <span className="truncate">{companyName || 'Vincular empresa'}</span>
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </p>
        </div>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Vincular empresa</DialogTitle>
            <DialogDescription>
              Escolha uma empresa cadastrada ou crie uma nova para este lead.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Empresa cadastrada</Label>
              <select
                className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/30"
                value={selectedCompanyId}
                onChange={(event) => {
                  const selectedValue = event.target.value
                  setSelectedCompanyId(selectedValue)
                  const selectedCompany = companies.find((company) => company.id === selectedValue)
                  setNewCompanyName(selectedCompany?.name ?? '')
                }}
              >
                <option value="new">Cadastrar nova empresa</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>
            </div>

            {selectedCompanyId === 'new' && (
              <div className="space-y-2">
                <Label htmlFor="lead-company-name">Nome da empresa</Label>
                <Input
                  id="lead-company-name"
                  value={newCompanyName}
                  onChange={(event) => setNewCompanyName(event.target.value)}
                  placeholder="Ex: Atlas Fitness"
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={handleSave} disabled={isPending}>
              {isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function LeadProfile({ lead, companies = [], onRefresh }: LeadProfileProps) {
  const createdAt = format(parseISO(lead.created_at), "d 'de' MMMM 'de' yyyy", { locale: ptBR })
  const ownerName = lead.owner_profile?.full_name ?? 'Usuário'
  const companyName = lead.company_record?.name ?? lead.company

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex flex-col items-center gap-3 px-6 py-8 text-center">
        <Avatar className="h-16 w-16">
          <AvatarFallback className="bg-primary text-xl font-bold text-primary-foreground">
            {getInitials(lead.name)}
          </AvatarFallback>
        </Avatar>

        <div>
          <h1 className="text-lg font-semibold text-foreground">{lead.name}</h1>
          {lead.job_title && (
            <p className="mt-0.5 text-sm text-muted-foreground">{lead.job_title}</p>
          )}
          {companyName && <p className="text-sm text-muted-foreground">{companyName}</p>}
        </div>

        <LeadStatusBadge status={lead.status} />
      </div>

      <Separator />

      <div className="divide-y divide-border">
        <InfoRow icon={Mail} label="E-mail" value={lead.email ?? ''} />
        <InfoRow icon={Phone} label="Telefone" value={lead.phone ?? ''} />
        <CompanyRow lead={lead} companies={companies} onRefresh={onRefresh} />
        <InfoRow icon={Briefcase} label="Cargo" value={lead.job_title ?? ''} />
        <InfoRow icon={UserCircle2} label="Responsável" value={ownerName} />
        {lead.estimated_value != null && (
          <InfoRow
            icon={DollarSign}
            label="Valor estimado"
            value={`R$ ${lead.estimated_value.toLocaleString('pt-BR')}`}
          />
        )}
        <InfoRow icon={CalendarDays} label="Criado em" value={createdAt} />
        {lead.notes && <InfoRow icon={FileText} label="Notas" value={lead.notes} />}
      </div>
    </div>
  )
}
