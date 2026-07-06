'use client'

// Port fiel de components/leads/LeadsView.tsx. Filtro de busca/status era via
// searchParams (RSC refazia o fetch); aqui vira controlado (props do page.tsx).

import { useState, useTransition } from 'react'
import { Building2, Plus, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LeadList } from './LeadList'
import { LeadFilters } from './LeadFilters'
import { LeadForm } from './LeadForm'
import type { LeadRow, DbLeadStatus } from '@/lib/actions/leads'
import { createCompany, findDuplicateCompanies, type CompanyWithStats } from '@/lib/actions/companies'
import { DuplicateWarningDialog, type DuplicateItem } from '@/components/ui/DuplicateWarningDialog'

interface LeadsViewProps {
  leads: LeadRow[]
  companies: CompanyWithStats[]
  search: string
  status: DbLeadStatus | 'all'
  onSearchChange: (value: string) => void
  onStatusChange: (value: DbLeadStatus | 'all') => void
  onRefresh: () => void
}

type ViewMode = 'leads' | 'companies'

export function LeadsView({ leads, companies, search, status, onSearchChange, onStatusChange, onRefresh }: LeadsViewProps) {
  const [mode, setMode] = useState<ViewMode>('leads')
  const [formOpen, setFormOpen] = useState(false)
  const [companyFormOpen, setCompanyFormOpen] = useState(false)
  const [selectedLead, setSelectedLead] = useState<LeadRow | null>(null)
  const [startWithDelete, setStartWithDelete] = useState(false)

  function openCreate() {
    setSelectedLead(null)
    setStartWithDelete(false)
    setFormOpen(true)
  }

  function openEdit(lead: LeadRow) {
    setSelectedLead(lead)
    setStartWithDelete(false)
    setFormOpen(true)
  }

  function openDelete(lead: LeadRow) {
    setSelectedLead(lead)
    setStartWithDelete(true)
    setFormOpen(true)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[20px] font-semibold tracking-[-0.02em] text-[#F7F9FA]">
            {mode === 'leads' ? 'Leads' : 'Empresas'}
          </h2>
          <p className="mt-0.5 text-sm text-slate">
            {mode === 'leads'
              ? `${leads.length} ${leads.length === 1 ? 'contato' : 'contatos'} no total`
              : `${companies.length} ${companies.length === 1 ? 'empresa' : 'empresas'} no total`}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div
            className="flex rounded-xl p-1"
            style={{ background: '#11151A', border: '1px solid rgba(216,222,227,0.08)' }}
          >
            <button
              type="button"
              onClick={() => setMode('leads')}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all duration-150"
              style={mode === 'leads'
                ? { background: '#c6f432', color: '#0B0D11' }
                : { color: '#7B8793' }}
            >
              <Users className="h-3.5 w-3.5" />
              Leads
            </button>
            <button
              type="button"
              onClick={() => setMode('companies')}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all duration-150"
              style={mode === 'companies'
                ? { background: '#c6f432', color: '#0B0D11' }
                : { color: '#7B8793' }}
            >
              <Building2 className="h-3.5 w-3.5" />
              Empresas
            </button>
          </div>
          <Button onClick={mode === 'leads' ? openCreate : () => setCompanyFormOpen(true)} className="shrink-0 gap-2">
            <Plus className="h-4 w-4" />
            {mode === 'leads' ? 'Novo Lead' : 'Nova Empresa'}
          </Button>
        </div>
      </div>

      {mode === 'leads' && (
        <LeadFilters search={search} status={status} onSearchChange={onSearchChange} onStatusChange={onStatusChange} />
      )}

      {mode === 'leads' ? (
        <LeadList leads={leads} onEdit={openEdit} onDelete={openDelete} />
      ) : (
        <CompanyList companies={companies} />
      )}

      <LeadForm
        open={formOpen}
        onOpenChange={setFormOpen}
        lead={selectedLead}
        companies={companies}
        startWithDelete={startWithDelete}
        onSaved={onRefresh}
      />
      <CompanyForm open={companyFormOpen} onOpenChange={setCompanyFormOpen} onSaved={onRefresh} />
    </div>
  )
}

function CompanyList({ companies }: { companies: CompanyWithStats[] }) {
  if (companies.length === 0) {
    return (
      <div
        className="flex h-52 flex-col items-center justify-center gap-3 rounded-[20px] text-center"
        style={{ background: '#151A20', border: '1px dashed rgba(216,222,227,0.14)' }}
      >
        <div
          className="flex h-12 w-12 items-center justify-center rounded-2xl"
          style={{ background: 'rgba(216,222,227,0.06)' }}
        >
          <Building2 className="h-5 w-5 text-slate" />
        </div>
        <div>
          <p className="text-sm font-medium text-geyser">Nenhuma empresa encontrada</p>
          <p className="mt-0.5 text-xs text-slate">Crie uma empresa para reutilizar em leads e negócios.</p>
        </div>
      </div>
    )
  }

  return (
    <div
      className="overflow-hidden rounded-[20px]"
      style={{ background: '#151A20', border: '1px solid rgba(216,222,227,0.09)' }}
    >
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr style={{ background: 'rgba(216,222,227,0.025)', borderBottom: '1px solid rgba(216,222,227,0.08)' }}>
              <th className="py-2.5 pl-4 pr-3 text-left text-[11px] font-semibold uppercase tracking-[0.10em] text-slate">Empresa</th>
              <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.10em] text-slate">Segmento</th>
              <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.10em] text-slate">Leads</th>
              <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.10em] text-slate">Negócios</th>
              <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.10em] text-slate">Site</th>
            </tr>
          </thead>
          <tbody>
            {companies.map((company) => (
              <tr
                key={company.id}
                className="transition-colors duration-150 last:[&>td]:border-0"
                style={{ borderBottom: '1px solid rgba(216,222,227,0.06)' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = 'rgba(198,244,50,0.03)' }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = '' }}
              >
                <td className="py-3 pl-4 pr-3">
                  <p className="text-sm font-medium text-geyser">{company.name}</p>
                  {company.cnpj && <p className="text-xs text-slate">{company.cnpj}</p>}
                </td>
                <td className="px-3 py-3 text-sm text-slate">{company.segment ?? company.category ?? '—'}</td>
                <td className="px-3 py-3 text-right text-sm text-geyser">{company.leads_count}</td>
                <td className="px-3 py-3 text-right text-sm text-geyser">{company.deals_count}</td>
                <td className="px-3 py-3 text-sm text-slate">{company.website ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function CompanyForm({ open, onOpenChange, onSaved }: { open: boolean; onOpenChange: (open: boolean) => void; onSaved: () => void }) {
  const [isPending, startTransition] = useTransition()
  const [name, setName] = useState('')
  const [website, setWebsite] = useState('')
  const [segment, setSegment] = useState('')
  const [duplicates, setDuplicates] = useState<DuplicateItem[]>([])
  const [pendingData, setPendingData] = useState<{ name: string; website: string; segment: string } | null>(null)

  async function doCreate(data: { name: string; website: string; segment: string }) {
    const result = await createCompany({
      name: data.name,
      website: data.website || null,
      segment: data.segment || null,
    })
    if (result.error) { toast.error(result.error); return }
    toast.success('Empresa criada')
    setName('')
    setWebsite('')
    setSegment('')
    onOpenChange(false)
    onSaved()
  }

  function save() {
    if (!name.trim()) {
      toast.error('Informe o nome da empresa')
      return
    }

    const data = { name: name.trim(), website: website.trim(), segment: segment.trim() }

    startTransition(async () => {
      const found = await findDuplicateCompanies(data.name)
      if (found.length > 0) {
        setDuplicates(found.map((c) => ({ id: c.id, label: c.name, sublabel: c.segment ?? undefined })))
        setPendingData(data)
        return
      }
      await doCreate(data)
    })
  }

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nova Empresa</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="company-name">Nome *</Label>
            <Input id="company-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex: Clara Foods" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="company-segment">Segmento</Label>
            <Input id="company-segment" value={segment} onChange={(event) => setSegment(event.target.value)} placeholder="Ex: Alimentação" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="company-website">Site</Label>
            <Input id="company-website" value={website} onChange={(event) => setWebsite(event.target.value)} placeholder="https://empresa.com" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save} disabled={isPending}>{isPending ? 'Salvando...' : 'Criar Empresa'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <DuplicateWarningDialog
      open={duplicates.length > 0}
      entityLabel="Empresa"
      duplicates={duplicates}
      onUpdate={(id) => {
        setDuplicates([])
        setPendingData(null)
        toast.info('Empresa existente selecionada.')
        onOpenChange(false)
        void id
      }}
      onCreateAnyway={() => {
        const data = pendingData
        setDuplicates([])
        setPendingData(null)
        if (data) startTransition(() => doCreate(data))
      }}
      onCancel={() => {
        setDuplicates([])
        setPendingData(null)
      }}
    />
    </>
  )
}
