'use client'

import { useState, useTransition, useRef, useCallback } from 'react'
import { Upload, X, AlertCircle, CheckCircle2, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { importLeadsCSV } from '@/lib/actions/data'
import type { ParsedRow, ImportResult } from '@/lib/actions/data'

// ── CSV parser ───────────────────────────────────────────────────────────────

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  result.push(current.trim())
  return result
}

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  if (lines.length === 0) return { headers: [], rows: [] }
  return { headers: parseCSVLine(lines[0]), rows: lines.slice(1).map(parseCSVLine) }
}

// ── System fields ─────────────────────────────────────────────────────────────

const SYSTEM_FIELDS = [
  { value: '', label: 'Ignorar' },
  { value: 'name', label: 'Nome *' },
  { value: 'email', label: 'E-mail' },
  { value: 'phone', label: 'Telefone' },
  { value: 'company', label: 'Empresa' },
  { value: 'job_title', label: 'Cargo' },
  { value: 'status', label: 'Status' },
]

function autoMap(header: string): string {
  const h = header.toLowerCase()
  if (h === 'nome' || h === 'name') return 'name'
  if (h === 'email' || h === 'e-mail') return 'email'
  if (h === 'telefone' || h === 'phone' || h === 'tel') return 'phone'
  if (h === 'empresa' || h === 'company') return 'company'
  if (h === 'cargo' || h === 'job_title' || h === 'position') return 'job_title'
  if (h === 'status') return 'status'
  return ''
}

// ── Component ─────────────────────────────────────────────────────────────────

interface ParsedFile {
  headers: string[]
  rows: string[][]
  fileName: string
}

export function DataImport() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [parsed, setParsed] = useState<ParsedFile | null>(null)
  const [mapping, setMapping] = useState<Record<number, string>>({})
  const [parseError, setParseError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<ImportResult | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  function processFile(file: File) {
    setParseError(null)
    setResult(null)
    setImportError(null)
    if (!file.name.endsWith('.csv') && file.type !== 'text/csv') {
      setParseError('Por favor, selecione um arquivo CSV.')
      return
    }
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      const { headers, rows } = parseCSV(text)
      if (headers.length === 0) {
        setParseError('Arquivo vazio ou formato inválido.')
        return
      }
      const autoMapping: Record<number, string> = {}
      headers.forEach((h, i) => { autoMapping[i] = autoMap(h) })
      setParsed({ headers, rows, fileName: file.name })
      setMapping(autoMapping)
    }
    reader.readAsText(file, 'utf-8')
  }

  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }, [])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) processFile(file)
  }, [])

  function handleImport() {
    if (!parsed) return
    setImportError(null)
    startTransition(async () => {
      const rows: ParsedRow[] = parsed.rows.map((row) => {
        const built: Record<string, string> = {}
        Object.entries(mapping).forEach(([colIdx, field]) => {
          if (field && row[Number(colIdx)] !== undefined) {
            built[field] = row[Number(colIdx)]
          }
        })
        return built as unknown as ParsedRow
      })

      const res = await importLeadsCSV(rows)
      if (res.error) {
        setImportError(res.error)
        return
      }
      setResult(res.data!)
    })
  }

  function handleReset() {
    setParsed(null)
    setMapping({})
    setResult(null)
    setImportError(null)
    setParseError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function downloadErrorReport(errors: ImportResult['errors']) {
    const lines = ['linha,mensagem', ...errors.map((e) => `${e.row},"${e.message}"`)]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'erros-importacao.csv'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div
      className="flex flex-col gap-5 rounded-2xl p-5"
      style={{ background: '#151A20', border: '1px solid rgba(216,222,227,0.08)' }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-lg"
            style={{ background: 'rgba(216,222,227,0.06)' }}
          >
            <Upload className="h-4 w-4 text-slate" />
          </div>
          <span className="text-sm font-semibold text-geyser">Importar Leads</span>
        </div>
        {parsed && (
          <button onClick={handleReset} className="text-slate hover:text-geyser transition-colors">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Result */}
      {result && (
        <div
          className="flex flex-col gap-3 rounded-xl p-4"
          style={{ background: 'rgba(74,222,128,0.06)', border: '1px solid rgba(74,222,128,0.15)' }}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-400" />
            <span className="text-sm font-semibold text-green-400">Importação concluída</span>
          </div>
          <div className="flex gap-4 text-sm text-slate">
            <span>
              <span className="font-semibold text-geyser">{result.imported}</span> importado{result.imported !== 1 ? 's' : ''}
            </span>
            {result.skipped > 0 && (
              <span>
                <span className="font-semibold text-geyser">{result.skipped}</span> ignorado{result.skipped !== 1 ? 's' : ''} (duplicados)
              </span>
            )}
            {result.errors.length > 0 && (
              <span>
                <span className="font-semibold text-red-400">{result.errors.length}</span> erro{result.errors.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          {result.errors.length > 0 && (
            <button
              onClick={() => downloadErrorReport(result.errors)}
              className="flex items-center gap-1.5 text-xs text-slate hover:text-geyser transition-colors w-fit"
            >
              <Download className="h-3 w-3" />
              Baixar relatório de erros
            </button>
          )}
        </div>
      )}

      {!parsed && !result && (
        <>
          {/* Drop zone */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className="flex flex-col items-center justify-center gap-3 rounded-xl py-10 cursor-pointer transition-all"
            style={{
              border: `1px dashed ${dragging ? 'rgba(216,222,227,0.30)' : 'rgba(216,222,227,0.12)'}`,
              background: dragging ? 'rgba(216,222,227,0.04)' : 'transparent',
            }}
          >
            <div
              className="flex h-10 w-10 items-center justify-center rounded-xl"
              style={{ background: 'rgba(216,222,227,0.06)', border: '1px solid rgba(216,222,227,0.08)' }}
            >
              <Upload className="h-5 w-5 text-slate/60" />
            </div>
            <div className="flex flex-col items-center gap-0.5 text-center">
              <p className="text-sm text-slate">Arraste um arquivo CSV ou clique para selecionar</p>
              <p className="text-xs text-slate/50">Máximo de 500 leads por importação</p>
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={onFileChange}
          />
          {parseError && (
            <div className="flex items-center gap-2 text-sm text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {parseError}
            </div>
          )}
          <p className="text-xs text-slate/40">
            Dica: use o modelo de exportação para garantir o formato correto.
          </p>
        </>
      )}

      {/* Mapping + preview */}
      {parsed && !result && (
        <div className="flex flex-col gap-4">
          <p className="text-xs text-slate/60">
            Arquivo: <span className="text-geyser">{parsed.fileName}</span> — {parsed.rows.length} linha{parsed.rows.length !== 1 ? 's' : ''}
          </p>

          {/* Column mapping */}
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-slate">Mapeamento de colunas</p>
            <div className="grid grid-cols-2 gap-2">
              {parsed.headers.map((header, colIdx) => (
                <div key={colIdx} className="flex items-center gap-2">
                  <span
                    className="truncate text-xs text-slate/70 w-28 shrink-0"
                    title={header}
                  >
                    {header || `Coluna ${colIdx + 1}`}
                  </span>
                  <span className="text-slate/30 text-xs">→</span>
                  <select
                    value={mapping[colIdx] ?? ''}
                    onChange={(e) => setMapping((prev) => ({ ...prev, [colIdx]: e.target.value }))}
                    className="flex-1 rounded-lg px-2 py-1 text-xs text-geyser focus:outline-none focus:ring-1 focus:ring-white/10"
                    style={{ background: '#1C2128', border: '1px solid rgba(216,222,227,0.10)' }}
                  >
                    {SYSTEM_FIELDS.map((f) => (
                      <option key={f.value} value={f.value}>{f.label}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          {/* Preview */}
          {parsed.rows.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium text-slate">Prévia (primeiras 5 linhas)</p>
              <div className="overflow-x-auto rounded-lg" style={{ border: '1px solid rgba(216,222,227,0.08)' }}>
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ background: 'rgba(216,222,227,0.04)', borderBottom: '1px solid rgba(216,222,227,0.08)' }}>
                      {parsed.headers.map((h, i) => (
                        <th key={i} className="px-3 py-2 text-left font-medium text-slate/60 whitespace-nowrap">
                          {h || `Coluna ${i + 1}`}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.rows.slice(0, 5).map((row, ri) => (
                      <tr key={ri} style={{ borderBottom: ri < 4 && ri < parsed.rows.slice(0, 5).length - 1 ? '1px solid rgba(216,222,227,0.05)' : 'none' }}>
                        {parsed.headers.map((_, ci) => (
                          <td key={ci} className="px-3 py-2 text-slate/80 whitespace-nowrap max-w-[160px] truncate">
                            {row[ci] ?? ''}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {parsed.rows.length > 5 && (
                <p className="text-xs text-slate/40">
                  +{parsed.rows.length - 5} linha{parsed.rows.length - 5 !== 1 ? 's' : ''} não exibidas
                </p>
              )}
            </div>
          )}

          {importError && (
            <div className="flex items-center gap-2 text-sm text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {importError}
            </div>
          )}

          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={handleReset} disabled={isPending}>
              Cancelar
            </Button>
            <Button size="sm" onClick={handleImport} disabled={isPending}>
              {isPending ? 'Importando...' : `Importar ${parsed.rows.length} lead${parsed.rows.length !== 1 ? 's' : ''}`}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
