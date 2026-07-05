'use client'

import { useState } from 'react'
import { Clock, MessageSquare, PlusCircle } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { DealHistory } from '@/types/supabase'
import { addHistoryNote } from '@/lib/actions/history'
import { toast } from 'sonner'

interface NotesTabProps {
  dealId: string
  history: DealHistory[]
  onRefresh: () => void
}

export function NotesTab({ dealId, history, onRefresh }: NotesTabProps) {
  const [note, setNote] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const notes = history.filter((event) => event.event_type === 'note_added')

  async function handleAddNote() {
    if (!note.trim()) return

    setIsSaving(true)
    try {
      const res = await addHistoryNote(dealId, note.trim())
      if (res.error) throw new Error(res.error)
      setNote('')
      toast.success('Nota adicionada')
      onRefresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro desconhecido')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="border-b border-border/10 bg-primary/5 px-6 py-4">
        <h3 className="text-[13px] font-bold uppercase tracking-widest text-primary/80">Notas</h3>
        <p className="mt-1 text-xs text-muted-foreground/55">
          Registre contexto comercial, próximos combinados e observações importantes.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-6 scrollbar-none">
        <div className="mb-6 rounded-2xl border border-primary/20 bg-primary/5 p-4">
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Adicionar uma nota para o time..."
            className="min-h-[92px] w-full resize-none border-none bg-transparent text-sm leading-6 text-foreground outline-none placeholder:text-primary/30 focus:ring-0"
          />
          <div className="mt-3 flex justify-end">
            <button
              onClick={handleAddNote}
              disabled={isSaving || !note.trim()}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-[11px] font-bold text-white transition-all hover:bg-primary/90 disabled:opacity-50"
            >
              <PlusCircle className="h-3.5 w-3.5" />
              {isSaving ? 'Salvando...' : 'Adicionar nota'}
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {notes.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/20 px-6 py-12 text-center">
              <MessageSquare className="mb-3 h-9 w-9 text-muted-foreground/20" />
              <p className="text-sm font-medium text-muted-foreground/60">Nenhuma nota registrada.</p>
            </div>
          ) : (
            notes.map((event) => (
              <article key={event.id} className="rounded-2xl border border-border/10 bg-card/40 p-4">
                <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold text-muted-foreground/60">
                  <Clock className="h-3 w-3" />
                  {formatDistanceToNow(new Date(event.created_at), { addSuffix: true, locale: ptBR })}
                </div>
                <p className="whitespace-pre-wrap text-sm leading-6 text-foreground/80">{event.details}</p>
              </article>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
