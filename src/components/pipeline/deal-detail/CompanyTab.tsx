'use client'

import { useEffect, useState } from 'react'
import { TabHeader } from './TabHeader'
import { CollapsibleSection } from './CollapsibleSection'
import { FieldRow } from './FieldRow'
import { CustomFieldsInline } from './CustomFieldsInline'
import { FieldsSkeleton } from './FieldsSkeleton'
import type { Company, CustomFieldDefinition, CustomFieldValue } from '@/types/supabase'
import { updateCompany, createCompany, findDuplicateCompanies, type CompanyWithStats } from '@/lib/actions/companies'
import { upsertCustomFieldValue } from '@/lib/actions/custom-fields'
import { toast } from 'sonner'
import { Building2, Plus } from 'lucide-react'
import { DuplicateWarningDialog, type DuplicateItem } from '@/components/ui/DuplicateWarningDialog'

interface CompanyTabProps {
  company: Company | null
  companies: CompanyWithStats[]
  customFields: CustomFieldDefinition[]
  fieldValues: CustomFieldValue[]
  expectsCompany?: boolean
  onRefresh: () => void
  onLinkCompany: (companyId: string, companyName?: string) => Promise<void>
  onManageFields: () => void
}

export function CompanyTab({ company, companies, customFields, fieldValues, expectsCompany = false, onRefresh, onLinkCompany, onManageFields }: CompanyTabProps) {
  const [hideEmpty, setHideEmpty] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [selectedCompanyId, setSelectedCompanyId] = useState(company?.id ?? '')
  const [isLinking, setIsLinking] = useState(false)
  const [companyDuplicates, setCompanyDuplicates] = useState<DuplicateItem[]>([])
  const [pendingCompanyName, setPendingCompanyName] = useState<string | null>(null)

  useEffect(() => {
    setSelectedCompanyId(company?.id ?? '')
  }, [company?.id])

  async function handleLinkExisting() {
    if (!selectedCompanyId) {
      toast.error('Selecione uma empresa.')
      return
    }

    setIsLinking(true)
    try {
      const selectedCompany = companies.find((item) => item.id === selectedCompanyId)
      await onLinkCompany(selectedCompanyId, selectedCompany?.name)
      toast.success('Empresa vinculada')
      onRefresh()
    } catch {
      // The parent action already shows the specific error toast.
    } finally {
      setIsLinking(false)
    }
  }

  async function doCreateCompany(name: string) {
    const res = await createCompany({ name })
    if (res.error) { toast.error(res.error); return }
    try {
      await onLinkCompany(res.data!.id, res.data!.name)
      setIsCreating(false)
      setNewName('')
      onRefresh()
    } catch {
      // The parent action already shows the specific error toast.
    }
  }

  async function handleCreate() {
    if (!newName.trim()) return
    const found = await findDuplicateCompanies(newName.trim())
    if (found.length > 0) {
      setCompanyDuplicates(found.map((c) => ({ id: c.id, label: c.name, sublabel: c.segment ?? undefined })))
      setPendingCompanyName(newName.trim())
      return
    }
    await doCreateCompany(newName.trim())
  }

  // Linked company (company_id set) not in state yet — it's loading. Skeleton
  // instead of flashing the "no company" empty state.
  if (!company && expectsCompany) {
    return <FieldsSkeleton title="Campos de empresa" />
  }

  if (!company) {
    return (
      <div className="flex flex-col h-full items-center justify-center p-10 bg-background">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/20 text-muted-foreground/30 mb-4">
          <Building2 className="h-8 w-8" />
        </div>
        <h4 className="text-sm font-bold text-foreground mb-2">Nenhuma empresa vinculada</h4>
        <p className="text-xs text-muted-foreground/60 text-center mb-6 max-w-[240px]">
          Vincule uma empresa existente ou crie uma nova para este negócio.
        </p>
        
        <div className="flex flex-col items-center gap-3">
          {companies.length > 0 && (
            <div className="flex items-center gap-2">
              <select
                value={selectedCompanyId}
                onChange={(event) => setSelectedCompanyId(event.target.value)}
                className="h-9 min-w-[220px] rounded-lg border border-border/40 bg-background px-3 text-xs font-medium text-foreground outline-none focus:border-primary/50"
              >
                <option value="">Selecione uma empresa</option>
                {companies.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <button
                onClick={handleLinkExisting}
                disabled={isLinking}
                className="flex h-9 items-center gap-2 rounded-xl border border-border/40 bg-card/50 px-4 text-xs font-bold text-foreground transition-all hover:border-primary/50 disabled:opacity-60"
              >
                {isLinking ? 'Vinculando...' : 'Vincular'}
              </button>
            </div>
          )}
          
          {isCreating ? (
            <div className="flex items-center gap-2">
              <input 
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nome da empresa..."
                className="h-8 rounded-lg border border-border/40 bg-background px-3 text-xs focus:border-primary/50 outline-none"
              />
              <button onClick={handleCreate} className="h-8 w-8 flex items-center justify-center rounded-lg bg-primary text-white">
                <Plus className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button 
              onClick={() => setIsCreating(true)}
              className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
            >
              <Plus className="h-4 w-4" /> Criar empresa
            </button>
          )}
        </div>
      </div>
    )
  }

  async function handleUpdateField(key: keyof Company, value: string) {
    const res = await updateCompany(company!.id, { [key]: value })
    if (res.error) {
      toast.error(res.error)
      throw new Error(res.error)
    }
    toast.success('Empresa atualizada')
    onRefresh()
  }

  async function handleUpdateCustomField(fieldId: string, value: string) {
    const res = await upsertCustomFieldValue(fieldId, company!.id, value)
    if (res.error) {
      toast.error(res.error)
      throw new Error(res.error)
    }
    toast.success('Campo atualizado')
    onRefresh()
  }

  return (
    <div className="flex flex-col h-full bg-background">
      <TabHeader 
        title="Campos de empresa" 
        hideEmpty={hideEmpty}
        onToggleHideEmpty={() => setHideEmpty(!hideEmpty)}
        onManageFields={onManageFields}
      />

      {companies.length > 0 && (
        <div className="flex items-center justify-between gap-3 border-b border-border/30 px-8 py-3">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60">
            Empresa vinculada
          </span>
          <div className="flex items-center gap-2">
            <select
              value={selectedCompanyId || company.id}
              onChange={(event) => setSelectedCompanyId(event.target.value)}
              className="h-8 min-w-[220px] rounded-lg border border-border/40 bg-card px-3 text-xs font-medium text-foreground outline-none focus:border-primary/50"
            >
              {companies.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <button
              onClick={handleLinkExisting}
              disabled={isLinking || (selectedCompanyId || company.id) === company.id}
              className="h-8 rounded-lg bg-primary px-3 text-xs font-bold text-white transition-all hover:bg-primary/90 disabled:opacity-50"
            >
              Trocar
            </button>
          </div>
        </div>
      )}
      
      <div className="flex-1 overflow-y-auto scrollbar-none">
        <CollapsibleSection title="Informações Gerais">
          <FieldRow label="Nome da empresa" value={company.name} onSave={(v) => handleUpdateField('name', v)} hideIfEmpty={hideEmpty} />
          <FieldRow label="Site" value={company.website} onSave={(v) => handleUpdateField('website', v)} type="url" hideIfEmpty={hideEmpty} />
          <FieldRow label="CNPJ" value={company.cnpj} onSave={(v) => handleUpdateField('cnpj', v)} hideIfEmpty={hideEmpty} />
          <FieldRow label="Cidade" value={company.city} onSave={(v) => handleUpdateField('city', v)} hideIfEmpty={hideEmpty} />
          <FieldRow label="Estado" value={company.state} onSave={(v) => handleUpdateField('state', v)} hideIfEmpty={hideEmpty} />
          <FieldRow label="Categoria" value={company.category} onSave={(v) => handleUpdateField('category', v)} hideIfEmpty={hideEmpty} />
          <FieldRow label="Segmento" value={company.segment} onSave={(v) => handleUpdateField('segment', v)} hideIfEmpty={hideEmpty} />
          <FieldRow label="Funcionários" value={company.employee_count} onSave={(v) => handleUpdateField('employee_count', v)} hideIfEmpty={hideEmpty} />
          <FieldRow label="Faturamento" value={company.faturamento_estimado} onSave={(v) => handleUpdateField('faturamento_estimado', v)} hideIfEmpty={hideEmpty} />
          <FieldRow label="LinkedIn" value={company.linkedin_url} onSave={(v) => handleUpdateField('linkedin_url', v)} type="url" hideIfEmpty={hideEmpty} />
          <FieldRow label="Observações" value={company.notes} onSave={(v) => handleUpdateField('notes', v)} type="textarea" hideIfEmpty={hideEmpty} />
        </CollapsibleSection>

        <CustomFieldsInline
          entityType="company"
          fields={customFields}
          fieldValues={fieldValues}
          hideEmpty={hideEmpty}
          onSaveValue={handleUpdateCustomField}
          onRefresh={onRefresh}
        />
      </div>

      <DuplicateWarningDialog
        open={companyDuplicates.length > 0}
        entityLabel="Empresa"
        duplicates={companyDuplicates}
        onUpdate={async (id) => {
          setCompanyDuplicates([])
          setPendingCompanyName(null)
          const found = companies.find((c) => c.id === id)
          try {
            await onLinkCompany(id, found?.name)
            setIsCreating(false)
            setNewName('')
            onRefresh()
          } catch {
            // parent shows toast
          }
        }}
        onCreateAnyway={() => {
          const name = pendingCompanyName
          setCompanyDuplicates([])
          setPendingCompanyName(null)
          if (name) void doCreateCompany(name)
        }}
        onCancel={() => {
          setCompanyDuplicates([])
          setPendingCompanyName(null)
        }}
      />
    </div>
  )
}
