// ─── Adapter: lib/actions/pipelines do PipeFlow original ─────────────────────
// Mesmos nomes/shapes das server actions originais, rodando no client sobre a
// fachada crm.ts (real crmSupabase / demo crmDemo). Tenant = empresa ativa do
// hub via getCompanyContext(). revalidatePath não existe aqui: quem chama
// refaz o fetch (router.refresh() vira refetch client-side nas páginas /crm).

import { getCompanyContext } from '@/hooks/useCompany'
import {
  fetchPipelines, createPipeline as crmCreatePipeline,
  updatePipeline as crmUpdatePipeline, deletePipeline as crmDeletePipeline,
  type CrmPipeline,
} from '@/lib/crm'
import type { PipelineStage } from '@/types/supabase'

export type PipelineStageRow = PipelineStage

export type PipelineWithStages = {
  id: string
  name: string
  stages: PipelineStageRow[]
}

export type SavePipelineInput = {
  name: string
  stages: Array<{
    id?: string
    name: string
    color?: string
    order_index: number
    status_kind: 'open' | 'won' | 'lost'
  }>
}

async function activeCompanyId(): Promise<string> {
  const state = await getCompanyContext()
  if (!state.company) throw new Error('Nenhuma empresa ativa.')
  return state.company.id
}

function toWithStages(p: CrmPipeline): PipelineWithStages {
  return {
    id: p.id,
    name: p.name,
    stages: p.stages.map((s) => ({
      id: s.id,
      pipeline_id: s.pipelineId,
      name: s.name,
      color: s.color,
      order_index: s.orderIndex,
      status_kind: s.statusKind,
    })),
  }
}

export async function getPipelines(): Promise<PipelineWithStages[]> {
  const companyId = await activeCompanyId()
  const pipelines = await fetchPipelines(companyId)
  return pipelines.map(toWithStages)
}

function toCrmInput(input: SavePipelineInput) {
  return {
    name: input.name,
    stages: [...input.stages]
      .sort((a, b) => a.order_index - b.order_index)
      .map((s) => ({ id: s.id, name: s.name, color: s.color ?? 'slate', statusKind: s.status_kind })),
  }
}

export async function createPipeline(input: SavePipelineInput): Promise<{ error?: string }> {
  try {
    await crmCreatePipeline(await activeCompanyId(), toCrmInput(input))
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao criar funil' }
  }
}

export async function updatePipeline(id: string, input: SavePipelineInput): Promise<{ error?: string }> {
  try {
    await crmUpdatePipeline(id, await activeCompanyId(), toCrmInput(input))
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao salvar funil' }
  }
}

export async function deletePipeline(id: string): Promise<{ error?: string }> {
  try {
    await crmDeletePipeline(id, await activeCompanyId())
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao excluir funil' }
  }
}
