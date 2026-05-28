"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
  Area, AreaChart,
} from "recharts";
import {
  Activity, AlertCircle, ArrowDown, ArrowLeft, ArrowUp, AtSign, BookMarked, CalendarDays,
  CheckCircle2, Edit2, GraduationCap, Heart, Key, Loader2, MessageCircle, Plus, RefreshCw,
  Repeat, SlidersHorizontal, Star, Target, Trash2, TrendingDown, TrendingUp, Users, X, Zap,
} from "lucide-react";
import {
  fetchMetaCampaigns, fetchMetaInsights, fetchMetaAdAccounts,
  loadMetaCredentials, MetaInsight, MetaAdAccount,
  extractLeads, extractRevenue,
} from "@/utils/metaApi";
import {
  fetchInstagramAccounts, fetchInstagramInsights,
  InstagramAccount, InstagramProfileInsights,
} from "@/utils/instagramApi";
import { formatBRL, formatCompact, formatInt, formatPercent } from "@/lib/format";
import { getTemplate, TEMPLATE_LIST, DEFAULT_PERSONALIZADO_CONFIG } from "@/lib/templates";
import { PerfilEmpty } from "@/components/empty/PerfilEmpty";
import { PerfilAtivoPanel } from "@/components/PerfilAtivoPanel";
import type { TemplateId, Template, PersonalizadoConfig } from "@/lib/templates/types";
import { TemplateSelector } from "@/components/profiles/TemplateSelector";
import { PersonalizadoBuilder } from "@/components/profiles/PersonalizadoBuilder";
import {
  useAdvertiserStore, AdvertiserProfile, ActiveCampaign, ResultType,
} from "@/hooks/useAdvertiserStore";
import { useCampaignStore } from "@/hooks/useCampaignStore";
import type { CampaignConfig } from "@/hooks/useCampaignStore";
import { readSharedDateRange } from "@/hooks/useDateRange";

const formatCurrency = formatBRL;
const formatNumber = formatInt;

const TEMPLATE_LS_KEY      = "pta_profile_template_v1";
const DATES_LS_KEY         = "pta_profile_dates_v1";
const FUNNEL_CONFIG_LS_KEY = "pta_profile_funnel_v1";
const GOALS_LS_KEY         = "pta_profile_goals_v1";

type ProfileFunnelStepId = "reach" | "impressions" | "clicks" | "page_views" | "leads" | "sales";

interface ProfileFunnelStep {
  id: ProfileFunnelStepId;
  label: string;
  color: string;
  rateLabel?: string;
}

const PROFILE_FUNNEL_STEPS: ProfileFunnelStep[] = [
  { id: "reach",       label: "Alcance",          color: "#3b82f6" },
  { id: "impressions", label: "Impressões",        color: "#8b5cf6", rateLabel: "Freq." },
  { id: "clicks",      label: "Cliques no link",   color: "#0891b2", rateLabel: "CTR" },
  { id: "page_views",  label: "Vis. de Página",    color: "#f59e0b", rateLabel: "Taxa LP" },
  { id: "leads",       label: "Leads",             color: "#e11d48", rateLabel: "Tx. Captura" },
  { id: "sales",       label: "Resultados",        color: "#10b981", rateLabel: "Tx. Venda" },
];

const DEFAULT_FUNNEL_STEP_IDS: ProfileFunnelStepId[] = ["impressions", "clicks", "leads", "sales"];

function loadProfileFunnelConfig(campaignId: string): ProfileFunnelStepId[] {
  if (typeof window === "undefined") return DEFAULT_FUNNEL_STEP_IDS;
  try {
    const stored = JSON.parse(localStorage.getItem(FUNNEL_CONFIG_LS_KEY) ?? "{}") as Record<string, string[]>;
    const ids = stored[campaignId];
    if (!ids) return DEFAULT_FUNNEL_STEP_IDS;
    const valid = ids.filter((id): id is ProfileFunnelStepId =>
      PROFILE_FUNNEL_STEPS.some((s) => s.id === id),
    );
    return valid.length > 0 ? valid : DEFAULT_FUNNEL_STEP_IDS;
  } catch { return DEFAULT_FUNNEL_STEP_IDS; }
}

function saveProfileFunnelConfig(campaignId: string, ids: ProfileFunnelStepId[]): void {
  try {
    const stored = JSON.parse(localStorage.getItem(FUNNEL_CONFIG_LS_KEY) ?? "{}") as Record<string, string[]>;
    localStorage.setItem(FUNNEL_CONFIG_LS_KEY, JSON.stringify({ ...stored, [campaignId]: ids }));
  } catch {}
}

function loadGoals(campaignId: string): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const stored = JSON.parse(localStorage.getItem(GOALS_LS_KEY) ?? "{}") as Record<string, Record<string, number>>;
    return stored[campaignId] ?? {};
  } catch { return {}; }
}

function saveGoals(campaignId: string, goals: Record<string, number>): void {
  try {
    const stored = JSON.parse(localStorage.getItem(GOALS_LS_KEY) ?? "{}") as Record<string, Record<string, number>>;
    localStorage.setItem(GOALS_LS_KEY, JSON.stringify({ ...stored, [campaignId]: goals }));
  } catch {}
}

// ─── Types ─────────────────────────────────────────────────────────────────────

interface GroupOption {
  id: string;
  label: string;
  section: string;
}

interface ProfileAnalysisProps {
  campaignGroupOptions: GroupOption[];
  campaignConfigs: Record<string, CampaignConfig>;
  /** When set, used as the default date range for profiles with no stored preference. */
  appliedDateRange?: { from: string; to: string };
}

// ─── Analysis helpers ─────────────────────────────────────────────────────────

interface AdsetRow {
  name: string;
  impressions: number;
  reach: number;
  clicks: number;        // inline_link_clicks (cliques no link)
  total_clicks: number;  // all clicks (reactions, shares, etc.)
  spend: number;
  revenue: number;
  cpm: number;
  ctr: number;           // link CTR %
  ctr_all: number;       // all-click CTR %
  purchases: number;
  leads: number;
  cpa: number;
  page_views: number;
  new_followers: number;
  customResult: number;  // configured resultType value (0 when no resultType)
}

// Human-readable labels for each result type
export const RESULT_TYPE_LABELS: Record<ResultType, string> = {
  "purchase":                       "Compras / Vendas",
  "lead":                           "Leads",
  "onsite_conversion.lead_grouped": "Leads no Site",
  "leadgen_grouped":                "Leads de Formulário",
  "omni_complete_registration":     "Cadastros",
  "link_click":                     "Cliques no Link",
};

export const RESULT_TYPE_OPTIONS: { value: ResultType; label: string }[] = [
  { value: "purchase",                       label: "Compras / Vendas" },
  { value: "lead",                           label: "Leads" },
  { value: "onsite_conversion.lead_grouped", label: "Leads no Site" },
  { value: "leadgen_grouped",                label: "Leads de Formulário" },
  { value: "omni_complete_registration",     label: "Cadastros" },
  { value: "link_click",                     label: "Cliques no Link" },
];

function todayStr() { return new Date().toISOString().split("T")[0]; }
function daysAgoStr(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
}

function parseMetaNum(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function getActionValue(actions: MetaInsight["actions"], type: string): number {
  return Number(actions?.find((a) => a.action_type === type)?.value ?? 0);
}

function pickActionValue(avs: MetaInsight["action_values"], ...types: string[]): number {
  if (!avs) return 0;
  for (const t of types) {
    const f = avs.find((a) => a.action_type === t);
    if (f) return parseFloat(f.value) || 0;
  }
  return 0;
}

function toAdsetRows(data: MetaInsight[], resultType?: string): AdsetRow[] {
  const map = new Map<string, AdsetRow>();
  data.forEach((d) => {
    const key = d.adset_name ?? d.campaign_name;
    const cur = map.get(key) ?? {
      name: key,
      impressions: 0, reach: 0, clicks: 0, total_clicks: 0, spend: 0, revenue: 0,
      cpm: 0, ctr: 0, ctr_all: 0, purchases: 0, leads: 0, cpa: 0,
      page_views: 0, new_followers: 0, customResult: 0,
    };
    cur.impressions   += parseMetaNum(d.impressions);
    cur.reach         += parseMetaNum(d.reach);
    // inline_link_clicks = "Cliques no link" (matches Meta Ads Manager default column)
    cur.clicks        += d.inline_link_clicks != null
      ? parseMetaNum(d.inline_link_clicks)
      : parseMetaNum(d.clicks);
    // raw clicks = all clicks (reactions, shares, profile visits, etc.)
    cur.total_clicks  += parseMetaNum(d.clicks);
    cur.spend         += parseMetaNum(d.spend);
    cur.purchases     += getActionValue(d.actions, "purchase");
    cur.leads         += extractLeads(d.actions);
    cur.revenue       += extractRevenue(d.action_values);
    // landing_page_view: more reliable than link clicks for LP-funnel templates.
    cur.page_views    += getActionValue(d.actions, "landing_page_view");
    // new_followers: "follow" (ad engagement objective) OR "page_fan_adds" (traffic-to-profile)
    cur.new_followers += getActionValue(d.actions, "follow")
                       + getActionValue(d.actions, "page_fan_adds");
    // configurable result type — link_click uses inline_link_clicks for consistency
    if (resultType) {
      cur.customResult += resultType === "link_click"
        ? (d.inline_link_clicks != null ? parseMetaNum(d.inline_link_clicks) : parseMetaNum(d.clicks))
        : getActionValue(d.actions, resultType);
    }
    map.set(key ?? "", cur);
  });
  return Array.from(map.values()).map((r) => ({
    ...r,
    cpm:     r.impressions   > 0 ? (r.spend / r.impressions) * 1000      : 0,
    ctr:     r.impressions   > 0 ? (r.clicks / r.impressions) * 100      : 0,
    ctr_all: r.impressions   > 0 ? (r.total_clicks / r.impressions) * 100 : 0,
    cpa:     r.purchases     > 0 ? r.spend / r.purchases                 : 0,
  })).sort((a, b) => b.spend - a.spend);
}

// ─── Section constants ────────────────────────────────────────────────────────

const SECTION_META = {
  pos:      { label: "Pós Graduação", icon: GraduationCap, color: "text-blue-600",   bg: "bg-blue-50",   border: "border-blue-200" },
  livros:   { label: "Livros",        icon: BookMarked,    color: "text-green-600",  bg: "bg-green-50",  border: "border-green-200" },
  ebooks:   { label: "Ebooks",        icon: BookMarked,    color: "text-violet-600", bg: "bg-violet-50", border: "border-violet-200" },
  perpetuo: { label: "Perpétuo",      icon: Repeat,        color: "text-amber-600",  bg: "bg-amber-50",  border: "border-amber-200" },
  eventos:  { label: "Eventos",       icon: CalendarDays,  color: "text-rose-600",   bg: "bg-rose-50",   border: "border-rose-200" },
} as const;

// ─── Avatar helpers ───────────────────────────────────────────────────────────

const AVATAR_STYLES = [
  ["bg-blue-100 text-blue-700",      "border-blue-200"],
  ["bg-purple-100 text-purple-700",  "border-purple-200"],
  ["bg-emerald-100 text-emerald-700","border-emerald-200"],
  ["bg-pink-100 text-pink-700",      "border-pink-200"],
  ["bg-orange-100 text-orange-700",  "border-orange-200"],
  ["bg-teal-100 text-teal-700",      "border-teal-200"],
];

function avatarStyle(name: string) {
  return AVATAR_STYLES[(name.charCodeAt(0) ?? 0) % AVATAR_STYLES.length];
}

// ─── Add Campaign Panel ───────────────────────────────────────────────────────
// Full panel: account picker → campaign list → multi-add without closing

function AddCampaignPanel({
  defaultAccountId,
  alreadyAddedIds,
  onAdd,
  onClose,
}: {
  defaultAccountId: string;
  alreadyAddedIds: Set<string>;
  onAdd: (campaign: ActiveCampaign) => void;
  onClose?: () => void;
}) {
  const token = loadMetaCredentials().accessToken;
  const hasToken = Boolean(token);

  // ── Account picker state ──
  const [accountId, setAccountId]           = useState(defaultAccountId);
  const [accounts, setAccounts]             = useState<MetaAdAccount[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [accountsError, setAccountsError]   = useState<string | null>(null);
  const [showAccountPicker, setShowAccountPicker] = useState(false);

  // ── Campaign list state ──
  const [campaigns, setCampaigns]           = useState<{ id: string; name: string; status: string }[]>([]);
  const [campaignsLoading, setCampaignsLoading] = useState(false);
  const [campaignsError, setCampaignsError] = useState<string | null>(null);
  const [addedThisSession, setAddedThisSession] = useState<Set<string>>(new Set());

  const fetchAccounts = async () => {
    setAccountsLoading(true); setAccountsError(null);
    try {
      const list = await fetchMetaAdAccounts(token);
      setAccounts(list);
      setShowAccountPicker(true);
    } catch (e) {
      setAccountsError(e instanceof Error ? e.message : "Erro ao buscar contas.");
    } finally {
      setAccountsLoading(false);
    }
  };

  const fetchCampaigns = async (id = accountId) => {
    const trimmed = id.trim();
    if (!trimmed) return;
    setCampaignsLoading(true); setCampaignsError(null); setCampaigns([]);
    try {
      const list = await fetchMetaCampaigns(trimmed, token);
      setCampaigns(list);
    } catch (e) {
      setCampaignsError(e instanceof Error ? e.message : "Erro ao buscar campanhas.");
    } finally {
      setCampaignsLoading(false);
    }
  };

  const handleSelectAccount = (acc: MetaAdAccount) => {
    setAccountId(acc.id);
    setShowAccountPicker(false);
    void fetchCampaigns(acc.id);
  };

  const handleAdd = (camp: { id: string; name: string }) => {
    onAdd({ id: camp.id, name: camp.name });
    setAddedThisSession((prev) => new Set([...prev, camp.id]));
  };

  const inputCls = "h-8 w-full rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-800 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200";

  if (!hasToken) {
    return (
      <p className="flex items-center gap-1.5 text-[11px] text-amber-600 dark:text-amber-400">
        <Key size={11} /> Configure o Access Token em <strong>Importar dados → Meta Ads</strong>.
      </p>
    );
  }

  return (
    <div className="space-y-3">

      {/* ── Account ID row ── */}
      <div className="space-y-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Ad Account
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={accountId}
            onChange={(e) => { setAccountId(e.target.value); setCampaigns([]); setCampaignsError(null); }}
            placeholder="act_524658353530105"
            className={inputCls}
          />
          {/* Buscar minhas contas */}
          <button
            type="button"
            onClick={() => void fetchAccounts()}
            disabled={accountsLoading}
            title="Listar todas as contas disponíveis para este token"
            className="flex flex-shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold text-slate-600 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-400 dark:hover:border-blue-500"
          >
            {accountsLoading ? <Loader2 size={10} className="animate-spin" /> : <Users size={10} />}
            {accountsLoading ? "Buscando…" : "Ver contas"}
          </button>
          {/* Buscar campanhas */}
          <button
            type="button"
            onClick={() => void fetchCampaigns()}
            disabled={!accountId.trim() || campaignsLoading}
            title="Buscar campanhas desta conta"
            className="flex flex-shrink-0 items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-[10px] font-semibold text-blue-600 transition hover:bg-blue-100 disabled:opacity-50 dark:border-blue-700 dark:bg-blue-900/20 dark:text-blue-400"
          >
            {campaignsLoading ? <Loader2 size={10} className="animate-spin" /> : <Zap size={10} />}
            {campaignsLoading ? "Buscando…" : "Campanhas"}
          </button>
        </div>

        {/* Account error */}
        {accountsError && (
          <p className="text-[10px] text-red-500 dark:text-red-400">{accountsError}</p>
        )}

        {/* Account picker dropdown */}
        {showAccountPicker && accounts.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-md dark:border-slate-600 dark:bg-slate-800">
            <div className="flex items-center justify-between border-b border-slate-100 px-3 py-1.5 dark:border-slate-700">
              <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                {accounts.length} conta{accounts.length > 1 ? "s" : ""} disponível{accounts.length > 1 ? "eis" : ""}
              </p>
              <button type="button" onClick={() => setShowAccountPicker(false)} className="text-slate-400 hover:text-slate-600">
                <X size={11} />
              </button>
            </div>
            <div className="max-h-40 overflow-y-auto">
              {accounts.map((acc) => (
                <button
                  key={acc.id}
                  type="button"
                  onClick={() => handleSelectAccount(acc)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-[11px] transition hover:bg-slate-50 dark:hover:bg-slate-700"
                >
                  <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${acc.account_status === 1 ? "bg-emerald-500" : "bg-slate-400"}`} />
                  <span className="flex-1 truncate font-medium text-slate-700 dark:text-slate-300">{acc.name}</span>
                  <span className="font-mono text-[9px] text-slate-400 dark:text-slate-500">{acc.id}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Campaigns list ── */}
      {campaignsError && (
        <div className="flex items-start gap-1.5 rounded-lg border border-red-200 bg-red-50 px-2.5 py-2 text-[11px] text-red-600 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          <AlertCircle size={11} className="mt-0.5 flex-shrink-0" />
          <span className="flex-1">{campaignsError}</span>
          <button type="button" onClick={() => void fetchCampaigns()} className="text-[10px] underline">Tentar novamente</button>
        </div>
      )}

      {!campaignsLoading && campaigns.length > 0 && (
        <div>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Campanhas — clique para adicionar
          </p>
          <div className="max-h-52 overflow-y-auto rounded-lg border border-slate-200 bg-white dark:border-slate-600 dark:bg-slate-800">
            {campaigns.map((c) => {
              const alreadyAdded = alreadyAddedIds.has(c.id);
              const justAdded    = addedThisSession.has(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => !alreadyAdded && !justAdded && handleAdd(c)}
                  disabled={alreadyAdded || justAdded}
                  className={`flex w-full items-center gap-2 border-b border-slate-100 px-3 py-2 text-left text-[11px] last:border-b-0 transition dark:border-slate-700 ${
                    alreadyAdded || justAdded
                      ? "cursor-default opacity-60"
                      : "hover:bg-blue-50 dark:hover:bg-blue-900/20"
                  }`}
                >
                  <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${c.status === "ACTIVE" ? "bg-emerald-500" : "bg-amber-400"}`} />
                  <span className="flex-1 truncate font-medium text-slate-700 dark:text-slate-300" title={c.name}>{c.name}</span>
                  {(alreadyAdded || justAdded) ? (
                    <span className="flex items-center gap-0.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                      <CheckCircle2 size={8} /> Adicionada
                    </span>
                  ) : (
                    <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[9px] font-semibold text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                      + Adicionar
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {addedThisSession.size > 0 && (
            <p className="mt-1.5 text-[10px] text-emerald-600 dark:text-emerald-400">
              ✓ {addedThisSession.size} campanha{addedThisSession.size > 1 ? "s adicionadas" : " adicionada"} — feche o painel quando terminar
            </p>
          )}
        </div>
      )}

      {!campaignsLoading && campaigns.length === 0 && !campaignsError && (
        <p className="text-[11px] text-slate-400 dark:text-slate-500">
          Digite ou selecione um Ad Account e clique em <strong>Campanhas</strong> para listar.
        </p>
      )}
    </div>
  );
}

// ─── Profile Form ─────────────────────────────────────────────────────────────

interface ProfileFormData {
  name: string;
  product: string;
  adAccountId: string;
  groupId: string;
  campaigns: ActiveCampaign[];
  instagramUserId: string;
}

const EMPTY_FORM: ProfileFormData = {
  name: "", product: "", adAccountId: "", groupId: "", campaigns: [], instagramUserId: "",
};

function FormSectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 text-[10px] font-bold uppercase tracking-widest"
      style={{ color: "var(--dm-text-tertiary)" }}>
      {children}
    </p>
  );
}

// ── Instagram selected chip with inline verify ────────────────────────────────
function IgSelectedChip({
  igUserId, knownAccount, onClear,
}: {
  igUserId: string;
  knownAccount?: InstagramAccount;
  onClear: () => void;
}) {
  const [verifyState, setVerifyState] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [verifiedLabel, setVerifiedLabel] = useState<string>("");

  const verify = async () => {
    const { accessToken } = loadMetaCredentials();
    if (!accessToken) return;
    setVerifyState("loading");
    try {
      const res = await fetch(
        `/api/instagram/accounts?accessToken=${encodeURIComponent(accessToken)}`,
      );
      const accounts = await res.json() as InstagramAccount[];
      const match = Array.isArray(accounts)
        ? accounts.find((a) => a.id === igUserId)
        : null;
      if (match) {
        setVerifiedLabel(`@${match.username} · ${formatNumber(match.followersCount)} seguidores`);
        setVerifyState("ok");
      } else {
        setVerifyState("error");
      }
    } catch {
      setVerifyState("error");
    }
  };

  const displayName = knownAccount
    ? `@${knownAccount.username}`
    : verifyState === "ok"
      ? verifiedLabel
      : `ID: ${igUserId}`;

  return (
    <div className="mb-3 space-y-1.5">
      <div
        className="flex items-center gap-2 rounded-lg border px-3 py-2"
        style={{
          borderColor: verifyState === "ok"
            ? "var(--dm-brand-200, #c7d2fe)"
            : verifyState === "error"
              ? "var(--dm-border-default)"
              : "var(--dm-border-default)",
          backgroundColor: "var(--dm-bg-elevated)",
        }}
      >
        <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded"
          style={{ background: IG_GRADIENT }}>
          <AtSign size={10} className="text-white" />
        </div>
        <span className="flex-1 text-xs font-medium" style={{ color: "var(--dm-text-primary)" }}>
          {displayName}
        </span>

        {/* Status icon */}
        {verifyState === "ok" && (
          <CheckCircle2 size={12} className="flex-shrink-0 text-emerald-500" />
        )}
        {verifyState === "error" && (
          <AlertCircle size={12} className="flex-shrink-0 text-amber-500" />
        )}

        {/* Verify button — só mostra se não veio da lista (knownAccount é undefined) */}
        {!knownAccount && verifyState !== "ok" && (
          <button
            type="button"
            onClick={() => void verify()}
            disabled={verifyState === "loading"}
            className="flex-shrink-0 rounded border px-2 py-0.5 text-[10px] font-semibold transition disabled:opacity-50"
            style={{
              borderColor: "var(--dm-border-default)",
              color: "var(--dm-text-secondary)",
              backgroundColor: "var(--dm-bg-surface)",
            }}
          >
            {verifyState === "loading"
              ? <Loader2 size={9} className="animate-spin" />
              : "Verificar"}
          </button>
        )}

        <button
          type="button"
          onClick={onClear}
          className="flex-shrink-0 rounded p-0.5 transition hover:opacity-60"
          style={{ color: "var(--dm-text-tertiary)" }}
        >
          <X size={12} />
        </button>
      </div>

      {verifyState === "error" && (
        <p className="text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>
          Conta não encontrada via token atual. Use a lista "Buscar" para garantir acesso.
        </p>
      )}
    </div>
  );
}

function ProfileForm({
  initial, groupOptions, campaignConfigs, onSave, onCancel,
}: {
  initial?: ProfileFormData;
  groupOptions: GroupOption[];
  campaignConfigs: Record<string, CampaignConfig>;
  onSave: (data: ProfileFormData) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<ProfileFormData>(initial ?? EMPTY_FORM);

  // ── Section labels (built-in + custom) for dropdown optgroups ─────────────
  const { customSections } = useCampaignStore();
  const BUILT_IN_SECTION_LABELS: Record<string, string> = {
    pos: "Pós Graduação", livros: "Livros", ebooks: "Ebooks",
    perpetuo: "Perpétuo", eventos: "Eventos",
  };
  const sectionLabel = (id: string) =>
    BUILT_IN_SECTION_LABELS[id]
    ?? customSections.find((s) => s.id === id)?.label
    ?? id;

  // Group the options by section for <optgroup> rendering
  const groupedBySec = groupOptions.reduce<Record<string, GroupOption[]>>((acc, g) => {
    const sec = g.section ?? "__none__";
    (acc[sec] ??= []).push(g);
    return acc;
  }, {});

  // ── Instagram picker (3.1) — usa o token Meta já configurado ──────────────
  const metaCreds  = loadMetaCredentials();
  const hasIgToken = Boolean(metaCreds.accessToken);
  const [igAccounts, setIgAccounts]     = useState<InstagramAccount[]>([]);
  const [igLoading, setIgLoading]       = useState(false);
  const [igError, setIgError]           = useState<string | null>(null);
  const [showIgPicker, setShowIgPicker] = useState(false);

  const fetchIgAccountsForForm = async () => {
    setIgLoading(true); setIgError(null);
    try {
      const list = await fetchInstagramAccounts(metaCreds.accessToken);
      setIgAccounts(list);
      setShowIgPicker(true);
    } catch (e) {
      setIgError(e instanceof Error ? e.message : "Erro ao buscar contas Instagram.");
    } finally {
      setIgLoading(false);
    }
  };

  const handleGroupChange = (groupId: string) => {
    const auto = campaignConfigs[groupId]?.adAccountId ?? "";
    setForm((f) => ({ ...f, groupId, adAccountId: auto || f.adAccountId }));
  };

  const handleSelectCampaign = (camp: ActiveCampaign) => {
    setForm((f) => {
      if (f.campaigns.some((c) => c.id === camp.id)) return f;
      return { ...f, campaigns: [...f.campaigns, camp] };
    });
  };

  const handleRemoveCampaign = (id: string) => {
    setForm((f) => ({ ...f, campaigns: f.campaigns.filter((c) => c.id !== id) }));
  };

  const inputCls = [
    "h-9 w-full rounded-lg border px-3 text-xs outline-none transition",
    "border-[var(--dm-border-default)] bg-[var(--dm-bg-elevated)] text-[var(--dm-text-primary)]",
    "placeholder:text-[var(--dm-text-tertiary)]",
    "focus:border-blue-500 focus:bg-[var(--dm-bg-surface)] focus:ring-2 focus:ring-blue-500/10",
  ].join(" ");

  const labelCls = "block text-xs font-semibold mb-1.5";

  const canSave = form.name.trim() !== "" && form.adAccountId.trim() !== "";

  return (
    <form onSubmit={(e) => { e.preventDefault(); if (canSave) onSave(form); }}>

      {/* ── Section 1: Identificação ────────────────────────────────────────── */}
      <div className="px-6 py-5">
        <FormSectionLabel>Identificação</FormSectionLabel>
        <div className="space-y-4">
          <div>
            <label className={labelCls} style={{ color: "var(--dm-text-secondary)" }}>
              Nome do Anunciante <span className="text-red-500">*</span>
            </label>
            <input
              type="text" value={form.name} autoFocus
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Ex: Rafa Lund"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls} style={{ color: "var(--dm-text-secondary)" }}>
              Produto / Nicho
            </label>
            <input
              type="text" value={form.product}
              onChange={(e) => setForm((f) => ({ ...f, product: e.target.value }))}
              placeholder="Ex: Pós em Treinamento Feminino"
              className={inputCls}
            />
          </div>
        </div>
      </div>

      <div className="border-t" style={{ borderColor: "var(--dm-border-subtle)" }} />

      {/* ── Section 2: Configuração ─────────────────────────────────────────── */}
      <div className="px-6 py-5">
        <FormSectionLabel>Configuração da Conta</FormSectionLabel>
        <div className="space-y-4">
          <div>
            <label className={labelCls} style={{ color: "var(--dm-text-secondary)" }}>
              Grupo de Campanha
            </label>
            <select
              value={form.groupId}
              onChange={(e) => handleGroupChange(e.target.value)}
              className={inputCls}
            >
              <option value="">— Selecionar grupo —</option>
              {Object.entries(groupedBySec).map(([secId, opts]) => (
                <optgroup key={secId} label={sectionLabel(secId)}>
                  {opts.map((g) => (
                    <option key={g.id} value={g.id}>{g.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls} style={{ color: "var(--dm-text-secondary)" }}>
              Ad Account ID <span className="text-red-500">*</span>
            </label>
            <input
              type="text" value={form.adAccountId}
              onChange={(e) => setForm((f) => ({ ...f, adAccountId: e.target.value, campaigns: [] }))}
              placeholder="act_524658353530105"
              className={inputCls}
            />
            {form.groupId && campaignConfigs[form.groupId]?.adAccountId && (
              <p className="mt-1.5 flex items-center gap-1 text-[10px]"
                style={{ color: "var(--dm-text-tertiary)" }}>
                <CheckCircle2 size={9} className="text-emerald-500" />
                Configurado: <span className="font-mono">{campaignConfigs[form.groupId].adAccountId}</span>
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── Section 3: Instagram (optional) ────────────────────────────────── */}
      {hasIgToken && (
        <>
          <div className="border-t" style={{ borderColor: "var(--dm-border-subtle)" }} />
          <div className="px-6 py-5">
            <FormSectionLabel>
              Instagram <span className="ml-1 normal-case font-normal tracking-normal opacity-50">(opcional)</span>
            </FormSectionLabel>

            {/* Selected account chip — estilo neutro do sistema */}
            {form.instagramUserId && !showIgPicker && (
              <IgSelectedChip
                igUserId={form.instagramUserId}
                knownAccount={igAccounts.find(a => a.id === form.instagramUserId)}
                onClear={() => setForm(f => ({ ...f, instagramUserId: "" }))}
              />
            )}

            <div className="flex gap-2">
              <input
                type="text"
                value={form.instagramUserId}
                onChange={e => setForm(f => ({ ...f, instagramUserId: e.target.value }))}
                placeholder="ID da conta Instagram"
                className={inputCls}
              />
              <button
                type="button"
                onClick={() => void fetchIgAccountsForForm()}
                disabled={igLoading}
                className="flex flex-shrink-0 items-center gap-1.5 rounded-lg border px-3 text-[10px] font-semibold transition disabled:opacity-50"
                style={{
                  borderColor: "var(--dm-border-default)",
                  backgroundColor: "var(--dm-bg-elevated)",
                  color: "var(--dm-text-secondary)",
                  height: "36px",
                }}
              >
                {igLoading ? <Loader2 size={10} className="animate-spin" /> : <AtSign size={10} />}
                {igLoading ? "Buscando…" : "Buscar"}
              </button>
            </div>

            {/* Dropdown picker */}
            {showIgPicker && igAccounts.length > 0 && (
              <div className="mt-1.5 overflow-hidden rounded-lg border shadow-lg"
                style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-surface)" }}>
                <div className="flex items-center justify-between border-b px-3 py-2"
                  style={{ borderColor: "var(--dm-border-subtle)" }}>
                  <p className="text-[10px] font-semibold uppercase tracking-wider"
                    style={{ color: "var(--dm-text-tertiary)" }}>
                    Selecione a conta
                  </p>
                  <button type="button" onClick={() => setShowIgPicker(false)}
                    style={{ color: "var(--dm-text-tertiary)" }}>
                    <X size={11} />
                  </button>
                </div>
                {igAccounts.map(acc => (
                  <button key={acc.id} type="button"
                    onClick={() => { setForm(f => ({ ...f, instagramUserId: acc.id })); setShowIgPicker(false); }}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition hover:bg-[var(--dm-bg-elevated)]">
                    <AtSign size={11} style={{ color: "var(--dm-brand-500)" }} />
                    <span className="flex-1 text-xs font-medium" style={{ color: "var(--dm-text-primary)" }}>
                      @{acc.username}
                    </span>
                    <span className="font-mono text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>
                      {formatNumber(acc.followersCount)} seguidores
                    </span>
                  </button>
                ))}
              </div>
            )}
            {igError && <p className="mt-1.5 text-[10px] text-red-500">{igError}</p>}
          </div>
        </>
      )}

      {/* ── Section 4: Campanhas ────────────────────────────────────────────── */}
      {form.adAccountId.trim() && (
        <>
          <div className="border-t" style={{ borderColor: "var(--dm-border-subtle)" }} />
          <div className="px-6 py-5">
            <FormSectionLabel>Campanhas Vinculadas</FormSectionLabel>

            {form.campaigns.length > 0 && (
              <div className="mb-3 space-y-1.5">
                {form.campaigns.map((c) => (
                  <div key={c.id}
                    className="flex items-center gap-2 rounded-lg border px-3 py-2"
                    style={{ borderColor: "#10B98144", backgroundColor: "#10B9810D" }}>
                    <CheckCircle2 size={11} className="flex-shrink-0 text-emerald-500" />
                    <span className="flex-1 truncate text-[11px] font-medium"
                      style={{ color: "var(--dm-text-primary)" }} title={c.name}>
                      {c.name}
                    </span>
                    <button type="button" onClick={() => handleRemoveCampaign(c.id)}
                      className="rounded p-0.5 text-emerald-400 transition hover:text-red-500">
                      <X size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="rounded-lg border p-3"
              style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-elevated)" }}>
              <AddCampaignPanel
                key={form.adAccountId}
                defaultAccountId={form.adAccountId}
                alreadyAddedIds={new Set(form.campaigns.map((c) => c.id))}
                onAdd={handleSelectCampaign}
              />
            </div>
          </div>
        </>
      )}

      {/* ── Sticky footer with actions ──────────────────────────────────────── */}
      <div className="sticky bottom-0 border-t px-6 py-4"
        style={{
          borderColor: "var(--dm-border-default)",
          backgroundColor: "var(--dm-bg-surface)",
        }}
      >
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={!canSave}
            className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg text-xs font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-40"
            style={{ backgroundColor: canSave ? "var(--dm-brand-500)" : "var(--dm-brand-500)" }}
          >
            {initial ? "Salvar Alterações" : "Criar Perfil"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="flex h-9 flex-1 items-center justify-center rounded-lg border text-xs font-semibold transition hover:bg-[var(--dm-bg-elevated)]"
            style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-secondary)" }}
          >
            Cancelar
          </button>
        </div>
      </div>
    </form>
  );
}

// ─── Profile Card ─────────────────────────────────────────────────────────────

function ProfileCard({
  profile, groupLabel, onSelect, onEdit, onDelete,
}: {
  profile: AdvertiserProfile;
  groupLabel: string;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const initials = profile.name.split(" ").slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
  const [avatarCls, borderCls] = avatarStyle(profile.name);

  return (
    <div
      onClick={onSelect}
      className="group relative cursor-pointer rounded-xl border shadow-sm transition-all hover:shadow-md"
      style={{ backgroundColor: "var(--dm-bg-surface)", borderColor: "var(--dm-border-default)" }}
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-sm font-bold ${avatarCls}`}>
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold" style={{ color: "var(--dm-text-primary)" }}>{profile.name}</p>
            <p className="mt-0.5 truncate text-xs" style={{ color: "var(--dm-text-secondary)" }}>{profile.product}</p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {groupLabel && (
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
              style={{ backgroundColor: "var(--dm-brand-50)", color: "var(--dm-brand-500)" }}
            >
              {groupLabel}
            </span>
          )}
          <span
            className="rounded-full px-2 py-0.5 font-mono text-[10px]"
            style={{ backgroundColor: "var(--dm-bg-elevated)", color: "var(--dm-text-tertiary)" }}
          >
            {profile.adAccountId}
          </span>
        </div>

        {/* Campaign badges */}
        {profile.campaigns.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {profile.campaigns.slice(0, 2).map((c) => (
              <span key={c.id} className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                <span className="h-1 w-1 rounded-full bg-emerald-500" />
                {c.name.length > 22 ? c.name.slice(0, 22) + "…" : c.name}
              </span>
            ))}
            {profile.campaigns.length > 2 && (
              <span
                className="rounded-full px-2 py-0.5 text-[10px]"
                style={{ backgroundColor: "var(--dm-bg-elevated)", color: "var(--dm-text-tertiary)" }}
              >
                +{profile.campaigns.length - 2}
              </span>
            )}
          </div>
        )}

        {profile.campaigns.length === 0 && (
          <p className="mt-2 text-[10px] italic" style={{ color: "var(--dm-text-tertiary)" }}>Sem campanhas configuradas</p>
        )}

      </div>

      {/* Action buttons — shown on hover */}
      <div className="absolute right-3 top-3 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button type="button" onClick={(e) => { e.stopPropagation(); onEdit(); }}
          className="flex h-6 w-6 items-center justify-center rounded-md border transition"
          style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-elevated)", color: "var(--dm-text-tertiary)" }}
        >
          <Edit2 size={11} />
        </button>
        <button type="button" onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="flex h-6 w-6 items-center justify-center rounded-md border transition hover:border-red-300 hover:text-red-500"
          style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-elevated)", color: "var(--dm-text-tertiary)" }}
        >
          <Trash2 size={11} />
        </button>
      </div>
    </div>
  );
}

// ─── Profile overview — agrega todas as campanhas do perfil ──────────────────

// ─── localStorage keys for overview-level persistence ────────────────────────
const OVERVIEW_GOALS_KEY  = "pta_overview_goals_v1";
const OVERVIEW_FUNNEL_KEY = "pta_overview_funnel_v1";

// Shared color maps (mirrors CampaignAnalysisPanel)
const KPI_SOLID_OV: Record<string, string> = {
  brand: "#6366C8", sky: "#0ea5e9", green: "#05CD99",
  rose: "#EE5D50", amber: "#F4A60D", slate: "#64748b",
};
const KPI_BG_OV: Record<string, string> = {
  brand: "rgba(99,102,200,0.12)", sky: "rgba(14,165,233,0.12)",
  green: "rgba(5,205,153,0.12)", rose: "rgba(238,93,80,0.12)",
  amber: "rgba(244,166,13,0.12)", slate: "rgba(100,116,139,0.10)",
};
const FUNNEL_COLORS_OV: Record<string, string> = {
  reach: "#6366C8", impressions: "#8b5cf6", clicks: "#0ea5e9",
  page_views: "#f59e0b", leads: "#e11d48", sales: "#05CD99",
};

function ProfileOverviewPanel({
  profileId, adAccountId, campaigns, dateFrom, dateTo, template,
}: {
  profileId: string;
  adAccountId: string;
  campaigns: ActiveCampaign[];
  dateFrom: string;
  dateTo: string;
  template: Template;
}) {
  const [rows, setRows]       = useState<AdsetRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  // ── Tipo de resultado dominante (comum a todas as campanhas do perfil) ────
  // Só definido se TODAS as campanhas concordam no mesmo resultType.
  // Alimenta toAdsetRows e rawValues.sales para unificar métricas entre tabs.
  const dominantResultType = useMemo(() => {
    const types = campaigns.map(c => c.resultType).filter(Boolean) as ResultType[];
    if (types.length === 0) return undefined;
    const first = types[0]!;
    return types.every(t => t === first) ? first : undefined;
  }, [campaigns]);

  // ── Goals ─────────────────────────────────────────────────────────────────
  const [goals, setGoals] = useState<Record<string, number>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const stored = JSON.parse(localStorage.getItem(OVERVIEW_GOALS_KEY) ?? "{}") as Record<string, Record<string, number>>;
      return stored[profileId] ?? {};
    } catch { return {}; }
  });
  const [editGoals, setEditGoals] = useState(false);

  const updateGoal = (kpiId: string, value: number) => {
    setGoals((prev) => {
      const next = { ...prev };
      if (!value || value <= 0) delete next[kpiId]; else next[kpiId] = value;
      try {
        const stored = JSON.parse(localStorage.getItem(OVERVIEW_GOALS_KEY) ?? "{}") as Record<string, Record<string, number>>;
        localStorage.setItem(OVERVIEW_GOALS_KEY, JSON.stringify({ ...stored, [profileId]: next }));
      } catch {}
      return next;
    });
  };

  // ── Funnel config ─────────────────────────────────────────────────────────
  const [funnelStepIds, setFunnelStepIds] = useState<ProfileFunnelStepId[]>(() => {
    if (typeof window === "undefined") return DEFAULT_FUNNEL_STEP_IDS;
    try {
      const stored = JSON.parse(localStorage.getItem(OVERVIEW_FUNNEL_KEY) ?? "{}") as Record<string, string[]>;
      const ids = stored[profileId];
      if (!ids) return DEFAULT_FUNNEL_STEP_IDS;
      const valid = ids.filter((id): id is ProfileFunnelStepId => PROFILE_FUNNEL_STEPS.some((s) => s.id === id));
      return valid.length > 0 ? valid : DEFAULT_FUNNEL_STEP_IDS;
    } catch { return DEFAULT_FUNNEL_STEP_IDS; }
  });
  const [showFunnelPanel, setShowFunnelPanel] = useState(false);
  const [funnelView, setFunnelView]           = useState<"bars" | "funnel">("bars");

  const persistFunnelSteps = (next: ProfileFunnelStepId[]) => {
    const safe = next.length > 0 ? next : DEFAULT_FUNNEL_STEP_IDS;
    setFunnelStepIds(safe);
    try {
      const stored = JSON.parse(localStorage.getItem(OVERVIEW_FUNNEL_KEY) ?? "{}") as Record<string, string[]>;
      localStorage.setItem(OVERVIEW_FUNNEL_KEY, JSON.stringify({ ...stored, [profileId]: safe }));
    } catch {}
  };

  const toggleFunnelStep = (id: ProfileFunnelStepId) => {
    persistFunnelSteps(
      funnelStepIds.includes(id)
        ? funnelStepIds.filter((s) => s !== id)
        : [...funnelStepIds, id],
    );
  };

  const moveFunnelStep = (id: ProfileFunnelStepId, dir: -1 | 1) => {
    const idx = funnelStepIds.indexOf(id);
    const next = idx + dir;
    if (idx < 0 || next < 0 || next >= funnelStepIds.length) return;
    const arr = [...funnelStepIds];
    [arr[idx], arr[next]] = [arr[next], arr[idx]];
    persistFunnelSteps(arr);
  };

  // ── Fetch at campaign level (one row per campaign — fixes duplicate bug) ──
  useEffect(() => {
    if (!adAccountId || campaigns.length === 0) return;
    const { accessToken } = loadMetaCredentials();
    if (!accessToken) return;
    setLoading(true); setError(null);
    fetchMetaInsights(adAccountId, dateFrom, dateTo, {
      level: "campaign",
      timeIncrement: "all_days",
      campaignIds: campaigns.map((c) => c.id),
    })
      .then((data) => setRows(toAdsetRows(data, dominantResultType)))
      .catch((e) => setError(e instanceof Error ? e.message : "Erro ao buscar dados."))
      .finally(() => setLoading(false));
  }, [adAccountId, campaigns, dateFrom, dateTo, dominantResultType]);

  // ── Aggregate totals ──────────────────────────────────────────────────────
  const totals = useMemo(() => {
    const inv  = rows.reduce((s, r) => s + r.spend, 0);
    const imp  = rows.reduce((s, r) => s + r.impressions, 0);
    const clk  = rows.reduce((s, r) => s + r.clicks, 0);
    const rch  = rows.reduce((s, r) => s + r.reach, 0);
    const conv = rows.reduce((s, r) => s + r.purchases, 0);
    const rev  = rows.reduce((s, r) => s + r.revenue, 0);
    const lds  = rows.reduce((s, r) => s + r.leads, 0);
    const pv   = rows.reduce((s, r) => s + r.page_views, 0);
    const fol  = rows.reduce((s, r) => s + r.new_followers, 0);
    const allC = rows.reduce((s, r) => s + r.total_clicks, 0);
    const cust = rows.reduce((s, r) => s + r.customResult, 0);
    return { inv, imp, clk, rch, conv, rev, lds, pv, fol, allC, cust };
  }, [rows]);

  // ── Template-driven KPI values ────────────────────────────────────────────
  // Resultado principal: usa customResult quando dominantResultType está definido e > 0.
  // Isso garante que "Resultados" e "Custo por Resultado" na Visão Geral mostrem
  // o mesmo número que a tab Campanha, calculado pelo mesmo template.derive().
  const rawValues: Record<string, number> = {
    impressions:    totals.imp,
    reach:          totals.rch,
    clicks:         totals.clk,
    total_clicks:   totals.allC,
    spend:          totals.inv,
    revenue:        totals.rev,
    leads:          totals.lds,
    sales:          dominantResultType && totals.cust > 0 ? totals.cust : totals.conv,
    tickets:        totals.conv,
    page_views:     totals.pv,
    profile_visits: 0,
    new_followers:  totals.fol,
  };
  const kpiValues = useMemo(() => ({ ...rawValues, ...template.derive(rawValues) }), [rows, template]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Funnel step aggregate values ──────────────────────────────────────────
  const funnelVals: Record<ProfileFunnelStepId, number> = {
    reach:       totals.rch,
    impressions: totals.imp,
    clicks:      totals.clk,
    page_views:  totals.pv,
    leads:       totals.lds,
    sales:       totals.conv,
  };

  // ── Loading / error states ────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={20} className="animate-spin" style={{ color: "var(--dm-text-tertiary)" }} />
        <span className="ml-2 text-sm" style={{ color: "var(--dm-text-tertiary)" }}>
          Agregando {campaigns.length} campanha{campaigns.length !== 1 ? "s" : ""}…
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
        <AlertCircle size={14} className="mt-0.5 shrink-0" /> {error}
        <button onClick={() => {
          const { accessToken } = loadMetaCredentials();
          if (!accessToken) return;
          setLoading(true); setError(null);
          fetchMetaInsights(adAccountId, dateFrom, dateTo, {
            level: "campaign", timeIncrement: "all_days",
            campaignIds: campaigns.map((c) => c.id),
          }).then((data) => setRows(toAdsetRows(data)))
            .catch((e) => setError(e instanceof Error ? e.message : "Erro ao buscar dados."))
            .finally(() => setLoading(false));
        }} className="ml-auto underline">Tentar novamente</button>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border p-8 text-center text-xs"
        style={{ backgroundColor: "var(--dm-bg-surface)", borderColor: "var(--dm-border-default)", color: "var(--dm-text-tertiary)" }}>
        Nenhum dado encontrado para este período.
      </div>
    );
  }

  return (
    <div className="space-y-4">

      {/* ── Badge + header ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <span className="rounded-full px-3 py-1 text-[11px] font-semibold"
          style={{ background: "rgba(99,102,200,0.12)", color: "var(--dm-brand-500)" }}>
          {campaigns.length} campanha{campaigns.length !== 1 ? "s" : ""} · visão consolidada
        </span>
        <span className="text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>
          {dateFrom} → {dateTo}
        </span>
      </div>

      {/* ── MÉTRICAS PRINCIPAIS ────────────────────────────────────────────── */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "var(--dm-text-tertiary)" }}>
            Métricas Principais
          </p>
          <button
            type="button"
            onClick={() => setEditGoals((v) => !v)}
            className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[11px] font-semibold transition"
            style={editGoals
              ? { background: "linear-gradient(135deg,#6366C8 0%,#313491 100%)", color: "#fff", boxShadow: "0 4px 12px rgba(49,52,145,0.30)" }
              : { backgroundColor: "var(--dm-bg-elevated)", color: "var(--dm-text-tertiary)", border: "1px solid var(--dm-border-default)" }}
          >
            <Target size={11} />
            {editGoals ? "Salvar Metas" : "Definir Metas"}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {template.kpis.map((kpi) => {
            const val      = kpiValues[kpi.id] ?? 0;
            const display  = val > 0 ? kpi.format(val) : "—";
            const goalVal  = goals[kpi.id] ?? 0;
            const goalPct  = goalVal > 0
              ? kpi.invert ? (goalVal / Math.max(val, 0.001)) * 100 : (val / goalVal) * 100
              : 0;
            const goalMet  = goalVal > 0 && (kpi.invert ? val <= goalVal : val >= goalVal);
            const goalColor = goalMet ? "#05CD99" : goalPct >= 75 ? "#F4A60D" : "#EE5D50";
            const solid = KPI_SOLID_OV[kpi.color] ?? "#6366C8";
            const bg    = KPI_BG_OV[kpi.color]    ?? "rgba(99,102,200,0.10)";

            return (
              <article
                key={kpi.id}
                className="flex flex-col rounded-[20px] border shadow-horizon card-hover"
                style={{ backgroundColor: "var(--dm-bg-surface)", borderColor: "var(--dm-border-default)", padding: "18px" }}
              >
                <div className="mb-4 flex items-center justify-between gap-2">
                  <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full"
                    style={{ backgroundColor: bg }}>
                    <Target size={18} style={{ color: solid }} />
                  </div>
                  {editGoals && (
                    <input
                      type="number" step="any"
                      value={goals[kpi.id] ?? ""}
                      onChange={(e) => { const v = parseFloat(e.target.value); updateGoal(kpi.id, isNaN(v) ? 0 : v); }}
                      placeholder="Meta"
                      className="w-20 h-7 rounded-[10px] border px-2 text-[10px] text-right outline-none"
                      style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-elevated)", color: "var(--dm-text-primary)" }}
                    />
                  )}
                </div>

                <p className="mb-1 text-[12px] font-semibold" style={{ color: "var(--dm-text-secondary)" }} title={kpi.tooltip}>
                  {kpi.label}
                </p>
                <p className="text-[22px] font-bold tabular-nums tracking-tight leading-tight"
                  style={{ color: "var(--dm-text-primary)", fontFamily: "var(--font-poppins), Poppins, sans-serif" }}>
                  {display}
                </p>

                {!editGoals && goalVal > 0 && (
                  <div className="mt-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>
                        Meta: {kpi.format(goalVal)}
                      </span>
                      <span className="text-[10px] font-bold" style={{ color: goalColor }}>
                        {Math.min(Math.round(goalPct), 999)}%
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: "var(--dm-bg-elevated)" }}>
                      <div className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, goalPct)}%`, backgroundColor: goalColor }} />
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </div>

      {/* ── FUNIL DE CONVERSÃO ─────────────────────────────────────────────── */}
      <article className="overflow-hidden rounded-[20px] border shadow-horizon"
        style={{ backgroundColor: "var(--dm-bg-surface)", borderColor: "var(--dm-border-default)" }}>

        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4"
          style={{ borderColor: "var(--dm-border-subtle)" }}>
          <div>
            <h3 className="text-sm font-bold" style={{ color: "var(--dm-text-primary)", fontFamily: "var(--font-poppins),Poppins,sans-serif" }}>
              Funil de Conversão
            </h3>
            <p className="mt-0.5 text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>
              Jornada consolidada de todas as campanhas
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-[10px] p-0.5" style={{ backgroundColor: "var(--dm-bg-elevated)" }}>
              {(["bars", "funnel"] as const).map((v) => (
                <button key={v} type="button" onClick={() => setFunnelView(v)}
                  className="flex items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-[11px] font-semibold transition-all"
                  style={funnelView === v
                    ? { background: "linear-gradient(135deg,#6366C8 0%,#313491 100%)", color: "#fff", boxShadow: "0 2px 8px rgba(49,52,145,0.28)" }
                    : { color: "var(--dm-text-tertiary)" }}>
                  {v === "bars" ? "Barras" : "Funil"}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setShowFunnelPanel((v) => !v)}
              className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[11px] font-semibold transition"
              style={showFunnelPanel
                ? { background: "linear-gradient(135deg,#6366C8 0%,#313491 100%)", color: "#fff", boxShadow: "0 4px 12px rgba(49,52,145,0.30)" }
                : { backgroundColor: "var(--dm-bg-elevated)", color: "var(--dm-text-secondary)", border: "1px solid var(--dm-border-default)" }}
            >
              <SlidersHorizontal size={11} />
              {showFunnelPanel ? "Fechar" : "Personalizar"}
            </button>
          </div>
        </div>

        {/* Funnel customization panel */}
        {showFunnelPanel && (
          <div className="border-b px-5 py-4 space-y-3" style={{ borderColor: "var(--dm-border-subtle)", backgroundColor: "var(--dm-bg-elevated)" }}>
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--dm-text-tertiary)" }}>
              Etapas visíveis
            </p>
            <div className="flex flex-wrap gap-2">
              {PROFILE_FUNNEL_STEPS.map((step) => {
                const selected = funnelStepIds.includes(step.id);
                const index    = funnelStepIds.indexOf(step.id);
                return (
                  <div key={step.id}
                    className="flex items-center gap-1.5 rounded-[12px] cursor-pointer select-none transition"
                    style={{
                      padding: "6px 12px",
                      backgroundColor: selected ? step.color + "20" : "var(--dm-bg-surface)",
                      border: `1.5px solid ${selected ? step.color + "66" : "var(--dm-border-default)"}`,
                      color: selected ? step.color : "var(--dm-text-tertiary)",
                    }}
                    onClick={() => !(selected && funnelStepIds.length === 1) && toggleFunnelStep(step.id)}
                  >
                    <span className="text-[11px] font-semibold">{step.label}</span>
                    {selected && (
                      <div className="flex gap-0.5 ml-0.5">
                        <button type="button"
                          onClick={(e) => { e.stopPropagation(); moveFunnelStep(step.id, -1); }}
                          disabled={index === 0}
                          className="rounded p-0.5 transition disabled:opacity-20 hover:opacity-80">
                          <ArrowUp size={9} />
                        </button>
                        <button type="button"
                          onClick={(e) => { e.stopPropagation(); moveFunnelStep(step.id, 1); }}
                          disabled={index === funnelStepIds.length - 1}
                          className="rounded p-0.5 transition disabled:opacity-20 hover:opacity-80">
                          <ArrowDown size={9} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <button type="button" onClick={() => persistFunnelSteps(DEFAULT_FUNNEL_STEP_IDS)}
              className="text-[10px] font-semibold transition hover:opacity-70"
              style={{ color: "var(--dm-brand-500)" }}>
              Restaurar padrão
            </button>
          </div>
        )}

        {/* VIEW: BARRAS */}
        {funnelView === "bars" && (() => {
          const maxVal = Math.max(...funnelStepIds.map((id) => funnelVals[id] ?? 0), 1);
          return (
            <div className="flex flex-col gap-0 px-5 py-5">
              {funnelStepIds.map((stepId, i) => {
                const step    = PROFILE_FUNNEL_STEPS.find((s) => s.id === stepId);
                if (!step) return null;
                const val     = funnelVals[stepId] ?? 0;
                const prevId  = i > 0 ? funnelStepIds[i - 1] : null;
                const prevVal = prevId ? (funnelVals[prevId] ?? 0) : null;
                const rate    = prevVal !== null && prevVal > 0 ? (val / prevVal) * 100 : null;
                const color   = FUNNEL_COLORS_OV[stepId] ?? step.color;
                const pct     = maxVal > 0 ? (val / maxVal) * 100 : 0;
                return (
                  <div key={stepId} className="flex flex-col">
                    {i > 0 && (
                      <div className="flex items-center gap-3 py-2 pl-[52px]">
                        <div className="w-px self-stretch" style={{ backgroundColor: "var(--dm-border-default)", minHeight: "12px" }} />
                        {rate !== null && (
                          <span className="rounded-full px-3 py-0.5 text-[10px] font-bold"
                            style={{ backgroundColor: color + "18", color }}>
                            {formatPercent(rate)}{step.rateLabel ? ` ${step.rateLabel}` : ""}
                          </span>
                        )}
                      </div>
                    )}
                    <div className="flex items-center gap-4">
                      <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                        style={{ background: `linear-gradient(135deg,${color} 0%,${color}bb 100%)`, boxShadow: `0 4px 12px ${color}44` }}>
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between mb-2">
                          <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color }}>{step.label}</p>
                          <p className="text-[20px] font-bold tabular-nums leading-none"
                            style={{ color: "var(--dm-text-primary)", fontFamily: "var(--font-poppins),Poppins,sans-serif" }}>
                            {val > 0 ? formatNumber(val) : <span style={{ color: "var(--dm-text-tertiary)", fontSize: "14px" }}>Sem dados</span>}
                          </p>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full" style={{ backgroundColor: color + "18" }}>
                          <div className="h-full rounded-full transition-all duration-700"
                            style={{ width: `${pct}%`, background: `linear-gradient(90deg,${color} 0%,${color}99 100%)` }} />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}

        {/* VIEW: FUNIL AFUNILADO */}
        {funnelView === "funnel" && (() => {
          const total = funnelStepIds.length;
          return (
            <div className="flex flex-col items-center px-6 py-6 gap-0">
              {funnelStepIds.map((stepId, i) => {
                const step    = PROFILE_FUNNEL_STEPS.find((s) => s.id === stepId);
                if (!step) return null;
                const val     = funnelVals[stepId] ?? 0;
                const prevId  = i > 0 ? funnelStepIds[i - 1] : null;
                const prevVal = prevId ? (funnelVals[prevId] ?? 0) : null;
                const rate    = prevVal !== null && prevVal > 0 ? (val / prevVal) * 100 : null;
                const color   = FUNNEL_COLORS_OV[stepId] ?? step.color;
                const widthPct = total > 1 ? 100 - (i / (total - 1)) * 50 : 88;
                return (
                  <div key={stepId} className="w-full flex flex-col items-center">
                    {i > 0 && (
                      <div className="flex flex-col items-center py-2 gap-1">
                        <div className="w-px h-4" style={{ backgroundColor: "var(--dm-border-default)" }} />
                        {rate !== null && (
                          <span className="rounded-full px-3 py-0.5 text-[10px] font-bold"
                            style={{ backgroundColor: color + "1a", color }}>
                            {formatPercent(rate)}{step.rateLabel ? ` ${step.rateLabel}` : ""}
                          </span>
                        )}
                        <div className="w-px h-4" style={{ backgroundColor: "var(--dm-border-default)" }} />
                      </div>
                    )}
                    <div className="flex items-center justify-between transition-all"
                      style={{
                        width: `${widthPct}%`, borderRadius: "14px", padding: "14px 20px",
                        background: `linear-gradient(135deg, ${color}22 0%, ${color}0d 100%)`,
                        border: `1.5px solid ${color}55`,
                      }}>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider mb-0.5" style={{ color }}>{step.label}</p>
                        {rate !== null && step.rateLabel && (
                          <p className="text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>{step.rateLabel}</p>
                        )}
                      </div>
                      <p className="text-[22px] font-bold tabular-nums"
                        style={{ color: "var(--dm-text-primary)", fontFamily: "var(--font-poppins),Poppins,sans-serif" }}>
                        {val > 0 ? formatNumber(val) : <span style={{ color: "var(--dm-text-tertiary)", fontSize: "13px" }}>—</span>}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </article>

      {/* ── VENDAS POR CAMPANHA ────────────────────────────────────────────── */}
      {campaigns.length > 0 && rows.length > 0 && (
        <article className="overflow-hidden rounded-[20px] border shadow-horizon"
          style={{ backgroundColor: "var(--dm-bg-surface)", borderColor: "var(--dm-border-default)" }}>
          <div className="flex items-center justify-between border-b px-5 py-4"
            style={{ borderColor: "var(--dm-border-subtle)" }}>
            <div>
              <h3 className="text-sm font-bold" style={{ color: "var(--dm-text-primary)", fontFamily: "var(--font-poppins),Poppins,sans-serif" }}>
                Vendas por Campanha
              </h3>
              <p className="mt-0.5 text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>
                {campaigns.length} campanha{campaigns.length !== 1 ? "s" : ""} · período selecionado
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr style={{ backgroundColor: "var(--dm-bg-elevated)" }}>
                  {["Campanha", "Investimento", "Alcance", "Leads", "Conv.", "Faturamento", "ROAS"].map((h) => (
                    <th key={h}
                      className={`border-b px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap ${h === "Campanha" ? "text-left" : "text-right"}`}
                      style={{ borderColor: "var(--dm-border-subtle)", color: "var(--dm-text-tertiary)" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {campaigns.map((camp) => {
                  // exact match by campaign name (campaign-level fetch gives one row per campaign name)
                  const row  = rows.find((r) => r.name === camp.name);
                  const inv  = row?.spend    ?? 0;
                  const rch  = row?.reach    ?? 0;
                  const lds  = row?.leads    ?? 0;
                  const conv = row?.purchases ?? 0;
                  const rev  = row?.revenue  ?? 0;
                  const roas = inv > 0 ? rev / inv : 0;
                  const roasColor = roas >= 2 ? "#05CD99" : roas >= 1 ? "#F4A60D" : inv > 0 ? "#EE5D50" : "var(--dm-text-tertiary)";
                  return (
                    <tr key={camp.id} className="border-b transition-colors hover:bg-white/5"
                      style={{ borderColor: "var(--dm-border-subtle)" }}>
                      <td className="px-4 py-3 max-w-[260px] truncate font-medium"
                        style={{ color: "var(--dm-text-primary)" }}>
                        {camp.name.length > 42 ? camp.name.slice(0, 42) + "…" : camp.name}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold"
                        style={{ color: "var(--dm-text-primary)" }}>
                        {inv > 0 ? formatBRL(inv) : <span style={{ color: "var(--dm-text-tertiary)" }}>—</span>}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums" style={{ color: "var(--dm-text-secondary)" }}>
                        {rch > 0 ? formatInt(rch) : <span style={{ color: "var(--dm-text-tertiary)" }}>—</span>}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums" style={{ color: "var(--dm-text-secondary)" }}>
                        {lds > 0 ? formatInt(lds) : <span style={{ color: "var(--dm-text-tertiary)" }}>—</span>}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums" style={{ color: "var(--dm-text-secondary)" }}>
                        {conv > 0 ? formatInt(conv) : <span style={{ color: "var(--dm-text-tertiary)" }}>—</span>}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums" style={{ color: "var(--dm-text-secondary)" }}>
                        {rev > 0 ? formatBRL(rev) : <span style={{ color: "var(--dm-text-tertiary)" }}>—</span>}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        <span className="rounded-full px-2.5 py-0.5 text-[11px] font-bold"
                          style={{ backgroundColor: roasColor + "1a", color: roasColor }}>
                          {inv > 0 ? `${roas.toFixed(2)}x` : "—"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {/* Totals row */}
              {campaigns.length > 1 && (
                <tfoot>
                  <tr style={{ background: "linear-gradient(135deg, rgba(49,52,145,0.06) 0%, rgba(99,102,200,0.04) 100%)", borderTop: "2px solid var(--dm-border-default)" }}>
                    <td className="px-4 py-3">
                      <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--dm-brand-500)" }}>Total</span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-[13px] font-bold" style={{ color: "var(--dm-brand-500)" }}>
                      {formatBRL(totals.inv)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-[12px] font-semibold" style={{ color: "var(--dm-text-primary)" }}>
                      {formatInt(totals.rch)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-[12px] font-semibold" style={{ color: "var(--dm-text-primary)" }}>
                      {formatInt(totals.lds)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-[12px] font-semibold" style={{ color: "var(--dm-text-primary)" }}>
                      {formatInt(totals.conv)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-[12px] font-semibold" style={{ color: "var(--dm-text-primary)" }}>
                      {formatBRL(totals.rev)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {(() => {
                        const totalRoas = totals.inv > 0 ? totals.rev / totals.inv : 0;
                        const c = totalRoas >= 2 ? "#05CD99" : totalRoas >= 1 ? "#F4A60D" : "#EE5D50";
                        return (
                          <span className="rounded-full px-2.5 py-0.5 text-[11px] font-bold"
                            style={{ backgroundColor: c + "1a", color: c }}>
                            {totals.inv > 0 ? `${totalRoas.toFixed(2)}x` : "—"}
                          </span>
                        );
                      })()}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </article>
      )}
    </div>
  );
}

// ─── KPI IDs to hide from the metrics grid when highlight cards are visible ───
// When a resultType is configured and the Resultado/Custo-por-Resultado cards
// are already rendered above, suppress the duplicate KPI cards below.
// KPIs a ocultar quando o rawValues.sales já é alimentado por customResult.
// Evita duplicar o mesmo número com labels diferentes no grid.
// "sales" e "cpa" não precisam mais ser listados aqui — o template já os calcula
// corretamente via rawValues.sales = customResult.
const RESULT_HIDDEN_KPIS: Partial<Record<ResultType, string[]>> = {
  link_click:                       ["clicks", "cpc_link"],  // Cliques no link = sales, CPC link = cpa
  lead:                             ["leads",  "cpl"],        // Leads = sales, CPL = cpa
  "onsite_conversion.lead_grouped": ["leads",  "cpl"],
  leadgen_grouped:                  ["leads",  "cpl"],
  omni_complete_registration:       [],                       // Cadastros não tem KPI específico duplicado
  purchase:                         [],                       // Purchase é o default — sem duplicata
};

// ─── Single-campaign analysis panel ──────────────────────────────────────────

function CampaignAnalysisPanel({
  adAccountId, campaign, dateFrom, dateTo, template, instagramUserId, forceTab, resultType, hideTabSwitcher,
}: {
  adAccountId: string;
  campaign: ActiveCampaign;
  dateFrom: string;
  dateTo: string;
  template: Template;
  instagramUserId?: string;
  forceTab?: "kpis" | "conjunto";
  resultType?: ResultType;
  /** When true, hides the internal Visão Geral / Análise de Conjunto tab bar
   *  (used when ProfileDetailView already manages top-level navigation) */
  hideTabSwitcher?: boolean;
}) {
  // kpiData: campaign-level daily rows → used for totals + funnel + template table
  // adsetData: adset-level totals → used for Análise de Conjunto
  const [kpiData, setKpiData]     = useState<AdsetRow[]>([]);
  const [adsetData, setAdsetData] = useState<AdsetRow[]>([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"kpis" | "conjunto" | "instagram">(forceTab ?? "kpis");

  // alias so the rest of the KPI-tab code stays unchanged
  const data = kpiData;
  const [funnelStepIds, setFunnelStepIds] = useState<ProfileFunnelStepId[]>(() => loadProfileFunnelConfig(campaign.id));
  const [showFunnelPanel, setShowFunnelPanel] = useState(false);
  const [funnelView, setFunnelView] = useState<"bars" | "funnel">("bars");

  // Goals / Metas
  const [goals, setGoals] = useState<Record<string, number>>(() => loadGoals(campaign.id));
  const [editGoals, setEditGoals] = useState(false);

  const updateGoal = (kpiId: string, value: number) => {
    setGoals((prev) => {
      const next = { ...prev };
      if (!value || value <= 0) delete next[kpiId];
      else next[kpiId] = value;
      saveGoals(campaign.id, next);
      return next;
    });
  };

  const persistFunnelSteps = (next: ProfileFunnelStepId[]) => {
    const safe = next.length > 0 ? next : DEFAULT_FUNNEL_STEP_IDS;
    setFunnelStepIds(safe);
    saveProfileFunnelConfig(campaign.id, safe);
  };

  const toggleFunnelStep = (id: ProfileFunnelStepId) => {
    persistFunnelSteps(
      funnelStepIds.includes(id)
        ? funnelStepIds.filter((s) => s !== id)
        : [...funnelStepIds, id],
    );
  };

  const moveFunnelStep = (id: ProfileFunnelStepId, dir: -1 | 1) => {
    const idx = funnelStepIds.indexOf(id);
    const next = idx + dir;
    if (idx < 0 || next < 0 || next >= funnelStepIds.length) return;
    const arr = [...funnelStepIds];
    [arr[idx], arr[next]] = [arr[next], arr[idx]];
    persistFunnelSteps(arr);
  };

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      // Parallel: campaign/daily for KPI totals + adset/all_days for Análise de Conjunto
      const [rawKpi, rawAdset] = await Promise.all([
        fetchMetaInsights(adAccountId, dateFrom, dateTo, {
          level: "campaign",
          timeIncrement: "1",
          campaignIds: [campaign.id],
        }),
        fetchMetaInsights(adAccountId, dateFrom, dateTo, {
          level: "adset",
          timeIncrement: "all_days",
          campaignIds: [campaign.id],
        }),
      ]);
      setKpiData(toAdsetRows(rawKpi, resultType ?? campaign.resultType));
      setAdsetData(toAdsetRows(rawAdset, resultType ?? campaign.resultType));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao buscar dados.");
    } finally {
      setLoading(false);
    }
  // resultType e campaign.resultType incluídos: toAdsetRows usa ambos para calcular
  // customResult / Resultado. Sem eles, trocar o tipo de resultado não re-busca os dados.
  }, [adAccountId, campaign.id, campaign.resultType, dateFrom, dateTo, resultType]);

  useEffect(() => { void load(); }, [load]);

  // ── Totals ────────────────────────────────────────────────────────────────────
  const totalSpend        = data.reduce((s, r) => s + r.spend,         0);
  const totalRevenue      = data.reduce((s, r) => s + r.revenue,       0);
  const totalPurchases    = data.reduce((s, r) => s + r.purchases,     0);
  const totalClicks       = data.reduce((s, r) => s + r.clicks,        0);
  const totalAllClicks    = data.reduce((s, r) => s + r.total_clicks,  0);
  const totalImpressions  = data.reduce((s, r) => s + r.impressions,   0);
  const totalLeads        = data.reduce((s, r) => s + r.leads,         0);
  const totalPageViews    = data.reduce((s, r) => s + r.page_views,    0);
  const totalNewFollowers = data.reduce((s, r) => s + r.new_followers, 0);
  const totalCustomResult = data.reduce((s, r) => s + r.customResult,  0);
  const txCaptura        = totalClicks    > 0 ? (totalLeads    / totalClicks)    * 100 : 0;
  const txConversao      = totalLeads     > 0 ? (totalPurchases / totalLeads)    * 100
                         : totalClicks   > 0 ? (totalPurchases / totalClicks)   * 100 : 0;
  const cpaMedia         = totalPurchases > 0 ? totalSpend / totalPurchases : 0;
  const roas             = totalSpend     > 0 ? totalRevenue / totalSpend        : 0;
  // Resultado variável — only meaningful when resultType is explicitly set
  const activeResultType = resultType ?? campaign.resultType;
  const resultCount      = activeResultType ? totalCustomResult : 0;
  const costPerResult    = resultCount > 0 ? totalSpend / resultCount : 0;

  if (loading && data.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={22} className="animate-spin text-slate-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
        <AlertCircle size={14} className="mt-0.5 shrink-0" /> {error}
        <button onClick={() => void load()} className="ml-auto underline">Tentar novamente</button>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div
        className="rounded-xl border p-8 text-center text-xs"
        style={{ backgroundColor: "var(--dm-bg-surface)", borderColor: "var(--dm-border-default)", color: "var(--dm-text-tertiary)" }}
      >
        Nenhum dado encontrado para este período.
      </div>
    );
  }

  // ── Template-driven values ─────────────────────────────────────────────────
  // Unificação de métricas: quando resultType está configurado, `sales` recebe
  // customResult (ex: cliques, leads, cadastros) para que os KPIs de template
  // "Resultados" (id=sales) e "Custo por resultado" (id=cpa = spend/sales)
  // reflitam o tipo de resultado correto em qualquer view — sem cards separados.
  const tpl = template;
  const rawValues: Record<string, number> = {
    impressions:    totalImpressions,
    reach:          data.reduce((s, r) => s + r.reach, 0),
    clicks:         totalClicks,
    total_clicks:   totalAllClicks,
    spend:          totalSpend,
    revenue:        totalRevenue,
    leads:          totalLeads,
    // Resultado principal: usa customResult quando resultType configurado e > 0
    sales:          activeResultType && totalCustomResult > 0 ? totalCustomResult : totalPurchases,
    tickets:        totalPurchases,
    page_views:     totalPageViews,
    profile_visits: 0,
    new_followers:  totalNewFollowers,
  };
  const derived   = tpl.derive(rawValues);
  const kpiValues = { ...rawValues, ...derived };

  const KPI_ACCENT: Record<string, string> = {
    brand: "text-brand",
    sky:   "text-sky-500",
    green: "text-emerald-500",
    rose:  "text-rose-500",
    amber: "text-amber-500",
    slate: "text-slate-500",
  };

  // Horizon-style color maps for KPI cards
  const KPI_SOLID: Record<string, string> = {
    brand: "#6366C8",
    sky:   "#0ea5e9",
    green: "#05CD99",
    rose:  "#EE5D50",
    amber: "#F4A60D",
    slate: "#64748b",
  };
  const KPI_BG: Record<string, string> = {
    brand: "rgba(99,102,200,0.12)",
    sky:   "rgba(14,165,233,0.12)",
    green: "rgba(5,205,153,0.12)",
    rose:  "rgba(238,93,80,0.12)",
    amber: "rgba(244,166,13,0.12)",
    slate: "rgba(100,116,139,0.10)",
  };

  // Funnel step colors — more saturated for professional look
  const FUNNEL_COLORS: Record<string, string> = {
    reach:       "#6366C8",
    impressions: "#8b5cf6",
    clicks:      "#0ea5e9",
    page_views:  "#f59e0b",
    leads:       "#e11d48",
    sales:       "#05CD99",
  };

  // ── Análise de Conjunto helpers (3.3) ────────────────────────────────────────
  const fmt = { brl: formatCurrency, int: formatNumber, pct: formatPercent };

  return (
    <div className="space-y-4">

      {/* ── Tab switcher — oculto quando ProfileDetailView gerencia a nav ─── */}
      {!hideTabSwitcher && (
        <div className="flex gap-1 rounded-[14px] p-1" style={{ backgroundColor: "var(--dm-bg-elevated)" }}>
          {([
            ["kpis",      "Visão Geral"],
            ["conjunto",  "Análise de Conjunto"],
            ...(instagramUserId ? [["instagram", "Perfil Ativo"]] : []),
          ] as [string, string][]).map(([id, label]) => (
            <button key={id} type="button" onClick={() => setActiveTab(id as "kpis" | "conjunto" | "instagram")}
              className="flex-1 rounded-[10px] py-2 text-[13px] font-semibold transition-all"
              style={activeTab === id
                ? { background: "linear-gradient(135deg,#6366C8 0%,#313491 100%)", color: "#fff", boxShadow: "0 4px 12px rgba(49,52,145,0.28)" }
                : { color: "var(--dm-text-tertiary)" }}>
              {label}
            </button>
          ))}
        </div>
      )}

      {/* ── Análise de Conjunto ─────────────────────────────────────────────── */}
      {activeTab === "conjunto" && (() => {
        const rows      = adsetData.length > 0 ? adsetData : kpiData;
        const totSpend  = rows.reduce((s, r) => s + r.spend,        0);
        const totClicks = rows.reduce((s, r) => s + r.clicks,       0);
        const totAll    = rows.reduce((s, r) => s + r.total_clicks, 0);
        const totImpr   = rows.reduce((s, r) => s + r.impressions,  0);
        const totPV     = rows.reduce((s, r) => s + r.page_views,   0);
        const maxSpend  = Math.max(...rows.map((r) => r.spend), 1);

        // CTR benchmark color: ≥10% green, ≥5% amber, <5% red
        const ctrColor = (v: number) =>
          v >= 10 ? "#05CD99" : v >= 5 ? "#F4A60D" : v > 0 ? "#EE5D50" : "var(--dm-text-tertiary)";

        return (
          <article className="overflow-hidden rounded-[20px] border shadow-horizon"
            style={{ backgroundColor: "var(--dm-bg-surface)", borderColor: "var(--dm-border-default)" }}>

            {/* Header */}
            <div className="flex items-center justify-between border-b px-5 py-4"
              style={{ borderColor: "var(--dm-border-subtle)" }}>
              <div>
                <h3 className="text-sm font-bold" style={{ color: "var(--dm-text-primary)", fontFamily: "var(--font-poppins),Poppins,sans-serif" }}>
                  Análise de Conjunto
                </h3>
                <p className="mt-0.5 text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>
                  Performance por conjunto de anúncios · {rows.length} conjuntos
                </p>
              </div>
              {loading && <Loader2 size={14} className="animate-spin" style={{ color: "var(--dm-text-tertiary)" }} />}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr style={{ backgroundColor: "var(--dm-bg-elevated)" }}>
                    {[
                      { label: "Conjunto de Anúncios", right: false, w: "min-w-[180px]" },
                      { label: "CPM",            right: true, w: "" },
                      { label: "Cliques Link",   right: true, w: "" },
                      { label: "CPC Link",       right: true, w: "" },
                      { label: "CTR Link",       right: true, w: "" },
                      { label: "Cliques Total",  right: true, w: "" },
                      { label: "CTR Total",      right: true, w: "" },
                      { label: "Vis. Página",    right: true, w: "" },
                      { label: "Investimento",   right: true, w: "min-w-[120px]" },
                    ].map((col) => (
                      <th key={col.label}
                        className={`${col.w} border-b px-4 py-3 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap ${col.right ? "text-right" : ""}`}
                        style={{ borderColor: "var(--dm-border-subtle)", color: "var(--dm-text-tertiary)" }}>
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, idx) => {
                    const cpcLink = r.clicks       > 0 ? r.spend / r.clicks      : 0;
                    const ctrLink = r.impressions  > 0 ? (r.clicks / r.impressions) * 100 : 0;
                    const ctrAll  = r.impressions  > 0 ? (r.total_clicks / r.impressions) * 100 : 0;
                    const spendPct = (r.spend / maxSpend) * 100;
                    return (
                      <tr key={r.name}
                        className="group transition-colors hover:bg-[var(--dm-bg-elevated)]"
                        style={{ borderBottom: "1px solid var(--dm-border-subtle)" }}>

                        {/* Name + spend bar */}
                        <td className="px-4 py-3" style={{ minWidth: "180px" }}>
                          <p className="truncate max-w-[200px] text-[12px] font-semibold"
                            style={{ color: "var(--dm-text-primary)" }} title={r.name}>
                            {r.name}
                          </p>
                          {/* Spend mini-bar */}
                          <div className="mt-1.5 h-1 overflow-hidden rounded-full w-full" style={{ backgroundColor: "var(--dm-bg-elevated)", maxWidth: "160px" }}>
                            <div className="h-full rounded-full"
                              style={{ width: `${spendPct}%`, background: "linear-gradient(90deg,#6366C8 0%,#313491 100%)" }} />
                          </div>
                        </td>

                        {/* CPM */}
                        <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-[12px]"
                          style={{ color: "var(--dm-text-secondary)" }}>
                          {r.cpm > 0 ? fmt.brl(r.cpm) : <span style={{ color: "var(--dm-text-tertiary)" }}>—</span>}
                        </td>

                        {/* Cliques link */}
                        <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-[12px]"
                          style={{ color: "var(--dm-text-secondary)" }}>
                          {r.clicks > 0 ? fmt.int(r.clicks) : <span style={{ color: "var(--dm-text-tertiary)" }}>—</span>}
                        </td>

                        {/* CPC link */}
                        <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-[12px]"
                          style={{ color: "var(--dm-text-secondary)" }}>
                          {cpcLink > 0 ? fmt.brl(cpcLink) : <span style={{ color: "var(--dm-text-tertiary)" }}>—</span>}
                        </td>

                        {/* CTR link — color-coded */}
                        <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-[12px]">
                          {ctrLink > 0
                            ? <span className="rounded-full px-2 py-0.5 text-[11px] font-bold"
                                style={{ backgroundColor: ctrColor(ctrLink) + "1a", color: ctrColor(ctrLink) }}>
                                {fmt.pct(ctrLink)}
                              </span>
                            : <span style={{ color: "var(--dm-text-tertiary)" }}>—</span>}
                        </td>

                        {/* Cliques todos */}
                        <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-[12px]"
                          style={{ color: "var(--dm-text-secondary)" }}>
                          {r.total_clicks > 0 ? fmt.int(r.total_clicks) : <span style={{ color: "var(--dm-text-tertiary)" }}>—</span>}
                        </td>

                        {/* CTR todos — color-coded */}
                        <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-[12px]">
                          {ctrAll > 0
                            ? <span className="rounded-full px-2 py-0.5 text-[11px] font-bold"
                                style={{ backgroundColor: ctrColor(ctrAll) + "1a", color: ctrColor(ctrAll) }}>
                                {fmt.pct(ctrAll)}
                              </span>
                            : <span style={{ color: "var(--dm-text-tertiary)" }}>—</span>}
                        </td>

                        {/* Vis. Página */}
                        <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-[12px]"
                          style={{ color: "var(--dm-text-secondary)" }}>
                          {r.page_views > 0 ? fmt.int(r.page_views) : <span style={{ color: "var(--dm-text-tertiary)" }}>—</span>}
                        </td>

                        {/* Investimento — bold + ranked highlight */}
                        <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                          <span className={`text-[13px] font-bold ${idx === 0 ? "" : ""}`}
                            style={{ color: idx === 0 ? "var(--dm-brand-500)" : "var(--dm-text-primary)" }}>
                            {fmt.brl(r.spend)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}

                  {/* Totals row */}
                  <tr style={{ background: "linear-gradient(135deg, rgba(49,52,145,0.06) 0%, rgba(99,102,200,0.04) 100%)", borderTop: "2px solid var(--dm-border-default)" }}>
                    <td className="px-4 py-3">
                      <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--dm-brand-500)" }}>
                        Total
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-[12px] font-semibold" style={{ color: "var(--dm-text-primary)" }}>
                      {totImpr > 0 ? fmt.brl((totSpend / totImpr) * 1000) : "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-[12px] font-semibold" style={{ color: "var(--dm-text-primary)" }}>
                      {fmt.int(totClicks)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-[12px] font-semibold" style={{ color: "var(--dm-text-primary)" }}>
                      {totClicks > 0 ? fmt.brl(totSpend / totClicks) : "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                      {totImpr > 0
                        ? <span className="rounded-full px-2 py-0.5 text-[11px] font-bold"
                            style={{ backgroundColor: ctrColor((totClicks / totImpr) * 100) + "1a", color: ctrColor((totClicks / totImpr) * 100) }}>
                            {fmt.pct((totClicks / totImpr) * 100)}
                          </span>
                        : <span style={{ color: "var(--dm-text-tertiary)" }}>—</span>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-[12px] font-semibold" style={{ color: "var(--dm-text-primary)" }}>
                      {fmt.int(totAll)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                      {totImpr > 0
                        ? <span className="rounded-full px-2 py-0.5 text-[11px] font-bold"
                            style={{ backgroundColor: ctrColor((totAll / totImpr) * 100) + "1a", color: ctrColor((totAll / totImpr) * 100) }}>
                            {fmt.pct((totAll / totImpr) * 100)}
                          </span>
                        : <span style={{ color: "var(--dm-text-tertiary)" }}>—</span>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-[12px] font-semibold" style={{ color: "var(--dm-text-primary)" }}>
                      {fmt.int(totPV)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                      <span className="text-[14px] font-bold" style={{ color: "var(--dm-brand-500)" }}>
                        {fmt.brl(totSpend)}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </article>
        );
      })()}

      {activeTab === "kpis" && <>

      {/* ── Label do tipo de resultado — exibido acima do grid quando configurado ── */}
      {activeResultType && resultCount > 0 && (
        <div className="flex items-center gap-2">
          <span className="rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider"
            style={{ background: "rgba(5,205,153,0.12)", color: "#05CD99", border: "1px solid rgba(5,205,153,0.25)" }}>
            Resultado: {RESULT_TYPE_LABELS[activeResultType]}
          </span>
        </div>
      )}

      {/* ── KPIs dirigidos pelo template — Resultado e CpR incluídos via rawValues ─── */}
      <div>
        {/* Section header with Goals toggle */}
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "var(--dm-text-tertiary)" }}>
            Métricas Principais
          </p>
          <button
            type="button"
            onClick={() => setEditGoals((v) => !v)}
            className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[11px] font-semibold transition"
            style={editGoals
              ? { background: "linear-gradient(135deg,#6366C8 0%,#313491 100%)", color: "#fff", boxShadow: "0 4px 12px rgba(49,52,145,0.30)" }
              : { backgroundColor: "var(--dm-bg-elevated)", color: "var(--dm-text-tertiary)", border: "1px solid var(--dm-border-default)" }}
          >
            <Target size={11} />
            {editGoals ? "Salvar Metas" : "Definir Metas"}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {tpl.kpis.filter((kpi) => {
            // Hide KPIs that are already shown in the Resultado/Custo-por-Resultado
            // highlight cards above — avoids duplicate numbers on screen.
            if (!activeResultType || resultCount === 0) return true;
            return !(RESULT_HIDDEN_KPIS[activeResultType] ?? []).includes(kpi.id);
          }).map((kpi) => {
            const val       = kpiValues[kpi.id] ?? 0;
            const display   = val > 0 ? kpi.format(val) : "—";
            const goalVal   = goals[kpi.id] ?? 0;
            const goalPct   = goalVal > 0
              ? kpi.invert
                ? (goalVal / Math.max(val, 0.001)) * 100
                : (val / goalVal) * 100
              : 0;
            const goalMet   = goalVal > 0 && (kpi.invert ? val <= goalVal : val >= goalVal);
            const goalColor = goalMet ? "#05CD99" : goalPct >= 75 ? "#F4A60D" : "#EE5D50";
            const solid     = KPI_SOLID[kpi.color] ?? "#6366C8";
            const bg        = KPI_BG[kpi.color]    ?? "rgba(99,102,200,0.10)";

            return (
              <article
                key={kpi.id}
                className="flex flex-col rounded-[20px] border shadow-horizon card-hover"
                style={{ backgroundColor: "var(--dm-bg-surface)", borderColor: "var(--dm-border-default)", padding: "18px" }}
              >
                {/* Icon circle + label row */}
                <div className="mb-4 flex items-center justify-between gap-2">
                  <div
                    className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full"
                    style={{ backgroundColor: bg }}
                  >
                    <Target size={18} style={{ color: solid }} />
                  </div>
                  {editGoals && (
                    <input
                      type="number"
                      step="any"
                      value={goals[kpi.id] ?? ""}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        updateGoal(kpi.id, isNaN(v) ? 0 : v);
                      }}
                      placeholder="Meta"
                      className="w-20 h-7 rounded-[10px] border px-2 text-[10px] text-right outline-none"
                      style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-elevated)", color: "var(--dm-text-primary)" }}
                    />
                  )}
                </div>

                {/* Label */}
                <p className="mb-1 text-[12px] font-semibold" style={{ color: "var(--dm-text-secondary)" }} title={kpi.tooltip}>
                  {kpi.label}
                </p>

                {/* Value */}
                <p
                  className="text-[22px] font-bold tabular-nums tracking-tight leading-tight"
                  style={{ color: "var(--dm-text-primary)", fontFamily: "var(--font-poppins), Poppins, sans-serif" }}
                >
                  {display}
                </p>

                {/* Goal progress bar */}
                {!editGoals && goalVal > 0 && (
                  <div className="mt-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>
                        Meta: {kpi.format(goalVal)}
                      </span>
                      <span className="text-[10px] font-bold" style={{ color: goalColor }}>
                        {Math.min(Math.round(goalPct), 999)}%
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: "var(--dm-bg-elevated)" }}>
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, goalPct)}%`, backgroundColor: goalColor }}
                      />
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </div>

      {/* ── Funil de Conversão (vertical, afunilado) ─────────────────────── */}
      <article
        className="overflow-hidden rounded-[20px] border shadow-horizon"
        style={{ backgroundColor: "var(--dm-bg-surface)", borderColor: "var(--dm-border-default)" }}
      >
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4" style={{ borderColor: "var(--dm-border-subtle)" }}>
          <div>
            <h3 className="text-sm font-bold" style={{ color: "var(--dm-text-primary)", fontFamily: "var(--font-poppins),Poppins,sans-serif" }}>
              Funil de Conversão
            </h3>
            <p className="mt-0.5 text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>
              Jornada do anúncio até a venda
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* View toggle — Barras | Funil */}
            <div className="flex rounded-[10px] p-0.5" style={{ backgroundColor: "var(--dm-bg-elevated)" }}>
              {(["bars", "funnel"] as const).map((v) => (
                <button key={v} type="button" onClick={() => setFunnelView(v)}
                  className="flex items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-[11px] font-semibold transition-all"
                  style={funnelView === v
                    ? { background: "linear-gradient(135deg,#6366C8 0%,#313491 100%)", color: "#fff", boxShadow: "0 2px 8px rgba(49,52,145,0.28)" }
                    : { color: "var(--dm-text-tertiary)" }}>
                  {v === "bars" ? "Barras" : "Funil"}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setShowFunnelPanel((v) => !v)}
              className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[11px] font-semibold transition"
              style={showFunnelPanel
                ? { background: "linear-gradient(135deg,#6366C8 0%,#313491 100%)", color: "#fff", boxShadow: "0 4px 12px rgba(49,52,145,0.30)" }
                : { backgroundColor: "var(--dm-bg-elevated)", color: "var(--dm-text-secondary)", border: "1px solid var(--dm-border-default)" }}
            >
              <SlidersHorizontal size={11} />
              {showFunnelPanel ? "Fechar" : "Personalizar"}
            </button>
          </div>
        </div>

        {/* Customization panel */}
        {showFunnelPanel && (
          <div className="border-b px-5 py-4 space-y-3" style={{ borderColor: "var(--dm-border-subtle)", backgroundColor: "var(--dm-bg-elevated)" }}>
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--dm-text-tertiary)" }}>
              Etapas visíveis — clique para ativar/desativar, arraste para reordenar
            </p>
            <div className="flex flex-wrap gap-2">
              {PROFILE_FUNNEL_STEPS.map((step) => {
                const selected = funnelStepIds.includes(step.id);
                const index    = funnelStepIds.indexOf(step.id);
                return (
                  <div
                    key={step.id}
                    className="flex items-center gap-1.5 rounded-[12px] cursor-pointer select-none transition"
                    style={{
                      padding: "6px 12px",
                      backgroundColor: selected ? step.color + "20" : "var(--dm-bg-surface)",
                      border: `1.5px solid ${selected ? step.color + "66" : "var(--dm-border-default)"}`,
                      color: selected ? step.color : "var(--dm-text-tertiary)",
                    }}
                    onClick={() => !(selected && funnelStepIds.length === 1) && toggleFunnelStep(step.id)}
                  >
                    <span className="text-[11px] font-semibold">{step.label}</span>
                    {selected && (
                      <div className="flex gap-0.5 ml-0.5">
                        <button type="button"
                          onClick={(e) => { e.stopPropagation(); moveFunnelStep(step.id, -1); }}
                          disabled={index === 0}
                          className="rounded p-0.5 transition disabled:opacity-20 hover:opacity-80">
                          <ArrowUp size={9} />
                        </button>
                        <button type="button"
                          onClick={(e) => { e.stopPropagation(); moveFunnelStep(step.id, 1); }}
                          disabled={index === funnelStepIds.length - 1}
                          className="rounded p-0.5 transition disabled:opacity-20 hover:opacity-80">
                          <ArrowDown size={9} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => persistFunnelSteps(DEFAULT_FUNNEL_STEP_IDS)}
              className="text-[10px] font-semibold transition hover:opacity-70"
              style={{ color: "var(--dm-brand-500)" }}
            >
              Restaurar padrão
            </button>
          </div>
        )}

        {/* ── VIEW: BARRAS ── */}
        {funnelView === "bars" && (() => {
          const maxVal = Math.max(...funnelStepIds.map((id) => kpiValues[id] ?? 0), 1);
          return (
            <div className="flex flex-col gap-0 px-5 py-5">
              {funnelStepIds.map((stepId, i) => {
                const step    = PROFILE_FUNNEL_STEPS.find((s) => s.id === stepId);
                if (!step) return null;
                const val     = kpiValues[stepId] ?? 0;
                const prevId  = i > 0 ? funnelStepIds[i - 1] : null;
                const prevVal = prevId ? (kpiValues[prevId] ?? 0) : null;
                const rate    = prevVal !== null && prevVal > 0 ? (val / prevVal) * 100 : null;
                const color   = FUNNEL_COLORS[stepId] ?? step.color;
                const pct     = maxVal > 0 ? (val / maxVal) * 100 : 0;
                return (
                  <div key={stepId} className="flex flex-col">
                    {i > 0 && (
                      <div className="flex items-center gap-3 py-2 pl-[52px]">
                        <div className="w-px self-stretch" style={{ backgroundColor: "var(--dm-border-default)", minHeight: "12px" }} />
                        {rate !== null && (
                          <span className="rounded-full px-3 py-0.5 text-[10px] font-bold"
                            style={{ backgroundColor: color + "18", color }}>
                            {formatPercent(rate)}{step.rateLabel ? ` ${step.rateLabel}` : ""}
                          </span>
                        )}
                      </div>
                    )}
                    <div className="flex items-center gap-4">
                      <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                        style={{ background: `linear-gradient(135deg,${color} 0%,${color}bb 100%)`, boxShadow: `0 4px 12px ${color}44` }}>
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between mb-2">
                          <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color }}>{step.label}</p>
                          <p className="text-[20px] font-bold tabular-nums leading-none"
                            style={{ color: "var(--dm-text-primary)", fontFamily: "var(--font-poppins),Poppins,sans-serif" }}>
                            {val > 0 ? formatNumber(val) : <span style={{ color: "var(--dm-text-tertiary)", fontSize: "14px" }}>Sem dados</span>}
                          </p>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full" style={{ backgroundColor: color + "18" }}>
                          <div className="h-full rounded-full transition-all duration-700"
                            style={{ width: `${pct}%`, background: `linear-gradient(90deg,${color} 0%,${color}99 100%)` }} />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}

        {/* ── VIEW: FUNIL AFUNILADO ── */}
        {funnelView === "funnel" && (() => {
          const total = funnelStepIds.length;
          return (
            <div className="flex flex-col items-center px-6 py-6 gap-0">
              {funnelStepIds.map((stepId, i) => {
                const step    = PROFILE_FUNNEL_STEPS.find((s) => s.id === stepId);
                if (!step) return null;
                const val     = kpiValues[stepId] ?? 0;
                const prevId  = i > 0 ? funnelStepIds[i - 1] : null;
                const prevVal = prevId ? (kpiValues[prevId] ?? 0) : null;
                const rate    = prevVal !== null && prevVal > 0 ? (val / prevVal) * 100 : null;
                const color   = FUNNEL_COLORS[stepId] ?? step.color;
                // Taper from 100% → 50%
                const widthPct = total > 1 ? 100 - (i / (total - 1)) * 50 : 88;
                return (
                  <div key={stepId} className="w-full flex flex-col items-center">
                    {/* Connector + rate */}
                    {i > 0 && (
                      <div className="flex flex-col items-center py-2 gap-1">
                        <div className="w-px h-4" style={{ backgroundColor: "var(--dm-border-default)" }} />
                        {rate !== null && (
                          <span className="rounded-full px-3 py-0.5 text-[10px] font-bold"
                            style={{ backgroundColor: color + "1a", color }}>
                            {formatPercent(rate)}{step.rateLabel ? ` ${step.rateLabel}` : ""}
                          </span>
                        )}
                        <div className="w-px h-4" style={{ backgroundColor: "var(--dm-border-default)" }} />
                      </div>
                    )}
                    {/* Step block */}
                    <div
                      className="flex items-center justify-between transition-all"
                      style={{
                        width: `${widthPct}%`,
                        borderRadius: "14px",
                        padding: "14px 20px",
                        background: `linear-gradient(135deg, ${color}22 0%, ${color}0d 100%)`,
                        border: `1.5px solid ${color}55`,
                      }}
                    >
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider mb-0.5" style={{ color }}>{step.label}</p>
                        {rate !== null && step.rateLabel && (
                          <p className="text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>{step.rateLabel}</p>
                        )}
                      </div>
                      <p className="text-[22px] font-bold tabular-nums"
                        style={{ color: "var(--dm-text-primary)", fontFamily: "var(--font-poppins),Poppins,sans-serif" }}>
                        {val > 0 ? formatNumber(val) : <span style={{ color: "var(--dm-text-tertiary)", fontSize: "13px" }}>—</span>}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </article>

      {/* ── Tabela do template ───────────────────────────────────────────────── */}
      {tpl.table && (
        <article
          className="overflow-hidden rounded-[20px] border shadow-horizon"
          style={{ backgroundColor: "var(--dm-bg-surface)", borderColor: "var(--dm-border-default)" }}
        >
          <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: "var(--dm-border-subtle)" }}>
            <h3 className="text-sm font-bold" style={{ color: "var(--dm-text-primary)", fontFamily: "var(--font-poppins),Poppins,sans-serif" }}>
              {tpl.table.title}
            </h3>
            {loading && <Loader2 size={13} className="animate-spin" style={{ color: "var(--dm-text-tertiary)" }} />}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ backgroundColor: "var(--dm-bg-elevated)" }}>
                  {tpl.table.columns.map((col) => (
                    <th key={col.id}
                      className={`border-b px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider ${col.align === "right" ? "text-right" : "text-left"}`}
                      style={{ borderColor: "var(--dm-border-subtle)", color: "var(--dm-text-tertiary)" }}>
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: "var(--dm-border-subtle)" }}>
                {data.map((r) => {
                  const rowAll: Record<string, number> = {
                    ...rawValues,
                    ...derived,
                    impressions: r.impressions, reach: r.reach, clicks: r.clicks,
                    total_clicks: r.total_clicks, spend: r.spend, revenue: r.revenue,
                    leads: r.leads, sales: r.purchases, tickets: r.purchases,
                    page_views: r.page_views, new_followers: r.new_followers,
                    ...(tpl.derive({ impressions: r.impressions, reach: r.reach, clicks: r.clicks,
                      total_clicks: r.total_clicks, spend: r.spend, revenue: r.revenue, leads: r.leads,
                      sales: r.purchases, tickets: r.purchases, page_views: r.page_views,
                      new_followers: r.new_followers, profile_visits: 0 })),
                  };
                  return (
                    <tr key={r.name} className="transition-colors hover:bg-[var(--dm-bg-elevated)]">
                      {tpl.table.columns.map((col) => {
                        if (col.id === "campaign") return (
                          <td key={col.id} className="max-w-[180px] truncate px-4 py-2.5 text-xs font-semibold" style={{ color: "var(--dm-text-primary)" }} title={r.name}>{r.name}</td>
                        );
                        if (col.id === "adset" || col.id === "name") return (
                          <td key={col.id} className="max-w-[160px] truncate px-4 py-2.5 text-xs" style={{ color: "var(--dm-text-tertiary)" }} title={r.name}>{r.name}</td>
                        );
                        const v = rowAll[col.id] ?? 0;
                        const formatted = col.format ? (v > 0 ? col.format(v) : "—") : String(v);
                        return (
                          <td key={col.id}
                            className={`whitespace-nowrap px-4 py-2.5 text-xs tabular-nums ${col.align === "right" ? "text-right" : ""}`}
                            style={{ color: "var(--dm-text-secondary)" }}>
                            {formatted}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
                {/* Totals row */}
                <tr style={{ backgroundColor: "var(--dm-bg-elevated)" }}>
                  <td className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>Total</td>
                  {tpl.table.columns.slice(1).map((col) => {
                    const v = kpiValues[col.id] ?? 0;
                    const formatted = col.format ? (v > 0 ? col.format(v) : "—") : "—";
                    return (
                      <td key={col.id}
                        className={`whitespace-nowrap px-4 py-2.5 text-xs font-semibold tabular-nums ${col.align === "right" ? "text-right" : ""}`}
                        style={{ color: "var(--dm-text-primary)" }}>
                        {formatted}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </article>
      )}

      {/* ── Gráfico investimento por conjunto ───────────────────────────────── */}
      {data.length > 1 && (
        <article
          className="rounded-[20px] border shadow-horizon"
          style={{ backgroundColor: "var(--dm-bg-surface)", borderColor: "var(--dm-border-default)", padding: "20px" }}
        >
          <h3 className="mb-4 text-sm font-bold" style={{ color: "var(--dm-text-primary)", fontFamily: "var(--font-poppins),Poppins,sans-serif" }}>
            Investimento por Conjunto de Anúncios
          </h3>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.slice(0, 10)} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 120 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--dm-border-subtle)" horizontal={false} />
                <XAxis type="number" stroke="var(--dm-border-default)" tick={{ fontSize: 10, fill: "var(--dm-text-tertiary)" }}
                  tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="name" stroke="var(--dm-border-default)" tick={{ fontSize: 10, fill: "var(--dm-text-tertiary)" }} width={115}
                  tickFormatter={(v: string) => v.length > 18 ? v.slice(0, 18) + "…" : v} />
                <Tooltip
                  contentStyle={{ borderRadius: 8, border: "1px solid var(--dm-border-default)", background: "var(--dm-bg-elevated)", color: "var(--dm-text-primary)", fontSize: 12 }}
                  formatter={(v) => [formatCurrency(Number(v)), "Investimento"]}
                />
                <Bar dataKey="spend" name="Investimento" fill="var(--dm-brand-500)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>
      )}

      </> /* end activeTab === "kpis" */}

      {/* ── Perfil Ativo ─────────────────────────────────────────────────────── */}
      {activeTab === "instagram" && instagramUserId && (
        <PerfilAtivoPanel
          igUserId={instagramUserId}
          dateFrom={dateFrom}
          dateTo={dateTo}
        />
      )}

    </div>
  );
}

// ─── Profile Date Range Picker ────────────────────────────────────────────────

const DATE_PRESETS = [
  { label: "7d",   days: 6  },
  { label: "14d",  days: 13 },
  { label: "30d",  days: 29 },
  { label: "Mês",  days: -1 }, // first of month
];

function ProfileDateRange({
  dateFrom, dateTo, onApply,
}: { dateFrom: string; dateTo: string; onApply: (from: string, to: string) => void }) {
  const [open, setOpen]       = useState(false);
  const [from, setFrom]       = useState(dateFrom);
  const [to,   setTo]         = useState(dateTo);
  const ref = useRef<HTMLDivElement>(null);

  // Sync internal state when parent props change
  useEffect(() => { setFrom(dateFrom); setTo(dateTo); }, [dateFrom, dateTo]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const applyPreset = (days: number) => {
    const today = todayStr();
    let start: string;
    if (days === -1) {
      const d = new Date();
      start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
    } else {
      start = daysAgoStr(days);
    }
    onApply(start, today);
    setOpen(false);
  };

  const handleApply = () => {
    if (!from || !to || from > to) return;
    onApply(from, to);
    setOpen(false);
  };

  const isoToBR = (iso: string) => {
    if (!iso) return "";
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition hover:bg-[var(--dm-bg-elevated)]"
        style={{ borderColor: "var(--dm-border-default)", backgroundColor: open ? "var(--dm-bg-elevated)" : "var(--dm-bg-elevated)", color: "var(--dm-text-primary)" }}
      >
        <CalendarDays size={13} style={{ color: "var(--dm-text-tertiary)" }} />
        <span>{isoToBR(dateFrom)}</span>
        <span style={{ color: "var(--dm-text-tertiary)" }}>→</span>
        <span>{isoToBR(dateTo)}</span>
      </button>

      {open && (
        <div
          className="absolute right-0 top-full z-30 mt-1.5 w-72 rounded-xl border p-4 shadow-xl"
          style={{ backgroundColor: "var(--dm-bg-surface)", borderColor: "var(--dm-border-default)" }}
        >
          {/* Presets */}
          <div className="mb-3 flex flex-wrap gap-1.5">
            {DATE_PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => applyPreset(p.days)}
                className="rounded-md border px-2.5 py-1 text-[10px] font-semibold transition"
                style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-elevated)", color: "var(--dm-text-secondary)" }}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Manual date inputs */}
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-medium" style={{ color: "var(--dm-text-tertiary)" }}>De</span>
              <input
                type="date" value={from} max={to || undefined}
                onChange={(e) => setFrom(e.target.value)}
                className="h-8 rounded-lg border px-2 text-xs outline-none focus:ring-1 focus:ring-blue-500"
                style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-elevated)", color: "var(--dm-text-primary)" }}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-medium" style={{ color: "var(--dm-text-tertiary)" }}>Até</span>
              <input
                type="date" value={to} min={from || undefined} max={todayStr()}
                onChange={(e) => setTo(e.target.value)}
                className="h-8 rounded-lg border px-2 text-xs outline-none focus:ring-1 focus:ring-blue-500"
                style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-elevated)", color: "var(--dm-text-primary)" }}
              />
            </label>
          </div>

          {from > to && (
            <p className="mt-2 text-[10px] font-semibold text-red-500">Data inicial maior que a data final</p>
          )}

          <button
            type="button"
            onClick={handleApply}
            disabled={!from || !to || from > to}
            className="mt-3 w-full rounded-lg py-2 text-xs font-bold text-white transition disabled:opacity-40"
            style={{ backgroundColor: "var(--dm-brand-500)" }}
          >
            Aplicar período
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Instagram Insights Panel ─────────────────────────────────────────────────

const IG_GRADIENT = "linear-gradient(135deg,#f09433 0%,#e6683c 25%,#dc2743 50%,#cc2366 75%,#bc1888 100%)";

const IG_MOCK_DATA: InstagramProfileInsights = {
  followersCount: 12847,
  mediaCount: 234,
  engagementRate: 4.32,
  avgLikes: 312,
  avgComments: 18,
  followersGrowthToday: 47,
  followersGrowthWeek: 318,
  followersGrowthMonth: 1204,
  followerGrowth: 1204,
  impressionsTotal: 98400,
  reachTotal: 54200,
  profileViewsTotal: 3810,
  followersSeriesData: Array.from({ length: 30 }, (_, i) => ({
    x: Date.now() - (29 - i) * 86400000,
    y: 11600 + Math.round(Math.random() * 100 + i * 42),
  })),
  score: { value: 78, label: "Bom" },
};

export function InstagramInsightsPanel({
  igUserId, dateFrom, dateTo,
}: { igUserId: string; dateFrom: string; dateTo: string }) {
  const [data, setData]       = useState<InstagramProfileInsights | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [isMock, setIsMock]   = useState(false);

  useEffect(() => {
    const accessToken = (() => {
      try { return localStorage.getItem("pta_ig_app_token_v1") ?? ""; } catch { return ""; }
    })();
    if (!accessToken || !igUserId) {
      setData(IG_MOCK_DATA);
      setIsMock(true);
      return;
    }
    setIsMock(false);
    setLoading(true); setError(null);
    fetchInstagramInsights(igUserId, accessToken, dateFrom, dateTo)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Erro ao buscar dados Instagram."))
      .finally(() => setLoading(false));
  }, [igUserId, dateFrom, dateTo]);

  const scoreColor = !data ? "#94a3b8" :
    data.score.value >= 85 ? "#05CD99" :
    data.score.value >= 60 ? "#4CAF50" :
    data.score.value >= 30 ? "#F4A60D" : "#EE5D50";

  return (
    <div className="rounded-[20px] border shadow-horizon overflow-hidden"
      style={{ backgroundColor: "var(--dm-bg-surface)", borderColor: "var(--dm-border-default)" }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2.5 border-b px-5 py-3.5"
        style={{ borderColor: "var(--dm-border-subtle)" }}>
        <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg"
          style={{ background: IG_GRADIENT }}>
          <AtSign size={12} className="text-white" />
        </div>
        <span className="text-[11px] font-semibold uppercase tracking-wider"
          style={{ color: "var(--dm-text-tertiary)" }}>Instagram Analytics</span>
        {isMock && (
          <span className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
            style={{ background: "rgba(245,158,11,0.15)", color: "#F59E0B", border: "1px solid rgba(245,158,11,0.3)" }}>
            demo
          </span>
        )}

        {/* Score badge */}
        {data && !error && (
          <div className="ml-auto flex items-center gap-1.5 rounded-full px-3 py-1"
            style={{ backgroundColor: scoreColor + "18", border: `1px solid ${scoreColor}40` }}>
            <Star size={10} style={{ color: scoreColor }} fill={scoreColor} />
            <span className="text-[11px] font-bold tabular-nums" style={{ color: scoreColor }}>
              {data.score.value} — {data.score.label}
            </span>
          </div>
        )}

        {loading && <Loader2 size={12} className={`${data ? "" : "ml-auto"} animate-spin`} style={{ color: "var(--dm-text-tertiary)" }} />}
      </div>

      {/* ── Error ──────────────────────────────────────────────────────────── */}
      {error && (
        <div className="flex items-start gap-2.5 px-5 py-4">
          <AlertCircle size={14} className="mt-0.5 flex-shrink-0" style={{ color: "var(--dm-text-tertiary)" }} />
          <div>
            <p className="text-xs font-medium" style={{ color: "var(--dm-text-secondary)" }}>
              Sem permissão para esta conta
            </p>
            <p className="mt-0.5 text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>
              Use apenas contas vinculadas a uma Página do Facebook acessível pelo token Meta.
            </p>
          </div>
        </div>
      )}

      {/* ── Loading skeleton ────────────────────────────────────────────────── */}
      {loading && !data && !error && (
        <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-4">
          {[0,1,2,3,4,5,6,7].map(i => (
            <div key={i} className="rounded-xl p-3" style={{ backgroundColor: "var(--dm-bg-elevated)" }}>
              <div className="mb-2 h-2 w-14 animate-pulse rounded" style={{ backgroundColor: "var(--dm-border-default)" }} />
              <div className="h-5 w-20 animate-pulse rounded" style={{ backgroundColor: "var(--dm-border-default)" }} />
            </div>
          ))}
        </div>
      )}

      {/* ── Data ───────────────────────────────────────────────────────────── */}
      {data && !error && (
        <div className="p-5 space-y-5">

          {/* Row 1 — Seguidores + Crescimento */}
          <div>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest"
              style={{ color: "var(--dm-text-tertiary)" }}>Audiência</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {/* Seguidores */}
              <div className="rounded-xl p-3" style={{ backgroundColor: "var(--dm-bg-elevated)", border: "1px solid var(--dm-border-subtle)" }}>
                <div className="flex items-center gap-1.5 mb-1">
                  <Users size={11} style={{ color: "var(--dm-brand-500)" }} />
                  <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>Seguidores</p>
                </div>
                <p className="text-xl font-bold tabular-nums" style={{ color: "var(--dm-text-primary)" }}>
                  {formatCompact(data.followersCount)}
                </p>
                <p className="text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>
                  {data.mediaCount} publicações
                </p>
              </div>

              {/* Hoje */}
              {(() => {
                const v = data.followersGrowthToday;
                const pos = v >= 0;
                return (
                  <div className="rounded-xl p-3" style={{ backgroundColor: "var(--dm-bg-elevated)", border: "1px solid var(--dm-border-subtle)" }}>
                    <div className="flex items-center gap-1.5 mb-1">
                      {pos ? <TrendingUp size={11} style={{ color: "var(--dm-value-positive)" }} /> : <TrendingDown size={11} style={{ color: "var(--dm-value-negative)" }} />}
                      <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>Hoje</p>
                    </div>
                    <p className="text-xl font-bold tabular-nums" style={{ color: pos ? "var(--dm-value-positive)" : "var(--dm-value-negative)" }}>
                      {pos ? "+" : ""}{formatCompact(v)}
                    </p>
                  </div>
                );
              })()}

              {/* Semana */}
              {(() => {
                const v = data.followersGrowthWeek;
                const pos = v >= 0;
                return (
                  <div className="rounded-xl p-3" style={{ backgroundColor: "var(--dm-bg-elevated)", border: "1px solid var(--dm-border-subtle)" }}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <CalendarDays size={11} style={{ color: "var(--dm-text-tertiary)" }} />
                      <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>7 dias</p>
                    </div>
                    <p className="text-xl font-bold tabular-nums" style={{ color: pos ? "var(--dm-value-positive)" : "var(--dm-value-negative)" }}>
                      {pos ? "+" : ""}{formatCompact(v)}
                    </p>
                  </div>
                );
              })()}

              {/* Mês */}
              {(() => {
                const v = data.followersGrowthMonth;
                const pos = v >= 0;
                return (
                  <div className="rounded-xl p-3" style={{ backgroundColor: "var(--dm-bg-elevated)", border: "1px solid var(--dm-border-subtle)" }}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <CalendarDays size={11} style={{ color: "var(--dm-text-tertiary)" }} />
                      <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>Período</p>
                    </div>
                    <p className="text-xl font-bold tabular-nums" style={{ color: pos ? "var(--dm-value-positive)" : "var(--dm-value-negative)" }}>
                      {pos ? "+" : ""}{formatCompact(v)}
                    </p>
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Row 2 — Engajamento */}
          <div>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest"
              style={{ color: "var(--dm-text-tertiary)" }}>Engajamento</p>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl p-3" style={{ backgroundColor: "var(--dm-bg-elevated)", border: "1px solid var(--dm-border-subtle)" }}>
                <div className="flex items-center gap-1.5 mb-1">
                  <Activity size={11} style={{ color: "#E1306C" }} />
                  <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>Taxa de Engaj.</p>
                </div>
                <p className="text-xl font-bold tabular-nums" style={{ color: "var(--dm-text-primary)" }}>
                  {data.engagementRate.toFixed(2)}%
                </p>
              </div>
              <div className="rounded-xl p-3" style={{ backgroundColor: "var(--dm-bg-elevated)", border: "1px solid var(--dm-border-subtle)" }}>
                <div className="flex items-center gap-1.5 mb-1">
                  <Heart size={11} style={{ color: "#E1306C" }} />
                  <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>Média Curtidas</p>
                </div>
                <p className="text-xl font-bold tabular-nums" style={{ color: "var(--dm-text-primary)" }}>
                  {formatCompact(data.avgLikes)}
                </p>
              </div>
              <div className="rounded-xl p-3" style={{ backgroundColor: "var(--dm-bg-elevated)", border: "1px solid var(--dm-border-subtle)" }}>
                <div className="flex items-center gap-1.5 mb-1">
                  <MessageCircle size={11} style={{ color: "var(--dm-text-secondary)" }} />
                  <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>Média Comentários</p>
                </div>
                <p className="text-xl font-bold tabular-nums" style={{ color: "var(--dm-text-primary)" }}>
                  {formatCompact(data.avgComments)}
                </p>
              </div>
            </div>
          </div>

          {/* Row 3 — Alcance / Impressões / Perfil */}
          <div>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest"
              style={{ color: "var(--dm-text-tertiary)" }}>Visibilidade no período</p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "Alcance",         value: formatCompact(data.reachTotal),        icon: Zap,    color: "var(--dm-brand-500)" },
                { label: "Impressões",      value: formatCompact(data.impressionsTotal),  icon: Target, color: "var(--dm-text-secondary)" },
                { label: "Visitas Perfil",  value: formatCompact(data.profileViewsTotal), icon: Users,  color: "var(--dm-text-secondary)" },
              ].map(({ label, value, icon: Icon, color }) => (
                <div key={label} className="rounded-xl p-3" style={{ backgroundColor: "var(--dm-bg-elevated)", border: "1px solid var(--dm-border-subtle)" }}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <Icon size={11} style={{ color }} />
                    <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>{label}</p>
                  </div>
                  <p className="text-xl font-bold tabular-nums" style={{ color: "var(--dm-text-primary)" }}>{value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Chart — followers over time */}
          {data.followersSeriesData.length > 1 && (
            <div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-widest"
                style={{ color: "var(--dm-text-tertiary)" }}>Crescimento de seguidores</p>
              <div className="rounded-xl p-3" style={{ backgroundColor: "var(--dm-bg-elevated)", border: "1px solid var(--dm-border-subtle)" }}>
                <ResponsiveContainer width="100%" height={120}>
                  <AreaChart data={data.followersSeriesData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="igFollowersGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#E1306C" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#E1306C" stopOpacity={0}   />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="x" hide />
                    <YAxis hide domain={["auto", "auto"]} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "var(--dm-bg-surface)", border: "1px solid var(--dm-border-default)", borderRadius: 8, fontSize: 11 }}
                      labelFormatter={(v) => new Date(v as number).toLocaleDateString("pt-BR")}
                      formatter={(v) => [(Number(v)).toLocaleString("pt-BR"), "Seguidores"]}
                    />
                    <Area
                      type="monotone"
                      dataKey="y"
                      stroke="#E1306C"
                      strokeWidth={2}
                      fill="url(#igFollowersGrad)"
                      dot={false}
                      activeDot={{ r: 4, fill: "#E1306C" }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Profile Detail View ──────────────────────────────────────────────────────

function ProfileDetailView({
  profile, groupLabel, onBack, appliedDateRange,
  onAddCampaign, onRemoveCampaign, onUpdateProfile,
}: {
  profile: AdvertiserProfile;
  groupLabel: string;
  onBack: () => void;
  appliedDateRange?: { from: string; to: string };
  onAddCampaign:    (profileId: string, campaign: ActiveCampaign) => void;
  onRemoveCampaign: (profileId: string, campaignId: string) => void;
  onUpdateProfile:  (id: string, data: Partial<Omit<AdvertiserProfile, "id" | "createdAt">>) => void;
}) {
  // Ações vêm da instância de store do ProfileAnalysis — assim qualquer mutação
  // atualiza o profiles[] de ProfileAnalysis e o profile prop flui de volta
  // corretamente, evitando o stale-prop que impedia o auto-refresh das campanhas.
  const addCampaignToProfile    = onAddCampaign;
  const removeCampaignFromProfile = onRemoveCampaign;
  const updateProfile           = onUpdateProfile;
  const [activeCampId, setActiveCampId] = useState<string>(profile.campaigns[0]?.id ?? "");
  const [profileTab, setProfileTab] = useState<"overview" | "campanha" | "conjunto" | "instagram">("overview");

  // Persist date range per profile. Priority: profile-specific → appliedDateRange prop → shared Dashboard range → 14-day default.
  const [dateFrom, setDateFrom] = useState<string>(() => {
    if (typeof window === "undefined") return daysAgoStr(14);
    try {
      const stored = JSON.parse(localStorage.getItem(DATES_LS_KEY) ?? "{}") as Record<string, { from: string; to: string }>;
      if (stored[profile.id]?.from) return stored[profile.id].from;
      return appliedDateRange?.from || readSharedDateRange().from || daysAgoStr(14);
    } catch { return daysAgoStr(14); }
  });
  const [dateTo, setDateTo] = useState<string>(() => {
    if (typeof window === "undefined") return todayStr();
    try {
      const stored = JSON.parse(localStorage.getItem(DATES_LS_KEY) ?? "{}") as Record<string, { from: string; to: string }>;
      if (stored[profile.id]?.to) return stored[profile.id].to;
      return appliedDateRange?.to || readSharedDateRange().to || todayStr();
    } catch { return todayStr(); }
  });

  const persistDates = (from: string, to: string) => {
    try {
      const stored = JSON.parse(localStorage.getItem(DATES_LS_KEY) ?? "{}") as Record<string, { from: string; to: string }>;
      localStorage.setItem(DATES_LS_KEY, JSON.stringify({ ...stored, [profile.id]: { from, to } }));
    } catch {}
  };
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const hasToken = Boolean(loadMetaCredentials().accessToken);

  // Template state — persisted per profile in localStorage
  const [templateId, setTemplateId] = useState<TemplateId>(() => {
    if (typeof window === "undefined") return "pos";
    try {
      const stored = JSON.parse(localStorage.getItem(TEMPLATE_LS_KEY) ?? "{}") as Record<string, TemplateId>;
      return stored[profile.id] ?? "pos";
    } catch { return "pos"; }
  });
  const [showTemplateModal, setShowTemplateModal] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      const stored = JSON.parse(localStorage.getItem(TEMPLATE_LS_KEY) ?? "{}") as Record<string, TemplateId>;
      return !stored[profile.id]; // show modal on first visit
    } catch { return true; }
  });
  const [showBuilder, setShowBuilder] = useState(false);

  const PERSONALIZADO_LS_KEY = "pta_personalizado_v1";
  const [personalizadoConfig, setPersonalizadoConfig] = useState<PersonalizadoConfig>(() => {
    if (typeof window === "undefined") return DEFAULT_PERSONALIZADO_CONFIG;
    try {
      const stored = JSON.parse(localStorage.getItem(PERSONALIZADO_LS_KEY) ?? "{}") as Record<string, PersonalizadoConfig>;
      return stored[profile.id] ?? DEFAULT_PERSONALIZADO_CONFIG;
    } catch { return DEFAULT_PERSONALIZADO_CONFIG; }
  });

  const handlePersonalizadoChange = (cfg: PersonalizadoConfig) => {
    // Switch to personalizado template so resolvedTemplate rebuilds from new config
    setTemplateId("personalizado");
    setPersonalizadoConfig(cfg);
    try {
      const stored = JSON.parse(localStorage.getItem(PERSONALIZADO_LS_KEY) ?? "{}") as Record<string, PersonalizadoConfig>;
      localStorage.setItem(PERSONALIZADO_LS_KEY, JSON.stringify({ ...stored, [profile.id]: cfg }));
      const tStored = JSON.parse(localStorage.getItem(TEMPLATE_LS_KEY) ?? "{}") as Record<string, string>;
      localStorage.setItem(TEMPLATE_LS_KEY, JSON.stringify({ ...tStored, [profile.id]: "personalizado" }));
    } catch {}
  };

  const handleTemplateChange = (id: TemplateId) => {
    setTemplateId(id);
    setShowTemplateModal(false);
    if (id === "personalizado") setShowBuilder(true);
    try {
      const stored = JSON.parse(localStorage.getItem(TEMPLATE_LS_KEY) ?? "{}") as Record<string, TemplateId>;
      localStorage.setItem(TEMPLATE_LS_KEY, JSON.stringify({ ...stored, [profile.id]: id }));
    } catch {}
  };

  // Resolved template — personalizado is built from config, others are static
  const resolvedTemplate = getTemplate(templateId, personalizadoConfig);

  // Keep activeCampId in sync when campaigns list changes
  useEffect(() => {
    if (!profile.campaigns.some((c) => c.id === activeCampId) && profile.campaigns.length > 0) {
      setActiveCampId(profile.campaigns[0].id);
    }
  }, [profile.campaigns, activeCampId]);

  const handleAddCampaign = (camp: ActiveCampaign) => {
    addCampaignToProfile(profile.id, camp);
    setActiveCampId(camp.id);
    // Panel stays open so user can add more campaigns
  };

  const handleSetResultType = (campId: string, rt: ResultType | undefined) => {
    updateProfile(profile.id, {
      campaigns: profile.campaigns.map((c) =>
        c.id === campId ? { ...c, resultType: rt } : c,
      ),
    });
  };

  const handleRemoveCampaign = (campId: string) => {
    if (confirmRemoveId === campId) {
      removeCampaignFromProfile(profile.id, campId);
      setConfirmRemoveId(null);
      if (activeCampId === campId) {
        const remaining = profile.campaigns.filter((c) => c.id !== campId);
        setActiveCampId(remaining[0]?.id ?? "");
      }
    } else {
      setConfirmRemoveId(campId);
      setTimeout(() => setConfirmRemoveId(null), 3000);
    }
  };

  const activeCampaign = profile.campaigns.find((c) => c.id === activeCampId);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div
        className="rounded-xl border shadow-sm"
        style={{ backgroundColor: "var(--dm-bg-surface)", borderColor: "var(--dm-border-default)" }}
      >
        <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-4">
          <div className="flex items-center gap-3">
            <button type="button" onClick={onBack}
              className="flex h-8 w-8 items-center justify-center rounded-lg border transition"
              style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-elevated)", color: "var(--dm-text-secondary)" }}
            >
              <ArrowLeft size={15} />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold" style={{ color: "var(--dm-text-primary)" }}>
                  {profile.name}
                </h2>
                {groupLabel && (
                  <span
                    className="rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                    style={{ backgroundColor: "var(--dm-brand-50)", color: "var(--dm-brand-500)" }}
                  >
                    {groupLabel}
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs" style={{ color: "var(--dm-text-secondary)" }}>
                {profile.product}
                <span className="mx-1.5 opacity-30">·</span>
                <span className="font-mono text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>{profile.adAccountId}</span>
              </p>
            </div>
          </div>

          {/* Configurar métricas + Date range */}
          <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto">
            {profileTab !== "instagram" && (
              <button
                type="button"
                onClick={() => setShowBuilder(true)}
                className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-semibold transition"
                style={{
                  borderColor: "var(--dm-border-default)",
                  color: "var(--dm-text-secondary)",
                  background: "var(--dm-bg-elevated)",
                }}
              >
                <SlidersHorizontal size={12} />
                Configurar
              </button>
            )}
            <ProfileDateRange
              dateFrom={dateFrom}
              dateTo={dateTo}
              onApply={(from, to) => { setDateFrom(from); setDateTo(to); persistDates(from, to); }}
            />
          </div>
        </div>

        {/* Campaign tabs — hidden on instagram tab */}
        {profileTab !== "instagram" && (
        <>
        <div
          className="flex flex-wrap items-center gap-2 border-t px-5 py-3"
          style={{ borderColor: "var(--dm-border-subtle)" }}
        >
          {profile.campaigns.map((camp) => (
            <div key={camp.id} className="group relative flex items-center">
              <button
                type="button"
                onClick={() => setActiveCampId(camp.id)}
                className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all"
                style={
                  activeCampId === camp.id
                    ? { backgroundColor: "var(--dm-brand-500)", borderColor: "var(--dm-brand-500)", color: "#fff" }
                    : { backgroundColor: "var(--dm-bg-elevated)", borderColor: "var(--dm-border-default)", color: "var(--dm-text-secondary)" }
                }
              >
                <span className={`h-1.5 w-1.5 rounded-full ${activeCampId === camp.id ? "bg-white" : "bg-emerald-500"}`} />
                {camp.name.length > 36 ? camp.name.slice(0, 36) + "…" : camp.name}
              </button>
              {/* Remove campaign button */}
              {confirmRemoveId === camp.id ? (
                <div
                  className="absolute left-0 top-full z-10 mt-1.5 flex items-center gap-1.5 rounded-lg border p-2 shadow-xl"
                  style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-surface)" }}
                >
                  <span className="px-1 text-[10px] font-bold uppercase tracking-wider text-red-600">Remover?</span>
                  <button type="button" onClick={() => handleRemoveCampaign(camp.id)}
                    className="rounded-md bg-red-600 px-2.5 py-1 text-[10px] font-bold text-white hover:bg-red-700 transition-colors">
                    Sim
                  </button>
                  <button type="button" onClick={() => setConfirmRemoveId(null)}
                    className="rounded-md border px-2.5 py-1 text-[10px] font-semibold transition"
                    style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-secondary)", backgroundColor: "var(--dm-bg-elevated)" }}
                  >
                    Não
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => handleRemoveCampaign(camp.id)}
                  className="ml-1 hidden h-5 w-5 items-center justify-center rounded text-red-400 transition hover:bg-red-50 group-hover:flex dark:hover:bg-red-900/30"
                >
                  <Trash2 size={11} />
                </button>
              )}
            </div>
          ))}

          {/* Add campaign */}
          <button
            type="button"
            onClick={() => setShowAddPanel(!showAddPanel)}
            className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all"
            style={
              showAddPanel
                ? { backgroundColor: "var(--dm-brand-500)", borderColor: "var(--dm-brand-500)", color: "#fff" }
                : { borderStyle: "dashed", borderColor: "var(--dm-border-default)", color: "var(--dm-text-tertiary)", backgroundColor: "transparent" }
            }
          >
            <Plus size={13} /> Adicionar Campanha
          </button>
        </div>

        {/* Add campaign panel */}
        {showAddPanel && (
          <div
            className="border-t px-5 py-4"
            style={{ borderColor: "var(--dm-border-subtle)", backgroundColor: "var(--dm-bg-elevated)" }}
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>
                Vincular Nova Campanha ao Perfil
              </p>
              <button type="button" onClick={() => setShowAddPanel(false)}
                className="rounded-md p-1 transition" style={{ color: "var(--dm-text-tertiary)" }}>
                <X size={14} />
              </button>
            </div>
            <AddCampaignPanel
              key={profile.id}
              defaultAccountId={profile.adAccountId}
              alreadyAddedIds={new Set(profile.campaigns.map((c) => c.id))}
              onAdd={handleAddCampaign}
              onClose={() => setShowAddPanel(false)}
            />
          </div>
        )}
        </> )} {/* end profileTab !== "instagram" campaign tabs */}
      </div>

      {/* Template selector modal */}
      {showTemplateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-3xl rounded-xl border p-6 shadow-2xl"
            style={{ backgroundColor: "var(--dm-bg-surface)", borderColor: "var(--dm-border-default)" }}>
            <h2 className="mb-4 text-base font-semibold" style={{ color: "var(--dm-text-primary)" }}>
              Qual tipo de campanha é essa?
            </h2>
            <TemplateSelector current={templateId} onChange={handleTemplateChange}
              variant="modal" onOpenBuilder={() => setShowBuilder(true)} />
          </div>
        </div>
      )}

      {/* Personalizado builder modal */}
      {showBuilder && (
        <PersonalizadoBuilder config={personalizadoConfig}
          onChange={handlePersonalizadoChange} onClose={() => setShowBuilder(false)} />
      )}

      {/* ── Tab bar top-level ── */}
      <div className="flex gap-1 rounded-[14px] p-1" style={{ backgroundColor: "var(--dm-bg-elevated)" }}>
        {([
          ["overview",   "Visão Geral"],
          ["campanha",   "Campanha"],
          ["conjunto",   "Análise de Conjunto"],
          ...(profile.instagramUserId ? [["instagram", "Perfil Ativo"]] : []),
        ] as [string, string][]).map(([id, label]) => (
          <button key={id} type="button"
            onClick={() => setProfileTab(id as typeof profileTab)}
            className="flex-1 rounded-[10px] py-2 text-[13px] font-semibold transition-all"
            style={profileTab === id
              ? { background: "linear-gradient(135deg,#6366C8 0%,#313491 100%)", color: "#fff", boxShadow: "0 4px 12px rgba(49,52,145,0.28)" }
              : { color: "var(--dm-text-tertiary)" }}>
            {label}
          </button>
        ))}
      </div>

      {/* ── Visão Geral — agrega todas as campanhas do perfil ── */}
      {profileTab === "overview" && (
        hasToken && profile.campaigns.length > 0 ? (
          <ProfileOverviewPanel
            key={`overview-${profile.id}-${dateFrom}-${dateTo}-${templateId}`}
            profileId={profile.id}
            adAccountId={profile.adAccountId}
            campaigns={profile.campaigns}
            dateFrom={dateFrom}
            dateTo={dateTo}
            template={resolvedTemplate}
          />
        ) : !hasToken ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border p-8 text-center"
            style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-surface)" }}>
            <Key size={20} className="text-amber-500" />
            <div>
              <p className="text-sm font-semibold" style={{ color: "var(--dm-text-primary)" }}>Token não configurado</p>
              <p className="mt-1 text-xs" style={{ color: "var(--dm-text-secondary)" }}>Configure em Importar dados → Meta Ads API</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-xl border p-10 text-center"
            style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-surface)" }}>
            <RefreshCw size={20} style={{ color: "var(--dm-text-tertiary)" }} />
            <p className="text-sm font-semibold" style={{ color: "var(--dm-text-primary)" }}>Nenhuma campanha adicionada</p>
            <p className="mt-1 text-xs" style={{ color: "var(--dm-text-secondary)" }}>
              Clique em <strong>+ Adicionar Campanha</strong> acima
            </p>
          </div>
        )
      )}

      {/* ── Campanha — seleção individual ── */}
      {profileTab === "campanha" && hasToken && activeCampaign && (
        <CampaignAnalysisPanel
          key={`${activeCampaign.id}-${dateFrom}-${dateTo}-${templateId}-${JSON.stringify(personalizadoConfig)}`}
          adAccountId={profile.adAccountId}
          campaign={activeCampaign}
          dateFrom={dateFrom}
          dateTo={dateTo}
          template={resolvedTemplate}
          instagramUserId={profile.instagramUserId}
          hideTabSwitcher
        />
      )}
      {profileTab === "campanha" && !hasToken && (
        <div className="flex flex-col items-center gap-3 rounded-xl border p-8 text-center"
          style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-surface)" }}>
          <Key size={20} className="text-amber-500" />
          <p className="text-sm font-semibold" style={{ color: "var(--dm-text-primary)" }}>Token não configurado</p>
        </div>
      )}

      {/* ── Análise de Conjunto ── */}
      {profileTab === "conjunto" && hasToken && activeCampaign && (
        <CampaignAnalysisPanel
          key={`conjunto-${activeCampaign.id}-${dateFrom}-${dateTo}`}
          adAccountId={profile.adAccountId}
          campaign={activeCampaign}
          dateFrom={dateFrom}
          dateTo={dateTo}
          template={resolvedTemplate}
          instagramUserId={profile.instagramUserId}
          forceTab="conjunto"
          hideTabSwitcher
        />
      )}

      {/* ── Perfil Ativo ── */}
      {profileTab === "instagram" && profile.instagramUserId && (
        <PerfilAtivoPanel
          key={`${profile.instagramUserId}-${dateFrom}-${dateTo}`}
          igUserId={profile.instagramUserId}
          dateFrom={dateFrom}
          dateTo={dateTo}
        />
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ProfileAnalysis({ campaignGroupOptions, campaignConfigs, appliedDateRange }: ProfileAnalysisProps) {
  const { profiles, addProfile, updateProfile, deleteProfile, addCampaignToProfile, removeCampaignFromProfile } = useAdvertiserStore();
  const { customSections } = useCampaignStore();
  const [view, setView]               = useState<"list" | "detail">("list");
  const [showForm, setShowForm]       = useState(false);
  const [selectedId, setSelectedId]   = useState<string | null>(null);
  const [editingId, setEditingId]     = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const selectedProfile = profiles.find((p) => p.id === selectedId);
  const editingProfile  = profiles.find((p) => p.id === editingId);

  function groupLabel(groupId: string) {
    return campaignGroupOptions.find((g) => g.id === groupId)?.label ?? groupId;
  }

  const handleSave = (data: ProfileFormData) => {
    const base = {
      name: data.name, product: data.product,
      adAccountId: data.adAccountId, groupId: data.groupId,
      campaigns: data.campaigns,
      instagramUserId: data.instagramUserId || undefined,
    };
    if (editingId) {
      updateProfile(editingId, base);
    } else {
      addProfile(base);
    }
    setShowForm(false); setEditingId(null);
  };

  const handleEdit = (id: string) => { setEditingId(id); setShowForm(true); };

  const handleDelete = (id: string) => {
    if (confirmDeleteId === id) {
      deleteProfile(id);
      setConfirmDeleteId(null);
      if (selectedId === id) { setSelectedId(null); setView("list"); }
    } else {
      setConfirmDeleteId(id);
      setTimeout(() => setConfirmDeleteId(null), 3000);
    }
  };

  // ── Shared form data for editing ─────────────────────────────────────────────
  const editingForm: ProfileFormData | undefined = editingProfile
    ? {
        name: editingProfile.name,
        product: editingProfile.product,
        adAccountId: editingProfile.adAccountId,
        groupId: editingProfile.groupId,
        campaigns: editingProfile.campaigns,
        instagramUserId: editingProfile.instagramUserId ?? "",
      }
    : undefined;

  // ── Detail view ──────────────────────────────────────────────────────────────
  if (view === "detail" && selectedProfile) {
    return (
      <ProfileDetailView
        key={selectedProfile.id}
        profile={selectedProfile}
        groupLabel={groupLabel(selectedProfile.groupId)}
        onBack={() => { setView("list"); setSelectedId(null); }}
        appliedDateRange={appliedDateRange}
        onAddCampaign={addCampaignToProfile}
        onRemoveCampaign={removeCampaignFromProfile}
        onUpdateProfile={updateProfile}
      />
    );
  }

  // ── List view ────────────────────────────────────────────────────────────────
  // Build a unified label map: built-in SECTION_META + user custom sections
  const sectionLabelMap: Record<string, string> = {
    pos:      "Pós Graduação",
    livros:   "Livros",
    ebooks:   "Ebooks",
    perpetuo: "Perpétuo",
    eventos:  "Eventos",
    ...Object.fromEntries(customSections.map((s) => [s.id, s.label])),
  };

  // Dynamically group profiles by their group's section (handles any section ID)
  const sectionMap = new Map<string, AdvertiserProfile[]>();
  const ungrouped: AdvertiserProfile[] = [];

  for (const profile of profiles) {
    const grp = campaignGroupOptions.find((g) => g.id === profile.groupId);
    if (!grp) {
      ungrouped.push(profile);
    } else {
      const secId = grp.section;
      sectionMap.set(secId, [...(sectionMap.get(secId) ?? []), profile]);
    }
  }

  const profilesBySection = Array.from(sectionMap.entries()).map(([secId, items]) => ({
    secId,
    meta: SECTION_META[secId as keyof typeof SECTION_META] ?? null,
    label: sectionLabelMap[secId] ?? secId,
    items,
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold" style={{ color: "var(--dm-text-primary)" }}>Perfis de Anunciantes</h2>
        </div>
        <button type="button" onClick={() => { setEditingId(null); setShowForm(true); }}
          className="flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-white transition hover:opacity-90"
          style={{ backgroundColor: "var(--dm-brand-500)" }}
        >
          <Plus size={13} /> Novo Perfil
        </button>
      </div>

      {/* Empty state */}
      {profiles.length === 0 && (
        <PerfilEmpty
          onCreateProfile={() => { setEditingId(null); setShowForm(true); }}
        />
      )}

      {/* Profiles grouped by section (dynamic — works for built-in + custom sections) */}
      {profilesBySection.map(({ secId, meta, label, items }) => {
        const SectionIcon = meta?.icon ?? Users;
        const colorCls   = meta?.color ?? "text-slate-500";
        return (
          <section key={secId}>
            <div className="mb-3 flex items-center gap-2 border-b pb-2" style={{ borderColor: "var(--dm-border-subtle)" }}>
              <SectionIcon size={13} className={colorCls} />
              <span className={`text-xs font-semibold ${colorCls}`}>{label}</span>
              <span className="ml-auto text-[10px] font-medium" style={{ color: "var(--dm-text-tertiary)" }}>
                {items.length} perfil{items.length !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((profile) => (
                <div key={profile.id} className="relative">
                  <ProfileCard
                    profile={profile}
                    groupLabel={groupLabel(profile.groupId)}
                    onSelect={() => { setSelectedId(profile.id); setView("detail"); }}
                    onEdit={() => handleEdit(profile.id)}
                    onDelete={() => handleDelete(profile.id)}
                  />
                  {confirmDeleteId === profile.id && (
                    <div className="absolute inset-0 flex items-center justify-center gap-2 rounded-2xl bg-red-50/95 dark:bg-slate-800/95">
                      <p className="text-xs font-semibold text-red-700 dark:text-red-400">Confirmar exclusão?</p>
                      <button type="button" onClick={() => handleDelete(profile.id)}
                        className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700">
                        Excluir
                      </button>
                      <button type="button" onClick={() => setConfirmDeleteId(null)}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300">
                        Cancelar
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        );
      })}

      {/* Ungrouped profiles */}
      {ungrouped.length > 0 && (
        <section>
          <div className="mb-3 flex items-center gap-2 border-b pb-2" style={{ borderColor: "var(--dm-border-subtle)" }}>
            <span className="text-xs font-semibold" style={{ color: "var(--dm-text-tertiary)" }}>Sem grupo</span>
            <span className="ml-auto text-[10px] font-medium" style={{ color: "var(--dm-text-tertiary)" }}>
              {ungrouped.length} perfil{ungrouped.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {ungrouped.map((profile) => (
              <div key={profile.id} className="relative">
                <ProfileCard
                  profile={profile}
                  groupLabel=""
                  onSelect={() => { setSelectedId(profile.id); setView("detail"); }}
                  onEdit={() => handleEdit(profile.id)}
                  onDelete={() => handleDelete(profile.id)}
                />
                {confirmDeleteId === profile.id && (
                  <div className="absolute inset-0 flex items-center justify-center gap-2 rounded-2xl bg-red-50/95 dark:bg-slate-800/95">
                    <p className="text-xs font-semibold text-red-700 dark:text-red-400">Confirmar exclusão?</p>
                    <button type="button" onClick={() => handleDelete(profile.id)}
                      className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700">
                      Excluir
                    </button>
                    <button type="button" onClick={() => setConfirmDeleteId(null)}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300">
                      Cancelar
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Slide-over form drawer ──────────────────────────────────────────── */}
      {showForm && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]"
            onClick={() => { setShowForm(false); setEditingId(null); }}
          />

          {/* Drawer panel */}
          <div
            className="fixed inset-y-0 right-0 z-50 flex w-full flex-col overflow-hidden border-l shadow-2xl sm:max-w-[480px]"
            style={{
              backgroundColor: "var(--dm-bg-surface)",
              borderColor: "var(--dm-border-default)",
            }}
          >
            {/* Drawer header */}
            <div
              className="flex flex-shrink-0 items-center justify-between border-b px-6 py-4"
              style={{ borderColor: "var(--dm-border-default)" }}
            >
              <div>
                <h2 className="text-sm font-semibold" style={{ color: "var(--dm-text-primary)" }}>
                  {editingId ? "Editar Perfil" : "Novo Perfil de Anunciante"}
                </h2>
                <p className="mt-0.5 text-[11px]" style={{ color: "var(--dm-text-secondary)" }}>
                  {editingId
                    ? "Atualize os dados do anunciante"
                    : "Configure um anunciante para análise personalizada"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setShowForm(false); setEditingId(null); }}
                className="rounded-lg p-1.5 transition hover:bg-[var(--dm-bg-elevated)]"
                style={{ color: "var(--dm-text-tertiary)" }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto">
              <ProfileForm
                key={editingId ?? "new"}
                initial={editingForm}
                groupOptions={campaignGroupOptions}
                campaignConfigs={campaignConfigs}
                onSave={handleSave}
                onCancel={() => { setShowForm(false); setEditingId(null); }}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
