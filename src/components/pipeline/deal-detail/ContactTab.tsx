'use client'

import { useEffect, useState } from 'react'
import { Link2, Loader2, Plus, UserRound } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TabHeader } from './TabHeader'
import { CollapsibleSection } from './CollapsibleSection'
import { FieldRow } from './FieldRow'
import { CustomFieldsInline } from './CustomFieldsInline'
import { FieldsSkeleton } from './FieldsSkeleton'
import type { Contact, CustomFieldDefinition, CustomFieldValue } from '@/types/supabase'
import { updateContact, type ContactOption } from '@/lib/actions/contacts'
import { upsertCustomFieldValue } from '@/lib/actions/custom-fields'
import { formatDate } from '@/lib/utils/formatters'

interface ContactTabProps {
  contact: Contact | null
  contactOptions: ContactOption[]
  customFields: CustomFieldDefinition[]
  fieldValues: CustomFieldValue[]
  expectsContact?: boolean
  suggestedName: string
  suggestedCompanyName?: string | null
  onRefresh: () => void
  onManageFields: () => void
  onCreateContact: (input: { name: string; email?: string; phone?: string; company?: string; instagram?: string; google_business?: string }) => Promise<void>
  onLinkContact: (contactId: string) => Promise<void>
  onContactUpdated: (contact: Contact) => void
}

export function ContactTab({
  contact,
  contactOptions,
  customFields,
  fieldValues,
  expectsContact = false,
  suggestedName,
  suggestedCompanyName,
  onRefresh,
  onManageFields,
  onCreateContact,
  onLinkContact,
  onContactUpdated,
}: ContactTabProps) {
  const [hideEmpty, setHideEmpty] = useState(false)
  const [selectedContactId, setSelectedContactId] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [isLinking, setIsLinking] = useState(false)
  const [draft, setDraft] = useState({
    name: suggestedName,
    email: '',
    phone: '',
    company: suggestedCompanyName ?? '',
    instagram: '',
    google_business: '',
  })

  useEffect(() => {
    if (!contact) {
      setDraft((prev) => ({
        ...prev,
        name: prev.name || suggestedName,
        company: prev.company || suggestedCompanyName || '',
      }))
    }
  }, [contact, suggestedName, suggestedCompanyName])

  async function handleCreateContact() {
    if (!draft.name.trim()) {
      toast.error('Informe o nome do contato.')
      return
    }

    setIsCreating(true)
    try {
      await onCreateContact({
        name: draft.name.trim(),
        email: draft.email.trim() || undefined,
        phone: draft.phone.trim() || undefined,
        company: draft.company.trim() || undefined,
        instagram: draft.instagram.trim() || undefined,
        google_business: draft.google_business.trim() || undefined,
      })
      setDraft({ name: '', email: '', phone: '', company: '', instagram: '', google_business: '' })
    } finally {
      setIsCreating(false)
    }
  }

  async function handleLinkContact() {
    if (!selectedContactId) {
      toast.error('Selecione um contato.')
      return
    }

    setIsLinking(true)
    try {
      await onLinkContact(selectedContactId)
      setSelectedContactId('')
    } finally {
      setIsLinking(false)
    }
  }

  // The deal references a contact (lead_id set) but it isn't in state yet — it's
  // loading. Show a skeleton instead of flashing the "create/link" empty state.
  // A deleted contact also clears the deal's lead_id, so expectsContact && !contact
  // unambiguously means "in flight", not "missing".
  if (!contact && expectsContact) {
    return <FieldsSkeleton title="Campos de contato" />
  }

  if (!contact) {
    return (
      <div className="flex h-full flex-col bg-background">
        <div className="border-b border-border/30 px-8 py-5">
          <h3 className="text-sm font-bold text-foreground">Contato do negócio</h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground/60">
            Crie um contato ou vincule um contato existente para liberar mensagens, histórico e dados comerciais.
          </p>
        </div>

        <div className="grid flex-1 gap-5 overflow-y-auto p-8 lg:grid-cols-2">
          <section className="rounded-2xl border border-border/30 bg-card/35 p-5">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
                <Plus className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-foreground">Criar contato</h4>
                <p className="text-xs text-muted-foreground/60">O contato será vinculado a este negócio.</p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground/70">Nome *</label>
                <Input
                  value={draft.name}
                  onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder="Nome do contato"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground/70">E-mail</label>
                <Input
                  value={draft.email}
                  onChange={(event) => setDraft((prev) => ({ ...prev, email: event.target.value }))}
                  placeholder="email@empresa.com"
                  type="email"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground/70">Telefone</label>
                <Input
                  value={draft.phone}
                  onChange={(event) => setDraft((prev) => ({ ...prev, phone: event.target.value }))}
                  placeholder="+55 41 99999-9999"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground/70">Empresa</label>
                <Input
                  value={draft.company}
                  onChange={(event) => setDraft((prev) => ({ ...prev, company: event.target.value }))}
                  placeholder="Empresa do contato"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground/70">Instagram</label>
                <Input
                  value={draft.instagram}
                  onChange={(event) => setDraft((prev) => ({ ...prev, instagram: event.target.value }))}
                  placeholder="@perfil ou link do Instagram"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground/70">Google Meu Negócio</label>
                <Input
                  value={draft.google_business}
                  onChange={(event) => setDraft((prev) => ({ ...prev, google_business: event.target.value }))}
                  placeholder="Link do perfil no Google Meu Negócio"
                />
              </div>
            </div>

            <Button onClick={handleCreateContact} disabled={isCreating} className="mt-5 w-full">
              {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Criar e vincular contato
            </Button>
          </section>

          <section className="rounded-2xl border border-border/30 bg-card/35 p-5">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted/50 text-muted-foreground">
                <Link2 className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-foreground">Vincular existente</h4>
                <p className="text-xs text-muted-foreground/60">Use um contato já cadastrado no workspace.</p>
              </div>
            </div>

            {contactOptions.length > 0 ? (
              <div className="space-y-3">
                <select
                  value={selectedContactId}
                  onChange={(event) => setSelectedContactId(event.target.value)}
                  className="h-11 w-full rounded-xl border border-border/40 bg-background px-3 text-sm font-medium text-foreground outline-none focus:border-primary/50"
                >
                  <option value="">Selecione um contato</option>
                  {contactOptions.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                      {item.email ? ` - ${item.email}` : ''}
                    </option>
                  ))}
                </select>

                <Button
                  type="button"
                  variant="outline"
                  onClick={handleLinkContact}
                  disabled={isLinking}
                  className="w-full"
                >
                  {isLinking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                  Vincular contato
                </Button>
              </div>
            ) : (
              <div className="flex min-h-[220px] flex-col items-center justify-center rounded-2xl border border-dashed border-border/30 p-6 text-center">
                <UserRound className="mb-3 h-9 w-9 text-muted-foreground/25" />
                <p className="text-sm font-semibold text-foreground">Nenhum contato encontrado</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground/60">
                  Crie o primeiro contato pelo formulário ao lado.
                </p>
              </div>
            )}
          </section>
        </div>
      </div>
    )
  }

  async function handleUpdateField(key: keyof Contact, value: string) {
    const res = await updateContact(contact!.id, { [key]: value })
    if (res.error) {
      toast.error(res.error)
      throw new Error(res.error)
    }
    if (res.data) onContactUpdated(res.data)
    toast.success('Contato atualizado')
    onRefresh()
  }

  async function handleUpdateCustomField(fieldId: string, value: string) {
    const res = await upsertCustomFieldValue(fieldId, contact!.id, value)
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
        title="Campos de contato"
        hideEmpty={hideEmpty}
        onToggleHideEmpty={() => setHideEmpty(!hideEmpty)}
        onManageFields={onManageFields}
      />

      <div className="flex-1 overflow-y-auto scrollbar-none">
        <CollapsibleSection title="Informações Gerais">
          <FieldRow label="Nome" value={contact.name} onSave={(value) => handleUpdateField('name', value)} hideIfEmpty={hideEmpty} />
          <FieldRow label="E-mail" value={contact.email} onSave={(value) => handleUpdateField('email', value)} type="email" hideIfEmpty={hideEmpty} />
          <FieldRow label="Telefone" value={contact.phone} onSave={(value) => handleUpdateField('phone', value)} type="phone" hideIfEmpty={hideEmpty} />
          <FieldRow label="WhatsApp" value={contact.whatsapp} onSave={(value) => handleUpdateField('whatsapp', value)} type="phone" hideIfEmpty={hideEmpty} />
          <FieldRow label="Instagram" value={contact.instagram} onSave={(value) => handleUpdateField('instagram', value)} type="url" hideIfEmpty={hideEmpty} />
          <FieldRow label="Google Meu Negócio" value={contact.google_business} onSave={(value) => handleUpdateField('google_business', value)} type="url" hideIfEmpty={hideEmpty} />
          <FieldRow label="Site" value={contact.website} onSave={(value) => handleUpdateField('website', value)} type="url" hideIfEmpty={hideEmpty} />
          <FieldRow label="Cargo" value={contact.job_title} onSave={(value) => handleUpdateField('job_title', value)} hideIfEmpty={hideEmpty} />
          <FieldRow label="Data de Nascimento" value={contact.birthdate} onSave={(value) => handleUpdateField('birthdate', value)} type="date" hideIfEmpty={hideEmpty} />
          <FieldRow label="Notas" value={contact.notes} onSave={(value) => handleUpdateField('notes', value)} type="textarea" hideIfEmpty={hideEmpty} />
          <FieldRow label="Origem" value={contact.origin} onSave={(value) => handleUpdateField('origin', value)} hideIfEmpty={hideEmpty} />
          <FieldRow label="UTM Source" value={contact.utm_source} onSave={(value) => handleUpdateField('utm_source', value)} hideIfEmpty={hideEmpty} />
          <FieldRow label="UTM Medium" value={contact.utm_medium} onSave={(value) => handleUpdateField('utm_medium', value)} hideIfEmpty={hideEmpty} />
          <FieldRow label="UTM Campaign" value={contact.utm_campaign} onSave={(value) => handleUpdateField('utm_campaign', value)} hideIfEmpty={hideEmpty} />
          <FieldRow label="UTM Term" value={contact.utm_term} onSave={(value) => handleUpdateField('utm_term', value)} hideIfEmpty={hideEmpty} />
          <FieldRow label="UTM Content" value={contact.utm_content} onSave={(value) => handleUpdateField('utm_content', value)} hideIfEmpty={hideEmpty} />
          <FieldRow label="UTM Track" value={contact.utm_track} onSave={(value) => handleUpdateField('utm_track', value)} hideIfEmpty={hideEmpty} />
          <FieldRow label="Data de Criação" value={formatDate(contact.created_at)} readOnly hideIfEmpty={hideEmpty} />
        </CollapsibleSection>

        <CustomFieldsInline
          entityType="contact"
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
