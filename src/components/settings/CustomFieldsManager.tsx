'use client'

import { useState, useTransition } from 'react'
import { Plus, Pencil, Trash2, GripVertical, AlertCircle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  settingsCreateCustomField,
  settingsUpdateCustomField,
  settingsDeleteCustomField,
} from '@/lib/actions/custom-fields'
import type { CustomFieldDefinition, CustomFieldEntity } from '@/types/supabase'
import type { Database } from '@/types/supabase'

type FieldType = Database['public']['Enums']['custom_field_type']

const ENTITY_TABS: { key: CustomFieldEntity; label: string }[] = [
  { key: 'contact', label: 'Contatos' },
  { key: 'company', label: 'Empresas' },
  { key: 'deal', label: 'Negócios' },
]

const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: 'Texto',
  number: 'Número',
  monetary: 'Monetário',
  date: 'Data',
  datetime: 'Data e hora',
  phone: 'Telefone',
  email: 'E-mail',
  url: 'URL',
  select: 'Seleção única',
  multi_select: 'Seleção múltipla',
  textarea: 'Texto longo',
  checkbox: 'Checkbox',
}

const FIELD_TYPES = Object.entries(FIELD_TYPE_LABELS) as [FieldType, string][]

interface Props {
  fieldsByEntity: Record<CustomFieldEntity, CustomFieldDefinition[]>
  isAdmin: boolean
}

interface FormState {
  label: string
  fieldType: FieldType
  groupName: string
  isRequired: boolean
  options: string
}

const EMPTY_FORM: FormState = {
  label: '',
  fieldType: 'text',
  groupName: 'Informações Adicionais',
  isRequired: false,
  options: '',
}

function parseOptions(raw: unknown): string {
  if (!raw) return ''
  // Handles both native array (jsonb) and legacy JSON string (if any old data)
  const arr = typeof raw === 'string' ? (() => { try { return JSON.parse(raw) } catch { return null } })() : raw
  if (Array.isArray(arr)) return arr.join('\n')
  return ''
}

function buildOptionsArray(raw: string): string[] | null {
  const lines = raw.split('\n').map((s) => s.trim()).filter(Boolean)
  return lines.length > 0 ? lines : null
}

export function CustomFieldsManager({ fieldsByEntity, isAdmin }: Props) {
  const [activeTab, setActiveTab] = useState<CustomFieldEntity>('contact')
  const [dialogMode, setDialogMode] = useState<'create' | 'edit' | null>(null)
  const [editingField, setEditingField] = useState<CustomFieldDefinition | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<CustomFieldDefinition | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [formError, setFormError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Local state for optimistic field list per entity
  const [localFields, setLocalFields] = useState<Record<CustomFieldEntity, CustomFieldDefinition[]>>(fieldsByEntity)

  function openCreate() {
    setForm({ ...EMPTY_FORM })
    setFormError(null)
    setDialogMode('create')
  }

  function openEdit(field: CustomFieldDefinition) {
    setEditingField(field)
    setForm({
      label: field.label,
      fieldType: field.field_type,
      groupName: field.group_name,
      isRequired: field.is_required ?? false,
      options: parseOptions(field.options),
    })
    setFormError(null)
    setDialogMode('edit')
  }

  function closeDialog() {
    setDialogMode(null)
    setEditingField(null)
    setFormError(null)
  }

  const needsOptions = form.fieldType === 'select' || form.fieldType === 'multi_select'

  function handleSubmit() {
    setFormError(null)
    startTransition(async () => {
      const optionsArray = needsOptions ? buildOptionsArray(form.options) : null

      if (dialogMode === 'create') {
        // ponytail: is_required fica só no form — a migration 072 não tem a coluna.
        const result = await settingsCreateCustomField({
          label: form.label,
          entity_type: activeTab,
          field_type: form.fieldType,
          group_name: form.groupName,
          options: optionsArray,
        })
        if (result.error) { setFormError(result.error); return }
        if (result.data) {
          setLocalFields((prev) => ({
            ...prev,
            [activeTab]: [...prev[activeTab], result.data!],
          }))
        }
      } else if (dialogMode === 'edit' && editingField) {
        const result = await settingsUpdateCustomField(editingField.id, {
          label: form.label,
          options: needsOptions ? optionsArray : undefined,
          group_name: form.groupName,
        })
        if (result.error) { setFormError(result.error); return }
        setLocalFields((prev) => ({
          ...prev,
          [activeTab]: prev[activeTab].map((f) =>
            f.id === editingField.id
              ? { ...f, label: form.label, is_required: form.isRequired, options: needsOptions ? optionsArray : f.options }
              : f
          ),
        }))
      }

      closeDialog()
    })
  }

  function handleDelete() {
    if (!deleteTarget) return
    const target = deleteTarget
    setDeleteTarget(null)
    startTransition(async () => {
      await settingsDeleteCustomField(target.id)
      setLocalFields((prev) => ({
        ...prev,
        [activeTab]: prev[activeTab].filter((f) => f.id !== target.id),
      }))
    })
  }

  const fields = localFields[activeTab]

  return (
    <div className="flex flex-col gap-6">
      {/* Tabs */}
      <div
        className="flex items-center gap-1 rounded-xl p-1"
        style={{ background: '#11151A', border: '1px solid rgba(216,222,227,0.06)' }}
      >
        {ENTITY_TABS.map((tab) => {
          const active = activeTab === tab.key
          const count = localFields[tab.key].length
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className="relative flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg text-sm font-medium transition-all duration-150"
              style={active ? {
                background: 'rgba(198,244,50,0.10)',
                border: '1px solid rgba(198,244,50,0.16)',
                color: '#c6f432',
              } : { color: '#7B8793' }}
            >
              {tab.label}
              <span
                className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none"
                style={active
                  ? { background: 'rgba(198,244,50,0.15)', color: '#c6f432' }
                  : { background: 'rgba(216,222,227,0.08)', color: '#7B8793' }}
              >
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Header row */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate">
          {fields.length === 0
            ? 'Nenhum campo personalizado criado ainda.'
            : `${fields.length} campo${fields.length !== 1 ? 's' : ''}`}
        </p>
        {isAdmin && (
          <Button size="sm" onClick={openCreate} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            Adicionar campo
          </Button>
        )}
      </div>

      {/* Field list */}
      {fields.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center gap-3 rounded-2xl py-16"
          style={{
            background: '#151A20',
            border: '1px dashed rgba(216,222,227,0.10)',
          }}
        >
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl"
            style={{ background: 'rgba(216,222,227,0.05)', border: '1px solid rgba(216,222,227,0.08)' }}
          >
            <GripVertical className="h-5 w-5 text-slate/40" />
          </div>
          <p className="text-sm text-slate">Nenhum campo personalizado</p>
          {isAdmin && (
            <Button size="sm" variant="outline" onClick={openCreate} className="gap-1.5 mt-1">
              <Plus className="h-3.5 w-3.5" />
              Criar primeiro campo
            </Button>
          )}
        </div>
      ) : (
        <div
          className="overflow-hidden rounded-2xl"
          style={{ border: '1px solid rgba(216,222,227,0.06)' }}
        >
          {/* Table header */}
          <div
            className="grid grid-cols-[1fr_140px_80px_80px] gap-4 px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate/50"
            style={{ background: 'rgba(216,222,227,0.025)' }}
          >
            <span>Nome</span>
            <span>Tipo</span>
            <span>Obrigatório</span>
            <span className="text-right">Ações</span>
          </div>
          {fields.map((field, idx) => (
            <div
              key={field.id}
              className="grid grid-cols-[1fr_140px_80px_80px] items-center gap-4 px-5 py-3.5"
              style={{
                background: '#151A20',
                borderTop: idx > 0 ? '1px solid rgba(216,222,227,0.04)' : undefined,
              }}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-geyser">{field.label}</p>
                {field.group_name && field.group_name !== 'Informações Adicionais' && (
                  <p className="truncate text-xs text-slate/60">{field.group_name}</p>
                )}
              </div>
              <span
                className="w-fit rounded-full px-2.5 py-0.5 text-xs font-medium"
                style={{ background: 'rgba(216,222,227,0.07)', color: '#7B8793' }}
              >
                {FIELD_TYPE_LABELS[field.field_type]}
              </span>
              <span className="text-xs text-slate">
                {field.is_required ? (
                  <span style={{ color: '#c6f432' }}>Sim</span>
                ) : 'Não'}
              </span>
              <div className="flex items-center justify-end gap-1">
                {isAdmin && (
                  <>
                    <button
                      onClick={() => openEdit(field)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-slate transition-colors hover:text-geyser"
                      style={{ background: 'transparent' }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(216,222,227,0.06)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setDeleteTarget(field)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors"
                      style={{ background: 'transparent', color: '#7B8793' }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(239,68,68,0.10)'
                        e.currentTarget.style.color = '#f87171'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent'
                        e.currentTarget.style.color = '#7B8793'
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit dialog */}
      <Dialog open={dialogMode !== null} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <h2 className="text-base font-semibold text-geyser">
              {dialogMode === 'create' ? 'Novo campo personalizado' : 'Editar campo'}
            </h2>
            <p className="text-sm text-slate">
              {dialogMode === 'create'
                ? `Para ${ENTITY_TABS.find((t) => t.key === activeTab)?.label}`
                : `Editando "${editingField?.label}"`}
            </p>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            {/* Label */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cf-label">Nome do campo</Label>
              <Input
                id="cf-label"
                placeholder="ex: CNPJ, LinkedIn, Prioridade..."
                value={form.label}
                onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))}
              />
            </div>

            {/* Field type — only for create */}
            {dialogMode === 'create' && (
              <div className="flex flex-col gap-1.5">
                <Label>Tipo do campo</Label>
                <Select
                  value={form.fieldType}
                  onValueChange={(v) => v && setForm((p) => ({ ...p, fieldType: v as FieldType }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FIELD_TYPES.map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Options — only for select/multi_select */}
            {needsOptions && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cf-options">Opções (uma por linha)</Label>
                <textarea
                  id="cf-options"
                  rows={4}
                  placeholder={'Opção 1\nOpção 2\nOpção 3'}
                  value={form.options}
                  onChange={(e) => setForm((p) => ({ ...p, options: e.target.value }))}
                  className="w-full resize-none rounded-xl px-3 py-2.5 text-sm text-geyser outline-none placeholder:text-slate/40"
                  style={{
                    background: 'rgba(216,222,227,0.05)',
                    border: '1px solid rgba(216,222,227,0.10)',
                  }}
                />
              </div>
            )}

            {/* Group name */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cf-group">Grupo (opcional)</Label>
              <Input
                id="cf-group"
                placeholder="Informações Adicionais"
                value={form.groupName}
                onChange={(e) => setForm((p) => ({ ...p, groupName: e.target.value }))}
              />
            </div>

            {/* Required toggle */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-geyser">Campo obrigatório</p>
                <p className="text-xs text-slate">Impede salvar sem preencher este campo</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={form.isRequired}
                onClick={() => setForm((p) => ({ ...p, isRequired: !p.isRequired }))}
                className="relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-all duration-200"
                style={{
                  background: form.isRequired ? '#c6f432' : 'rgba(216,222,227,0.12)',
                  border: form.isRequired ? '1px solid rgba(198,244,50,0.4)' : '1px solid rgba(216,222,227,0.12)',
                }}
              >
                <span
                  className="inline-block h-3.5 w-3.5 transform rounded-full transition-transform duration-200"
                  style={{
                    background: form.isRequired ? '#0B0D11' : '#7B8793',
                    transform: form.isRequired ? 'translateX(18px)' : 'translateX(2px)',
                  }}
                />
              </button>
            </div>

            {/* Error */}
            {formError && (
              <div
                className="flex items-center gap-2 rounded-xl px-3 py-2.5"
                style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.16)' }}
              >
                <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
                <p className="text-sm text-red-400">{formError}</p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={closeDialog} disabled={isPending}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={isPending || !form.label.trim()}>
              {isPending ? 'Salvando...' : dialogMode === 'create' ? 'Criar campo' : 'Salvar alterações'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <h2 className="text-base font-semibold text-geyser">Remover campo</h2>
            <p className="text-sm text-slate">
              O campo <span className="font-medium text-geyser">&ldquo;{deleteTarget?.label}&rdquo;</span> será
              desativado. Os dados já preenchidos não serão perdidos.
            </p>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)} disabled={isPending}>
              Cancelar
            </Button>
            <Button
              onClick={handleDelete}
              disabled={isPending}
              style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.20)' }}
            >
              {isPending ? 'Removendo...' : 'Remover campo'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
