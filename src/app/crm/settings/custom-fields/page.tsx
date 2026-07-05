'use client'

// Port fiel de app/(app)/settings/custom-fields/page.tsx (era RSC; aqui client).

import { useEffect, useState } from 'react'
import { CrmShell } from '@/components/crm/CrmShell'
import { settingsGetCustomFields } from '@/lib/actions/custom-fields'
import { CustomFieldsManager } from '@/components/settings/CustomFieldsManager'
import type { CustomFieldDefinition, CustomFieldEntity } from '@/types/supabase'

const ENTITY_TYPES: CustomFieldEntity[] = ['contact', 'company', 'deal']

export default function CustomFieldsSettingsPage() {
  return <CrmShell>{({ canWrite }) => <Content isAdmin={canWrite} />}</CrmShell>
}

function Content({ isAdmin }: { isAdmin: boolean }) {
  const [fields, setFields] = useState<Record<CustomFieldEntity, CustomFieldDefinition[]> | null>(null)

  useEffect(() => {
    void Promise.all(ENTITY_TYPES.map((e) => settingsGetCustomFields(e)))
      .then(([contact, company, deal]) => setFields({ contact, company, deal }))
      .catch(() => setFields({ contact: [], company: [], deal: [] }))
  }, [])

  if (!fields) return null

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[20px] font-semibold tracking-[-0.02em] text-[#F7F9FA]">
          Campos Personalizados
        </h1>
        <p className="mt-1 text-sm text-slate">
          Adicione campos extras a Contatos, Empresas e Negócios para capturar informações específicas do seu processo comercial.
        </p>
      </div>

      <CustomFieldsManager fieldsByEntity={fields} isAdmin={isAdmin} />
    </div>
  )
}
