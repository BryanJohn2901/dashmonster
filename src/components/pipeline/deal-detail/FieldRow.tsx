'use client'

import React, { useState, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { Check, ExternalLink, Loader2, Mail, Phone, Trash2, X } from 'lucide-react'

interface FieldRowProps {
  label: string
  value: string | number | null | undefined
  onSave?: (value: string) => Promise<void>
  placeholder?: string
  type?: 'text' | 'number' | 'email' | 'url' | 'date' | 'textarea' | 'phone'
  hideIfEmpty?: boolean
  isEditingGlobal?: boolean
  readOnly?: boolean
  /** When provided, renders a hover-only delete control (used for custom fields). */
  onDelete?: () => void | Promise<void>
}

export function FieldRow({
  label,
  value,
  onSave,
  placeholder = 'Clique aqui para adicionar',
  type = 'text',
  hideIfEmpty = false,
  isEditingGlobal: _isEditingGlobal = false,
  readOnly = false,
  onDelete,
}: FieldRowProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(value?.toString() || '')
  const [isSaving, setIsSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isEditing])

  if (hideIfEmpty && !value && !isEditing) return null

  async function handleSave() {
    if (editValue === (value?.toString() || '')) {
      setIsEditing(false)
      return
    }

    setIsSaving(true)
    try {
      await onSave?.(editValue)
      setIsEditing(false)
    } catch (error) {
      console.error('Error saving field:', error)
    } finally {
      setIsSaving(false)
    }
  }

  function handleCancel() {
    setEditValue(value?.toString() || '')
    setIsEditing(false)
  }

  const displayValue = value?.toString() ?? ''
  const actionHref = type === 'url' && displayValue
    ? (displayValue.startsWith('http') ? displayValue : `https://${displayValue}`)
    : type === 'email' && displayValue
      ? `mailto:${displayValue}`
      : type === 'phone' && displayValue
        ? `tel:${displayValue.replace(/[^\d+]/g, '')}`
        : null
  const ActionIcon = type === 'email' ? Mail : type === 'phone' ? Phone : ExternalLink

  return (
    <div className={cn(
      "group flex items-center justify-between min-h-[40px] px-5 py-2 hover:bg-muted/5 transition-colors border-b border-border/5 last:border-0",
      isEditing && "bg-primary/5"
    )}>
      <div className="w-1/3 flex-shrink-0">
        <label className="text-[12px] font-medium text-muted-foreground/60">{label}</label>
      </div>

      <div className="flex-1 flex justify-end">
        {isEditing ? (
          <div className="flex w-full items-center gap-2">
            {type === 'textarea' ? (
              <textarea
                ref={inputRef as React.RefObject<HTMLTextAreaElement>}
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.ctrlKey) handleSave()
                  if (e.key === 'Escape') handleCancel()
                }}
                className="w-full bg-background border border-border/40 rounded-lg px-3 py-1.5 text-sm focus:border-primary/50 focus:outline-none min-h-[80px]"
              />
            ) : (
              <input
                ref={inputRef as React.RefObject<HTMLInputElement>}
                type={type}
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSave()
                  if (e.key === 'Escape') handleCancel()
                }}
                className="w-full bg-background border border-border/40 rounded-lg h-8 px-3 text-sm focus:border-primary/50 focus:outline-none text-right"
              />
            )}
            <div className="flex items-center gap-1">
              <button 
                onClick={handleSave} 
                disabled={isSaving}
                className="p-1.5 rounded-md bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-50"
              >
                {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              </button>
              <button 
                onClick={handleCancel}
                disabled={isSaving}
                className="p-1.5 rounded-md hover:bg-muted/20 text-muted-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ) : (
          <div className="flex min-w-0 items-center justify-end gap-2">
            <div
              onClick={() => { if (!readOnly && onSave) setIsEditing(true) }}
              className={cn(
                "min-w-0 max-w-full truncate text-right text-sm font-medium transition-colors",
                readOnly || !onSave ? "cursor-default" : "cursor-pointer",
                value ? "text-foreground" : "text-muted-foreground/30 italic group-hover:text-muted-foreground/60"
              )}
            >
              {value || placeholder}
            </div>
            {actionHref && (
              <a
                href={actionHref}
                target={type === 'url' ? '_blank' : undefined}
                rel={type === 'url' ? 'noreferrer' : undefined}
                onClick={(event) => event.stopPropagation()}
                className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-muted-foreground/60 transition-colors hover:bg-primary/10 hover:text-primary"
                title="Abrir"
              >
                <ActionIcon className="h-3.5 w-3.5" />
              </a>
            )}
            {onDelete && (
              <button
                onClick={(event) => { event.stopPropagation(); onDelete() }}
                className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-red-500/0 transition-colors group-hover:text-red-500/45 hover:bg-red-500/10 hover:!text-red-500"
                title="Excluir campo"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
