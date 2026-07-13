// ─── PipeFlow CRM — camada de dados (Fase 2) ─────────────────────────────────
// Client-side + RLS, como o resto do app (useCompany.ts é o modelo). Portado de
// wesley-wmb/pipeflow-crm lib/actions/{pipelines,deals}.ts, sem server actions,
// sem webhooks/playbooks (Fase 4). Tenancy: company_id = empresa (tenant);
// a "empresa do lead" (conta B2B) é crm_company_id. Ver docs/pipeflow-integration.md.

import { supabaseClient } from "@/lib/supabase";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type CrmStageStatusKind = "open" | "won" | "lost";
export type CrmDealStatus = "open" | "won" | "lost";

export interface CrmStage {
  id: string;
  pipelineId: string;
  name: string;
  color: string; // nome de cor do PipeFlow: slate|blue|amber|indigo|emerald|rose
  orderIndex: number;
  statusKind: CrmStageStatusKind;
}

export interface CrmPipeline {
  id: string;
  name: string;
  stages: CrmStage[];
}

export interface CrmDeal {
  id: string;
  title: string;
  value: number | null;
  status: CrmDealStatus;
  pipelineId: string;
  stageId: string;
  ownerId: string;
  ownerName: string | null;
  leadId: string | null;
  leadName: string | null;
  /** Campos do contato usados no board fiel (DealCard). */
  leadCompany: string | null;
  leadPhone: string | null;
  leadEmail: string | null;
  temperature: string | null;
  expectedCloseDate: string | null;
  dueDate: string | null;
  updatedAt: string;
  /** Campos completos do negócio (o board original fazia select *). */
  crmCompanyId: string | null;
  productName: string | null;
  lostReason: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  acquisitionChannel: string | null;
  landingPageUrl: string | null;
  proposalUrl: string | null;
  paymentUrl: string | null;
  schedulingUrl: string | null;
  contractUrl: string | null;
  stageEnteredAt: string;
  createdAt: string;
  activitiesTotal: number;
  activitiesDone: number;
  /** Data da atividade pendente mais próxima (null = nada planejado). */
  nextActivityAt: string | null;
  /** true quando existe atividade pendente com data no passado. */
  hasOverdueActivity: boolean;
  tags: CrmTag[];
}

export interface CrmTag {
  id: string;
  name: string;
  color: string; // nome de cor do PipeFlow (slate|blue|amber|indigo|emerald|rose)
}

function requireClient() {
  if (!supabaseClient) throw new Error("Supabase não configurado.");
  return supabaseClient;
}

/** status do deal derivado do papel semântico da etapa (regra do PipeFlow). */
function dealStatusForStage(statusKind: CrmStageStatusKind): CrmDealStatus {
  if (statusKind === "won") return "won";
  if (statusKind === "lost") return "lost";
  return "open";
}

// ─── Pipelines ────────────────────────────────────────────────────────────────

/** Funil default criado no primeiro acesso da empresa (era o seed da migration deles). */
const DEFAULT_STAGES: Array<{ name: string; color: string; statusKind: CrmStageStatusKind }> = [
  { name: "Novo Lead",  color: "slate",   statusKind: "open" },
  { name: "Contatado",  color: "blue",    statusKind: "open" },
  { name: "Proposta",   color: "amber",   statusKind: "open" },
  { name: "Negociação", color: "indigo",  statusKind: "open" },
  { name: "Ganho",      color: "emerald", statusKind: "won"  },
  { name: "Perdido",    color: "rose",    statusKind: "lost" },
];

export async function fetchPipelines(companyId: string): Promise<CrmPipeline[]> {
  const sb = requireClient();

  const { data: pipelines, error } = await sb
    .from("pipelines")
    .select("id, name")
    .eq("company_id", companyId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  if (!pipelines || pipelines.length === 0) return [];

  const { data: stages, error: sError } = await sb
    .from("pipeline_stages")
    .select("id, pipeline_id, name, color, order_index, status_kind")
    .in("pipeline_id", pipelines.map((p) => p.id))
    .order("order_index", { ascending: true });
  if (sError) throw new Error(sError.message);

  return pipelines.map((p) => ({
    id: p.id,
    name: p.name,
    stages: (stages ?? [])
      .filter((s) => s.pipeline_id === p.id)
      .map((s) => ({
        id: s.id,
        pipelineId: s.pipeline_id,
        name: s.name,
        color: s.color,
        orderIndex: s.order_index,
        statusKind: s.status_kind as CrmStageStatusKind,
      })),
  }));
}

/**
 * Garante que a empresa tem ao menos um funil ("Funil Principal" + 6 etapas).
 * Idempotente; exige papel com escrita (owner/manager) — viewer só verá o funil
 * depois que alguém com escrita abrir o CRM uma vez.
 */
export async function ensureDefaultPipeline(companyId: string): Promise<void> {
  const sb = requireClient();

  const { count, error } = await sb
    .from("pipelines")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId);
  if (error) throw new Error(error.message);
  if (count && count > 0) return;

  const { data: pipeline, error: pError } = await sb
    .from("pipelines")
    .insert({ company_id: companyId, name: "Funil Principal" })
    .select("id")
    .single();
  if (pError) throw new Error(pError.message);

  const { error: sError } = await sb.from("pipeline_stages").insert(
    DEFAULT_STAGES.map((s, i) => ({
      pipeline_id: pipeline.id,
      name: s.name,
      color: s.color,
      order_index: i,
      status_kind: s.statusKind,
    })),
  );
  if (sError) {
    await sb.from("pipelines").delete().eq("id", pipeline.id);
    throw new Error(sError.message);
  }
}

// ─── Editor de funil (create/update/delete) ───────────────────────────────────

export interface SavePipelineStageInput {
  id?: string; // ausente = etapa nova
  name: string;
  color: string;
  statusKind: CrmStageStatusKind;
}

export interface SavePipelineInput {
  name: string;
  stages: SavePipelineStageInput[];
}

/** won/lost têm cor fixa (emerald/rose) — regra do original. */
function colorForStatusKind(statusKind: CrmStageStatusKind, fallback = "slate"): string {
  if (statusKind === "won") return "emerald";
  if (statusKind === "lost") return "rose";
  return fallback;
}

/** Validação portada do PipelineSchema (zod) do original, sem zod. */
function validatePipelineInput(input: SavePipelineInput): string | null {
  const name = input.name.trim();
  if (!name || name.length > 100) return "Nome do funil obrigatório (até 100 caracteres).";
  if (input.stages.length < 2) return "Crie pelo menos duas etapas para definir ganho e perdido.";
  if (input.stages.some((s) => !s.name.trim() || s.name.trim().length > 100)) return "Toda etapa precisa de nome (até 100 caracteres).";
  const won = input.stages.filter((s) => s.statusKind === "won").length;
  const lost = input.stages.filter((s) => s.statusKind === "lost").length;
  if (won !== 1) return "Escolha exatamente uma etapa como venda ganha.";
  if (lost !== 1) return "Escolha exatamente uma etapa como venda perdida.";
  return null;
}

export async function createPipeline(companyId: string, input: SavePipelineInput): Promise<void> {
  const invalid = validatePipelineInput(input);
  if (invalid) throw new Error(invalid);
  const sb = requireClient();

  const { data: pipeline, error: pError } = await sb
    .from("pipelines")
    .insert({ company_id: companyId, name: input.name.trim() })
    .select("id")
    .single();
  if (pError) throw new Error(pError.message);

  const { error: sError } = await sb.from("pipeline_stages").insert(
    input.stages.map((s, i) => ({
      pipeline_id: pipeline.id,
      name: s.name.trim(),
      color: colorForStatusKind(s.statusKind, s.color),
      order_index: i,
      status_kind: s.statusKind,
    })),
  );
  if (sError) {
    await sb.from("pipelines").delete().eq("id", pipeline.id);
    throw new Error(sError.message);
  }
}

/**
 * Atualiza funil + etapas (porte de updatePipeline do original):
 * remove etapas que saíram, reseta status_kind (índices únicos won/lost),
 * aplica etapas na ordem, move deals ganhos/perdidos para as etapas terminais
 * e re-sincroniza deals.status com o papel da etapa.
 */
export async function updatePipeline(
  pipelineId: string,
  companyId: string,
  input: SavePipelineInput,
): Promise<void> {
  const invalid = validatePipelineInput(input);
  if (invalid) throw new Error(invalid);
  const sb = requireClient();

  const { data: existing } = await sb
    .from("pipelines")
    .select("id")
    .eq("id", pipelineId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (!existing) throw new Error("Funil não encontrado.");

  const { error: pError } = await sb
    .from("pipelines")
    .update({ name: input.name.trim() })
    .eq("id", pipelineId);
  if (pError) throw new Error(pError.message);

  const { data: existingStages } = await sb
    .from("pipeline_stages")
    .select("id")
    .eq("pipeline_id", pipelineId);

  const incomingIds = new Set(input.stages.map((s) => s.id).filter((id): id is string => Boolean(id)));
  const toDelete = (existingStages ?? []).map((s) => s.id).filter((id) => !incomingIds.has(id));

  if (toDelete.length > 0) {
    const { error: dError } = await sb.from("pipeline_stages").delete().in("id", toDelete);
    if (dError) {
      // deals.stage_id é ON DELETE RESTRICT: etapa com negócios não sai
      throw new Error(`Não foi possível remover etapa: mova os negócios dela primeiro. (${dError.message})`);
    }
  }

  // Reset: os índices únicos de won/lost por funil exigem limpar antes de reatribuir
  if (incomingIds.size > 0) {
    const { error: rError } = await sb
      .from("pipeline_stages")
      .update({ status_kind: "open", color: "slate" })
      .in("id", Array.from(incomingIds))
      .eq("pipeline_id", pipelineId);
    if (rError) throw new Error(`Erro ao preparar etapas: ${rError.message}`);
  }

  for (let i = 0; i < input.stages.length; i++) {
    const s = input.stages[i];
    const color = colorForStatusKind(s.statusKind, s.color);
    if (s.id) {
      const { error } = await sb
        .from("pipeline_stages")
        .update({ name: s.name.trim(), color, order_index: i, status_kind: s.statusKind })
        .eq("id", s.id)
        .eq("pipeline_id", pipelineId);
      if (error) throw new Error(`Erro ao atualizar etapa "${s.name}": ${error.message}`);
    } else {
      const { error } = await sb
        .from("pipeline_stages")
        .insert({ pipeline_id: pipelineId, name: s.name.trim(), color, order_index: i, status_kind: s.statusKind });
      if (error) throw new Error(`Erro ao criar etapa "${s.name}": ${error.message}`);
    }
  }

  // Realinha os negócios: ganhos/perdidos vão pra etapa terminal; status segue a etapa
  const { data: saved, error: savedError } = await sb
    .from("pipeline_stages")
    .select("id, status_kind")
    .eq("pipeline_id", pipelineId);
  if (savedError) throw new Error(`Erro ao sincronizar etapas: ${savedError.message}`);

  const wonStage = (saved ?? []).find((s) => s.status_kind === "won");
  const lostStage = (saved ?? []).find((s) => s.status_kind === "lost");

  if (wonStage) {
    const { error } = await sb
      .from("deals")
      .update({ stage_id: wonStage.id })
      .eq("pipeline_id", pipelineId)
      .eq("company_id", companyId)
      .eq("status", "won");
    if (error) throw new Error(`Erro ao mover negócios ganhos: ${error.message}`);
  }
  if (lostStage) {
    const { error } = await sb
      .from("deals")
      .update({ stage_id: lostStage.id })
      .eq("pipeline_id", pipelineId)
      .eq("company_id", companyId)
      .eq("status", "lost");
    if (error) throw new Error(`Erro ao mover negócios perdidos: ${error.message}`);
  }

  for (const s of saved ?? []) {
    const status = s.status_kind === "won" ? "won" : s.status_kind === "lost" ? "lost" : "open";
    const { error } = await sb
      .from("deals")
      .update({ status })
      .eq("pipeline_id", pipelineId)
      .eq("stage_id", s.id)
      .eq("company_id", companyId);
    if (error) throw new Error(`Erro ao sincronizar negócios da etapa: ${error.message}`);
  }
}

export async function deletePipeline(pipelineId: string, companyId: string): Promise<void> {
  const sb = requireClient();

  const { count, error: cError } = await sb
    .from("deals")
    .select("id", { count: "exact", head: true })
    .eq("pipeline_id", pipelineId)
    .eq("company_id", companyId);
  if (cError) throw new Error(cError.message);
  if (count && count > 0) {
    throw new Error(`Não é possível excluir: este funil contém ${count} negócio(s). Mova-os primeiro.`);
  }

  const { error } = await sb
    .from("pipelines")
    .delete()
    .eq("id", pipelineId)
    .eq("company_id", companyId);
  if (error) throw new Error(error.message);
}

// ─── Deals ────────────────────────────────────────────────────────────────────

export async function fetchDeals(companyId: string, pipelineId?: string): Promise<CrmDeal[]> {
  const sb = requireClient();

  let query = sb
    .from("deals")
    .select(
      "id, title, value, status, pipeline_id, stage_id, owner_id, lead_id, temperature, expected_close_date, due_date, updated_at, stage_entered_at, created_at, " +
      "crm_company_id, product_name, lost_reason, utm_source, utm_medium, utm_campaign, utm_content, acquisition_channel, landing_page_url, " +
      "proposal_url, payment_url, scheduling_url, contract_url",
    )
    .eq("company_id", companyId)
    .order("created_at", { ascending: true });
  if (pipelineId) query = query.eq("pipeline_id", pipelineId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  // ponytail: select longo estoura o parser de tipos do supabase-js → cast manual.
  type DealSelectRow = {
    id: string; title: string; value: number | null; status: string;
    pipeline_id: string; stage_id: string; owner_id: string; lead_id: string | null;
    temperature: string | null; expected_close_date: string | null; due_date: string | null;
    updated_at: string; stage_entered_at: string; created_at: string;
    crm_company_id: string | null; product_name: string | null; lost_reason: string | null;
    utm_source: string | null; utm_medium: string | null; utm_campaign: string | null;
    utm_content: string | null; acquisition_channel: string | null; landing_page_url: string | null;
    proposal_url: string | null; payment_url: string | null; scheduling_url: string | null;
    contract_url: string | null;
  };
  const rows = (data ?? []) as unknown as DealSelectRow[];
  if (rows.length === 0) return [];

  const ownerIds = Array.from(new Set(rows.map((r) => r.owner_id)));
  const leadIds = rows.map((r) => r.lead_id).filter((id): id is string => id !== null);
  const dealIds = rows.map((r) => r.id);

  const [profilesRes, leadsRes, activitiesRes, tagsRes] = await Promise.all([
    sb.from("profiles").select("id, full_name").in("id", ownerIds),
    leadIds.length > 0
      ? sb.from("crm_leads").select("id, name, company, phone, email").in("id", leadIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string; company: string | null; phone: string | null; email: string | null }> }),
    sb.from("deal_activities")
      .select("deal_id, completed_at, scheduled_start_at, due_date")
      .in("deal_id", dealIds),
    sb.from("deal_tags")
      .select("deal_id, tags(id, name, color)")
      .in("deal_id", dealIds),
  ]);

  const ownerMap = new Map((profilesRes.data ?? []).map((p) => [p.id, p.full_name]));
  const leadMap = new Map(
    (leadsRes.data ?? []).map((l) => [l.id, l as { id: string; name: string; company: string | null; phone: string | null; email: string | null }]),
  );

  // Tags por deal (join deal_tags → tags, como no original)
  type TagJoin = { deal_id: string; tags: CrmTag | null };
  const tagMap = new Map<string, CrmTag[]>();
  for (const row of (tagsRes.data ?? []) as unknown as TagJoin[]) {
    if (!row.tags) continue;
    tagMap.set(row.deal_id, [...(tagMap.get(row.deal_id) ?? []), row.tags]);
  }

  // Saúde de atividades por deal (igual ao getDeals original): total, feitas,
  // próxima pendente e atraso — a referência é o agendamento (ou o prazo).
  const totalMap = new Map<string, number>();
  const doneMap = new Map<string, number>();
  const nextMap = new Map<string, string>();
  const overdueMap = new Map<string, boolean>();
  const nowIso = new Date().toISOString();
  for (const act of activitiesRes.data ?? []) {
    totalMap.set(act.deal_id, (totalMap.get(act.deal_id) ?? 0) + 1);
    if (act.completed_at) {
      doneMap.set(act.deal_id, (doneMap.get(act.deal_id) ?? 0) + 1);
      continue;
    }
    const ref = act.scheduled_start_at ?? act.due_date;
    if (!ref) continue;
    if (ref < nowIso) overdueMap.set(act.deal_id, true);
    const current = nextMap.get(act.deal_id);
    if (!current || ref < current) nextMap.set(act.deal_id, ref);
  }

  return rows.map((r) => {
    const lead = r.lead_id ? leadMap.get(r.lead_id) : undefined;
    return {
    id: r.id,
    title: r.title,
    value: r.value,
    status: r.status as CrmDealStatus,
    pipelineId: r.pipeline_id,
    stageId: r.stage_id,
    ownerId: r.owner_id,
    ownerName: ownerMap.get(r.owner_id) ?? null,
    leadId: r.lead_id,
    leadName: lead?.name ?? null,
    leadCompany: lead?.company ?? null,
    leadPhone: lead?.phone ?? null,
    leadEmail: lead?.email ?? null,
    temperature: r.temperature,
    expectedCloseDate: r.expected_close_date,
    dueDate: r.due_date,
    updatedAt: r.updated_at,
    crmCompanyId: r.crm_company_id ?? null,
    productName: r.product_name ?? null,
    lostReason: r.lost_reason ?? null,
    utmSource: r.utm_source ?? null,
    utmMedium: r.utm_medium ?? null,
    utmCampaign: r.utm_campaign ?? null,
    utmContent: r.utm_content ?? null,
    acquisitionChannel: r.acquisition_channel ?? null,
    landingPageUrl: r.landing_page_url ?? null,
    proposalUrl: r.proposal_url ?? null,
    paymentUrl: r.payment_url ?? null,
    schedulingUrl: r.scheduling_url ?? null,
    contractUrl: r.contract_url ?? null,
    stageEnteredAt: r.stage_entered_at,
    createdAt: r.created_at,
    activitiesTotal: totalMap.get(r.id) ?? 0,
    activitiesDone: doneMap.get(r.id) ?? 0,
    nextActivityAt: nextMap.get(r.id) ?? null,
    hasOverdueActivity: overdueMap.get(r.id) ?? false,
    tags: tagMap.get(r.id) ?? [],
    };
  });
}

// ─── Tags ─────────────────────────────────────────────────────────────────────

export async function fetchTags(companyId: string): Promise<CrmTag[]> {
  const sb = requireClient();
  const { data, error } = await sb
    .from("tags")
    .select("id, name, color")
    .eq("company_id", companyId)
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createTag(companyId: string, name: string, color = "slate"): Promise<CrmTag> {
  const sb = requireClient();
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Nome da tag obrigatório.");
  const { data, error } = await sb
    .from("tags")
    .insert({ company_id: companyId, name: trimmed, color })
    .select("id, name, color")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function fetchDealTags(dealId: string, companyId: string): Promise<CrmTag[]> {
  const sb = requireClient();
  const { data, error } = await sb
    .from("deal_tags")
    .select("tags(id, name, color)")
    .eq("deal_id", dealId)
    .eq("company_id", companyId);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Array<{ tags: CrmTag | null }>)
    .map((r) => r.tags)
    .filter((t): t is CrmTag => t !== null);
}

export async function addDealTag(dealId: string, tagId: string, companyId: string): Promise<void> {
  const sb = requireClient();
  const { error } = await sb
    .from("deal_tags")
    .insert({ deal_id: dealId, tag_id: tagId, company_id: companyId });
  if (error) throw new Error(error.message);
}

export async function removeDealTag(dealId: string, tagId: string, companyId: string): Promise<void> {
  const sb = requireClient();
  const { error } = await sb
    .from("deal_tags")
    .delete()
    .eq("deal_id", dealId)
    .eq("tag_id", tagId)
    .eq("company_id", companyId);
  if (error) throw new Error(error.message);
}

/** Registra evento na timeline do negócio (best-effort: nunca bloqueia a ação principal). */
async function addDealHistory(
  dealId: string,
  companyId: string,
  eventType: string,
  details: string,
  oldValue?: string,
  newValue?: string,
): Promise<void> {
  try {
    const sb = requireClient();
    const { data: auth } = await sb.auth.getUser();
    await sb.from("deal_history").insert({
      deal_id: dealId,
      company_id: companyId,
      user_id: auth.user?.id ?? null,
      event_type: eventType,
      details,
      old_value: oldValue ?? null,
      new_value: newValue ?? null,
    });
  } catch { /* timeline é secundária */ }
}

export async function createDeal(input: {
  companyId: string;
  pipelineId: string;
  stageId: string;
  title: string;
  value?: number | null;
}): Promise<CrmDeal> {
  const sb = requireClient();
  const title = input.title.trim();
  if (!title) throw new Error("Título obrigatório.");

  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) throw new Error("Não autenticado.");

  const { data: stage } = await sb
    .from("pipeline_stages")
    .select("status_kind")
    .eq("id", input.stageId)
    .maybeSingle();

  const { data: row, error } = await sb
    .from("deals")
    .insert({
      company_id: input.companyId,
      pipeline_id: input.pipelineId,
      stage_id: input.stageId,
      title,
      value: input.value ?? null,
      status: stage ? dealStatusForStage(stage.status_kind as CrmStageStatusKind) : "open",
      owner_id: auth.user.id,
    })
    .select("id, title, value, status, pipeline_id, stage_id, owner_id, lead_id, updated_at, stage_entered_at, created_at")
    .single();
  if (error) throw new Error(error.message);

  void addDealHistory(row.id, input.companyId, "deal_created", `Negócio "${title}" foi criado no funil`);
  void instantiateStagePlaybook(row.id, input.stageId, input.companyId).catch(() => {});
  void triggerWebhooks(input.companyId, "deal.created", { id: row.id, title: row.title, value: row.value, status: row.status });

  const meta = auth.user.user_metadata as Record<string, unknown> | null;
  return {
    id: row.id,
    title: row.title,
    value: row.value,
    status: row.status as CrmDealStatus,
    pipelineId: row.pipeline_id,
    stageId: row.stage_id,
    ownerId: row.owner_id,
    ownerName: typeof meta?.full_name === "string" ? (meta.full_name as string) : null,
    leadId: row.lead_id,
    leadName: null,
    leadCompany: null,
    leadPhone: null,
    leadEmail: null,
    temperature: null,
    expectedCloseDate: null,
    dueDate: null,
    updatedAt: row.updated_at,
    crmCompanyId: null,
    productName: null,
    lostReason: null,
    utmSource: null,
    utmMedium: null,
    utmCampaign: null,
    utmContent: null,
    acquisitionChannel: null,
    landingPageUrl: null,
    proposalUrl: null,
    paymentUrl: null,
    schedulingUrl: null,
    contractUrl: null,
    stageEnteredAt: row.stage_entered_at,
    createdAt: row.created_at,
    activitiesTotal: 0,
    activitiesDone: 0,
    nextActivityAt: null,
    hasOverdueActivity: false,
    tags: [],
  };
}

// ─── Métricas (Dashboard CRM) ─────────────────────────────────────────────────

export interface CrmStats {
  leadsCount: number;
  /** Contatos criados no mês corrente (para a meta de leads). */
  leadsThisMonth: number;
  /** Todos os negócios da empresa (todas as pipelines), campos mínimos.
   *  stageEnteredAt da etapa terminal ≈ data do ganho/perda (metas do mês). */
  deals: Array<{ id: string; status: CrmDealStatus; value: number | null; stageId: string; pipelineId: string; stageEnteredAt: string }>;
}

export async function fetchCrmStats(companyId: string): Promise<CrmStats> {
  const sb = requireClient();
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const [leadsRes, leadsMonthRes, dealsRes] = await Promise.all([
    sb.from("crm_leads").select("id", { count: "exact", head: true }).eq("company_id", companyId),
    sb.from("crm_leads").select("id", { count: "exact", head: true }).eq("company_id", companyId).gte("created_at", monthStart),
    sb.from("deals").select("id, status, value, stage_id, pipeline_id, stage_entered_at").eq("company_id", companyId),
  ]);
  if (leadsRes.error) throw new Error(leadsRes.error.message);
  if (dealsRes.error) throw new Error(dealsRes.error.message);
  return {
    leadsCount: leadsRes.count ?? 0,
    leadsThisMonth: leadsMonthRes.count ?? 0,
    deals: (dealsRes.data ?? []).map((d) => ({
      id: d.id,
      status: d.status as CrmDealStatus,
      value: d.value,
      stageId: d.stage_id,
      pipelineId: d.pipeline_id,
      stageEnteredAt: d.stage_entered_at,
    })),
  };
}

/**
 * Move o negócio de etapa: sincroniza status com o status_kind da etapa e só
 * zera o relógio "tempo na etapa" quando troca de etapa de verdade.
 */
export async function moveDeal(
  deal: Pick<CrmDeal, "id" | "stageId">,
  newStage: Pick<CrmStage, "id" | "name" | "statusKind">,
  companyId: string,
  oldStageName?: string,
): Promise<{ status: CrmDealStatus; stageEnteredAt: string }> {
  const sb = requireClient();
  const stageChanged = deal.stageId !== newStage.id;
  const status = dealStatusForStage(newStage.statusKind);
  const stageEnteredAt = new Date().toISOString();

  const { error } = await sb
    .from("deals")
    .update({
      stage_id: newStage.id,
      status,
      ...(stageChanged ? { stage_entered_at: stageEnteredAt } : {}),
    })
    .eq("id", deal.id)
    .eq("company_id", companyId);
  if (error) throw new Error(error.message);

  if (stageChanged) {
    void addDealHistory(
      deal.id, companyId, "stage_change",
      "O negócio foi movido de estágio no funil",
      oldStageName ?? "Estágio anterior", newStage.name,
    );
    // Cadência da nova etapa (best-effort, idempotente — como no original)
    void instantiateStagePlaybook(deal.id, newStage.id, companyId).catch(() => {});
    // Notifica o dono do negócio (se não foi ele quem moveu)
    void notifyDealOwner(deal.id, companyId, "deal_stage_changed", `Negócio movido para "${newStage.name}"`).catch(() => {});
    void triggerWebhooks(companyId, "deal.stage_changed", { id: deal.id, stageId: newStage.id, status });
    if (status === "won") void triggerWebhooks(companyId, "deal.won", { id: deal.id, stageId: newStage.id });
    if (status === "lost") void triggerWebhooks(companyId, "deal.lost", { id: deal.id, stageId: newStage.id });
  }

  return { status, stageEnteredAt };
}

/** Cria notificação para o dono do negócio quando OUTRA pessoa age nele. */
async function notifyDealOwner(dealId: string, companyId: string, eventType: string, title: string): Promise<void> {
  const sb = requireClient();
  const [{ data: deal }, { data: auth }] = await Promise.all([
    sb.from("deals").select("owner_id, title").eq("id", dealId).maybeSingle(),
    sb.auth.getUser(),
  ]);
  if (!deal || !auth.user || deal.owner_id === auth.user.id) return;
  await sb.from("notifications").insert({
    company_id: companyId,
    user_id: deal.owner_id,
    event_type: eventType,
    title,
    body: `"${deal.title}"`,
    related_deal_id: dealId,
  });
}

export async function deleteDeal(dealId: string, companyId: string): Promise<void> {
  const sb = requireClient();
  const { error } = await sb.from("deals").delete().eq("id", dealId).eq("company_id", companyId);
  if (error) throw new Error(error.message);
}

// ─── Detalhe do negócio (sheet) ───────────────────────────────────────────────

export interface CrmDealDetail {
  id: string;
  title: string;
  value: number | null;
  status: CrmDealStatus;
  pipelineId: string;
  stageId: string;
  ownerId: string;
  leadId: string | null;
  crmCompanyId: string | null;
  productName: string | null;
  temperature: string | null; // cold | warm | hot
  expectedCloseDate: string | null;
  dueDate: string | null;
  lostReason: string | null;
  proposalUrl: string | null;
  paymentUrl: string | null;
  schedulingUrl: string | null;
  contractUrl: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  acquisitionChannel: string | null;
  landingPageUrl: string | null;
  stageEnteredAt: string;
  createdAt: string;
}

const DEAL_DETAIL_COLS =
  "id, title, value, status, pipeline_id, stage_id, owner_id, lead_id, crm_company_id, product_name, temperature, " +
  "expected_close_date, due_date, lost_reason, proposal_url, payment_url, scheduling_url, contract_url, " +
  "utm_source, utm_medium, utm_campaign, utm_content, acquisition_channel, landing_page_url, stage_entered_at, created_at";

function mapDealDetail(r: Record<string, unknown>): CrmDealDetail {
  return {
    id: r.id as string,
    title: r.title as string,
    value: r.value as number | null,
    status: r.status as CrmDealStatus,
    pipelineId: r.pipeline_id as string,
    stageId: r.stage_id as string,
    ownerId: r.owner_id as string,
    leadId: r.lead_id as string | null,
    crmCompanyId: (r.crm_company_id as string | null) ?? null,
    productName: r.product_name as string | null,
    temperature: r.temperature as string | null,
    expectedCloseDate: r.expected_close_date as string | null,
    dueDate: r.due_date as string | null,
    lostReason: r.lost_reason as string | null,
    proposalUrl: r.proposal_url as string | null,
    paymentUrl: r.payment_url as string | null,
    schedulingUrl: r.scheduling_url as string | null,
    contractUrl: r.contract_url as string | null,
    utmSource: r.utm_source as string | null,
    utmMedium: r.utm_medium as string | null,
    utmCampaign: r.utm_campaign as string | null,
    utmContent: (r.utm_content as string | null) ?? null,
    acquisitionChannel: (r.acquisition_channel as string | null) ?? null,
    landingPageUrl: (r.landing_page_url as string | null) ?? null,
    stageEnteredAt: r.stage_entered_at as string,
    createdAt: r.created_at as string,
  };
}

export async function fetchDealDetail(dealId: string, companyId: string): Promise<CrmDealDetail | null> {
  const sb = requireClient();
  const { data, error } = await sb
    .from("deals")
    .select(DEAL_DETAIL_COLS)
    .eq("id", dealId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapDealDetail(data as unknown as Record<string, unknown>) : null;
}

/** Edição parcial de campos do negócio (título, valor, produto, URLs…). */
export async function updateDeal(
  dealId: string,
  companyId: string,
  patch: Partial<Pick<CrmDealDetail,
    "title" | "value" | "productName" | "temperature" | "expectedCloseDate" | "dueDate" | "lostReason" |
    "proposalUrl" | "paymentUrl" | "schedulingUrl" | "contractUrl" |
    "utmSource" | "utmMedium" | "utmCampaign" | "utmContent" | "acquisitionChannel" | "landingPageUrl">> & { leadId?: string | null },
): Promise<void> {
  const sb = requireClient();
  const row: Record<string, unknown> = {};
  if ("title" in patch) row.title = patch.title?.trim();
  if ("value" in patch) row.value = patch.value;
  if ("dueDate" in patch) row.due_date = patch.dueDate;
  if ("utmSource" in patch) row.utm_source = patch.utmSource;
  if ("utmMedium" in patch) row.utm_medium = patch.utmMedium;
  if ("utmCampaign" in patch) row.utm_campaign = patch.utmCampaign;
  if ("utmContent" in patch) row.utm_content = patch.utmContent;
  if ("acquisitionChannel" in patch) row.acquisition_channel = patch.acquisitionChannel;
  if ("landingPageUrl" in patch) row.landing_page_url = patch.landingPageUrl;
  if ("productName" in patch) row.product_name = patch.productName;
  if ("temperature" in patch) row.temperature = patch.temperature;
  if ("expectedCloseDate" in patch) row.expected_close_date = patch.expectedCloseDate;
  if ("lostReason" in patch) row.lost_reason = patch.lostReason;
  if ("proposalUrl" in patch) row.proposal_url = patch.proposalUrl;
  if ("paymentUrl" in patch) row.payment_url = patch.paymentUrl;
  if ("schedulingUrl" in patch) row.scheduling_url = patch.schedulingUrl;
  if ("contractUrl" in patch) row.contract_url = patch.contractUrl;
  if ("leadId" in patch) row.lead_id = patch.leadId;
  if (Object.keys(row).length === 0) return;

  const { error } = await sb.from("deals").update(row).eq("id", dealId).eq("company_id", companyId);
  if (error) throw new Error(error.message);
}

// ─── Contatos (crm_leads) ─────────────────────────────────────────────────────

export type CrmLeadStatus = "new" | "contacted" | "proposal" | "negotiation" | "won" | "lost";

export interface CrmLead {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  instagram: string | null;
  company: string | null; // nome da empresa em texto livre
  jobTitle: string | null;
  status: CrmLeadStatus;
  ownerId: string;
  /** Preenchido só por fetchLeads (listagem). */
  ownerName: string | null;
  notes: string | null;
  createdAt: string;
  /** Conta B2B vinculada (crm_companies). */
  crmCompanyId: string | null;
  estimatedValue: number | null;
}

const LEAD_COLS = "id, name, email, phone, whatsapp, instagram, company, job_title, status, owner_id, notes, created_at, crm_company_id, estimated_value";

function mapLead(r: Record<string, unknown>, ownerName: string | null = null): CrmLead {
  return {
    id: r.id as string,
    name: r.name as string,
    email: r.email as string | null,
    phone: r.phone as string | null,
    whatsapp: r.whatsapp as string | null,
    instagram: r.instagram as string | null,
    company: r.company as string | null,
    jobTitle: r.job_title as string | null,
    status: r.status as CrmLeadStatus,
    ownerId: r.owner_id as string,
    ownerName,
    notes: r.notes as string | null,
    createdAt: r.created_at as string,
    crmCompanyId: (r.crm_company_id as string | null) ?? null,
    estimatedValue: r.estimated_value != null ? Number(r.estimated_value) : null,
  };
}

/** Listagem com busca (nome/empresa/e-mail) e filtro por status, com nome do dono. */
export async function fetchLeads(
  companyId: string,
  filters?: { search?: string; status?: CrmLeadStatus | "all" },
): Promise<CrmLead[]> {
  const sb = requireClient();

  let query = sb
    .from("crm_leads")
    .select(LEAD_COLS)
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(500);

  if (filters?.status && filters.status !== "all") query = query.eq("status", filters.status);
  if (filters?.search) {
    // Remove operadores do PostgREST para evitar injeção de filtro (como no original)
    const safe = filters.search.replace(/[(),%]/g, "").slice(0, 100);
    if (safe.trim()) {
      const term = `%${safe}%`;
      query = query.or(`name.ilike.${term},company.ilike.${term},email.ilike.${term}`);
    }
  }

  const { data: rows, error } = await query;
  if (error) throw new Error(error.message);
  if (!rows || rows.length === 0) return [];

  const ownerIds = Array.from(new Set((rows as Array<{ owner_id: string }>).map((r) => r.owner_id)));
  const { data: profiles } = await sb.from("profiles").select("id, full_name").in("id", ownerIds);
  const nameMap = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));

  return (rows as unknown as Array<Record<string, unknown>>).map((r) =>
    mapLead(r, nameMap.get(r.owner_id as string) ?? null),
  );
}

export async function deleteLead(leadId: string, companyId: string): Promise<void> {
  const sb = requireClient();
  const { error } = await sb.from("crm_leads").delete().eq("id", leadId).eq("company_id", companyId);
  if (error) throw new Error(error.message);
}

/**
 * Cria um negócio a partir do contato: primeiro funil, primeira etapa
 * (portado de createDealFromLead do original).
 */
export async function createDealFromLead(lead: Pick<CrmLead, "id" | "name">, companyId: string): Promise<void> {
  const sb = requireClient();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) throw new Error("Não autenticado.");

  const { data: pipeline } = await sb
    .from("pipelines")
    .select("id")
    .eq("company_id", companyId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!pipeline) throw new Error("Nenhum funil encontrado. Abra a Pipeline primeiro.");

  const { data: stage } = await sb
    .from("pipeline_stages")
    .select("id")
    .eq("pipeline_id", pipeline.id)
    .order("order_index", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!stage) throw new Error("Nenhuma etapa encontrada no funil.");

  const { data: deal, error } = await sb
    .from("deals")
    .insert({
      company_id: companyId,
      pipeline_id: pipeline.id,
      stage_id: stage.id,
      title: lead.name,
      lead_id: lead.id,
      status: "open",
      owner_id: auth.user.id,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  void addDealHistory(deal.id, companyId, "deal_created", `Negócio "${lead.name}" foi criado a partir de um contato`);
}

export async function fetchLead(leadId: string): Promise<CrmLead | null> {
  const sb = requireClient();
  const { data, error } = await sb.from("crm_leads").select(LEAD_COLS).eq("id", leadId).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapLead(data as unknown as Record<string, unknown>) : null;
}

export async function searchLeads(companyId: string, term: string): Promise<CrmLead[]> {
  const sb = requireClient();
  const { data, error } = await sb
    .from("crm_leads")
    .select(LEAD_COLS)
    .eq("company_id", companyId)
    .ilike("name", `%${term.replace(/[%,()]/g, "").trim()}%`)
    .order("created_at", { ascending: false })
    .limit(8);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapLead(r as unknown as Record<string, unknown>));
}

// ─── Timeline legada do lead (activities: ligação/e-mail/reunião/nota) ────────

export type CrmLegacyActivityType = "call" | "email" | "meeting" | "note";

export interface CrmLegacyActivity {
  id: string;
  leadId: string;
  authorId: string;
  authorName: string | null;
  type: CrmLegacyActivityType;
  title: string;
  description: string | null;
  occurredAt: string;
  createdAt: string;
}

export async function fetchLeadActivities(leadId: string, companyId: string): Promise<CrmLegacyActivity[]> {
  const sb = requireClient();
  const { data: rows, error } = await sb
    .from("activities")
    .select("id, lead_id, author_id, type, title, description, occurred_at, created_at")
    .eq("lead_id", leadId)
    .eq("company_id", companyId)
    .order("occurred_at", { ascending: false });
  if (error) throw new Error(error.message);
  if (!rows || rows.length === 0) return [];

  const authorIds = Array.from(new Set(rows.map((r) => r.author_id)));
  const { data: profiles } = await sb.from("profiles").select("id, full_name").in("id", authorIds);
  const nameMap = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));

  return rows.map((r) => ({
    id: r.id, leadId: r.lead_id, authorId: r.author_id, authorName: nameMap.get(r.author_id) ?? null,
    type: r.type as CrmLegacyActivityType, title: r.title, description: r.description,
    occurredAt: r.occurred_at, createdAt: r.created_at,
  }));
}

export async function createLeadActivity(
  leadId: string, companyId: string,
  input: { type: CrmLegacyActivityType; title: string; description?: string | null },
): Promise<{ error?: string }> {
  const sb = requireClient();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return { error: "Não autenticado." };
  const { error } = await sb.from("activities").insert({
    company_id: companyId, lead_id: leadId, author_id: auth.user.id,
    type: input.type, title: input.title.trim(), description: input.description ?? null,
  });
  if (error) return { error: error.message };
  return {};
}

export async function createLead(
  companyId: string,
  input: { name: string; email?: string; phone?: string; crmCompanyId?: string | null; estimatedValue?: number | null },
): Promise<CrmLead> {
  const sb = requireClient();
  const name = input.name.trim();
  if (!name) throw new Error("Nome do contato obrigatório.");
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) throw new Error("Não autenticado.");

  const { data, error } = await sb
    .from("crm_leads")
    .insert({
      company_id: companyId,
      owner_id: auth.user.id,
      name,
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      crm_company_id: input.crmCompanyId ?? null,
      estimated_value: input.estimatedValue ?? null,
    })
    .select(LEAD_COLS)
    .single();
  if (error) throw new Error(error.message);
  void triggerWebhooks(companyId, "lead.created", { id: data.id, name: data.name, email: data.email });
  return mapLead(data as unknown as Record<string, unknown>);
}

export async function updateLead(
  leadId: string,
  companyId: string,
  patch: Partial<Pick<CrmLead, "name" | "email" | "phone" | "whatsapp" | "instagram" | "company" | "jobTitle" | "status" | "notes" | "crmCompanyId" | "estimatedValue">>,
): Promise<void> {
  const sb = requireClient();
  const row: Record<string, unknown> = {};
  if ("name" in patch) row.name = patch.name?.trim();
  if ("email" in patch) row.email = patch.email;
  if ("phone" in patch) row.phone = patch.phone;
  if ("whatsapp" in patch) row.whatsapp = patch.whatsapp;
  if ("instagram" in patch) row.instagram = patch.instagram;
  if ("company" in patch) row.company = patch.company;
  if ("jobTitle" in patch) row.job_title = patch.jobTitle;
  if ("status" in patch) row.status = patch.status;
  if ("notes" in patch) row.notes = patch.notes;
  if ("crmCompanyId" in patch) row.crm_company_id = patch.crmCompanyId;
  if ("estimatedValue" in patch) row.estimated_value = patch.estimatedValue;
  if (Object.keys(row).length === 0) return;

  const { error } = await sb.from("crm_leads").update(row).eq("id", leadId).eq("company_id", companyId);
  if (error) throw new Error(error.message);
}

// ─── Atividades do negócio (deal_activities) ──────────────────────────────────

export type CrmActivityKind =
  | "call" | "email" | "whatsapp" | "instagram" | "meeting"
  | "task" | "social" | "proposal" | "closure";

export interface CrmActivity {
  id: string;
  dealId: string;
  title: string;
  activityType: CrmActivityKind;
  scheduledStartAt: string | null;
  dueDate: string | null;
  completedAt: string | null;
  notes: string | null;
  createdAt: string;
  /** id do template da etapa que gerou a atividade (playbook); null = manual. */
  sourceTemplateId: string | null;
  /** Campos do playbook/cadência usados pelo sheet fiel. */
  dayOffset: number | null;
  orderIndex: number;
  iconKey: string | null;
  actionLabel: string | null;
  script: string | null;
  priority: string;
  assignedTo: string | null;
  reminderAt: string | null;
}

const ACTIVITY_COLS =
  "id, deal_id, title, activity_type, scheduled_start_at, due_date, completed_at, notes, created_at, source_template_id, " +
  "day_offset, order_index, icon_key, action_label, script, priority, assigned_to, reminder_at";

function mapActivity(r: Record<string, unknown>): CrmActivity {
  return {
    id: r.id as string,
    dealId: r.deal_id as string,
    title: r.title as string,
    activityType: r.activity_type as CrmActivityKind,
    scheduledStartAt: r.scheduled_start_at as string | null,
    dueDate: r.due_date as string | null,
    completedAt: r.completed_at as string | null,
    notes: r.notes as string | null,
    assignedTo: (r.assigned_to as string | null) ?? null,
    reminderAt: (r.reminder_at as string | null) ?? null,
    createdAt: r.created_at as string,
    sourceTemplateId: (r.source_template_id as string | null) ?? null,
    dayOffset: (r.day_offset as number | null) ?? null,
    orderIndex: (r.order_index as number) ?? 0,
    iconKey: (r.icon_key as string | null) ?? null,
    actionLabel: (r.action_label as string | null) ?? null,
    script: (r.script as string | null) ?? null,
    priority: (r.priority as string) ?? "normal",
  };
}

export async function fetchDealActivities(dealId: string, companyId: string): Promise<CrmActivity[]> {
  const sb = requireClient();
  const { data, error } = await sb
    .from("deal_activities")
    .select(ACTIVITY_COLS)
    .eq("deal_id", dealId)
    .eq("company_id", companyId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapActivity(r as unknown as Record<string, unknown>));
}

/** Todas as atividades da empresa (Dashboard: funil por etapa, gargalos). */
export async function fetchCompanyDealActivities(companyId: string): Promise<CrmActivity[]> {
  const sb = requireClient();
  const { data, error } = await sb
    .from("deal_activities")
    .select(ACTIVITY_COLS)
    .eq("company_id", companyId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapActivity(r as unknown as Record<string, unknown>));
}

export async function createDealActivity(input: {
  dealId: string;
  companyId: string;
  title: string;
  activityType: CrmActivityKind;
  scheduledStartAt?: string | null;
  assignedTo?: string | null;
  reminderAt?: string | null;
}): Promise<CrmActivity> {
  const sb = requireClient();
  const title = input.title.trim();
  if (!title) throw new Error("Título da atividade obrigatório.");
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) throw new Error("Não autenticado.");

  const { data, error } = await sb
    .from("deal_activities")
    .insert({
      deal_id: input.dealId,
      company_id: input.companyId,
      title,
      activity_type: input.activityType,
      scheduled_start_at: input.scheduledStartAt ?? null,
      is_custom: true,
      assigned_to: input.assignedTo !== undefined ? input.assignedTo : auth.user.id,
      reminder_at: input.reminderAt ?? null,
    })
    .select(ACTIVITY_COLS)
    .single();
  if (error) throw new Error(error.message);

  void addDealHistory(input.dealId, input.companyId, "activity_created", `Atividade "${title}" foi criada`);
  return mapActivity(data as unknown as Record<string, unknown>);
}

/** Marca/desmarca conclusão. Concluir registra evento na timeline (como no original). */
export async function setActivityDone(
  activity: Pick<CrmActivity, "id" | "dealId" | "title">,
  companyId: string,
  done: boolean,
): Promise<{ completedAt: string | null }> {
  const sb = requireClient();
  const { data: auth } = await sb.auth.getUser();
  const completedAt = done ? new Date().toISOString() : null;

  const { error } = await sb
    .from("deal_activities")
    .update({ completed_at: completedAt, completed_by: done ? (auth.user?.id ?? null) : null })
    .eq("id", activity.id)
    .eq("company_id", companyId);
  if (error) throw new Error(error.message);

  if (done) {
    void addDealHistory(activity.dealId, companyId, "activity_completed", `Atividade "${activity.title}" foi concluída`);
  }
  return { completedAt };
}

export async function deleteDealActivity(activityId: string, companyId: string): Promise<void> {
  const sb = requireClient();
  const { error } = await sb.from("deal_activities").delete().eq("id", activityId).eq("company_id", companyId);
  if (error) throw new Error(error.message);
}

/** Edição parcial de uma atividade (título, notas, agendamento, tipo…). */
export async function updateDealActivity(
  activityId: string,
  companyId: string,
  patch: Partial<Pick<CrmActivity,
    "title" | "notes" | "scheduledStartAt" | "dueDate" | "activityType" | "script" | "priority" | "assignedTo" | "reminderAt">>,
): Promise<void> {
  const sb = requireClient();
  const row: Record<string, unknown> = {};
  if ("title" in patch) row.title = patch.title?.trim();
  if ("notes" in patch) row.notes = patch.notes;
  if ("scheduledStartAt" in patch) row.scheduled_start_at = patch.scheduledStartAt;
  if ("dueDate" in patch) row.due_date = patch.dueDate;
  if ("activityType" in patch) row.activity_type = patch.activityType;
  if ("script" in patch) row.script = patch.script;
  if ("priority" in patch) row.priority = patch.priority;
  if ("assignedTo" in patch) row.assigned_to = patch.assignedTo;
  if ("reminderAt" in patch) row.reminder_at = patch.reminderAt;
  if (Object.keys(row).length === 0) return;
  const { error } = await sb.from("deal_activities").update(row).eq("id", activityId).eq("company_id", companyId);
  if (error) throw new Error(error.message);
}

/** Remove TODAS as atividades pendentes do negócio (botão "limpar" do sheet). */
export async function clearDealActivities(dealId: string, companyId: string): Promise<void> {
  const sb = requireClient();
  const { error } = await sb
    .from("deal_activities")
    .delete()
    .eq("deal_id", dealId)
    .eq("company_id", companyId)
    .is("completed_at", null);
  if (error) throw new Error(error.message);
}

// ─── Playbooks nomeados (tabelas da 073) ──────────────────────────────────────

export interface CrmPlaybook {
  id: string;
  name: string;
  description: string | null;
  activities: Array<{
    id: string;
    title: string;
    activityType: CrmActivityKind;
    dayOffset: number;
    orderIndex: number;
    iconKey: string | null;
    actionLabel: string | null;
    script: string | null;
  }>;
}

export async function fetchPlaybooks(companyId: string): Promise<CrmPlaybook[]> {
  const sb = requireClient();
  const { data: books, error } = await sb
    .from("playbooks")
    .select("id, name, description")
    .eq("company_id", companyId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  if (!books || books.length === 0) return [];

  const { data: acts, error: aError } = await sb
    .from("playbook_activities")
    .select("id, playbook_id, title, activity_type, day_offset, order_index, icon_key, action_label, script")
    .in("playbook_id", books.map((b) => b.id))
    .order("order_index", { ascending: true });
  if (aError) throw new Error(aError.message);

  return books.map((b) => ({
    id: b.id,
    name: b.name,
    description: b.description,
    activities: (acts ?? [])
      .filter((a) => a.playbook_id === b.id)
      .map((a) => ({
        id: a.id,
        title: a.title,
        activityType: a.activity_type as CrmActivityKind,
        dayOffset: a.day_offset ?? 0,
        orderIndex: a.order_index ?? 0,
        iconKey: a.icon_key,
        actionLabel: a.action_label,
        script: a.script,
      })),
  }));
}

/** Instancia as atividades de um playbook nomeado no negócio (idempotente por título pendente). */
export async function applyPlaybookToDeal(dealId: string, companyId: string, playbookId: string): Promise<number> {
  const sb = requireClient();
  const playbooks = await fetchPlaybooks(companyId);
  const book = playbooks.find((p) => p.id === playbookId);
  if (!book) throw new Error("Playbook não encontrado.");

  const existing = await fetchDealActivities(dealId, companyId);
  const existingTitles = new Set(existing.filter((a) => !a.completedAt).map((a) => a.title));
  const toCreate = book.activities.filter((a) => !existingTitles.has(a.title));
  if (toCreate.length === 0) return 0;

  const { error } = await sb.from("deal_activities").insert(
    toCreate.map((a) => ({
      deal_id: dealId,
      company_id: companyId,
      title: a.title,
      activity_type: a.activityType,
      day_offset: a.dayOffset,
      order_index: a.orderIndex,
      icon_key: a.iconKey,
      action_label: a.actionLabel,
      script: a.script,
    })),
  );
  if (error) throw new Error(error.message);
  return toCreate.length;
}

export async function createPlaybook(
  companyId: string,
  input: { name: string; description?: string | null },
): Promise<CrmPlaybook> {
  const sb = requireClient();
  const name = input.name.trim();
  if (!name) throw new Error("Nome do playbook obrigatório.");
  const { data, error } = await sb
    .from("playbooks")
    .insert({ company_id: companyId, name, description: input.description ?? null })
    .select("id, name, description")
    .single();
  if (error) throw new Error(error.message);
  return { id: data.id, name: data.name, description: data.description, activities: [] };
}

export async function deletePlaybook(playbookId: string, companyId: string): Promise<void> {
  const sb = requireClient();
  const { error } = await sb.from("playbooks").delete().eq("id", playbookId).eq("company_id", companyId);
  if (error) throw new Error(error.message);
}

export interface CrmPlaybookActivity {
  id: string; title: string; activityType: CrmActivityKind; dayOffset: number; orderIndex: number;
  iconKey: string | null; actionLabel: string | null; script: string | null;
}

export async function addPlaybookActivity(
  companyId: string,
  playbookId: string,
  input: {
    title: string; activityType: CrmActivityKind; dayOffset?: number; orderIndex?: number;
    iconKey?: string | null; actionLabel?: string | null; script?: string | null;
  },
): Promise<CrmPlaybookActivity> {
  const sb = requireClient();
  const { data, error } = await sb.from("playbook_activities").insert({
    company_id: companyId,
    playbook_id: playbookId,
    title: input.title.trim(),
    activity_type: input.activityType,
    day_offset: input.dayOffset ?? 1,
    order_index: input.orderIndex ?? 0,
    icon_key: input.iconKey ?? null,
    action_label: input.actionLabel ?? null,
    script: input.script ?? null,
  }).select("id, title, activity_type, day_offset, order_index, icon_key, action_label, script").single();
  if (error) throw new Error(error.message);
  return {
    id: data.id, title: data.title, activityType: data.activity_type as CrmActivityKind,
    dayOffset: data.day_offset ?? 0, orderIndex: data.order_index ?? 0,
    iconKey: data.icon_key, actionLabel: data.action_label, script: data.script,
  };
}

export async function updatePlaybookActivity(
  activityId: string,
  companyId: string,
  patch: Partial<{
    title: string; activityType: CrmActivityKind; dayOffset: number; orderIndex: number;
    iconKey: string | null; actionLabel: string | null; script: string | null;
  }>,
): Promise<CrmPlaybookActivity> {
  const sb = requireClient();
  const row: Record<string, unknown> = {};
  if ("title" in patch) row.title = patch.title?.trim();
  if ("activityType" in patch) row.activity_type = patch.activityType;
  if ("dayOffset" in patch) row.day_offset = patch.dayOffset;
  if ("orderIndex" in patch) row.order_index = patch.orderIndex;
  if ("iconKey" in patch) row.icon_key = patch.iconKey;
  if ("actionLabel" in patch) row.action_label = patch.actionLabel;
  if ("script" in patch) row.script = patch.script;
  if (Object.keys(row).length > 0) {
    const { error } = await sb.from("playbook_activities").update(row).eq("id", activityId).eq("company_id", companyId);
    if (error) throw new Error(error.message);
  }
  const { data, error: selError } = await sb
    .from("playbook_activities")
    .select("id, title, activity_type, day_offset, order_index, icon_key, action_label, script")
    .eq("id", activityId).eq("company_id", companyId).single();
  if (selError) throw new Error(selError.message);
  return {
    id: data.id, title: data.title, activityType: data.activity_type as CrmActivityKind,
    dayOffset: data.day_offset ?? 0, orderIndex: data.order_index ?? 0,
    iconKey: data.icon_key, actionLabel: data.action_label, script: data.script,
  };
}

export async function deletePlaybookActivity(activityId: string, companyId: string): Promise<void> {
  const sb = requireClient();
  const { error } = await sb.from("playbook_activities").delete().eq("id", activityId).eq("company_id", companyId);
  if (error) throw new Error(error.message);
}

// ─── Empresas B2B (crm_companies) ─────────────────────────────────────────────

export interface CrmCompany {
  id: string;
  name: string;
  website: string | null;
  cnpj: string | null;
  city: string | null;
  state: string | null;
  segment: string | null;
  notes: string | null;
}

const CRM_COMPANY_COLS = "id, name, website, cnpj, city, state, segment, notes";

function mapCrmCompany(r: Record<string, unknown>): CrmCompany {
  return {
    id: r.id as string,
    name: r.name as string,
    website: r.website as string | null,
    cnpj: r.cnpj as string | null,
    city: r.city as string | null,
    state: r.state as string | null,
    segment: r.segment as string | null,
    notes: r.notes as string | null,
  };
}

export async function fetchCrmCompany(crmCompanyId: string): Promise<CrmCompany | null> {
  const sb = requireClient();
  const { data, error } = await sb.from("crm_companies").select(CRM_COMPANY_COLS).eq("id", crmCompanyId).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapCrmCompany(data as unknown as Record<string, unknown>) : null;
}

export async function searchCrmCompanies(companyId: string, term: string): Promise<CrmCompany[]> {
  const sb = requireClient();
  const { data, error } = await sb
    .from("crm_companies")
    .select(CRM_COMPANY_COLS)
    .eq("company_id", companyId)
    .ilike("name", `%${term.replace(/[%,()]/g, "").trim()}%`)
    .order("created_at", { ascending: false })
    .limit(8);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapCrmCompany(r as unknown as Record<string, unknown>));
}

export async function createCrmCompany(companyId: string, input: { name: string }): Promise<CrmCompany> {
  const sb = requireClient();
  const name = input.name.trim();
  if (!name) throw new Error("Nome da empresa obrigatório.");
  const { data, error } = await sb
    .from("crm_companies")
    .insert({ company_id: companyId, name })
    .select(CRM_COMPANY_COLS)
    .single();
  if (error) throw new Error(error.message);
  return mapCrmCompany(data as unknown as Record<string, unknown>);
}

export async function updateCrmCompany(
  crmCompanyId: string,
  companyId: string,
  patch: Partial<Pick<CrmCompany, "name" | "website" | "cnpj" | "city" | "state" | "segment" | "notes">>,
): Promise<void> {
  const sb = requireClient();
  const row: Record<string, unknown> = {};
  for (const k of ["name", "website", "cnpj", "city", "state", "segment", "notes"] as const) {
    if (k in patch) row[k] = k === "name" ? patch.name?.trim() : patch[k];
  }
  if (Object.keys(row).length === 0) return;
  const { error } = await sb.from("crm_companies").update(row).eq("id", crmCompanyId).eq("company_id", companyId);
  if (error) throw new Error(error.message);
}

/** Vincula/desvincula a conta B2B do negócio. */
export async function linkDealCrmCompany(dealId: string, companyId: string, crmCompanyId: string | null): Promise<void> {
  const sb = requireClient();
  const { error } = await sb.from("deals").update({ crm_company_id: crmCompanyId }).eq("id", dealId).eq("company_id", companyId);
  if (error) throw new Error(error.message);
}

// ─── Notas do negócio (deal_history event note_added, como no original) ───────

export async function addDealNote(dealId: string, companyId: string, note: string): Promise<void> {
  const text = note.trim();
  if (!text) throw new Error("Nota vazia.");
  await addDealHistory(dealId, companyId, "note_added", text);
}

// ─── Playbook por etapa (pipeline_stage_activities) ───────────────────────────

export interface CrmStageTemplate {
  id: string;
  stageId: string;
  title: string;
  activityType: CrmActivityKind;
  dayOffset: number;
  orderIndex: number;
  script: string | null;
  isActive: boolean;
}

const TEMPLATE_COLS = "id, stage_id, title, activity_type, day_offset, order_index, script, is_active";

function mapTemplate(r: Record<string, unknown>): CrmStageTemplate {
  return {
    id: r.id as string,
    stageId: r.stage_id as string,
    title: r.title as string,
    activityType: r.activity_type as CrmActivityKind,
    dayOffset: r.day_offset as number,
    orderIndex: r.order_index as number,
    script: r.script as string | null,
    isActive: r.is_active as boolean,
  };
}

export async function fetchStageTemplates(stageId: string, companyId: string): Promise<CrmStageTemplate[]> {
  const sb = requireClient();
  const { data, error } = await sb
    .from("pipeline_stage_activities")
    .select(TEMPLATE_COLS)
    .eq("stage_id", stageId)
    .eq("company_id", companyId)
    .order("order_index", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapTemplate(r as unknown as Record<string, unknown>));
}

/** Substitui a cadência da etapa (delete + upsert em ordem). */
export async function saveStageTemplates(
  stageId: string,
  companyId: string,
  templates: Array<{ id?: string; title: string; activityType: CrmActivityKind; dayOffset: number; script?: string | null }>,
): Promise<void> {
  const sb = requireClient();

  const { data: existing } = await sb
    .from("pipeline_stage_activities")
    .select("id")
    .eq("stage_id", stageId)
    .eq("company_id", companyId);

  const incoming = new Set(templates.map((t) => t.id).filter(Boolean));
  const toDelete = (existing ?? []).map((e) => e.id).filter((id) => !incoming.has(id));
  if (toDelete.length > 0) {
    const { error } = await sb.from("pipeline_stage_activities").delete().in("id", toDelete);
    if (error) throw new Error(error.message);
  }

  for (let i = 0; i < templates.length; i++) {
    const t = templates[i];
    const row = {
      title: t.title.trim(),
      activity_type: t.activityType,
      day_offset: t.dayOffset,
      order_index: i,
      script: t.script ?? null,
    };
    if (t.id) {
      const { error } = await sb.from("pipeline_stage_activities").update(row).eq("id", t.id).eq("company_id", companyId);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await sb.from("pipeline_stage_activities").insert({ ...row, stage_id: stageId, company_id: companyId });
      if (error) throw new Error(error.message);
    }
  }
}

/**
 * Instancia a cadência da etapa no negócio (porte de instantiateStagePlaybook):
 * cria deal_activities dos templates ativos, agendadas em agora + day_offset
 * dias, atribuídas ao dono do negócio. Idempotente via source_template_id.
 */
export async function instantiateStagePlaybook(dealId: string, stageId: string, companyId: string): Promise<void> {
  const sb = requireClient();

  const [{ data: templates }, { data: existing }, { data: deal }] = await Promise.all([
    sb.from("pipeline_stage_activities")
      .select("id, title, activity_type, day_offset, order_index, script, icon_key, action_label")
      .eq("stage_id", stageId)
      .eq("company_id", companyId)
      .eq("is_active", true)
      .order("order_index", { ascending: true }),
    sb.from("deal_activities").select("source_template_id").eq("deal_id", dealId).not("source_template_id", "is", null),
    sb.from("deals").select("owner_id").eq("id", dealId).maybeSingle(),
  ]);

  const done = new Set((existing ?? []).map((e) => e.source_template_id));
  const missing = (templates ?? []).filter((t) => !done.has(t.id));
  if (missing.length === 0) return;

  const { error } = await sb.from("deal_activities").insert(
    missing.map((t) => ({
      deal_id: dealId,
      company_id: companyId,
      title: t.title,
      activity_type: t.activity_type,
      script: t.script,
      icon_key: t.icon_key,
      action_label: t.action_label,
      day_offset: t.day_offset,
      order_index: t.order_index,
      source_template_id: t.id,
      assigned_to: deal?.owner_id ?? null,
      scheduled_start_at: new Date(Date.now() + t.day_offset * 86_400_000).toISOString(),
      is_custom: false,
    })),
  );
  if (error) throw new Error(error.message);
}

// ─── Calendário (deal_activities agendadas da empresa) ────────────────────────

export interface CrmCalendarItem {
  id: string;
  dealId: string;
  dealTitle: string;
  title: string;
  activityType: CrmActivityKind;
  scheduledStartAt: string;
  completedAt: string | null;
}

export async function fetchCalendar(companyId: string, fromIso: string, toIso: string): Promise<CrmCalendarItem[]> {
  const sb = requireClient();
  const { data: rows, error } = await sb
    .from("deal_activities")
    .select("id, deal_id, title, activity_type, scheduled_start_at, completed_at")
    .eq("company_id", companyId)
    .gte("scheduled_start_at", fromIso)
    .lte("scheduled_start_at", toIso)
    .order("scheduled_start_at", { ascending: true })
    .limit(500);
  if (error) throw new Error(error.message);
  if (!rows || rows.length === 0) return [];

  const dealIds = Array.from(new Set(rows.map((r) => r.deal_id)));
  const { data: deals } = await sb.from("deals").select("id, title").in("id", dealIds);
  const titleMap = new Map((deals ?? []).map((d) => [d.id, d.title]));

  return rows
    .filter((r) => r.scheduled_start_at !== null)
    .map((r) => ({
      id: r.id,
      dealId: r.deal_id,
      dealTitle: titleMap.get(r.deal_id) ?? "Negócio",
      title: r.title,
      activityType: r.activity_type as CrmActivityKind,
      scheduledStartAt: r.scheduled_start_at as string,
      completedAt: r.completed_at,
    }));
}

// ─── Histórico do negócio ─────────────────────────────────────────────────────

export interface CrmHistoryEvent {
  id: string;
  eventType: string;
  details: string | null;
  oldValue: string | null;
  newValue: string | null;
  userName: string | null;
  createdAt: string;
}

export type CrmCompanyHistoryEvent = CrmHistoryEvent & { dealId: string };

/** Todo o histórico da empresa (Dashboard: entradas por etapa no período). */
export async function fetchCompanyDealHistory(companyId: string): Promise<CrmCompanyHistoryEvent[]> {
  const sb = requireClient();
  const { data: rows, error } = await sb
    .from("deal_history")
    .select("id, deal_id, event_type, details, old_value, new_value, user_id, created_at")
    .eq("company_id", companyId);
  if (error) throw new Error(error.message);
  return (rows ?? []).map((r) => ({
    id: r.id,
    dealId: r.deal_id,
    eventType: r.event_type,
    details: r.details,
    oldValue: r.old_value,
    newValue: r.new_value,
    userName: null,
    createdAt: r.created_at,
  }));
}

export async function fetchDealHistory(dealId: string, companyId: string): Promise<CrmHistoryEvent[]> {
  const sb = requireClient();
  const { data: rows, error } = await sb
    .from("deal_history")
    .select("id, event_type, details, old_value, new_value, user_id, created_at")
    .eq("deal_id", dealId)
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  if (!rows || rows.length === 0) return [];

  const userIds = Array.from(new Set(rows.map((r) => r.user_id).filter((id): id is string => id !== null)));
  const nameMap = new Map<string, string | null>();
  if (userIds.length > 0) {
    const { data: profiles } = await sb.from("profiles").select("id, full_name").in("id", userIds);
    for (const p of profiles ?? []) nameMap.set(p.id, p.full_name);
  }

  return rows.map((r) => ({
    id: r.id,
    eventType: r.event_type,
    details: r.details,
    oldValue: r.old_value,
    newValue: r.new_value,
    userName: r.user_id ? (nameMap.get(r.user_id) ?? null) : null,
    createdAt: r.created_at,
  }));
}

// ─── Inbox omnicanal (channel_connections / conversations / messages) ─────────

export type CrmChannelProvider = "instagram" | "whatsapp_zapi" | "whatsapp_cloud";
export type CrmConversationStatus = "open" | "resolved" | "pending";

export interface CrmChannel {
  id: string;
  provider: CrmChannelProvider;
  status: "connected" | "disconnected" | "error";
  accountName: string | null;
  accountHandle: string | null;
}

export interface CrmConversation {
  id: string;
  provider: CrmChannelProvider;
  contactName: string | null;
  contactHandle: string | null;
  status: CrmConversationStatus;
  lastMessageAt: string;
  lastMessagePreview: string | null;
  unreadCount: number;
  leadId: string | null;
  dealId: string | null;
}

export interface CrmMessage {
  id: string;
  conversationId: string;
  direction: "inbound" | "outbound";
  senderType: "contact" | "agent";
  content: string | null;
  contentType: string;
  status: string;
  createdAt: string;
}

export async function deleteChannelConnection(connectionId: string, companyId: string): Promise<void> {
  const sb = requireClient();
  const { error } = await sb.from("channel_connections").delete().eq("id", connectionId).eq("company_id", companyId);
  if (error) throw new Error(error.message);
}

export async function fetchChannels(companyId: string): Promise<CrmChannel[]> {
  const sb = requireClient();
  const { data, error } = await sb
    .from("channel_connections")
    .select("id, provider, status, account_name, account_handle")
    .eq("company_id", companyId)
    .order("connected_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id,
    provider: r.provider as CrmChannelProvider,
    status: r.status as CrmChannel["status"],
    accountName: r.account_name,
    accountHandle: r.account_handle,
  }));
}

export async function fetchConversations(companyId: string): Promise<CrmConversation[]> {
  const sb = requireClient();
  const { data, error } = await sb
    .from("conversations")
    .select("id, provider, contact_name, contact_handle, status, last_message_at, last_message_preview, unread_count, lead_id, deal_id")
    .eq("company_id", companyId)
    .order("last_message_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id,
    provider: r.provider as CrmChannelProvider,
    contactName: r.contact_name,
    contactHandle: r.contact_handle,
    status: r.status as CrmConversationStatus,
    lastMessageAt: r.last_message_at,
    lastMessagePreview: r.last_message_preview,
    unreadCount: r.unread_count,
    leadId: r.lead_id,
    dealId: r.deal_id,
  }));
}

export async function fetchMessages(conversationId: string, companyId: string): Promise<CrmMessage[]> {
  const sb = requireClient();
  const { data, error } = await sb
    .from("messages")
    .select("id, conversation_id, direction, sender_type, content, content_type, status, provider_timestamp")
    .eq("conversation_id", conversationId)
    .eq("company_id", companyId)
    .order("provider_timestamp", { ascending: true })
    .limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id,
    conversationId: r.conversation_id,
    direction: r.direction as CrmMessage["direction"],
    senderType: r.sender_type as CrmMessage["senderType"],
    content: r.content,
    contentType: r.content_type,
    status: r.status,
    createdAt: r.provider_timestamp,
  }));
}

/**
 * Envia mensagem (grava outbound no banco e atualiza o preview da conversa).
 * O envio REAL pelo provedor (Z-API/Cloud/IG) entra na fase de integrações.
 */
export async function sendMessage(conversationId: string, companyId: string, content: string): Promise<CrmMessage> {
  const sb = requireClient();
  const text = content.trim();
  if (!text) throw new Error("Mensagem vazia.");
  const { data: auth } = await sb.auth.getUser();

  const { data, error } = await sb
    .from("messages")
    .insert({
      conversation_id: conversationId,
      company_id: companyId,
      direction: "outbound",
      sender_type: "agent",
      sender_id: auth.user?.id ?? null,
      content: text,
      content_type: "text",
      status: "sent",
    })
    .select("id, conversation_id, direction, sender_type, content, content_type, status, provider_timestamp")
    .single();
  if (error) throw new Error(error.message);

  await sb
    .from("conversations")
    .update({ last_message_at: new Date().toISOString(), last_message_preview: text.slice(0, 120) })
    .eq("id", conversationId)
    .eq("company_id", companyId);

  void dispatchOutboundMessage(companyId, data.id, conversationId);

  return {
    id: data.id,
    conversationId: data.conversation_id,
    direction: data.direction as CrmMessage["direction"],
    senderType: data.sender_type as CrmMessage["senderType"],
    content: data.content,
    contentType: data.content_type,
    status: data.status,
    createdAt: data.provider_timestamp,
  };
}

export async function markConversationRead(conversationId: string, companyId: string): Promise<void> {
  const sb = requireClient();
  const { error } = await sb
    .from("conversations")
    .update({ unread_count: 0 })
    .eq("id", conversationId)
    .eq("company_id", companyId);
  if (error) throw new Error(error.message);
}

/** Vincula lead (e opcionalmente negócio) à conversa — LeadLinker do Inbox. */
export async function linkConversationLead(
  conversationId: string,
  companyId: string,
  leadId: string,
  dealId?: string | null,
): Promise<void> {
  const sb = requireClient();
  const { error } = await sb
    .from("conversations")
    .update({ lead_id: leadId, deal_id: dealId ?? null })
    .eq("id", conversationId)
    .eq("company_id", companyId);
  if (error) throw new Error(error.message);
}

export async function setConversationStatus(
  conversationId: string,
  companyId: string,
  status: CrmConversationStatus,
): Promise<void> {
  const sb = requireClient();
  const { error } = await sb
    .from("conversations")
    .update({ status })
    .eq("id", conversationId)
    .eq("company_id", companyId);
  if (error) throw new Error(error.message);
}

// ─── Notificações ─────────────────────────────────────────────────────────────

export interface CrmNotification {
  id: string;
  eventType: string;
  title: string;
  body: string | null;
  relatedDealId: string | null;
  readAt: string | null;
  createdAt: string;
}

export async function fetchNotifications(companyId: string): Promise<CrmNotification[]> {
  const sb = requireClient();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return [];
  const { data, error } = await sb
    .from("notifications")
    .select("id, event_type, title, body, related_deal_id, read_at, created_at")
    .eq("company_id", companyId)
    .eq("user_id", auth.user.id)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id,
    eventType: r.event_type,
    title: r.title,
    body: r.body,
    relatedDealId: r.related_deal_id,
    readAt: r.read_at,
    createdAt: r.created_at,
  }));
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  const sb = requireClient();
  const { error } = await sb
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId);
  if (error) throw new Error(error.message);
}

export async function markAllNotificationsRead(companyId: string): Promise<void> {
  const sb = requireClient();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return;
  const { error } = await sb
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("company_id", companyId)
    .eq("user_id", auth.user.id)
    .is("read_at", null);
  if (error) throw new Error(error.message);
}

// ─── Busca global (Ctrl+K — CommandPalette do original) ───────────────────────

export interface GlobalSearchResult {
  leads: Array<{ id: string; name: string; email: string | null; company: string | null }>;
  deals: Array<{ id: string; title: string; value: number | null; pipeline_id: string }>;
  companies: Array<{ id: string; name: string }>;
}

export async function globalSearch(companyId: string, query: string): Promise<GlobalSearchResult> {
  const sb = requireClient();
  const q = query.replace(/[%_,]/g, " ").trim();
  if (q.length < 2) return { leads: [], deals: [], companies: [] };
  const like = `%${q}%`;
  const [leadsRes, dealsRes, companiesRes] = await Promise.all([
    sb.from("crm_leads").select("id, name, email, company").eq("company_id", companyId)
      .or(`name.ilike.${like},email.ilike.${like},company.ilike.${like}`).limit(5),
    sb.from("deals").select("id, title, value, pipeline_id").eq("company_id", companyId)
      .ilike("title", like).limit(5),
    sb.from("crm_companies").select("id, name").eq("company_id", companyId)
      .ilike("name", like).limit(5),
  ]);
  return {
    leads: (leadsRes.data ?? []) as GlobalSearchResult["leads"],
    deals: (dealsRes.data ?? []) as GlobalSearchResult["deals"],
    companies: (companiesRes.data ?? []) as GlobalSearchResult["companies"],
  };
}

// ─── Duplicados (aviso pré-criação, como no original) ─────────────────────────

export async function findDuplicateDeals(
  companyId: string,
  pipelineId: string,
  title: string,
): Promise<Array<{ id: string; title: string }>> {
  const sb = requireClient();
  const term = `%${title.replace(/[%,()]/g, "").trim()}%`;
  if (term === "%%") return [];
  const { data } = await sb
    .from("deals")
    .select("id, title")
    .eq("company_id", companyId)
    .eq("pipeline_id", pipelineId)
    .ilike("title", term)
    .limit(3);
  return data ?? [];
}

export async function findDuplicateLeads(
  companyId: string,
  name: string,
  email?: string,
): Promise<Array<{ id: string; name: string; email: string | null }>> {
  const sb = requireClient();
  const safe = name.replace(/[%,()]/g, "").trim();
  if (!safe && !email?.trim()) return [];
  let q = sb.from("crm_leads").select("id, name, email").eq("company_id", companyId).limit(3);
  if (email?.trim()) q = q.or(`name.ilike.%${safe}%,email.eq.${email.trim()}`);
  else q = q.ilike("name", `%${safe}%`);
  const { data } = await q;
  return data ?? [];
}

// ─── API pública: tokens (api_tokens) ─────────────────────────────────────────

export interface CrmApiToken {
  id: string;
  name: string;
  scopes: string[];
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export async function fetchApiTokens(companyId: string): Promise<CrmApiToken[]> {
  const sb = requireClient();
  const { data, error } = await sb
    .from("api_tokens")
    .select("id, name, scopes, last_used_at, revoked_at, created_at")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id, name: r.name, scopes: r.scopes ?? [],
    lastUsedAt: r.last_used_at, revokedAt: r.revoked_at, createdAt: r.created_at,
  }));
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Cria token e retorna o valor em claro UMA vez (só o hash vai pro banco). */
export async function createApiToken(companyId: string, name: string): Promise<{ token: string; record: CrmApiToken }> {
  const sb = requireClient();
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Nome do token obrigatório.");
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) throw new Error("Não autenticado.");

  const raw = new Uint8Array(32);
  crypto.getRandomValues(raw);
  const token = `pf_${Array.from(raw).map((b) => b.toString(16).padStart(2, "0")).join("")}`;
  const tokenHash = await sha256Hex(token);

  const { data, error } = await sb
    .from("api_tokens")
    .insert({ company_id: companyId, created_by: auth.user.id, name: trimmed, token_hash: tokenHash, scopes: ["read", "write"] })
    .select("id, name, scopes, last_used_at, revoked_at, created_at")
    .single();
  if (error) throw new Error(error.message);

  return {
    token,
    record: {
      id: data.id, name: data.name, scopes: data.scopes ?? [],
      lastUsedAt: data.last_used_at, revokedAt: data.revoked_at, createdAt: data.created_at,
    },
  };
}

export async function revokeApiToken(tokenId: string, companyId: string): Promise<void> {
  const sb = requireClient();
  const { error } = await sb
    .from("api_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", tokenId)
    .eq("company_id", companyId);
  if (error) throw new Error(error.message);
}

// ─── Webhooks de saída (webhook_subscriptions) ────────────────────────────────

export const CRM_WEBHOOK_EVENTS = [
  "deal.created", "deal.updated", "deal.stage_changed", "deal.won", "deal.lost",
  "lead.created", "lead.updated",
] as const;

export interface CrmWebhook {
  id: string;
  name: string;
  url: string;
  events: string[];
  secret: string;
  isActive: boolean;
  lastTriggeredAt: string | null;
  lastStatusCode: number | null;
}

export async function fetchWebhooks(companyId: string): Promise<CrmWebhook[]> {
  const sb = requireClient();
  const { data, error } = await sb
    .from("webhook_subscriptions")
    .select("id, name, url, events, secret, is_active, last_triggered_at, last_status_code")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id, name: r.name, url: r.url, events: r.events ?? [], secret: r.secret,
    isActive: r.is_active, lastTriggeredAt: r.last_triggered_at, lastStatusCode: r.last_status_code,
  }));
}

export async function createWebhook(
  companyId: string,
  input: { name: string; url: string; events: string[] },
): Promise<CrmWebhook> {
  const sb = requireClient();
  if (!input.name.trim()) throw new Error("Nome obrigatório.");
  if (!/^https:\/\//.test(input.url.trim())) throw new Error("URL precisa ser https://");
  if (input.events.length === 0) throw new Error("Escolha ao menos um evento.");

  const raw = new Uint8Array(24);
  crypto.getRandomValues(raw);
  const secret = `whsec_${Array.from(raw).map((b) => b.toString(16).padStart(2, "0")).join("")}`;

  const { data, error } = await sb
    .from("webhook_subscriptions")
    .insert({ company_id: companyId, name: input.name.trim(), url: input.url.trim(), events: input.events, secret })
    .select("id, name, url, events, secret, is_active, last_triggered_at, last_status_code")
    .single();
  if (error) throw new Error(error.message);
  return {
    id: data.id, name: data.name, url: data.url, events: data.events ?? [], secret: data.secret,
    isActive: data.is_active, lastTriggeredAt: data.last_triggered_at, lastStatusCode: data.last_status_code,
  };
}

export async function setWebhookActive(webhookId: string, companyId: string, isActive: boolean): Promise<void> {
  const sb = requireClient();
  const { error } = await sb
    .from("webhook_subscriptions")
    .update({ is_active: isActive })
    .eq("id", webhookId)
    .eq("company_id", companyId);
  if (error) throw new Error(error.message);
}

export async function deleteWebhook(webhookId: string, companyId: string): Promise<void> {
  const sb = requireClient();
  const { error } = await sb.from("webhook_subscriptions").delete().eq("id", webhookId).eq("company_id", companyId);
  if (error) throw new Error(error.message);
}

// ─── Webhooks de entrada (inbound_webhooks) — captação pública de leads ───────

export interface CrmInboundWebhook {
  id: string;
  name: string;
  webhookKey: string;
  pipelineId: string | null;
  defaultStageId: string | null;
  defaultOwnerId: string | null;
  defaultTags: string[];
  defaultProduct: string | null;
  fieldMap: Record<string, string>;
  isActive: boolean;
  createdAt: string;
}

function mapInboundWebhook(r: Record<string, unknown>): CrmInboundWebhook {
  return {
    id: r.id as string, name: r.name as string, webhookKey: r.webhook_key as string,
    pipelineId: (r.pipeline_id as string) ?? null, defaultStageId: (r.default_stage_id as string) ?? null,
    defaultOwnerId: (r.default_owner_id as string) ?? null, defaultTags: (r.default_tags as string[]) ?? [],
    defaultProduct: (r.default_product as string) ?? null, fieldMap: (r.field_map as Record<string, string>) ?? {},
    isActive: r.is_active as boolean, createdAt: r.created_at as string,
  };
}

const INBOUND_COLS =
  "id, name, webhook_key, pipeline_id, default_stage_id, default_owner_id, default_tags, default_product, field_map, is_active, created_at";

export async function fetchInboundWebhooks(companyId: string): Promise<CrmInboundWebhook[]> {
  const sb = requireClient();
  const { data, error } = await sb.from("inbound_webhooks").select(INBOUND_COLS).eq("company_id", companyId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapInboundWebhook(r as Record<string, unknown>));
}

function genWebhookKey(): string {
  const raw = new Uint8Array(20);
  crypto.getRandomValues(raw);
  return `wh_${Array.from(raw).map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export async function createInboundWebhook(
  companyId: string,
  input: { name: string; pipelineId?: string | null; defaultStageId?: string | null },
): Promise<CrmInboundWebhook> {
  const sb = requireClient();
  if (!input.name.trim()) throw new Error("Nome obrigatório.");
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) throw new Error("Não autenticado.");

  const { data, error } = await sb
    .from("inbound_webhooks")
    .insert({
      company_id: companyId, name: input.name.trim(), webhook_key: genWebhookKey(),
      pipeline_id: input.pipelineId ?? null, default_stage_id: input.defaultStageId ?? null,
      default_owner_id: auth.user.id,
    })
    .select(INBOUND_COLS)
    .single();
  if (error) throw new Error(error.message);
  return mapInboundWebhook(data as Record<string, unknown>);
}

export async function updateInboundWebhook(
  id: string, companyId: string, patch: { name?: string; isActive?: boolean },
): Promise<void> {
  const sb = requireClient();
  const row: Record<string, unknown> = {};
  if ("name" in patch) row.name = patch.name?.trim();
  if ("isActive" in patch) row.is_active = patch.isActive;
  if (Object.keys(row).length === 0) return;
  const { error } = await sb.from("inbound_webhooks").update(row).eq("id", id).eq("company_id", companyId);
  if (error) throw new Error(error.message);
}

export async function deleteInboundWebhook(id: string, companyId: string): Promise<void> {
  const sb = requireClient();
  const { error } = await sb.from("inbound_webhooks").delete().eq("id", id).eq("company_id", companyId);
  if (error) throw new Error(error.message);
}

export async function regenerateInboundWebhookKey(id: string, companyId: string): Promise<string> {
  const sb = requireClient();
  const webhookKey = genWebhookKey();
  const { error } = await sb.from("inbound_webhooks").update({ webhook_key: webhookKey }).eq("id", id).eq("company_id", companyId);
  if (error) throw new Error(error.message);
  return webhookKey;
}

// ─── Disparo de webhooks a partir do cliente (deal.*/lead.*) ─────────────────
// Fire-and-forget: a entrega HTTP real roda no servidor (/api/crm/webhooks/dispatch)
// pra evitar CORS/SSRF do browser. Chamado de createDeal/moveDeal/createLead.

async function triggerWebhooks(companyId: string, event: string, payload: Record<string, unknown>): Promise<void> {
  try {
    const sb = requireClient();
    const { data } = await sb.auth.getSession();
    const accessToken = data.session?.access_token;
    if (!accessToken) return;
    await fetch("/api/crm/webhooks/dispatch", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ companyId, event, payload }),
    });
  } catch {
    // best-effort — falha de rede não pode quebrar a mutação principal
  }
}

/** Dispara o envio real da mensagem pelo provedor (WhatsApp Cloud/Instagram). */
async function dispatchOutboundMessage(companyId: string, messageId: string, conversationId: string): Promise<void> {
  try {
    const sb = requireClient();
    const { data } = await sb.auth.getSession();
    const accessToken = data.session?.access_token;
    if (!accessToken) return;
    await fetch("/api/crm/messages/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ companyId, messageId, conversationId }),
    });
  } catch {
    // best-effort — status "failed" fica só se a rota responder; sem rede, mensagem
    // segue "sent" otimista no banco (mesma politica de fire-and-forget dos webhooks)
  }
}

// ─── Campos personalizados (custom_field_definitions / values) ────────────────

export type CrmFieldEntity = "contact" | "company" | "deal";
export type CrmFieldType =
  | "text" | "number" | "monetary" | "date" | "datetime" | "phone"
  | "email" | "url" | "select" | "multi_select" | "textarea" | "checkbox";

export interface CrmFieldDef {
  id: string;
  entityType: CrmFieldEntity;
  label: string;
  fieldType: CrmFieldType;
  options: string[] | null; // p/ select/multi_select
  groupName: string;
  sortOrder: number;
  isActive: boolean;
  placeholder: string | null;
}

const FIELD_DEF_COLS = "id, entity_type, label, field_type, options, group_name, sort_order, is_active, placeholder";

function mapFieldDef(r: Record<string, unknown>): CrmFieldDef {
  return {
    id: r.id as string,
    entityType: r.entity_type as CrmFieldEntity,
    label: r.label as string,
    fieldType: r.field_type as CrmFieldType,
    options: Array.isArray(r.options) ? (r.options as string[]) : null,
    groupName: (r.group_name as string) ?? "Geral",
    sortOrder: (r.sort_order as number) ?? 0,
    isActive: (r.is_active as boolean) ?? true,
    placeholder: (r.placeholder as string | null) ?? null,
  };
}

export async function fetchFieldDefs(companyId: string, entity?: CrmFieldEntity): Promise<CrmFieldDef[]> {
  const sb = requireClient();
  let q = sb
    .from("custom_field_definitions")
    .select(FIELD_DEF_COLS)
    .eq("company_id", companyId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (entity) q = q.eq("entity_type", entity);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapFieldDef(r as unknown as Record<string, unknown>));
}

export async function saveFieldDef(
  companyId: string,
  def: {
    id?: string; entityType: CrmFieldEntity; label: string; fieldType: CrmFieldType;
    options?: string[] | null; groupName?: string; placeholder?: string | null;
  },
): Promise<CrmFieldDef> {
  const sb = requireClient();
  const label = def.label.trim();
  if (!label) throw new Error("Nome do campo obrigatório.");
  const row: Record<string, unknown> = {
    entity_type: def.entityType,
    label,
    field_type: def.fieldType,
    options: def.options && def.options.length > 0 ? def.options : null,
  };
  if (def.groupName !== undefined) row.group_name = def.groupName || "Geral";
  if (def.placeholder !== undefined) row.placeholder = def.placeholder;
  if (def.id) {
    const { data, error } = await sb
      .from("custom_field_definitions")
      .update(row)
      .eq("id", def.id)
      .eq("company_id", companyId)
      .select(FIELD_DEF_COLS)
      .single();
    if (error) throw new Error(error.message);
    return mapFieldDef(data as unknown as Record<string, unknown>);
  }
  const { data, error } = await sb
    .from("custom_field_definitions")
    .insert({ ...row, company_id: companyId })
    .select(FIELD_DEF_COLS)
    .single();
  if (error) throw new Error(error.message);
  return mapFieldDef(data as unknown as Record<string, unknown>);
}

/** Desativa (soft delete) — valores históricos permanecem no banco. */
export async function deleteFieldDef(fieldId: string, companyId: string): Promise<void> {
  const sb = requireClient();
  const { error } = await sb
    .from("custom_field_definitions")
    .update({ is_active: false })
    .eq("id", fieldId)
    .eq("company_id", companyId);
  if (error) throw new Error(error.message);
}

export async function fetchFieldValues(companyId: string, entityId: string): Promise<Map<string, string>> {
  const sb = requireClient();
  const { data, error } = await sb
    .from("custom_field_values")
    .select("field_id, value")
    .eq("company_id", companyId)
    .eq("entity_id", entityId);
  if (error) throw new Error(error.message);
  return new Map((data ?? []).map((r) => [r.field_id, r.value ?? ""]));
}

export async function setFieldValue(
  companyId: string,
  fieldId: string,
  entityId: string,
  value: string | null,
): Promise<void> {
  const sb = requireClient();
  const { error } = await sb
    .from("custom_field_values")
    .upsert(
      { company_id: companyId, field_id: fieldId, entity_id: entityId, value },
      { onConflict: "field_id,entity_id" },
    );
  if (error) throw new Error(error.message);
}

// ─── Gestão de tags ───────────────────────────────────────────────────────────

export async function updateTag(
  tagId: string,
  companyId: string,
  patch: Partial<Pick<CrmTag, "name" | "color">>,
): Promise<void> {
  const sb = requireClient();
  const row: Record<string, unknown> = {};
  if ("name" in patch) row.name = patch.name?.trim();
  if ("color" in patch) row.color = patch.color;
  if (Object.keys(row).length === 0) return;
  const { error } = await sb.from("tags").update(row).eq("id", tagId).eq("company_id", companyId);
  if (error) throw new Error(error.message);
}

export async function deleteTag(tagId: string, companyId: string): Promise<void> {
  const sb = requireClient();
  const { error } = await sb.from("tags").delete().eq("id", tagId).eq("company_id", companyId);
  if (error) throw new Error(error.message);
}

// ─── Metas do mês (dashboard_goals, escopo global: pipeline_id null) ──────────

export interface CrmGoal {
  month: number;
  year: number;
  leads: number;
  sales: number;
  revenue: number;
  annualRevenue?: number;
}

export interface CrmGoalEntry extends CrmGoal {
  pipelineId: string | null;
}

export async function fetchGoal(
  companyId: string, month: number, year: number, pipelineId: string | null = null,
): Promise<CrmGoal | null> {
  const sb = requireClient();
  let query = sb
    .from("dashboard_goals")
    .select("month, year, leads, sales, revenue, annual_revenue")
    .eq("company_id", companyId)
    .eq("month", month)
    .eq("year", year);
  query = pipelineId ? query.eq("pipeline_id", pipelineId) : query.is("pipeline_id", null);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(error.message);
  return data
    ? { month: data.month, year: data.year, leads: data.leads, sales: data.sales, revenue: Number(data.revenue), annualRevenue: Number(data.annual_revenue ?? 0) }
    : null;
}

export async function saveGoal(companyId: string, goal: CrmGoal, pipelineId: string | null = null): Promise<void> {
  const sb = requireClient();
  // upsert manual: a UNIQUE de meta global é índice parcial (pipeline_id null)
  let existingQuery = sb
    .from("dashboard_goals")
    .select("id")
    .eq("company_id", companyId)
    .eq("month", goal.month)
    .eq("year", goal.year);
  existingQuery = pipelineId ? existingQuery.eq("pipeline_id", pipelineId) : existingQuery.is("pipeline_id", null);
  const { data: existing } = await existingQuery.maybeSingle();

  const row = { leads: goal.leads, sales: goal.sales, revenue: goal.revenue, annual_revenue: goal.annualRevenue ?? 0 };
  if (existing) {
    const { error } = await sb.from("dashboard_goals").update(row).eq("id", existing.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await sb
      .from("dashboard_goals")
      .insert({ ...row, company_id: companyId, month: goal.month, year: goal.year, pipeline_id: pipelineId });
    if (error) throw new Error(error.message);
  }
}

/** Todas as metas da empresa (globais + por funil), mais recentes primeiro. */
export async function fetchGoals(companyId: string): Promise<CrmGoalEntry[]> {
  const sb = requireClient();
  const { data, error } = await sb
    .from("dashboard_goals")
    .select("month, year, leads, sales, revenue, annual_revenue, pipeline_id")
    .eq("company_id", companyId)
    .order("year", { ascending: false })
    .order("month", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((d) => ({
    month: d.month, year: d.year, leads: d.leads, sales: d.sales,
    revenue: Number(d.revenue), annualRevenue: Number(d.annual_revenue ?? 0), pipelineId: d.pipeline_id,
  }));
}
