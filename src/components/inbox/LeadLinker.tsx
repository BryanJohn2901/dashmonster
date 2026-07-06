'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  Phone,
  Mail,
  ExternalLink,
  MessageCircle,
  Loader2,
  User,
  ChevronRight,
  ChevronDown,
  Building2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createInboxContact, type Conversation } from '@/lib/actions/inbox'
import { getDealForPanel, updateDeal, type DealPanelData } from '@/lib/actions/deals'
import { getPipelines, type PipelineWithStages } from '@/lib/actions/pipelines'
import { cn } from '@/lib/utils/cn'
import { formatCurrency } from '@/lib/utils/formatters'

interface LeadLinkerProps {
  conversation: Conversation
  onLinked: (leadId: string, dealId?: string) => void
}

type SectionKey = 'contato' | 'negocio' | 'historico' | 'conversas'

const SECTIONS: { key: SectionKey; label: string }[] = [
  { key: 'contato',   label: 'Contato' },
  { key: 'negocio',   label: 'Negócio' },
  { key: 'historico', label: 'Histórico' },
  { key: 'conversas', label: 'Conversas' },
]

export function LeadLinker({ conversation, onLinked }: LeadLinkerProps) {
  const [loading, setLoading] = useState(false)
  const [name, setName] = useState(conversation.contact_name || '')
  const [pipelines, setPipelines] = useState<PipelineWithStages[]>([])
  const [selectedPipelineId, setSelectedPipelineId] = useState('')
  const [selectedStageId, setSelectedStageId] = useState('')
  const [dealData, setDealData] = useState<DealPanelData | null>(null)
  const [dealLoading, setDealLoading] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  // "Contato" aberto por padrão
  const [openSection, setOpenSection] = useState<SectionKey | null>('contato')

  useEffect(() => {
    if (conversation.lead_id) return
    getPipelines()
      .then((data) => {
        setPipelines(data)
        if (data.length > 0) {
          setSelectedPipelineId(data[0].id)
          const first = data[0].stages.find(s => s.status_kind === 'open') ?? data[0].stages[0]
          if (first) setSelectedStageId(first.id)
        }
      })
      .catch(() => {})
  }, [conversation.lead_id])

  const handlePipelineChange = (pipelineId: string) => {
    setSelectedPipelineId(pipelineId)
    const pipeline = pipelines.find(p => p.id === pipelineId)
    const first = pipeline?.stages.find(s => s.status_kind === 'open') ?? pipeline?.stages[0]
    setSelectedStageId(first?.id ?? '')
  }

  useEffect(() => {
    if (!conversation.deal_id) {
      setDealData(null)
      return
    }
    setDealLoading(true)
    getDealForPanel(conversation.deal_id)
      .then(d => setDealData(d))
      .catch(() => {})
      .finally(() => setDealLoading(false))
  }, [conversation.deal_id])

  const toggleSection = (s: SectionKey) =>
    setOpenSection(prev => (prev === s ? null : s))

  const handleStatusChange = async (status: 'open' | 'won' | 'lost') => {
    if (!conversation.deal_id || updatingStatus || dealData?.status === status) return
    setUpdatingStatus(true)
    const prev = dealData
    setDealData(d => (d ? { ...d, status } : d))
    const res = await updateDeal(conversation.deal_id, { status })
    if (res.error) {
      toast.error(res.error)
      setDealData(prev)
    }
    setUpdatingStatus(false)
  }

  const handleCreate = async () => {
    if (!name.trim()) return toast.error('Nome do contato é obrigatório')
    if (!selectedPipelineId) return toast.error('Selecione um funil')
    if (!selectedStageId) return toast.error('Selecione uma etapa')
    setLoading(true)
    try {
      const res = await createInboxContact({
        conversationId: conversation.id,
        name: name.trim(),
        phone: conversation.provider_thread_id,
        pipelineId: selectedPipelineId,
        stageId: selectedStageId,
      })
      if (res.error) throw new Error(res.error)
      toast.success('Lead e negócio criados!')
      onLinked(res.leadId!, res.dealId)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  const selectedPipeline = pipelines.find(p => p.id === selectedPipelineId)
  const stages = selectedPipeline?.stages ?? []

  // No lead linked — show creation form
  if (!conversation.lead_id) {
    return (
      <div className="flex flex-col h-full border-l border-white/5 bg-[#0e1015]">
        <div className="p-5 border-b border-white/5">
          <div className="flex items-center gap-2 text-yellow-400 mb-1.5">
            <User className="w-4 h-4" />
            <span className="text-[14px] font-semibold">Novo Contato</span>
          </div>
          <p className="text-[13px] text-gray-500">Crie o lead e escolha em qual funil o negócio será registrado.</p>
        </div>
        <div className="p-5 space-y-4">
          <div className="space-y-2">
            <Label className="text-[12px] text-gray-500 uppercase tracking-wider font-semibold">Nome</Label>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              className="bg-white/[0.03] border-white/10 text-[14px] h-10"
              placeholder="Ex: João Silva"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-[12px] text-gray-500 uppercase tracking-wider font-semibold">Identificador</Label>
            <div className="flex items-center gap-2 px-3 h-10 bg-white/5 border border-white/10 rounded-lg text-[13px] text-gray-400">
              <Phone className="w-3.5 h-3.5 text-gray-600 flex-shrink-0" />
              <span className="truncate">{conversation.provider_thread_id}</span>
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-[12px] text-gray-500 uppercase tracking-wider font-semibold">Funil</Label>
            {pipelines.length === 0 ? (
              <div className="flex items-center gap-2 h-10 px-3 bg-white/5 border border-white/10 rounded-lg text-[13px] text-gray-500">
                <Loader2 className="w-3 h-3 animate-spin" /> Carregando...
              </div>
            ) : (
              <div className="relative">
                <select
                  value={selectedPipelineId}
                  onChange={e => handlePipelineChange(e.target.value)}
                  className="w-full h-10 appearance-none bg-[#0B0D11] border border-white/10 rounded-lg px-3 pr-8 text-[14px] text-gray-200 focus:outline-none focus:border-white/20"
                >
                  {pipelines.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none" />
              </div>
            )}
          </div>
          {stages.length > 0 && (
            <div className="space-y-2">
              <Label className="text-[12px] text-gray-500 uppercase tracking-wider font-semibold">Etapa</Label>
              <div className="relative">
                <select
                  value={selectedStageId}
                  onChange={e => setSelectedStageId(e.target.value)}
                  className="w-full h-10 appearance-none bg-[#0B0D11] border border-white/10 rounded-lg px-3 pr-8 text-[14px] text-gray-200 focus:outline-none focus:border-white/20"
                >
                  {stages.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none" />
              </div>
            </div>
          )}
          <Button
            onClick={handleCreate}
            disabled={loading || !name.trim() || !selectedPipelineId || !selectedStageId}
            className="w-full h-10 text-[14px] mt-2"
          >
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" />}
            {loading ? 'Salvando...' : 'Criar Lead e Negócio'}
          </Button>
        </div>
      </div>
    )
  }

  const phone = conversation.provider_thread_id
  const providerLabel = conversation.provider.includes('whatsapp') ? 'WhatsApp' : 'Instagram'
  const isWhatsApp = conversation.provider.includes('whatsapp')

  return (
    <div className="flex flex-col h-full border-l border-white/5 bg-[#0e1015] overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">

      {/* ── Contact header ── */}
      <div className="p-5 border-b border-white/[0.07]">
        {/* Avatar + name */}
        <div className="flex items-center gap-3.5 mb-4">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center flex-shrink-0 overflow-hidden ring-1 ring-white/10">
            {conversation.contact_avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={conversation.contact_avatar_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-gray-200 font-bold text-[20px]">
                {(conversation.contact_name || conversation.provider_thread_id).charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <div className="min-w-0">
            <p className="font-bold text-[16px] text-gray-100 truncate leading-snug">
              {conversation.contact_name || conversation.provider_thread_id}
            </p>
            <span className="inline-flex items-center gap-1.5 mt-1 text-[12px] text-emerald-400 font-semibold">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              {providerLabel}
            </span>
          </div>
        </div>

        {/* Phone shown directly */}
        {phone && (
          <div className="flex items-center gap-2 mb-4 px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
            <Phone className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
            <span className="text-[13px] text-gray-300 font-medium truncate">{phone}</span>
          </div>
        )}

        {/* Quick action buttons */}
        <div className="flex items-center gap-2">
          <a
            href={`tel:${phone}`}
            className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-gray-400 hover:text-gray-200 transition-colors text-[12px] font-medium border border-white/[0.06]"
            title="Ligar"
          >
            <Phone className="w-3.5 h-3.5" />
            Ligar
          </a>
          <a
            href="mailto:"
            className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-gray-400 hover:text-gray-200 transition-colors text-[12px] font-medium border border-white/[0.06]"
            title="E-mail"
          >
            <Mail className="w-3.5 h-3.5" />
            E-mail
          </a>
          <Link
            href={`/crm/leads/${conversation.lead_id}`}
            className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-gray-400 hover:text-gray-200 transition-colors text-[12px] font-medium border border-white/[0.06]"
            title="Abrir no CRM"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            CRM
          </Link>
          {isWhatsApp && (
            <a
              href={`https://wa.me/${phone.replace(/\D/g, '')}`}
              target="_blank"
              rel="noreferrer"
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-white/[0.04] hover:bg-emerald-500/15 text-gray-400 hover:text-emerald-400 transition-colors border border-white/[0.06]"
              title="WhatsApp Web"
            >
              <MessageCircle className="w-4 h-4" />
            </a>
          )}
        </div>
      </div>

      {/* ── Deal section ── */}
      <div className="border-b border-white/[0.07] p-5">
        <p className="text-[11px] font-bold text-gray-500 uppercase tracking-[0.12em] mb-3">
          Negócio Selecionado
        </p>

        {dealLoading ? (
          <div className="flex items-center gap-2 text-gray-500 text-[13px]">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando...
          </div>
        ) : dealData ? (
          <div className="space-y-3.5">
            <div className="flex items-start gap-2.5">
              <Building2 className="w-4 h-4 text-gray-500 mt-0.5 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-[14px] font-semibold text-gray-200 truncate leading-snug">
                  {dealData.title}
                </p>
                {(dealData.pipeline_name || dealData.stage_name) && (
                  <p className="text-[12px] text-gray-500 mt-0.5">
                    {[dealData.pipeline_name, dealData.stage_name].filter(Boolean).join(' › ')}
                  </p>
                )}
                <p className="text-[15px] font-bold text-gray-300 mt-1">
                  {formatCurrency(dealData.value ?? 0)}
                </p>
              </div>
            </div>

            {/* Status pills */}
            <div className="flex gap-2">
              {(['won', 'lost', 'open'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => handleStatusChange(s)}
                  disabled={updatingStatus}
                  className={cn(
                    'flex-1 h-8 rounded-xl text-[12.5px] font-semibold transition-all',
                    dealData.status === s
                      ? s === 'won'
                        ? 'bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/40'
                        : s === 'lost'
                          ? 'bg-red-500/20 text-red-400 ring-1 ring-red-500/40'
                          : 'bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/40'
                      : 'bg-white/5 text-gray-500 hover:bg-white/10 hover:text-gray-300'
                  )}
                >
                  {s === 'won' ? 'Ganho' : s === 'lost' ? 'Perdido' : 'Aberto'}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div>
            <p className="text-[13px] text-gray-500 mb-3">Nenhum negócio vinculado.</p>
            <Link href={`/crm/leads/${conversation.lead_id}`}>
              <Button
                variant="outline"
                size="sm"
                className="w-full text-[13px] h-9 bg-white/[0.03] border-white/10 hover:bg-white/5"
              >
                Abrir Lead e criar negócio
              </Button>
            </Link>
          </div>
        )}
      </div>

      {/* ── Accordion sections ── */}
      <div className="flex-1">
        {SECTIONS.map(({ key, label }) => (
          <div key={key} className="border-b border-white/[0.06] last:border-0">
            <button
              onClick={() => toggleSection(key)}
              className="flex items-center justify-between w-full px-5 py-4 text-left hover:bg-white/[0.02] transition-colors"
            >
              <span className="text-[14px] font-medium text-gray-300">{label}</span>
              <ChevronRight
                className={cn(
                  'w-4 h-4 text-gray-600 transition-transform duration-200',
                  openSection === key && 'rotate-90'
                )}
              />
            </button>
            {openSection === key && (
              <div className="px-5 pb-4 text-[13px] text-gray-500 space-y-3">
                {key === 'contato' && (
                  <>
                    {phone && (
                      <div className="flex items-center gap-2.5">
                        <Phone className="w-3.5 h-3.5 text-gray-600 flex-shrink-0" />
                        <span>{phone}</span>
                      </div>
                    )}
                    {conversation.contact_handle && (
                      <div className="flex items-center gap-2.5">
                        <MessageCircle className="w-3.5 h-3.5 text-gray-600 flex-shrink-0" />
                        <span>{conversation.contact_handle}</span>
                      </div>
                    )}
                    <Link
                      href={`/crm/leads/${conversation.lead_id}`}
                      className="flex items-center gap-2 hover:text-gray-300 transition-colors mt-1"
                    >
                      <ExternalLink className="w-3.5 h-3.5" /> Ver perfil completo
                    </Link>
                  </>
                )}
                {key === 'negocio' && (
                  <Link
                    href={`/crm/leads/${conversation.lead_id}`}
                    className="flex items-center gap-2 hover:text-gray-300 transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    {dealData ? 'Ver negócio no CRM' : 'Criar negócio no CRM'}
                  </Link>
                )}
                {key === 'historico' && (
                  <p>Histórico de atividades disponível no perfil do lead.</p>
                )}
                {key === 'conversas' && (
                  <p>Esta conversa está ativa no inbox.</p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
