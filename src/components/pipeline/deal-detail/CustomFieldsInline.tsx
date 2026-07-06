'use client'

import { useState } from 'react'
import { Check, Loader2, Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import { CollapsibleSection } from './CollapsibleSection'
import { FieldRow } from './FieldRow'
import {
  createCustomFieldDefinition,
  deleteCustomFieldDefinition,
} from '@/lib/actions/custom-fields'
import type {
  CustomFieldDefinition,
  CustomFieldValue,
  CustomFieldEntity,
  CustomFieldType,
} from '@/types/supabase'

const FIELD_TYPES: { value: CustomFieldType; label: string }[] = [
  { value: 'text', label: 'Texto' },
  { value: 'textarea', label: 'Texto longo' },
  { value: 'number', label: 'Número' },
  { value: 'monetary', label: 'Moeda (R$)' },
  { value: 'date', label: 'Data' },
  { value: 'phone', label: 'Telefone' },
  { value: 'email', label: 'E-mail' },
  { value: 'url', label: 'Link' },
]

/** Maps a custom-field type to the input behavior understood by FieldRow. */
function rowType(t: CustomFieldType): 'text' | 'number' | 'email' | 'url' | 'date' | 'textarea' | 'phone' {
  if (t === 'textarea' || t === 'number' || t === 'email' || t === 'url' || t === 'date' || t === 'phone') return t
  return 'text'
}

interface CustomFieldsInlineProps {
  entityType: CustomFieldEntity
  fields: CustomFieldDefinition[]
  fieldValues: CustomFieldValue[]
  hideEmpty: boolean
  onSaveValue: (fieldId: string, value: string) => Promise<void>
  /** Refresh the parent so newly created/deleted definitions show up. */
  onRefresh: () => void
}

export function CustomFieldsInline({
  entityType,
  fields,
  fieldValues,
  hideEmpty,
  onSaveValue,
  onRefresh,
}: CustomFieldsInlineProps) {
  const [adding, setAdding] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [newType, setNewType] = useState<CustomFieldType>('text')
  const [saving, setSaving] = useState(false)

  // Native field lists already own these section titles; remap any custom field
  // that reuses one so it doesn't render a duplicate, colliding header.
  const RESERVED = ['informações gerais', 'informacoes gerais', 'utm', 'links']
  const groupOf = (f: CustomFieldDefinition) => {
    const name = f.group_name || 'Campos personalizados'
    return RESERVED.includes(name.toLowerCase()) ? 'Campos personalizados' : name
  }

  const groups = Array.from(new Set(fields.map(groupOf)))

  async function handleDelete(field: CustomFieldDefinition) {
    if (!confirm(`Excluir o campo "${field.label}"? Os dados salvos nele serão perdidos.`)) return
    const res = await deleteCustomFieldDefinition(field.id)
    if (res.error) {
      toast.error(res.error)
      return
    }
    toast.success('Campo excluído')
    onRefresh()
  }

  async function handleCreate() {
    const label = newLabel.trim()
    if (!label) {
      toast.error('Informe o nome do campo.')
      return
    }
    setSaving(true)
    try {
      const res = await createCustomFieldDefinition({
        entity_type: entityType,
        label,
        field_type: newType,
        group_name: 'Campos personalizados',
        sort_order: fields.length,
        is_active: true,
      })
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success('Campo criado')
      setNewLabel('')
      setNewType('text')
      setAdding(false)
      onRefresh()
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      {groups.map((group) => (
        <CollapsibleSection key={group} title={group}>
          {fields
            .filter((field) => groupOf(field) === group)
            .map((field) => {
              const value = fieldValues.find((v) => v.field_id === field.id)?.value
              return (
                <FieldRow
                  key={field.id}
                  label={field.label}
                  value={value}
                  type={rowType(field.field_type)}
                  onSave={(next) => onSaveValue(field.id, next)}
                  onDelete={() => handleDelete(field)}
                  placeholder={field.placeholder || undefined}
                  hideIfEmpty={hideEmpty}
                />
              )
            })}
        </CollapsibleSection>
      ))}

      {/* Inline add-field affordance */}
      <div className="px-5 py-3">
        {adding ? (
          <div className="flex flex-col gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3 sm:flex-row sm:items-center">
            <input
              autoFocus
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate()
                if (e.key === 'Escape') { setAdding(false); setNewLabel('') }
              }}
              placeholder="Nome do campo"
              className="h-9 flex-1 rounded-lg border border-border/40 bg-background px-3 text-[13px] font-medium text-foreground outline-none focus:border-primary/50"
            />
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value as CustomFieldType)}
              className="h-9 rounded-lg border border-border/40 bg-background px-2 text-[13px] font-medium text-foreground outline-none focus:border-primary/50"
            >
              {FIELD_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleCreate}
                disabled={saving}
                className="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-[13px] font-bold text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Criar
              </button>
              <button
                onClick={() => { setAdding(false); setNewLabel('') }}
                disabled={saving}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground/60 transition-colors hover:bg-muted/40 hover:text-foreground"
                title="Cancelar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border/30 py-3 text-[13px] font-bold text-muted-foreground/60 transition-all hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
          >
            <Plus className="h-4 w-4" /> Adicionar campo
          </button>
        )}
      </div>
    </>
  )
}
