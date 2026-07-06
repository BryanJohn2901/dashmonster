'use client'

import { useState, useTransition } from 'react'
import { Plus, Pencil, Trash2, Tag } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createTag, updateTag, deleteTag } from '@/lib/actions/tags'
import type { TagWithCount } from '@/lib/actions/tags'

const PRESET_COLORS = [
  '#f87171', // red
  '#fb923c', // orange
  '#fbbf24', // amber
  '#c6f432', // canary
  '#4ade80', // green
  '#34d399', // emerald
  '#22d3ee', // cyan
  '#60a5fa', // blue
  '#818cf8', // indigo
  '#a78bfa', // violet
  '#e879f9', // fuchsia
  '#94a3b8', // slate
]

interface Props {
  initialTags: TagWithCount[]
  isAdmin: boolean
}

export function TagsManager({ initialTags, isAdmin }: Props) {
  const [tags, setTags] = useState<TagWithCount[]>(initialTags)
  const [dialogMode, setDialogMode] = useState<'create' | 'edit' | null>(null)
  const [editingTag, setEditingTag] = useState<TagWithCount | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<TagWithCount | null>(null)
  const [name, setName] = useState('')
  const [color, setColor] = useState(PRESET_COLORS[0])
  const [formError, setFormError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function openCreate() {
    setName('')
    setColor(PRESET_COLORS[0])
    setFormError(null)
    setDialogMode('create')
  }

  function openEdit(tag: TagWithCount) {
    setEditingTag(tag)
    setName(tag.name)
    setColor(tag.color ?? PRESET_COLORS[0])
    setFormError(null)
    setDialogMode('edit')
  }

  function closeDialog() {
    setDialogMode(null)
    setEditingTag(null)
    setFormError(null)
  }

  function handleSubmit() {
    setFormError(null)
    startTransition(async () => {
      if (dialogMode === 'create') {
        const result = await createTag({ name, color })
        if (result.error) { setFormError(result.error); return }
        if (result.data) {
          setTags((prev) => [...prev, { ...result.data!, usageCount: 0 }])
        }
      } else if (dialogMode === 'edit' && editingTag) {
        const result = await updateTag(editingTag.id, { name, color })
        if (result.error) { setFormError(result.error); return }
        setTags((prev) => prev.map((t) =>
          t.id === editingTag.id ? { ...t, name, color } : t
        ))
      }
      closeDialog()
    })
  }

  function handleDelete() {
    if (!deleteTarget) return
    const target = deleteTarget
    setDeleteTarget(null)
    startTransition(async () => {
      await deleteTag(target.id)
      setTags((prev) => prev.filter((t) => t.id !== target.id))
    })
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate">
          {tags.length === 0 ? 'Nenhuma tag criada ainda.' : `${tags.length} tag${tags.length !== 1 ? 's' : ''}`}
        </p>
        {isAdmin && (
          <Button size="sm" onClick={openCreate} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            Nova tag
          </Button>
        )}
      </div>

      {/* Empty state */}
      {tags.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center gap-3 rounded-2xl py-16"
          style={{ background: '#151A20', border: '1px dashed rgba(216,222,227,0.10)' }}
        >
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl"
            style={{ background: 'rgba(216,222,227,0.05)', border: '1px solid rgba(216,222,227,0.08)' }}
          >
            <Tag className="h-5 w-5 text-slate/40" />
          </div>
          <p className="text-sm text-slate">Nenhuma tag criada</p>
          <p className="text-xs text-slate/50 text-center max-w-xs">
            Use tags para categorizar leads e negócios e facilitar a filtragem.
          </p>
          {isAdmin && (
            <Button size="sm" variant="outline" onClick={openCreate} className="gap-1.5 mt-1">
              <Plus className="h-3.5 w-3.5" />
              Criar primeira tag
            </Button>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap gap-3">
          {tags.map((tag) => (
            <div
              key={tag.id}
              className="group flex items-center gap-2 rounded-full px-3 py-1.5 transition-all"
              style={{
                background: `${tag.color}18`,
                border: `1px solid ${tag.color}40`,
              }}
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: tag.color }}
              />
              <span className="text-sm font-medium text-geyser">{tag.name}</span>
              {tag.usageCount > 0 && (
                <span
                  className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none"
                  style={{ background: 'rgba(216,222,227,0.08)', color: '#7B8793' }}
                >
                  {tag.usageCount}
                </span>
              )}
              {isAdmin && (
                <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    onClick={() => openEdit(tag)}
                    className="flex h-5 w-5 items-center justify-center rounded-full text-slate hover:text-geyser transition-colors"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => setDeleteTarget(tag)}
                    className="flex h-5 w-5 items-center justify-center rounded-full text-slate transition-colors hover:text-red-400"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit dialog */}
      <Dialog open={dialogMode !== null} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <h2 className="text-base font-semibold text-geyser">
              {dialogMode === 'create' ? 'Nova tag' : 'Editar tag'}
            </h2>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tag-name">Nome</Label>
              <Input
                id="tag-name"
                placeholder="ex: VIP, Urgente, Cliente Antigo..."
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label>Cor</Label>
              <div className="flex flex-wrap gap-2">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className="h-7 w-7 rounded-full transition-all duration-150"
                    style={{
                      background: c,
                      outline: color === c ? `2px solid ${c}` : 'none',
                      outlineOffset: '2px',
                      transform: color === c ? 'scale(1.15)' : 'scale(1)',
                    }}
                  />
                ))}
              </div>

              {/* Preview */}
              <div className="mt-1 flex items-center gap-2">
                <div
                  className="flex items-center gap-2 rounded-full px-3 py-1"
                  style={{ background: `${color}18`, border: `1px solid ${color}40` }}
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: color }} />
                  <span className="text-sm font-medium text-geyser">{name || 'Prévia'}</span>
                </div>
              </div>
            </div>

            {formError && (
              <p className="text-sm text-red-400">{formError}</p>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={closeDialog} disabled={isPending}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={isPending || !name.trim()}>
              {isPending ? 'Salvando...' : dialogMode === 'create' ? 'Criar tag' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <h2 className="text-base font-semibold text-geyser">Excluir tag</h2>
            <p className="text-sm text-slate">
              {deleteTarget?.usageCount && deleteTarget.usageCount > 0 ? (
                <>
                  A tag <span className="font-medium text-geyser">&ldquo;{deleteTarget?.name}&rdquo;</span> está
                  em uso em <span className="font-medium text-geyser">{deleteTarget.usageCount}</span> registro{deleteTarget.usageCount !== 1 ? 's' : ''}.
                  Ao excluir, será removida de todos eles.
                </>
              ) : (
                <>Tem certeza que deseja excluir <span className="font-medium text-geyser">&ldquo;{deleteTarget?.name}&rdquo;</span>?</>
              )}
            </p>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)} disabled={isPending}>Cancelar</Button>
            <Button
              onClick={handleDelete}
              disabled={isPending}
              style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.20)' }}
            >
              {isPending ? 'Excluindo...' : 'Excluir tag'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
