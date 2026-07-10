'use client'

import { useState, useTransition } from 'react'
import { Download, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { exportLeadsCSV } from '@/lib/actions/data'
import { getCompanyContext } from '@/hooks/useCompany'
import { logAudit } from '@/lib/auditLog'

export function DataExport() {
  const [isPending, startTransition] = useTransition()
  const [lastExport, setLastExport] = useState<{ count: number; at: Date } | null>(null)
  const [error, setError] = useState<string | null>(null)

  function handleExport() {
    setError(null)
    startTransition(async () => {
      const result = await exportLeadsCSV()
      if (result.error || result.csv === undefined) {
        setError(result.error ?? 'Erro ao exportar')
        return
      }
      const blob = new Blob([result.csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      setLastExport({ count: result.count, at: new Date() })

      const state = await getCompanyContext()
      if (state.company) {
        void logAudit({
          companyId: state.company.id,
          action: 'export',
          entityType: 'lead',
          entityLabel: `Leads CRM (${result.count})`,
          details: { page: 'crm/settings/data', count: result.count },
        })
      }
    })
  }

  return (
    <div
      className="flex flex-col gap-4 rounded-2xl p-5"
      style={{ background: '#151A20', border: '1px solid rgba(216,222,227,0.08)' }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg"
              style={{ background: 'rgba(216,222,227,0.06)' }}
            >
              <FileText className="h-4 w-4 text-slate" />
            </div>
            <span className="text-sm font-semibold text-geyser">Exportar Leads</span>
          </div>
          <p className="text-xs text-slate/60 mt-1">
            Baixe todos os seus leads como um arquivo CSV compatível com Excel e Google Sheets.
          </p>
          {lastExport && (
            <p className="text-xs text-slate/50 mt-1">
              Último export: {lastExport.count} lead{lastExport.count !== 1 ? 's' : ''} em{' '}
              {lastExport.at.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
          {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
        </div>
        <Button
          size="sm"
          onClick={handleExport}
          disabled={isPending}
          className="shrink-0 gap-1.5"
        >
          <Download className="h-3.5 w-3.5" />
          {isPending ? 'Exportando...' : 'Baixar CSV'}
        </Button>
      </div>

      <div
        className="rounded-lg px-3 py-2 text-xs text-slate/50"
        style={{ background: 'rgba(216,222,227,0.04)', border: '1px solid rgba(216,222,227,0.06)' }}
      >
        Campos exportados: nome, e-mail, telefone, empresa, cargo, status, anotações, origem, website, instagram, whatsapp
      </div>
    </div>
  )
}
