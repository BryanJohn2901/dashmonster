"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseClient } from "@/lib/supabase";
import { getCompanyContext } from "@/hooks/useCompany";
import type { ResultType } from "@/hooks/useAdvertiserStore";

const STORAGE_KEY = "dm_campaign_center_v1";

// ─── Intenção da campanha — o que torna a configuração inteligente ───────────

export type CampaignIntent =
  | "lead_gen"        // Captar Leads
  | "direct_sale"     // Venda Direta
  | "profile_growth"  // Crescer Perfil
  | "traffic"         // Tráfego
  | "awareness"       // Reconhecimento
  | "remarketing";    // Remarketing

export interface IntentGoalField {
  id: string;
  label: string;
  unit: "qtd" | "brl" | "pct" | "x";
}

export interface IntentMeta {
  label: string;
  color: string;
  /** Campos de meta relevantes para esta intenção */
  goalFields: IntentGoalField[];
  /** ResultTypes típicos — o primeiro é o default quando nada foi detectado */
  defaultResultTypes: ResultType[];
}

export const INTENT_META: Record<CampaignIntent, IntentMeta> = {
  lead_gen: {
    label: "Captar Leads",
    color: "#e11d48",
    goalFields: [
      { id: "leads", label: "Leads", unit: "qtd" },
      { id: "cpl",   label: "CPL",   unit: "brl" },
      { id: "ctr",   label: "CTR",   unit: "pct" },
    ],
    defaultResultTypes: ["leadgen_grouped", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead", "lead"],
  },
  direct_sale: {
    label: "Venda Direta",
    color: "#10b981",
    goalFields: [
      { id: "sales", label: "Vendas", unit: "qtd" },
      { id: "cpa",   label: "CPA",    unit: "brl" },
      { id: "roas",  label: "ROAS",   unit: "x" },
    ],
    defaultResultTypes: ["offsite_conversion.fb_pixel_purchase", "purchase"],
  },
  profile_growth: {
    label: "Crescer Perfil",
    color: "#8b5cf6",
    goalFields: [
      { id: "profile_visits", label: "Visitas",    unit: "qtd" },
      { id: "new_followers",  label: "Seguidores", unit: "qtd" },
      { id: "cpf",            label: "Custo/seg.", unit: "brl" },
    ],
    defaultResultTypes: ["profile_visit"],
  },
  traffic: {
    label: "Tráfego",
    color: "#0891b2",
    goalFields: [
      { id: "clicks", label: "Cliques", unit: "qtd" },
      { id: "cpc",    label: "CPC",     unit: "brl" },
      { id: "ctr",    label: "CTR",     unit: "pct" },
    ],
    defaultResultTypes: ["link_click", "view_content"],
  },
  awareness: {
    label: "Reconhecimento",
    color: "#3b82f6",
    goalFields: [
      { id: "reach",     label: "Alcance",    unit: "qtd" },
      { id: "cpm",       label: "CPM",        unit: "brl" },
      { id: "frequency", label: "Frequência", unit: "x" },
    ],
    defaultResultTypes: ["view_content", "link_click"],
  },
  remarketing: {
    label: "Remarketing",
    color: "#f59e0b",
    goalFields: [
      { id: "sales", label: "Vendas", unit: "qtd" },
      { id: "cpa",   label: "CPA",    unit: "brl" },
      { id: "roas",  label: "ROAS",   unit: "x" },
    ],
    defaultResultTypes: ["offsite_conversion.fb_pixel_purchase", "purchase", "offsite_conversion.fb_pixel_lead"],
  },
};

export const INTENT_OPTIONS = (Object.keys(INTENT_META) as CampaignIntent[]).map((id) => ({
  value: id,
  label: INTENT_META[id].label,
}));

// ─── Auto-detecção de intenção (3 camadas) ────────────────────────────────────

const OBJECTIVE_TO_INTENT: Record<string, CampaignIntent> = {
  OUTCOME_LEADS:      "lead_gen",
  LEAD_GENERATION:    "lead_gen",
  OUTCOME_SALES:      "direct_sale",
  CONVERSIONS:        "direct_sale",
  PRODUCT_CATALOG_SALES: "direct_sale",
  OUTCOME_TRAFFIC:    "traffic",
  LINK_CLICKS:        "traffic",
  OUTCOME_AWARENESS:  "awareness",
  BRAND_AWARENESS:    "awareness",
  REACH:              "awareness",
  OUTCOME_ENGAGEMENT: "profile_growth",
  PAGE_LIKES:         "profile_growth",
};

const RESULT_TYPE_TO_INTENT: Partial<Record<ResultType, CampaignIntent>> = {
  "purchase":                             "direct_sale",
  "offsite_conversion.fb_pixel_purchase": "direct_sale",
  "lead":                                 "lead_gen",
  "offsite_conversion.fb_pixel_lead":     "lead_gen",
  "onsite_conversion.lead_grouped":       "lead_gen",
  "leadgen_grouped":                      "lead_gen",
  "omni_complete_registration":           "lead_gen",
  "submit_application":                   "lead_gen",
  "schedule":                             "lead_gen",
  "contact":                              "lead_gen",
  "profile_visit":                        "profile_growth",
  "link_click":                           "traffic",
  "view_content":                         "traffic",
};

const NAME_KEYWORDS: { intent: CampaignIntent; words: string[] }[] = [
  { intent: "remarketing",    words: ["remarketing", "rmkt", "retarget", "remkt"] },
  { intent: "lead_gen",       words: ["lead", "captacao", "captação", "cadastro", "formulario", "formulário", "endform"] },
  { intent: "direct_sale",    words: ["venda", "compra", "vendas", "checkout", "sale"] },
  { intent: "profile_growth", words: ["perfil", "seguidores", "follow", "instagram", "ig "] },
  { intent: "awareness",      words: ["alcance", "awareness", "reconhecimento", "branding", "topo"] },
  { intent: "traffic",        words: ["trafego", "tráfego", "clique", "traffic", "lp "] },
];

/**
 * Detecta a intenção da campanha em 3 camadas de confiança:
 * 1. objective da API Meta  2. resultType detectado nos actions[]  3. nome
 */
export function detectIntent(args: {
  objective?: string;
  resultType?: ResultType;
  name: string;
}): CampaignIntent {
  if (args.objective && OBJECTIVE_TO_INTENT[args.objective]) {
    return OBJECTIVE_TO_INTENT[args.objective];
  }
  if (args.resultType && RESULT_TYPE_TO_INTENT[args.resultType]) {
    return RESULT_TYPE_TO_INTENT[args.resultType]!;
  }
  const lower = args.name.toLowerCase();
  for (const { intent, words } of NAME_KEYWORDS) {
    if (words.some((w) => lower.includes(w))) return intent;
  }
  return "traffic";
}

// ─── Entry — configuração completa de uma campanha ───────────────────────────

export interface CampaignCenterEntry {
  campaignId: string;
  campaignName: string;
  adAccountId: string;
  adAccountLabel?: string;
  intent: CampaignIntent;
  resultType: ResultType;
  groupId: string;
  monthlyBudget: number | null;
  /** Metas keyed pelo id do goalField da intenção (leads, cpl, roas…) */
  goals: Record<string, number>;
  enabled: boolean;
  /** true = auto-configurada, ainda não revisada pelo usuário */
  autoConfigured: boolean;
  updatedAt: string;
}

interface CenterState {
  entries: CampaignCenterEntry[];
}

const DEFAULT_STATE: CenterState = { entries: [] };

// ─── Persistência ─────────────────────────────────────────────────────────────
// Supabase (compartilhado por empresa) é a fonte de verdade; localStorage é
// cache local e fallback enquanto a migration 021 não foi aplicada.

function loadCache(): CenterState {
  if (typeof window === "undefined") return DEFAULT_STATE;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw) as CenterState;
    return Array.isArray(parsed.entries) ? parsed : DEFAULT_STATE;
  } catch { return DEFAULT_STATE; }
}

function persistCache(s: CenterState): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {}
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToEntry(row: any): CampaignCenterEntry {
  return {
    campaignId:     row.campaign_id,
    campaignName:   row.campaign_name,
    adAccountId:    row.ad_account_id,
    adAccountLabel: row.ad_account_label || undefined,
    intent:         row.intent as CampaignIntent,
    resultType:     row.result_type as ResultType,
    groupId:        row.group_id ?? "",
    monthlyBudget:  row.monthly_budget === null ? null : Number(row.monthly_budget),
    goals:          (row.goals as Record<string, number>) ?? {},
    enabled:        row.enabled ?? true,
    autoConfigured: row.auto_configured ?? false,
    updatedAt:      row.updated_at ?? new Date().toISOString(),
  };
}

function entryToRow(e: CampaignCenterEntry, companyId: string): Record<string, unknown> {
  return {
    company_id:       companyId,
    campaign_id:      e.campaignId,
    campaign_name:    e.campaignName,
    ad_account_id:    e.adAccountId,
    ad_account_label: e.adAccountLabel ?? "",
    intent:           e.intent,
    result_type:      e.resultType,
    group_id:         e.groupId || null,
    monthly_budget:   e.monthlyBudget,
    goals:            e.goals,
    enabled:          e.enabled,
    auto_configured:  e.autoConfigured,
  };
}

async function fetchRemote(): Promise<CampaignCenterEntry[] | null> {
  if (!supabaseClient) return null;
  const { company } = await getCompanyContext();
  if (!company) return null;
  const { data, error } = await supabaseClient
    .from("campaign_center_entries")
    .select("*")
    .eq("company_id", company.id)
    .order("created_at");
  if (error) return null; // tabela ainda não existe → fallback localStorage
  return (data ?? []).map(rowToEntry);
}

async function syncUpsert(entries: CampaignCenterEntry[]): Promise<void> {
  if (!supabaseClient || entries.length === 0) return;
  const { company } = await getCompanyContext();
  if (!company) return;
  await supabaseClient
    .from("campaign_center_entries")
    .upsert(entries.map((e) => entryToRow(e, company.id)), { onConflict: "company_id,campaign_id" });
}

async function syncDelete(campaignIds: string[]): Promise<void> {
  if (!supabaseClient || campaignIds.length === 0) return;
  const { company } = await getCompanyContext();
  if (!company) return;
  await supabaseClient
    .from("campaign_center_entries")
    .delete()
    .eq("company_id", company.id)
    .in("campaign_id", campaignIds);
}

// ─── Store compartilhado em módulo ────────────────────────────────────────────
// Um único estado para o app inteiro: qualquer mutação (em qualquer tela)
// notifica todos os componentes que usam o hook — sem precisar de refresh.
// Realtime do Supabase mantém o estado em sincronia entre usuários/devices.

let centerState: CenterState = DEFAULT_STATE;
let centerHydrated = false;
let realtimeStarted = false;
const centerListeners = new Set<(s: CenterState) => void>();

function setCenterState(next: CenterState): void {
  centerState = next;
  persistCache(next);
  centerListeners.forEach((l) => l(next));
}

function hydrateCenter(): void {
  if (!centerHydrated) {
    centerHydrated = true;
    centerState = loadCache();
    centerListeners.forEach((l) => l(centerState));
  }
  void fetchRemote().then((remote) => {
    if (remote) setCenterState({ entries: remote });
  });
}

function startRealtime(): void {
  if (realtimeStarted || !supabaseClient) return;
  realtimeStarted = true;
  supabaseClient
    .channel("campaign-center-realtime")
    .on("postgres_changes",
      { event: "*", schema: "public", table: "campaign_center_entries" },
      () => {
        void fetchRemote().then((remote) => {
          if (remote) setCenterState({ entries: remote });
        });
      })
    .subscribe();
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useCampaignCenter() {
  const [state, setState] = useState<CenterState>(centerState);

  useEffect(() => {
    centerListeners.add(setState);
    hydrateCenter();
    startRealtime();
    return () => { centerListeners.delete(setState); };
  }, []);

  const upsertEntries = useCallback((incoming: CampaignCenterEntry[]) => {
    const byId = new Map(centerState.entries.map((e) => [e.campaignId, e]));
    incoming.forEach((e) => byId.set(e.campaignId, e));
    setCenterState({ entries: Array.from(byId.values()) });
    void syncUpsert(incoming);
  }, []);

  const updateEntry = useCallback((campaignId: string, patch: Partial<CampaignCenterEntry>) => {
    const next = {
      entries: centerState.entries.map((e) =>
        e.campaignId === campaignId
          ? { ...e, ...patch, autoConfigured: false, updatedAt: new Date().toISOString() }
          : e,
      ),
    };
    setCenterState(next);
    const updated = next.entries.find((e) => e.campaignId === campaignId);
    if (updated) void syncUpsert([updated]);
  }, []);

  const removeEntry = useCallback((campaignId: string) => {
    const removed = centerState.entries.map((e) => e.campaignId).filter((id) => id === campaignId);
    setCenterState({ entries: centerState.entries.filter((e) => e.campaignId !== campaignId) });
    void syncDelete(removed);
  }, []);

  const clearAll = useCallback(() => {
    const ids = centerState.entries.map((e) => e.campaignId);
    setCenterState(DEFAULT_STATE);
    void syncDelete(ids);
  }, []);

  /** Busca a config de uma campanha — consumida pelo Dashboard e Perfil de Anunciantes */
  const getEntry = useCallback((campaignId: string): CampaignCenterEntry | undefined => {
    return state.entries.find((e) => e.campaignId === campaignId);
  }, [state]);

  return { entries: state.entries, upsertEntries, updateEntry, removeEntry, clearAll, getEntry };
}
