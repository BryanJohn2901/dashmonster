// ─── Adapter: lib/actions/deal-sheet do PipeFlow original ─────────────────────
// Agrega tudo que a aba ativa do DealDetailSheet precisa, em paralelo.
// Portado quase verbatim: só troca server actions pelos adapters client.

import type {
  Contact,
  Company,
  CustomFieldDefinition,
  CustomFieldValue,
  DealActivity,
  DealHistory,
} from '@/types/supabase'
import { getDealActivities } from '@/lib/actions/playbook'
import { getContact, getContactsForSelect, type ContactOption } from '@/lib/actions/contacts'
import { getCompany, getCompanies, type CompanyWithStats } from '@/lib/actions/companies'
import { getCustomFieldDefinitions, getCustomFieldValues } from '@/lib/actions/custom-fields'
import { getOtherDealsOfContact, type DealRow } from '@/lib/actions/deals'
import { getDealHistory } from '@/lib/actions/history'

export interface DealSheetData {
  activities: DealActivity[]
  contact: Contact | null
  contactOptions: ContactOption[]
  company: Company | null
  companyOptions: CompanyWithStats[]
  customFields: CustomFieldDefinition[]
  fieldValues: CustomFieldValue[]
  otherDeals: DealRow[]
  history: DealHistory[]
}

const EMPTY: DealSheetData = {
  activities: [],
  contact: null,
  contactOptions: [],
  company: null,
  companyOptions: [],
  customFields: [],
  fieldValues: [],
  otherDeals: [],
  history: [],
}

export async function getDealSheetData(params: {
  dealId: string
  leadId: string | null
  companyId: string | null
  tab: string
}): Promise<DealSheetData> {
  const { dealId, leadId, companyId, tab } = params

  const activitiesP = getDealActivities(dealId).catch(() => [] as DealActivity[])

  if (tab === 'contact') {
    const [activities, contact, customFields, fieldValues, contactOptions] = await Promise.all([
      activitiesP,
      leadId ? getContact(leadId).catch(() => null) : Promise.resolve(null),
      getCustomFieldDefinitions('contact').catch(() => [] as CustomFieldDefinition[]),
      leadId ? getCustomFieldValues(leadId).catch(() => [] as CustomFieldValue[]) : Promise.resolve([] as CustomFieldValue[]),
      leadId ? Promise.resolve([] as ContactOption[]) : getContactsForSelect().catch(() => [] as ContactOption[]),
    ])
    return { ...EMPTY, activities, contact, customFields, fieldValues, contactOptions }
  }

  if (tab === 'company') {
    const [activities, companyOptions, company, customFields, fieldValues] = await Promise.all([
      activitiesP,
      getCompanies().catch(() => [] as CompanyWithStats[]),
      companyId ? getCompany(companyId).catch(() => null) : Promise.resolve(null),
      getCustomFieldDefinitions('company').catch(() => [] as CustomFieldDefinition[]),
      companyId ? getCustomFieldValues(companyId).catch(() => [] as CustomFieldValue[]) : Promise.resolve([] as CustomFieldValue[]),
    ])
    return { ...EMPTY, activities, companyOptions, company, customFields, fieldValues }
  }

  if (tab === 'deal') {
    const [activities, customFields, fieldValues, otherDeals] = await Promise.all([
      activitiesP,
      getCustomFieldDefinitions('deal').catch(() => [] as CustomFieldDefinition[]),
      getCustomFieldValues(dealId).catch(() => [] as CustomFieldValue[]),
      leadId ? getOtherDealsOfContact(leadId, dealId).catch(() => [] as DealRow[]) : Promise.resolve([] as DealRow[]),
    ])
    return { ...EMPTY, activities, customFields, fieldValues, otherDeals }
  }

  if (tab === 'notes' || tab === 'history') {
    const [activities, history] = await Promise.all([
      activitiesP,
      getDealHistory(dealId).catch(() => [] as DealHistory[]),
    ])
    return { ...EMPTY, activities, history }
  }

  // 'activities' / 'messages' / fallback: só atividades.
  return { ...EMPTY, activities: await activitiesP }
}
