// ─── Adapter: lib/actions/custom-fields do PipeFlow original ──────────────────

import { getCompanyContext } from '@/hooks/useCompany'
import {
  fetchFieldDefs, saveFieldDef, deleteFieldDef, fetchFieldValues, setFieldValue,
  type CrmFieldDef, type CrmFieldEntity, type CrmFieldType,
} from '@/lib/crm'
import type { CustomFieldDefinition, CustomFieldValue, CustomFieldEntity, CustomFieldType } from '@/types/supabase'

async function activeCompanyId(): Promise<string> {
  const state = await getCompanyContext()
  if (!state.company) throw new Error('Nenhuma empresa ativa.')
  return state.company.id
}

function toRow(d: CrmFieldDef): CustomFieldDefinition {
  return {
    id: d.id,
    entity_type: d.entityType as CustomFieldEntity,
    label: d.label,
    field_type: d.fieldType as CustomFieldType,
    options: d.options,
    group_name: d.groupName,
    placeholder: d.placeholder,
    sort_order: d.sortOrder,
    is_active: d.isActive,
  }
}

export async function getCustomFieldDefinitions(entityType: CustomFieldEntity): Promise<CustomFieldDefinition[]> {
  const companyId = await activeCompanyId()
  const defs = await fetchFieldDefs(companyId, entityType as CrmFieldEntity)
  return defs.map(toRow)
}

export async function getCustomFieldValues(entityId: string): Promise<CustomFieldValue[]> {
  const companyId = await activeCompanyId()
  const values = await fetchFieldValues(companyId, entityId)
  return Array.from(values.entries()).map(([field_id, value]) => ({ field_id, entity_id: entityId, value }))
}

export async function upsertCustomFieldValue(fieldId: string, entityId: string, value: string): Promise<{ error?: string }> {
  try {
    await setFieldValue(await activeCompanyId(), fieldId, entityId, value || null)
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao salvar campo' }
  }
}

// ── Variante usada pelas telas de configurações e pelo manager modal ──────────

export async function settingsGetCustomFields(entityType?: CustomFieldEntity): Promise<CustomFieldDefinition[]> {
  const companyId = await activeCompanyId()
  const defs = await fetchFieldDefs(companyId, entityType as CrmFieldEntity | undefined)
  return defs.map(toRow)
}

export async function settingsCreateCustomField(input: {
  entity_type: CustomFieldEntity
  label: string
  field_type: CustomFieldType
  options?: string[] | null
  group_name?: string
  placeholder?: string | null
  sort_order?: number
  is_active?: boolean
}): Promise<{ data?: CustomFieldDefinition; error?: string }> {
  try {
    const companyId = await activeCompanyId()
    const created = await saveFieldDef(companyId, {
      entityType: input.entity_type as CrmFieldEntity,
      label: input.label,
      fieldType: input.field_type as CrmFieldType,
      options: input.options ?? null,
      groupName: input.group_name,
      placeholder: input.placeholder ?? null,
    })
    return { data: toRow(created) }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao criar campo' }
  }
}

export async function settingsUpdateCustomField(
  id: string,
  input: {
    label?: string; field_type?: CustomFieldType; options?: string[] | null
    entity_type?: CustomFieldEntity; group_name?: string; placeholder?: string | null
  },
): Promise<{ error: string | null }> {
  try {
    const companyId = await activeCompanyId()
    const existing = (await fetchFieldDefs(companyId)).find((d) => d.id === id)
    if (!existing) return { error: 'Campo não encontrado' }
    await saveFieldDef(companyId, {
      id,
      entityType: (input.entity_type as CrmFieldEntity) ?? existing.entityType,
      label: input.label ?? existing.label,
      fieldType: (input.field_type as CrmFieldType) ?? existing.fieldType,
      options: 'options' in input ? (input.options ?? null) : existing.options,
      groupName: input.group_name ?? existing.groupName,
      placeholder: 'placeholder' in input ? (input.placeholder ?? null) : existing.placeholder,
    })
    return { error: null }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao atualizar campo' }
  }
}

export async function settingsDeleteCustomField(id: string): Promise<{ error: string | null }> {
  try {
    await deleteFieldDef(id, await activeCompanyId())
    return { error: null }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao excluir campo' }
  }
}

// Aliases dos nomes originais usados pelo CustomFieldsManagerModal
export const createCustomFieldDefinition = settingsCreateCustomField
export const updateCustomFieldDefinition = settingsUpdateCustomField
export const deleteCustomFieldDefinition = settingsDeleteCustomField
