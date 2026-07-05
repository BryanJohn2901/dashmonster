'use client'

// Port fiel de app/(app)/settings/data/page.tsx.

import { CrmShell } from '@/components/crm/CrmShell'
import { DataExport } from '@/components/settings/DataExport'
import { DataImport } from '@/components/settings/DataImport'

export default function DataSettingsPage() {
  return (
    <CrmShell>
      {() => (
        <div className="flex flex-col gap-6">
          <div>
            <h1 className="text-[20px] font-semibold tracking-[-0.02em] text-[#F7F9FA]">
              Importar / Exportar
            </h1>
            <p className="mt-1 text-sm text-slate">
              Exporte seus leads para CSV ou importe leads a partir de uma planilha.
            </p>
          </div>

          <div className="flex flex-col gap-4">
            <DataExport />
            <DataImport />
          </div>
        </div>
      )}
    </CrmShell>
  )
}
