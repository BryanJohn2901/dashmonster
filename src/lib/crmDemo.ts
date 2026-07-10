// ─── PipeFlow CRM — modo demo (preview sem Supabase) ─────────────────────────
// Mesmas assinaturas de crmSupabase.ts, dados em memória por empresa. Usado
// pela fachada crm.ts quando NEXT_PUBLIC_SUPABASE_URL não está configurado —
// igual ao padrão das empresas demo do useCompany. Mutações persistem só até
// o reload da página.

import type {
  CrmPipeline, CrmStage, CrmStageStatusKind, CrmDeal, CrmDealDetail, CrmDealStatus,
  CrmLead, CrmLeadStatus, CrmActivity, CrmActivityKind, CrmHistoryEvent, CrmTag,
  CrmStats, SavePipelineInput, CrmCompany, CrmStageTemplate, CrmCalendarItem,
  CrmChannel, CrmConversation, CrmConversationStatus, CrmMessage, CrmNotification,
  CrmFieldDef, CrmFieldEntity, CrmFieldType, CrmGoal, CrmGoalEntry, CrmApiToken, CrmWebhook,
  CrmPlaybookActivity, CrmInboundWebhook,
} from "@/lib/crmSupabase";

// Constante compartilhada (a fachada exige paridade de exports com o real)
export { CRM_WEBHOOK_EVENTS } from "@/lib/crmSupabase";

// ─── Banco em memória ─────────────────────────────────────────────────────────

interface DB {
  pipelines: Array<{ id: string; name: string; createdAt: string }>;
  stages: CrmStage[];
  deals: CrmDealDetail[];
  leads: CrmLead[];
  activities: CrmActivity[];
  tags: CrmTag[];
  dealTags: Array<{ dealId: string; tagId: string }>;
  history: Array<CrmHistoryEvent & { dealId: string }>;
  crmCompanies: CrmCompany[];
  templates: CrmStageTemplate[];
  channels: CrmChannel[];
  conversations: CrmConversation[];
  messages: CrmMessage[];
  notifications: CrmNotification[];
  fieldDefs: CrmFieldDef[];
  fieldValues: Array<{ fieldId: string; entityId: string; value: string | null }>;
  goals: Array<CrmGoalEntry & { id: string }>;
  apiTokens: CrmApiToken[];
  webhooks: CrmWebhook[];
  inboundWebhooks: CrmInboundWebhook[];
  playbooks: import("@/lib/crmSupabase").CrmPlaybook[];
  leadActivities: import("@/lib/crmSupabase").CrmLegacyActivity[];
}

const dbs = new Map<string, DB>();

const uid = () => (globalThis.crypto?.randomUUID?.() ?? `demo-${Math.random().toString(36).slice(2)}`);
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
const hoursFromNow = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

const OWNER = "Você (demo)";

function emptyDb(): DB {
  return {
    pipelines: [], stages: [], deals: [], leads: [], activities: [], tags: [], dealTags: [],
    history: [], crmCompanies: [], templates: [], channels: [], conversations: [], messages: [], notifications: [],
    fieldDefs: [], fieldValues: [], goals: [], apiTokens: [], webhooks: [], playbooks: [],
    leadActivities: [], inboundWebhooks: [],
  };
}

function db(companyId: string): DB {
  let d = dbs.get(companyId);
  if (!d) {
    d = emptyDb();
    seed(d);
    dbs.set(companyId, d);
  }
  return d;
}

// ─── Seed: funil populado pra VER a interface ─────────────────────────────────

const DEFAULT_STAGES: Array<{ name: string; color: string; statusKind: CrmStageStatusKind }> = [
  { name: "Novo Lead",  color: "slate",   statusKind: "open" },
  { name: "Contatado",  color: "blue",    statusKind: "open" },
  { name: "Proposta",   color: "amber",   statusKind: "open" },
  { name: "Negociação", color: "indigo",  statusKind: "open" },
  { name: "Ganho",      color: "emerald", statusKind: "won"  },
  { name: "Perdido",    color: "rose",    statusKind: "lost" },
];

function makeLead(input: Partial<CrmLead> & { name: string }): CrmLead {
  return {
    id: uid(), email: null, phone: null, whatsapp: null, instagram: null,
    company: null, jobTitle: null, status: "new", ownerId: "demo-user",
    ownerName: OWNER, notes: null, createdAt: hoursAgo(72), crmCompanyId: null, estimatedValue: null, ...input,
  };
}

function makeDeal(input: Partial<CrmDealDetail> & { title: string; pipelineId: string; stageId: string }): CrmDealDetail {
  return {
    id: uid(), value: null, status: "open", ownerId: "demo-user", leadId: null, crmCompanyId: null,
    productName: null, temperature: null, expectedCloseDate: null, dueDate: null, lostReason: null,
    proposalUrl: null, paymentUrl: null, schedulingUrl: null, contractUrl: null,
    utmSource: null, utmMedium: null, utmCampaign: null, utmContent: null,
    acquisitionChannel: null, landingPageUrl: null,
    stageEnteredAt: hoursAgo(24), createdAt: hoursAgo(96), ...input,
  };
}

function seed(d: DB) {
  const pipelineId = uid();
  d.pipelines.push({ id: pipelineId, name: "Funil Principal", createdAt: hoursAgo(200) });
  d.stages = DEFAULT_STAGES.map((s, i) => ({
    id: uid(), pipelineId, name: s.name, color: s.color, orderIndex: i, statusKind: s.statusKind,
  }));
  const [sNovo, sContato, sProposta, sNegociacao, sGanho, sPerdido] = d.stages;

  const ana = makeLead({ name: "Ana Souza", email: "ana@exemplo.com", phone: "(11) 98888-1111", instagram: "@ana.fit", status: "negotiation", company: "Studio Ana Fit", jobTitle: "Dona" });
  const bruno = makeLead({ name: "Bruno Lima", email: "bruno@exemplo.com", whatsapp: "(21) 97777-2222", status: "contacted" });
  const carla = makeLead({ name: "Carla Mendes", email: "carla@exemplo.com", status: "proposal", company: "CM Estética" });
  const diego = makeLead({ name: "Diego Rocha", phone: "(31) 96666-3333", status: "new" });
  d.leads.push(ana, bruno, carla, diego);

  const tQuente = { id: uid(), name: "Quente", color: "rose" };
  const tIndicacao = { id: uid(), name: "Indicação", color: "emerald" };
  const tInsta = { id: uid(), name: "Instagram", color: "indigo" };
  d.tags.push(tQuente, tIndicacao, tInsta);

  const d1 = makeDeal({ title: "Mentoria Black — Ana", pipelineId, stageId: sNegociacao.id, value: 4970, leadId: ana.id, temperature: "hot", productName: "Mentoria Black", utmSource: "instagram", utmCampaign: "lanc-julho", stageEnteredAt: hoursAgo(30) });
  const d2 = makeDeal({ title: "Consultoria 90 dias — Bruno", pipelineId, stageId: sContato.id, value: 1997, leadId: bruno.id, temperature: "warm", stageEnteredAt: hoursAgo(50) });
  const d3 = makeDeal({ title: "Protocolo Estética — Carla", pipelineId, stageId: sProposta.id, value: 2497, leadId: carla.id, stageEnteredAt: hoursAgo(8) });
  const d4 = makeDeal({ title: "Plano Trimestral — Diego", pipelineId, stageId: sNovo.id, value: 897, leadId: diego.id, stageEnteredAt: hoursAgo(2) });
  const d5 = makeDeal({ title: "Mentoria Black — João", pipelineId, stageId: sGanho.id, value: 4970, status: "won", productName: "Mentoria Black", stageEnteredAt: hoursAgo(120) });
  const d6 = makeDeal({ title: "Consultoria — Paula", pipelineId, stageId: sPerdido.id, value: 1997, status: "lost", lostReason: "Fechou com concorrente", stageEnteredAt: hoursAgo(160) });
  d.deals.push(d1, d2, d3, d4, d5, d6);

  d.dealTags.push(
    { dealId: d1.id, tagId: tQuente.id }, { dealId: d1.id, tagId: tInsta.id },
    { dealId: d3.id, tagId: tIndicacao.id }, { dealId: d5.id, tagId: tQuente.id },
  );

  const act = (dealId: string, title: string, kind: CrmActivityKind, when: string | null, done = false): CrmActivity => ({
    id: uid(), dealId, title, activityType: kind, scheduledStartAt: when, dueDate: null,
    completedAt: done ? hoursAgo(4) : null, notes: null, createdAt: hoursAgo(48), sourceTemplateId: null,
    dayOffset: null, orderIndex: 0, iconKey: null, actionLabel: null, script: null, priority: "normal",
    assignedTo: "demo-user", reminderAt: null,
  });
  d.activities.push(
    act(d1.id, "Enviar proposta final", "proposal", hoursFromNow(4)),
    act(d1.id, "Ligação de qualificação", "call", hoursAgo(26), true),
    act(d2.id, "Follow-up no WhatsApp", "whatsapp", hoursAgo(20)), // atrasada → chip vermelho
    act(d3.id, "Reunião de apresentação", "meeting", hoursFromNow(28)),
    act(d5.id, "Onboarding do cliente", "task", hoursAgo(100), true),
  );

  const hist = (dealId: string, eventType: string, details: string, oldValue?: string, newValue?: string, h = 24): CrmHistoryEvent & { dealId: string } => ({
    id: uid(), dealId, eventType, details, oldValue: oldValue ?? null, newValue: newValue ?? null,
    userName: OWNER, createdAt: hoursAgo(h),
  });
  d.history.push(
    hist(d1.id, "deal_created", `Negócio "${d1.title}" foi criado no funil`, undefined, undefined, 96),
    hist(d1.id, "stage_change", "O negócio foi movido de estágio no funil", "Proposta", "Negociação", 30),
    hist(d1.id, "activity_completed", 'Atividade "Ligação de qualificação" foi concluída', undefined, undefined, 26),
  );

  // Inbox: 1 canal IG conectado + 2 conversas (uma não lida)
  const chIg = { id: uid(), provider: "instagram" as const, status: "connected" as const, accountName: "PT Academy", accountHandle: "@pt.academy" };
  d.channels.push(chIg);

  const convAna: CrmConversation = {
    id: uid(), provider: "instagram", contactName: "Ana Souza", contactHandle: "@ana.fit",
    status: "open", lastMessageAt: hoursAgo(1), lastMessagePreview: "Perfeito, me manda o link do pagamento!",
    unreadCount: 2, leadId: ana.id, dealId: d1.id,
  };
  const convBruno: CrmConversation = {
    id: uid(), provider: "whatsapp_zapi", contactName: "Bruno Lima", contactHandle: "(21) 97777-2222",
    status: "pending", lastMessageAt: hoursAgo(22), lastMessagePreview: "Vou pensar e te retorno.",
    unreadCount: 0, leadId: bruno.id, dealId: d2.id,
  };
  d.conversations.push(convAna, convBruno);

  const msg = (conv: string, dir: "inbound" | "outbound", content: string, h: number): CrmMessage => ({
    id: uid(), conversationId: conv, direction: dir,
    senderType: dir === "inbound" ? "contact" : "agent",
    content, contentType: "text", status: dir === "outbound" ? "read" : "sent", createdAt: hoursAgo(h),
  });
  d.messages.push(
    msg(convAna.id, "inbound", "Oi! Vi o post de vocês sobre a Mentoria Black 👀", 5),
    msg(convAna.id, "outbound", "Oi Ana! Que bom te ver por aqui. A mentoria fecha turma sexta — quer os detalhes?", 4),
    msg(convAna.id, "inbound", "Quero sim!", 2),
    msg(convAna.id, "inbound", "Perfeito, me manda o link do pagamento!", 1),
    msg(convBruno.id, "outbound", "Bruno, consegui aquela condição especial que te falei 😉", 26),
    msg(convBruno.id, "inbound", "Vou pensar e te retorno.", 22),
  );

  // Campos personalizados de exemplo + meta do mês
  d.fieldDefs.push(
    { id: uid(), entityType: "deal", label: "Origem do lead", fieldType: "select", options: ["Instagram", "Indicação", "Tráfego pago", "Orgânico"], groupName: "Geral", sortOrder: 0, isActive: true, placeholder: null },
    { id: uid(), entityType: "deal", label: "Nº de parcelas", fieldType: "number", options: null, groupName: "Geral", sortOrder: 1, isActive: true, placeholder: null },
    { id: uid(), entityType: "contact", label: "Data de nascimento", fieldType: "date", options: null, groupName: "Geral", sortOrder: 0, isActive: true, placeholder: null },
  );
  const now = new Date();
  d.goals.push({ id: uid(), pipelineId: null, month: now.getMonth() + 1, year: now.getFullYear(), leads: 20, sales: 5, revenue: 15000, annualRevenue: 180000 });

  // Notificações (1 não lida)
  d.notifications.push(
    {
      id: uid(), eventType: "deal_stage_changed", title: "Negócio movido para Negociação",
      body: `"${d1.title}" avançou no funil`, relatedDealId: d1.id, readAt: null, createdAt: hoursAgo(3),
    },
    {
      id: uid(), eventType: "activity_reminder", title: "Atividade atrasada",
      body: `"Follow-up no WhatsApp" venceu em "${d2.title}"`, relatedDealId: d2.id, readAt: hoursAgo(10), createdAt: hoursAgo(20),
    },
  );
}

// ─── Helpers de derivação ─────────────────────────────────────────────────────

function toCard(d: DB, deal: CrmDealDetail): CrmDeal {
  const acts = d.activities.filter((a) => a.dealId === deal.id);
  const nowIso = new Date().toISOString();
  let next: string | null = null;
  let overdue = false;
  for (const a of acts) {
    if (a.completedAt) continue;
    const ref = a.scheduledStartAt ?? a.dueDate;
    if (!ref) continue;
    if (ref < nowIso) overdue = true;
    if (!next || ref < next) next = ref;
  }
  const lead = deal.leadId ? d.leads.find((l) => l.id === deal.leadId) : null;
  return {
    id: deal.id, title: deal.title, value: deal.value, status: deal.status,
    pipelineId: deal.pipelineId, stageId: deal.stageId, ownerId: deal.ownerId,
    ownerName: OWNER,
    leadId: deal.leadId, leadName: lead?.name ?? null,
    leadCompany: lead?.company ?? null, leadPhone: lead?.phone ?? null, leadEmail: lead?.email ?? null,
    temperature: deal.temperature, expectedCloseDate: deal.expectedCloseDate,
    dueDate: deal.dueDate, updatedAt: deal.stageEnteredAt,
    crmCompanyId: deal.crmCompanyId, productName: deal.productName, lostReason: deal.lostReason,
    utmSource: deal.utmSource, utmMedium: deal.utmMedium, utmCampaign: deal.utmCampaign,
    utmContent: deal.utmContent, acquisitionChannel: deal.acquisitionChannel, landingPageUrl: deal.landingPageUrl,
    proposalUrl: deal.proposalUrl, paymentUrl: deal.paymentUrl, schedulingUrl: deal.schedulingUrl, contractUrl: deal.contractUrl,
    stageEnteredAt: deal.stageEnteredAt, createdAt: deal.createdAt,
    activitiesTotal: acts.length,
    activitiesDone: acts.filter((a) => a.completedAt).length,
    nextActivityAt: next, hasOverdueActivity: overdue,
    tags: d.dealTags.filter((dt) => dt.dealId === deal.id)
      .map((dt) => d.tags.find((t) => t.id === dt.tagId))
      .filter((t): t is CrmTag => Boolean(t)),
  };
}

function pushHistory(d: DB, dealId: string, eventType: string, details: string, oldValue?: string, newValue?: string) {
  d.history.push({
    id: uid(), dealId, eventType, details,
    oldValue: oldValue ?? null, newValue: newValue ?? null,
    userName: OWNER, createdAt: new Date().toISOString(),
  });
}

const statusForKind = (k: CrmStageStatusKind): CrmDealStatus => (k === "open" ? "open" : k);

// ─── Pipelines ────────────────────────────────────────────────────────────────

export async function fetchPipelines(companyId: string): Promise<CrmPipeline[]> {
  const d = db(companyId);
  return d.pipelines.map((p) => ({
    id: p.id, name: p.name,
    stages: d.stages.filter((s) => s.pipelineId === p.id).sort((a, b) => a.orderIndex - b.orderIndex),
  }));
}

export async function ensureDefaultPipeline(companyId: string): Promise<void> {
  db(companyId); // seed já cria o Funil Principal
}

export async function createPipeline(companyId: string, input: SavePipelineInput): Promise<void> {
  const d = db(companyId);
  const id = uid();
  d.pipelines.push({ id, name: input.name.trim(), createdAt: new Date().toISOString() });
  d.stages.push(...input.stages.map((s, i) => ({
    id: uid(), pipelineId: id, name: s.name.trim(),
    color: s.statusKind === "won" ? "emerald" : s.statusKind === "lost" ? "rose" : s.color,
    orderIndex: i, statusKind: s.statusKind,
  })));
}

export async function updatePipeline(pipelineId: string, companyId: string, input: SavePipelineInput): Promise<void> {
  const d = db(companyId);
  const p = d.pipelines.find((x) => x.id === pipelineId);
  if (!p) throw new Error("Funil não encontrado.");
  p.name = input.name.trim();

  const incoming = new Set(input.stages.map((s) => s.id).filter(Boolean));
  const removed = d.stages.filter((s) => s.pipelineId === pipelineId && !incoming.has(s.id));
  for (const s of removed) {
    if (d.deals.some((dl) => dl.stageId === s.id)) {
      throw new Error("Não foi possível remover etapa: mova os negócios dela primeiro.");
    }
  }
  d.stages = d.stages.filter((s) => s.pipelineId !== pipelineId || incoming.has(s.id));

  input.stages.forEach((s, i) => {
    const color = s.statusKind === "won" ? "emerald" : s.statusKind === "lost" ? "rose" : s.color;
    if (s.id) {
      const st = d.stages.find((x) => x.id === s.id);
      if (st) Object.assign(st, { name: s.name.trim(), color, orderIndex: i, statusKind: s.statusKind });
    } else {
      d.stages.push({ id: uid(), pipelineId, name: s.name.trim(), color, orderIndex: i, statusKind: s.statusKind });
    }
  });

  // Realinha negócios ganhos/perdidos com as etapas terminais (regra do original)
  const stages = d.stages.filter((s) => s.pipelineId === pipelineId);
  const won = stages.find((s) => s.statusKind === "won");
  const lost = stages.find((s) => s.statusKind === "lost");
  for (const deal of d.deals.filter((x) => x.pipelineId === pipelineId)) {
    if (deal.status === "won" && won) deal.stageId = won.id;
    if (deal.status === "lost" && lost) deal.stageId = lost.id;
    const st = stages.find((s) => s.id === deal.stageId);
    if (st) deal.status = statusForKind(st.statusKind);
  }
}

export async function deletePipeline(pipelineId: string, companyId: string): Promise<void> {
  const d = db(companyId);
  const count = d.deals.filter((x) => x.pipelineId === pipelineId).length;
  if (count > 0) throw new Error(`Não é possível excluir: este funil contém ${count} negócio(s). Mova-os primeiro.`);
  d.pipelines = d.pipelines.filter((p) => p.id !== pipelineId);
  d.stages = d.stages.filter((s) => s.pipelineId !== pipelineId);
}

// ─── Deals ────────────────────────────────────────────────────────────────────

export async function fetchDeals(companyId: string, pipelineId?: string): Promise<CrmDeal[]> {
  const d = db(companyId);
  return d.deals
    .filter((x) => !pipelineId || x.pipelineId === pipelineId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((x) => toCard(d, x));
}

export async function createDeal(input: {
  companyId: string; pipelineId: string; stageId: string; title: string; value?: number | null;
}): Promise<CrmDeal> {
  const d = db(input.companyId);
  const stage = d.stages.find((s) => s.id === input.stageId);
  const deal = makeDeal({
    title: input.title.trim(), pipelineId: input.pipelineId, stageId: input.stageId,
    value: input.value ?? null, status: stage ? statusForKind(stage.statusKind) : "open",
    stageEnteredAt: new Date().toISOString(), createdAt: new Date().toISOString(),
  });
  d.deals.push(deal);
  pushHistory(d, deal.id, "deal_created", `Negócio "${deal.title}" foi criado no funil`);
  void instantiateStagePlaybook(deal.id, input.stageId, input.companyId);
  return toCard(d, deal);
}

export async function moveDeal(
  deal: Pick<CrmDeal, "id" | "stageId">,
  newStage: Pick<CrmStage, "id" | "name" | "statusKind">,
  companyId: string,
  oldStageName?: string,
): Promise<{ status: CrmDealStatus; stageEnteredAt: string }> {
  const d = db(companyId);
  const target = d.deals.find((x) => x.id === deal.id);
  if (!target) throw new Error("Negócio não encontrado.");
  const stageChanged = target.stageId !== newStage.id;
  const status = statusForKind(newStage.statusKind);
  const stageEnteredAt = stageChanged ? new Date().toISOString() : target.stageEnteredAt;
  Object.assign(target, { stageId: newStage.id, status, stageEnteredAt });
  if (stageChanged) {
    pushHistory(d, deal.id, "stage_change", "O negócio foi movido de estágio no funil", oldStageName ?? "Estágio anterior", newStage.name);
    void instantiateStagePlaybook(deal.id, newStage.id, companyId);
  }
  return { status, stageEnteredAt };
}

export async function deleteDeal(dealId: string, companyId: string): Promise<void> {
  const d = db(companyId);
  d.deals = d.deals.filter((x) => x.id !== dealId);
  d.activities = d.activities.filter((a) => a.dealId !== dealId);
  d.dealTags = d.dealTags.filter((t) => t.dealId !== dealId);
  d.history = d.history.filter((h) => h.dealId !== dealId);
}

export async function fetchDealDetail(dealId: string, companyId: string): Promise<CrmDealDetail | null> {
  return db(companyId).deals.find((x) => x.id === dealId) ?? null;
}

export async function updateDeal(
  dealId: string,
  companyId: string,
  patch: Partial<Pick<CrmDealDetail,
    "title" | "value" | "productName" | "temperature" | "expectedCloseDate" | "dueDate" | "lostReason" |
    "proposalUrl" | "paymentUrl" | "schedulingUrl" | "contractUrl">> & { leadId?: string | null },
): Promise<void> {
  const d = db(companyId);
  const deal = d.deals.find((x) => x.id === dealId);
  if (!deal) throw new Error("Negócio não encontrado.");
  Object.assign(deal, patch);
}

// ─── Contatos ─────────────────────────────────────────────────────────────────

export async function fetchLead(leadId: string): Promise<CrmLead | null> {
  for (const d of dbs.values()) {
    const l = d.leads.find((x) => x.id === leadId);
    if (l) return l;
  }
  return null;
}

export async function searchLeads(companyId: string, term: string): Promise<CrmLead[]> {
  const t = term.trim().toLowerCase();
  return db(companyId).leads.filter((l) => l.name.toLowerCase().includes(t)).slice(0, 8);
}

export async function createLead(
  companyId: string,
  input: { name: string; email?: string; phone?: string; crmCompanyId?: string | null; estimatedValue?: number | null },
): Promise<CrmLead> {
  const d = db(companyId);
  const lead = makeLead({
    name: input.name.trim(), email: input.email?.trim() || null, phone: input.phone?.trim() || null,
    createdAt: new Date().toISOString(),
    crmCompanyId: input.crmCompanyId ?? null, estimatedValue: input.estimatedValue ?? null,
  });
  d.leads.unshift(lead);
  return lead;
}

export async function updateLead(
  leadId: string,
  companyId: string,
  patch: Partial<Pick<CrmLead, "name" | "email" | "phone" | "whatsapp" | "instagram" | "company" | "jobTitle" | "status" | "notes" | "crmCompanyId" | "estimatedValue">>,
): Promise<void> {
  const lead = db(companyId).leads.find((l) => l.id === leadId);
  if (!lead) throw new Error("Contato não encontrado.");
  Object.assign(lead, patch);
}

export async function fetchLeads(
  companyId: string,
  filters?: { search?: string; status?: CrmLeadStatus | "all" },
): Promise<CrmLead[]> {
  const d = db(companyId);
  let out = [...d.leads];
  if (filters?.status && filters.status !== "all") out = out.filter((l) => l.status === filters.status);
  if (filters?.search?.trim()) {
    const t = filters.search.trim().toLowerCase();
    out = out.filter((l) =>
      l.name.toLowerCase().includes(t)
      || (l.company ?? "").toLowerCase().includes(t)
      || (l.email ?? "").toLowerCase().includes(t));
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function fetchLeadActivities(leadId: string, companyId: string): Promise<import("@/lib/crmSupabase").CrmLegacyActivity[]> {
  return db(companyId).leadActivities
    .filter((a) => a.leadId === leadId)
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}

export async function createLeadActivity(
  leadId: string, companyId: string,
  input: { type: import("@/lib/crmSupabase").CrmLegacyActivityType; title: string; description?: string | null },
): Promise<{ error?: string }> {
  const nowIso = new Date().toISOString();
  db(companyId).leadActivities.push({
    id: uid(), leadId, authorId: "demo-user", authorName: OWNER,
    type: input.type, title: input.title.trim(), description: input.description ?? null,
    occurredAt: nowIso, createdAt: nowIso,
  });
  return {};
}

export async function deleteLead(leadId: string, companyId: string): Promise<void> {
  const d = db(companyId);
  d.leads = d.leads.filter((l) => l.id !== leadId);
  for (const deal of d.deals) if (deal.leadId === leadId) deal.leadId = null;
}

export async function createDealFromLead(lead: Pick<CrmLead, "id" | "name">, companyId: string): Promise<void> {
  const d = db(companyId);
  const pipeline = d.pipelines[0];
  if (!pipeline) throw new Error("Nenhum funil encontrado. Abra a Pipeline primeiro.");
  const stage = d.stages.filter((s) => s.pipelineId === pipeline.id).sort((a, b) => a.orderIndex - b.orderIndex)[0];
  if (!stage) throw new Error("Nenhuma etapa encontrada no funil.");
  const deal = makeDeal({
    title: lead.name, pipelineId: pipeline.id, stageId: stage.id, leadId: lead.id,
    stageEnteredAt: new Date().toISOString(), createdAt: new Date().toISOString(),
  });
  d.deals.push(deal);
  pushHistory(d, deal.id, "deal_created", `Negócio "${lead.name}" foi criado a partir de um contato`);
  void instantiateStagePlaybook(deal.id, stage.id, companyId);
}

// ─── Atividades ───────────────────────────────────────────────────────────────

export async function fetchDealActivities(dealId: string, companyId: string): Promise<CrmActivity[]> {
  return db(companyId).activities
    .filter((a) => a.dealId === dealId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function fetchCompanyDealActivities(companyId: string): Promise<CrmActivity[]> {
  return db(companyId).activities;
}

export async function createDealActivity(input: {
  dealId: string; companyId: string; title: string; activityType: CrmActivityKind; scheduledStartAt?: string | null;
  assignedTo?: string | null; reminderAt?: string | null;
}): Promise<CrmActivity> {
  const d = db(input.companyId);
  const activity: CrmActivity = {
    id: uid(), dealId: input.dealId, title: input.title.trim(), activityType: input.activityType,
    scheduledStartAt: input.scheduledStartAt ?? null, dueDate: null, completedAt: null,
    notes: null, createdAt: new Date().toISOString(), sourceTemplateId: null,
    dayOffset: null, orderIndex: 0, iconKey: null, actionLabel: null, script: null, priority: "normal",
    assignedTo: input.assignedTo !== undefined ? input.assignedTo : "demo-user",
    reminderAt: input.reminderAt ?? null,
  };
  d.activities.push(activity);
  pushHistory(d, input.dealId, "activity_created", `Atividade "${activity.title}" foi criada`);
  return activity;
}

export async function setActivityDone(
  activity: Pick<CrmActivity, "id" | "dealId" | "title">,
  companyId: string,
  done: boolean,
): Promise<{ completedAt: string | null }> {
  const d = db(companyId);
  const a = d.activities.find((x) => x.id === activity.id);
  if (!a) throw new Error("Atividade não encontrada.");
  a.completedAt = done ? new Date().toISOString() : null;
  if (done) pushHistory(d, activity.dealId, "activity_completed", `Atividade "${activity.title}" foi concluída`);
  return { completedAt: a.completedAt };
}

export async function deleteDealActivity(activityId: string, companyId: string): Promise<void> {
  const d = db(companyId);
  d.activities = d.activities.filter((a) => a.id !== activityId);
}

export async function updateDealActivity(
  activityId: string,
  companyId: string,
  patch: Partial<Pick<CrmActivity,
    "title" | "notes" | "scheduledStartAt" | "dueDate" | "activityType" | "script" | "priority" | "assignedTo" | "reminderAt">>,
): Promise<void> {
  const a = db(companyId).activities.find((x) => x.id === activityId);
  if (!a) throw new Error("Atividade não encontrada.");
  Object.assign(a, patch);
}

export async function clearDealActivities(dealId: string, companyId: string): Promise<void> {
  const d = db(companyId);
  d.activities = d.activities.filter((a) => a.dealId !== dealId || a.completedAt);
}

// ─── Playbooks nomeados (demo: em memória) ────────────────────────────────────

type DemoPlaybook = import("@/lib/crmSupabase").CrmPlaybook;

export async function fetchPlaybooks(companyId: string): Promise<DemoPlaybook[]> {
  return db(companyId).playbooks;
}

export async function applyPlaybookToDeal(dealId: string, companyId: string, playbookId: string): Promise<number> {
  const d = db(companyId);
  const book = d.playbooks.find((p) => p.id === playbookId);
  if (!book) throw new Error("Playbook não encontrado.");
  const existing = new Set(d.activities.filter((a) => a.dealId === dealId && !a.completedAt).map((a) => a.title));
  const toCreate = book.activities.filter((a) => !existing.has(a.title));
  for (const a of toCreate) {
    d.activities.push({
      id: uid(), dealId, title: a.title, activityType: a.activityType,
      scheduledStartAt: null, dueDate: null, completedAt: null, notes: null,
      createdAt: new Date().toISOString(), sourceTemplateId: null,
      dayOffset: a.dayOffset, orderIndex: a.orderIndex, iconKey: a.iconKey,
      actionLabel: a.actionLabel, script: a.script, priority: "normal",
      assignedTo: null, reminderAt: null,
    });
  }
  return toCreate.length;
}

export async function createPlaybook(
  companyId: string,
  input: { name: string; description?: string | null },
): Promise<DemoPlaybook> {
  const book: DemoPlaybook = { id: uid(), name: input.name.trim(), description: input.description ?? null, activities: [] };
  db(companyId).playbooks.push(book);
  return book;
}

export async function deletePlaybook(playbookId: string, companyId: string): Promise<void> {
  const d = db(companyId);
  d.playbooks = d.playbooks.filter((p) => p.id !== playbookId);
}

export async function addPlaybookActivity(
  companyId: string,
  playbookId: string,
  input: {
    title: string; activityType: CrmActivityKind; dayOffset?: number; orderIndex?: number;
    iconKey?: string | null; actionLabel?: string | null; script?: string | null;
  },
): Promise<CrmPlaybookActivity> {
  const book = db(companyId).playbooks.find((p) => p.id === playbookId);
  if (!book) throw new Error("Playbook não encontrado.");
  const activity = {
    id: uid(), title: input.title.trim(), activityType: input.activityType,
    dayOffset: input.dayOffset ?? 1, orderIndex: input.orderIndex ?? 0,
    iconKey: input.iconKey ?? null, actionLabel: input.actionLabel ?? null, script: input.script ?? null,
  };
  book.activities.push(activity);
  return activity;
}

export async function updatePlaybookActivity(
  activityId: string,
  companyId: string,
  patch: Partial<{
    title: string; activityType: CrmActivityKind; dayOffset: number; orderIndex: number;
    iconKey: string | null; actionLabel: string | null; script: string | null;
  }>,
): Promise<CrmPlaybookActivity> {
  for (const book of db(companyId).playbooks) {
    const a = book.activities.find((x) => x.id === activityId);
    if (a) {
      if (patch.title !== undefined) a.title = patch.title.trim();
      if (patch.activityType !== undefined) a.activityType = patch.activityType;
      if (patch.dayOffset !== undefined) a.dayOffset = patch.dayOffset;
      if (patch.orderIndex !== undefined) a.orderIndex = patch.orderIndex;
      if (patch.iconKey !== undefined) a.iconKey = patch.iconKey;
      if (patch.actionLabel !== undefined) a.actionLabel = patch.actionLabel;
      if (patch.script !== undefined) a.script = patch.script;
      return a;
    }
  }
  throw new Error("Atividade não encontrada.");
}

export async function deletePlaybookActivity(activityId: string, companyId: string): Promise<void> {
  for (const book of db(companyId).playbooks) {
    book.activities = book.activities.filter((x) => x.id !== activityId);
  }
}

// ─── Histórico ────────────────────────────────────────────────────────────────

export async function fetchDealHistory(dealId: string, companyId: string): Promise<CrmHistoryEvent[]> {
  return db(companyId).history
    .filter((h) => h.dealId === dealId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 100);
}

export async function fetchCompanyDealHistory(companyId: string): Promise<Array<CrmHistoryEvent & { dealId: string }>> {
  return db(companyId).history;
}

// ─── Tags ─────────────────────────────────────────────────────────────────────

export async function fetchTags(companyId: string): Promise<CrmTag[]> {
  return [...db(companyId).tags].sort((a, b) => a.name.localeCompare(b.name));
}

export async function createTag(companyId: string, name: string, color = "slate"): Promise<CrmTag> {
  const tag = { id: uid(), name: name.trim(), color };
  db(companyId).tags.push(tag);
  return tag;
}

export async function fetchDealTags(dealId: string, companyId: string): Promise<CrmTag[]> {
  const d = db(companyId);
  return d.dealTags.filter((dt) => dt.dealId === dealId)
    .map((dt) => d.tags.find((t) => t.id === dt.tagId))
    .filter((t): t is CrmTag => Boolean(t));
}

export async function addDealTag(dealId: string, tagId: string, companyId: string): Promise<void> {
  const d = db(companyId);
  if (!d.dealTags.some((x) => x.dealId === dealId && x.tagId === tagId)) {
    d.dealTags.push({ dealId, tagId });
  }
}

export async function removeDealTag(dealId: string, tagId: string, companyId: string): Promise<void> {
  const d = db(companyId);
  d.dealTags = d.dealTags.filter((x) => !(x.dealId === dealId && x.tagId === tagId));
}

// ─── Empresas B2B ─────────────────────────────────────────────────────────────

export async function fetchCrmCompany(crmCompanyId: string): Promise<CrmCompany | null> {
  for (const d of dbs.values()) {
    const c = d.crmCompanies.find((x) => x.id === crmCompanyId);
    if (c) return c;
  }
  return null;
}

export async function searchCrmCompanies(companyId: string, term: string): Promise<CrmCompany[]> {
  const t = term.trim().toLowerCase();
  return db(companyId).crmCompanies.filter((c) => c.name.toLowerCase().includes(t)).slice(0, 8);
}

export async function createCrmCompany(companyId: string, input: { name: string }): Promise<CrmCompany> {
  const c: CrmCompany = { id: uid(), name: input.name.trim(), website: null, cnpj: null, city: null, state: null, segment: null, notes: null };
  db(companyId).crmCompanies.unshift(c);
  return c;
}

export async function updateCrmCompany(
  crmCompanyId: string,
  companyId: string,
  patch: Partial<Pick<CrmCompany, "name" | "website" | "cnpj" | "city" | "state" | "segment" | "notes">>,
): Promise<void> {
  const c = db(companyId).crmCompanies.find((x) => x.id === crmCompanyId);
  if (!c) throw new Error("Empresa não encontrada.");
  Object.assign(c, patch);
}

export async function linkDealCrmCompany(dealId: string, companyId: string, crmCompanyId: string | null): Promise<void> {
  const deal = db(companyId).deals.find((x) => x.id === dealId);
  if (deal) deal.crmCompanyId = crmCompanyId;
}

// ─── Notas ────────────────────────────────────────────────────────────────────

export async function addDealNote(dealId: string, companyId: string, note: string): Promise<void> {
  const text = note.trim();
  if (!text) throw new Error("Nota vazia.");
  pushHistory(db(companyId), dealId, "note_added", text);
}

// ─── Playbook por etapa ───────────────────────────────────────────────────────

export async function fetchStageTemplates(stageId: string, companyId: string): Promise<CrmStageTemplate[]> {
  return db(companyId).templates
    .filter((t) => t.stageId === stageId)
    .sort((a, b) => a.orderIndex - b.orderIndex);
}

export async function saveStageTemplates(
  stageId: string,
  companyId: string,
  templates: Array<{ id?: string; title: string; activityType: CrmActivityKind; dayOffset: number; script?: string | null }>,
): Promise<void> {
  const d = db(companyId);
  d.templates = d.templates.filter((t) => t.stageId !== stageId);
  templates.forEach((t, i) => {
    d.templates.push({
      id: t.id ?? uid(), stageId, title: t.title.trim(), activityType: t.activityType,
      dayOffset: t.dayOffset, orderIndex: i, script: t.script ?? null, isActive: true,
    });
  });
}

export async function instantiateStagePlaybook(dealId: string, stageId: string, companyId: string): Promise<void> {
  const d = db(companyId);
  const done = new Set(
    d.activities.filter((a) => a.dealId === dealId && a.sourceTemplateId).map((a) => a.sourceTemplateId),
  );
  for (const t of d.templates.filter((t) => t.stageId === stageId && t.isActive && !done.has(t.id))) {
    d.activities.push({
      id: uid(), dealId, title: t.title, activityType: t.activityType,
      scheduledStartAt: new Date(Date.now() + t.dayOffset * 86_400_000).toISOString(),
      dueDate: null, completedAt: null, notes: null, createdAt: new Date().toISOString(),
      sourceTemplateId: t.id,
      dayOffset: t.dayOffset, orderIndex: 0, iconKey: null, actionLabel: null,
      script: t.script ?? null, priority: "normal",
      assignedTo: null, reminderAt: null,
    });
  }
}

// ─── Calendário ───────────────────────────────────────────────────────────────

export async function fetchCalendar(companyId: string, fromIso: string, toIso: string): Promise<CrmCalendarItem[]> {
  const d = db(companyId);
  return d.activities
    .filter((a) => a.scheduledStartAt && a.scheduledStartAt >= fromIso && a.scheduledStartAt <= toIso)
    .sort((a, b) => (a.scheduledStartAt ?? "").localeCompare(b.scheduledStartAt ?? ""))
    .map((a) => ({
      id: a.id,
      dealId: a.dealId,
      dealTitle: d.deals.find((x) => x.id === a.dealId)?.title ?? "Negócio",
      title: a.title,
      activityType: a.activityType,
      scheduledStartAt: a.scheduledStartAt as string,
      completedAt: a.completedAt,
    }));
}

// ─── Inbox ────────────────────────────────────────────────────────────────────

export async function fetchChannels(companyId: string): Promise<CrmChannel[]> {
  return [...db(companyId).channels];
}

export async function fetchConversations(companyId: string): Promise<CrmConversation[]> {
  return [...db(companyId).conversations].sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
}

export async function fetchMessages(conversationId: string, companyId: string): Promise<CrmMessage[]> {
  return db(companyId).messages
    .filter((m) => m.conversationId === conversationId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function sendMessage(conversationId: string, companyId: string, content: string): Promise<CrmMessage> {
  const d = db(companyId);
  const text = content.trim();
  if (!text) throw new Error("Mensagem vazia.");
  const m: CrmMessage = {
    id: uid(), conversationId, direction: "outbound", senderType: "agent",
    content: text, contentType: "text", status: "sent", createdAt: new Date().toISOString(),
  };
  d.messages.push(m);
  const conv = d.conversations.find((c) => c.id === conversationId);
  if (conv) { conv.lastMessageAt = m.createdAt; conv.lastMessagePreview = text.slice(0, 120); }
  return m;
}

export async function markConversationRead(conversationId: string, companyId: string): Promise<void> {
  const conv = db(companyId).conversations.find((c) => c.id === conversationId);
  if (conv) conv.unreadCount = 0;
}

export async function linkConversationLead(
  conversationId: string,
  companyId: string,
  leadId: string,
  dealId?: string | null,
): Promise<void> {
  const conv = db(companyId).conversations.find((c) => c.id === conversationId);
  if (conv) { conv.leadId = leadId; conv.dealId = dealId ?? null; }
}

export async function setConversationStatus(
  conversationId: string,
  companyId: string,
  status: CrmConversationStatus,
): Promise<void> {
  const conv = db(companyId).conversations.find((c) => c.id === conversationId);
  if (conv) conv.status = status;
}

// ─── Notificações ─────────────────────────────────────────────────────────────

export async function fetchNotifications(companyId: string): Promise<CrmNotification[]> {
  return [...db(companyId).notifications].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  for (const d of dbs.values()) {
    const n = d.notifications.find((x) => x.id === notificationId);
    if (n) { n.readAt = new Date().toISOString(); return; }
  }
}

export async function markAllNotificationsRead(companyId: string): Promise<void> {
  for (const n of db(companyId).notifications) {
    if (!n.readAt) n.readAt = new Date().toISOString();
  }
}

// ─── Busca global (Ctrl+K) ────────────────────────────────────────────────────

export async function globalSearch(
  companyId: string,
  query: string,
): Promise<import("@/lib/crmSupabase").GlobalSearchResult> {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return { leads: [], deals: [], companies: [] };
  const d = db(companyId);
  return {
    leads: d.leads
      .filter((l) => l.name.toLowerCase().includes(q) || l.email?.toLowerCase().includes(q) || l.company?.toLowerCase().includes(q))
      .slice(0, 5)
      .map((l) => ({ id: l.id, name: l.name, email: l.email, company: l.company })),
    deals: d.deals
      .filter((deal) => deal.title.toLowerCase().includes(q))
      .slice(0, 5)
      .map((deal) => ({ id: deal.id, title: deal.title, value: deal.value, pipeline_id: deal.pipelineId })),
    companies: d.crmCompanies
      .filter((c) => c.name.toLowerCase().includes(q))
      .slice(0, 5)
      .map((c) => ({ id: c.id, name: c.name })),
  };
}

// ─── Duplicados ───────────────────────────────────────────────────────────────

export async function findDuplicateDeals(
  companyId: string,
  pipelineId: string,
  title: string,
): Promise<Array<{ id: string; title: string }>> {
  const t = title.trim().toLowerCase();
  if (!t) return [];
  return db(companyId).deals
    .filter((d) => d.pipelineId === pipelineId && d.title.toLowerCase().includes(t))
    .slice(0, 3)
    .map((d) => ({ id: d.id, title: d.title }));
}

export async function findDuplicateLeads(
  companyId: string,
  name: string,
  email?: string,
): Promise<Array<{ id: string; name: string; email: string | null }>> {
  const n = name.trim().toLowerCase();
  const e = email?.trim().toLowerCase();
  if (!n && !e) return [];
  return db(companyId).leads
    .filter((l) => (n && l.name.toLowerCase().includes(n)) || (e && l.email?.toLowerCase() === e))
    .slice(0, 3)
    .map((l) => ({ id: l.id, name: l.name, email: l.email }));
}

// ─── API tokens + Webhooks ────────────────────────────────────────────────────

export async function fetchApiTokens(companyId: string): Promise<CrmApiToken[]> {
  return [...db(companyId).apiTokens];
}

export async function createApiToken(companyId: string, name: string): Promise<{ token: string; record: CrmApiToken }> {
  const record: CrmApiToken = {
    id: uid(), name: name.trim(), scopes: ["read", "write"],
    lastUsedAt: null, revokedAt: null, createdAt: new Date().toISOString(),
  };
  db(companyId).apiTokens.unshift(record);
  return { token: `pf_demo_${uid().replace(/-/g, "")}`, record };
}

export async function revokeApiToken(tokenId: string, companyId: string): Promise<void> {
  const t = db(companyId).apiTokens.find((x) => x.id === tokenId);
  if (t) t.revokedAt = new Date().toISOString();
}

export async function fetchWebhooks(companyId: string): Promise<CrmWebhook[]> {
  return [...db(companyId).webhooks];
}

export async function createWebhook(
  companyId: string,
  input: { name: string; url: string; events: string[] },
): Promise<CrmWebhook> {
  if (!/^https:\/\//.test(input.url.trim())) throw new Error("URL precisa ser https://");
  const w: CrmWebhook = {
    id: uid(), name: input.name.trim(), url: input.url.trim(), events: input.events,
    secret: `whsec_demo_${uid().replace(/-/g, "")}`, isActive: true,
    lastTriggeredAt: null, lastStatusCode: null,
  };
  db(companyId).webhooks.unshift(w);
  return w;
}

export async function setWebhookActive(webhookId: string, companyId: string, isActive: boolean): Promise<void> {
  const w = db(companyId).webhooks.find((x) => x.id === webhookId);
  if (w) w.isActive = isActive;
}

export async function deleteWebhook(webhookId: string, companyId: string): Promise<void> {
  const d = db(companyId);
  d.webhooks = d.webhooks.filter((w) => w.id !== webhookId);
}

// ─── Webhooks de entrada ──────────────────────────────────────────────────────

export async function fetchInboundWebhooks(companyId: string): Promise<CrmInboundWebhook[]> {
  return [...db(companyId).inboundWebhooks];
}

export async function createInboundWebhook(
  companyId: string,
  input: { name: string; pipelineId?: string | null; defaultStageId?: string | null },
): Promise<CrmInboundWebhook> {
  const w: CrmInboundWebhook = {
    id: uid(), name: input.name.trim(), webhookKey: `wh_demo_${uid().replace(/-/g, "")}`,
    pipelineId: input.pipelineId ?? null, defaultStageId: input.defaultStageId ?? null,
    defaultOwnerId: null, defaultTags: [], defaultProduct: null, fieldMap: {},
    isActive: true, createdAt: new Date().toISOString(),
  };
  db(companyId).inboundWebhooks.unshift(w);
  return w;
}

export async function updateInboundWebhook(id: string, companyId: string, patch: { name?: string; isActive?: boolean }): Promise<void> {
  const w = db(companyId).inboundWebhooks.find((x) => x.id === id);
  if (!w) return;
  if ("name" in patch && patch.name) w.name = patch.name.trim();
  if ("isActive" in patch) w.isActive = patch.isActive!;
}

export async function deleteInboundWebhook(id: string, companyId: string): Promise<void> {
  const d = db(companyId);
  d.inboundWebhooks = d.inboundWebhooks.filter((w) => w.id !== id);
}

export async function regenerateInboundWebhookKey(id: string, companyId: string): Promise<string> {
  const w = db(companyId).inboundWebhooks.find((x) => x.id === id);
  const key = `wh_demo_${uid().replace(/-/g, "")}`;
  if (w) w.webhookKey = key;
  return key;
}

// ─── Campos personalizados ────────────────────────────────────────────────────

export async function fetchFieldDefs(companyId: string, entity?: CrmFieldEntity): Promise<CrmFieldDef[]> {
  return db(companyId).fieldDefs
    .filter((f) => f.isActive && (!entity || f.entityType === entity))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function saveFieldDef(
  companyId: string,
  def: {
    id?: string; entityType: CrmFieldEntity; label: string; fieldType: CrmFieldType;
    options?: string[] | null; groupName?: string; placeholder?: string | null;
  },
): Promise<CrmFieldDef> {
  const d = db(companyId);
  const label = def.label.trim();
  if (!label) throw new Error("Nome do campo obrigatório.");
  if (def.id) {
    const f = d.fieldDefs.find((x) => x.id === def.id);
    if (!f) throw new Error("Campo não encontrado.");
    Object.assign(f, {
      label, fieldType: def.fieldType, options: def.options?.length ? def.options : null,
      groupName: def.groupName ?? f.groupName, placeholder: 'placeholder' in def ? (def.placeholder ?? null) : f.placeholder,
    });
    return f;
  }
  const f: CrmFieldDef = {
    id: uid(), entityType: def.entityType, label, fieldType: def.fieldType,
    options: def.options?.length ? def.options : null,
    groupName: def.groupName ?? "Geral", sortOrder: d.fieldDefs.length, isActive: true,
    placeholder: def.placeholder ?? null,
  };
  d.fieldDefs.push(f);
  return f;
}

export async function deleteFieldDef(fieldId: string, companyId: string): Promise<void> {
  const f = db(companyId).fieldDefs.find((x) => x.id === fieldId);
  if (f) f.isActive = false;
}

export async function fetchFieldValues(companyId: string, entityId: string): Promise<Map<string, string>> {
  return new Map(
    db(companyId).fieldValues
      .filter((v) => v.entityId === entityId)
      .map((v) => [v.fieldId, v.value ?? ""]),
  );
}

export async function setFieldValue(
  companyId: string,
  fieldId: string,
  entityId: string,
  value: string | null,
): Promise<void> {
  const d = db(companyId);
  const existing = d.fieldValues.find((v) => v.fieldId === fieldId && v.entityId === entityId);
  if (existing) existing.value = value;
  else d.fieldValues.push({ fieldId, entityId, value });
}

// ─── Gestão de tags ───────────────────────────────────────────────────────────

export async function updateTag(
  tagId: string,
  companyId: string,
  patch: Partial<Pick<CrmTag, "name" | "color">>,
): Promise<void> {
  const t = db(companyId).tags.find((x) => x.id === tagId);
  if (!t) throw new Error("Tag não encontrada.");
  Object.assign(t, patch);
}

export async function deleteTag(tagId: string, companyId: string): Promise<void> {
  const d = db(companyId);
  d.tags = d.tags.filter((t) => t.id !== tagId);
  d.dealTags = d.dealTags.filter((dt) => dt.tagId !== tagId);
}

// ─── Metas do mês ─────────────────────────────────────────────────────────────

export async function fetchGoal(
  companyId: string, month: number, year: number, pipelineId: string | null = null,
): Promise<CrmGoal | null> {
  const g = db(companyId).goals.find((x) => x.month === month && x.year === year && x.pipelineId === pipelineId);
  return g ? { month: g.month, year: g.year, leads: g.leads, sales: g.sales, revenue: g.revenue, annualRevenue: g.annualRevenue } : null;
}

export async function saveGoal(companyId: string, goal: CrmGoal, pipelineId: string | null = null): Promise<void> {
  const d = db(companyId);
  const existing = d.goals.find((x) => x.month === goal.month && x.year === goal.year && x.pipelineId === pipelineId);
  if (existing) Object.assign(existing, goal);
  else d.goals.push({ ...goal, pipelineId, id: uid() });
}

export async function fetchGoals(companyId: string): Promise<CrmGoalEntry[]> {
  return db(companyId).goals
    .slice()
    .sort((a, b) => b.year - a.year || b.month - a.month)
    .map(({ id: _id, ...g }) => g);
}

// ─── Métricas ─────────────────────────────────────────────────────────────────

export async function fetchCrmStats(companyId: string): Promise<CrmStats> {
  const d = db(companyId);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  return {
    leadsCount: d.leads.length,
    leadsThisMonth: d.leads.filter((l) => l.createdAt >= monthStart).length,
    deals: d.deals.map((x) => ({
      id: x.id, status: x.status, value: x.value, stageId: x.stageId, pipelineId: x.pipelineId,
      stageEnteredAt: x.stageEnteredAt,
    })),
  };
}
