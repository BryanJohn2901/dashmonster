'use client'

import { useState, useEffect } from 'react'
import { X, Plus, Trash2, GripVertical, Loader2 } from 'lucide-react'
import { 
  getCustomFieldDefinitions, 
  createCustomFieldDefinition,
  updateCustomFieldDefinition,
  deleteCustomFieldDefinition,
} from '@/lib/actions/custom-fields'
import type { CustomFieldDefinition, CustomFieldEntity, CustomFieldType } from '@/types/supabase'
import { toast } from 'sonner'

interface CustomFieldsManagerModalProps {
  entityType: CustomFieldEntity
  onClose: () => void
  onUpdated: () => void
}

const NEW_GROUP_SENTINEL = '__new_group__'
const DEFAULT_GROUPS = ['Geral']
/** Section titles owned by the native field lists — custom groups must not reuse them. */
const RESERVED_GROUPS = ['informações gerais', 'informacoes gerais', 'utm', 'links']

const FIELD_TYPES: { value: CustomFieldType; label: string }[] = [
  { value: 'text', label: 'Texto Curto' },
  { value: 'textarea', label: 'Texto Longo' },
  { value: 'number', label: 'Número' },
  { value: 'monetary', label: 'Moeda (R$)' },
  { value: 'date', label: 'Data' },
  { value: 'phone', label: 'Telefone' },
  { value: 'email', label: 'E-mail' },
  { value: 'url', label: 'Link' },
  { value: 'select', label: 'Seleção Única' },
  { value: 'checkbox', label: 'Caixa de Seleção' },
]

export function CustomFieldsManagerModal({ entityType, onClose, onUpdated }: CustomFieldsManagerModalProps) {
  const [fields, setFields] = useState<CustomFieldDefinition[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    async function loadFields() {
      setLoading(true)
      const data = await getCustomFieldDefinitions(entityType)
      if (!mounted) return
      setFields(data)
      setLoading(false)
    }

    loadFields()

    return () => {
      mounted = false
    }
  }, [entityType])

  async function handleAddField() {
    const res = await createCustomFieldDefinition({
      entity_type: entityType,
      label: 'Novo Campo',
      field_type: 'text' as CustomFieldType,
      group_name: 'Geral',
      sort_order: fields.length,
      is_active: true,
    })

    if (res.error) {
      toast.error(res.error)
      return
    }

    setFields((prev) => [...prev, res.data!])
    toast.success('Campo adicionado')
    onUpdated()
  }

  /** Local-only edit while the user types — no server round-trip per keystroke. */
  function patchFieldLocal(id: string, updates: Partial<CustomFieldDefinition>) {
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...updates } : f)))
  }

  /** Persist a field's current values to the server (call on blur / select change). */
  async function persistField(id: string, updates: Partial<CustomFieldDefinition>) {
    const res = await updateCustomFieldDefinition(id, updates)
    if (res.error) {
      toast.error(res.error)
      return
    }
    onUpdated()
  }

  /** Handle the GRUPO select — choosing the sentinel opens a prompt to create a new group. */
  async function handleGroupChange(id: string, value: string) {
    if (value === NEW_GROUP_SENTINEL) {
      const name = window.prompt('Nome do novo grupo:')?.trim()
      if (!name) return
      if (RESERVED_GROUPS.includes(name.toLowerCase())) {
        toast.error(`"${name}" é um grupo reservado. Escolha outro nome.`)
        return
      }
      patchFieldLocal(id, { group_name: name })
      await persistField(id, { group_name: name })
      return
    }
    patchFieldLocal(id, { group_name: value })
    await persistField(id, { group_name: value })
  }

  async function handleDeleteField(id: string) {
    if (!confirm('Tem certeza que deseja excluir este campo? Todos os dados salvos nele serão perdidos.')) return

    const res = await deleteCustomFieldDefinition(id)
    if (res.error) {
      toast.error(res.error)
      return
    }
    setFields((prev) => prev.filter((f) => f.id !== id))
    toast.success('Campo excluído')
    onUpdated()
  }

  const entityLabels: Record<CustomFieldEntity, string> = {
    contact: 'Contato',
    company: 'Empresa',
    deal: 'Negócio'
  }

  // Distinct group names currently in use, plus sensible defaults — excluding
  // reserved native section titles to avoid duplicate headers in the tabs.
  const groupOptions = Array.from(
    new Set([...DEFAULT_GROUPS, ...fields.map((f) => f.group_name).filter(Boolean)]),
  ).filter((g) => !RESERVED_GROUPS.includes(g.toLowerCase()))

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-background w-full max-w-3xl max-h-[80vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-border/40 animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/10 px-8 py-6 bg-muted/5">
          <div>
            <h2 className="text-xl font-black text-foreground">Gerenciar Campos Personalizados</h2>
            <p className="text-xs text-muted-foreground/60">Entidade: <span className="font-bold text-primary">{entityLabels[entityType]}</span></p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-muted transition-colors">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8 scrollbar-none">
          {loading ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary/40" />
            </div>
          ) : fields.length === 0 ? (
            <div className="text-center py-20 border-2 border-dashed border-border/20 rounded-3xl">
              <p className="text-sm text-muted-foreground/60 mb-4 font-medium">Nenhum campo personalizado definido ainda.</p>
              <button onClick={handleAddField} className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-xs font-bold text-white shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all">
                <Plus className="h-4 w-4" /> Criar meu primeiro campo
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-12 gap-4 px-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 mb-2">
                <div className="col-span-4">Rótulo (Label)</div>
                <div className="col-span-3">Tipo</div>
                <div className="col-span-3">Grupo</div>
                <div className="col-span-2 text-right">Ações</div>
              </div>

              {fields.map((field) => (
                <div key={field.id} className="grid grid-cols-12 gap-4 items-center bg-muted/5 border border-border/5 p-3 rounded-2xl group hover:border-primary/20 transition-all">
                  <div className="col-span-4 flex items-center gap-2">
                    <GripVertical className="h-4 w-4 text-muted-foreground/20" />
                    <input
                      value={field.label}
                      onChange={(e) => patchFieldLocal(field.id, { label: e.target.value })}
                      onBlur={(e) => persistField(field.id, { label: e.target.value.trim() || 'Campo' })}
                      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                      className="w-full bg-transparent border-none text-[13px] font-bold focus:ring-0 p-0"
                    />
                  </div>
                  <div className="col-span-3">
                    <select
                      value={field.field_type}
                      onChange={(e) => {
                        const field_type = e.target.value as CustomFieldType
                        patchFieldLocal(field.id, { field_type })
                        persistField(field.id, { field_type })
                      }}
                      className="w-full bg-background/50 border border-border/20 rounded-lg h-8 px-2 text-[12px] focus:border-primary/40 outline-none"
                    >
                      {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  <div className="col-span-3">
                    <select
                      value={field.group_name}
                      onChange={(e) => handleGroupChange(field.id, e.target.value)}
                      className="w-full bg-background/50 border border-border/20 rounded-lg h-8 px-2 text-[12px] focus:border-primary/40 outline-none"
                    >
                      {Array.from(new Set([field.group_name, ...groupOptions])).filter(Boolean).map((g) => (
                        <option key={g} value={g}>{g}</option>
                      ))}
                      <option value={NEW_GROUP_SENTINEL}>+ Novo grupo…</option>
                    </select>
                  </div>
                  <div className="col-span-2 flex justify-end gap-1">
                    <button 
                      onClick={() => handleDeleteField(field.id)}
                      className="p-2 rounded-lg text-red-500/40 hover:bg-red-500/10 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}

              <button 
                onClick={handleAddField}
                className="w-full mt-4 flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border/20 py-4 text-xs font-bold text-muted-foreground/60 hover:border-primary/40 hover:bg-primary/5 hover:text-primary transition-all"
              >
                <Plus className="h-4 w-4" /> Adicionar novo campo
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border/10 px-8 py-6 bg-muted/5 flex justify-end">
          <button 
            onClick={onClose}
            className="rounded-xl bg-foreground px-8 py-3 text-[13px] font-bold text-background shadow-lg hover:opacity-90 transition-all"
          >
            Concluir
          </button>
        </div>
      </div>
    </div>
  )
}
