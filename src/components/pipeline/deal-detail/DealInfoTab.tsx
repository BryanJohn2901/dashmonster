'use client'

import { useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { TabHeader } from './TabHeader'
import { CollapsibleSection } from './CollapsibleSection'
import { FieldRow } from './FieldRow'
import { CustomFieldsInline } from './CustomFieldsInline'
import type { CustomFieldDefinition, CustomFieldValue, Database } from '@/types/supabase'
import { updateDeal, type DealRow } from '@/lib/actions/deals'
import { upsertCustomFieldValue } from '@/lib/actions/custom-fields'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'

type OtherDeal = Database['public']['Tables']['deals']['Row']

type EditableDealKey =
  | 'title'
  | 'value'
  | 'product_name'
  | 'temperature'
  | 'expected_close_date'
  | 'lost_reason'
  | 'utm_source'
  | 'utm_medium'
  | 'utm_campaign'
  | 'utm_content'
  | 'acquisition_channel'
  | 'landing_page_url'
  | 'proposal_url'
  | 'payment_url'
  | 'scheduling_url'
  | 'contract_url'

const STATUS_LABELS: Record<string, string> = {
  open: 'Aberto',
  won: 'Ganho',
  lost: 'Perdido',
}

interface DealInfoTabProps {
  deal: DealRow
  otherDeals: OtherDeal[]
  customFields: CustomFieldDefinition[]
  fieldValues: CustomFieldValue[]
  onRefresh: () => void
  onDealPatch: (patch: Partial<DealRow>) => void
  onOpenDeal: (dealId: string) => void
  onManageFields: () => void
}

export function DealInfoTab({
  deal,
  otherDeals,
  customFields,
  fieldValues,
  onRefresh,
  onDealPatch,
  onOpenDeal,
  onManageFields,
}: DealInfoTabProps) {
  const [hideEmpty, setHideEmpty] = useState(false)

  async function handleUpdateField(key: EditableDealKey, value: string) {
    if (key === 'title' && !value.trim()) {
      toast.error('O nome do negócio é obrigatório.')
      throw new Error('O nome do negócio é obrigatório.')
    }

    const finalValue: string | number | null =
      key === 'value'
        ? parseFloat(value.replace(/[^\d.-]/g, '')) || 0
        : value.trim() || null

    const res = await updateDeal(deal.id, { [key]: finalValue })
    if (res.error) {
      toast.error(res.error)
      throw new Error(res.error)
    }

    onDealPatch({ [key]: finalValue } as Partial<DealRow>)
    toast.success('Negócio atualizado')
    onRefresh()
  }

  async function handleUpdateCustomField(fieldId: string, value: string) {
    const res = await upsertCustomFieldValue(fieldId, deal.id, value)
    if (res.error) {
      toast.error(res.error)
      throw new Error(res.error)
    }
    toast.success('Campo atualizado')
    onRefresh()
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <TabHeader
        title="Campos de negócio"
        hideEmpty={hideEmpty}
        onToggleHideEmpty={() => setHideEmpty(!hideEmpty)}
        onManageFields={onManageFields}
      />

      <div className="flex-1 overflow-y-auto scrollbar-none">
        <CollapsibleSection title="Informações Gerais">
          <FieldRow label="Nome do negócio" value={deal.title} onSave={(value) => handleUpdateField('title', value)} hideIfEmpty={hideEmpty} />
          <FieldRow label="Valor" value={deal.value ? formatCurrency(deal.value) : null} onSave={(value) => handleUpdateField('value', value)} hideIfEmpty={hideEmpty} />
          <FieldRow label="Status" value={STATUS_LABELS[deal.status] ?? deal.status} readOnly hideIfEmpty={hideEmpty} />
          <FieldRow label="Produto/Serviço" value={deal.product_name} onSave={(value) => handleUpdateField('product_name', value)} hideIfEmpty={hideEmpty} />
          <FieldRow label="Temperatura" value={deal.temperature} onSave={(value) => handleUpdateField('temperature', value)} hideIfEmpty={hideEmpty} />
          <FieldRow label="Previsão de Fechamento" value={deal.expected_close_date} onSave={(value) => handleUpdateField('expected_close_date', value)} type="date" hideIfEmpty={hideEmpty} />
          <FieldRow label="Motivo da Perda" value={deal.lost_reason} onSave={(value) => handleUpdateField('lost_reason', value)} hideIfEmpty={hideEmpty} />
          <FieldRow label="Data de Criação" value={formatDate(deal.created_at)} readOnly hideIfEmpty={hideEmpty} />
        </CollapsibleSection>

        <CollapsibleSection title="UTM" defaultOpen={false}>
          <FieldRow label="UTM Source" value={deal.utm_source} onSave={(value) => handleUpdateField('utm_source', value)} hideIfEmpty={hideEmpty} />
          <FieldRow label="UTM Medium" value={deal.utm_medium} onSave={(value) => handleUpdateField('utm_medium', value)} hideIfEmpty={hideEmpty} />
          <FieldRow label="UTM Campaign" value={deal.utm_campaign} onSave={(value) => handleUpdateField('utm_campaign', value)} hideIfEmpty={hideEmpty} />
          <FieldRow label="UTM Content" value={deal.utm_content} onSave={(value) => handleUpdateField('utm_content', value)} hideIfEmpty={hideEmpty} />
          <FieldRow label="Canal de Aquisição" value={deal.acquisition_channel} onSave={(value) => handleUpdateField('acquisition_channel', value)} hideIfEmpty={hideEmpty} />
        </CollapsibleSection>

        <CollapsibleSection title="Links" defaultOpen={false}>
          <FieldRow label="Landing Page" value={deal.landing_page_url} onSave={(value) => handleUpdateField('landing_page_url', value)} type="url" hideIfEmpty={hideEmpty} />
          <FieldRow label="Proposta" value={deal.proposal_url} onSave={(value) => handleUpdateField('proposal_url', value)} type="url" hideIfEmpty={hideEmpty} />
          <FieldRow label="Link de Pagamento" value={deal.payment_url} onSave={(value) => handleUpdateField('payment_url', value)} type="url" hideIfEmpty={hideEmpty} />
          <FieldRow label="Link de Agendamento" value={deal.scheduling_url} onSave={(value) => handleUpdateField('scheduling_url', value)} type="url" hideIfEmpty={hideEmpty} />
          <FieldRow label="Contrato" value={deal.contract_url} onSave={(value) => handleUpdateField('contract_url', value)} type="url" hideIfEmpty={hideEmpty} />
        </CollapsibleSection>

        <CollapsibleSection title="Outros negócios deste contato">
          <div className="flex flex-col">
            {otherDeals.length === 0 ? (
              <div className="p-5 text-center text-[11px] italic text-muted-foreground/30">
                Nenhum outro negócio para este contato.
              </div>
            ) : (
              otherDeals.map((otherDeal) => (
                <div
                  key={otherDeal.id}
                  className="flex items-center justify-between border-b border-border/5 px-5 py-3 transition-colors hover:bg-muted/5"
                >
                  <div className="flex flex-col">
                    <span className="text-[12px] font-bold text-foreground">{otherDeal.title}</span>
                    <span className="text-[10px] text-muted-foreground/60">
                      {otherDeal.status} - {formatCurrency(otherDeal.value || 0)}
                    </span>
                  </div>
                  <button
                    onClick={() => onOpenDeal(otherDeal.id)}
                    className="rounded-lg p-2 text-primary transition-colors hover:bg-primary/10"
                    title="Abrir negócio"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </CollapsibleSection>

        <CustomFieldsInline
          entityType="deal"
          fields={customFields}
          fieldValues={fieldValues}
          hideEmpty={hideEmpty}
          onSaveValue={handleUpdateCustomField}
          onRefresh={onRefresh}
        />
      </div>
    </div>
  )
}
