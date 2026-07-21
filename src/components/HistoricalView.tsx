"use client";

import { useRef, useState, useMemo, useCallback, useEffect } from "react";
import { useTheme } from "next-themes";
import {
  Area, AreaChart, Bar, BarChart, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ComposedChart, Line,
} from "recharts";
import {
  Upload, TrendingUp, ShoppingCart, DollarSign, Target,
  ArrowRight, CheckCircle2, XCircle, Plus, Pencil, Trash2, X, Copy,
  BarChart2, Package, Cloud, CloudOff, Loader2, CalendarDays, Camera, Repeat, Wallet,
  ArrowUpDown, ArrowUp, ArrowDown, Tag, Layers, Filter, FileText,
} from "lucide-react";
import { HistoricoEmpty } from "@/components/empty/HistoricoEmpty";
import {
  HISTORY_TAB_LABELS_KEY, historyKindLabel, isBuiltinHistoryKind, readCustomHistoryTabs,
  type CustomHistoryTab, type CustomMetric, type HistoricalKind, type HistoricalMeta, type HistoricalRow,
} from "@/types/historical";
import { useCompany } from "@/hooks/useCompany";
import { toast } from "@/hooks/useToast";

// Sub-aba custom se comporta como "Lançamento" (form/stats/headers genéricos).
// Só built-in tem shape próprio; o filtro de linhas usa o kind real (não este).
const baseKind = (k: HistoricalKind): HistoricalKind => isBuiltinHistoryKind(k) ? k : "lancamento";
import { parseHistoricalCsvFile } from "@/utils/parseHistoricalCsv";
import { formatCurrency, formatNumber, formatPercent } from "@/utils/metrics";
import { isSupabaseConfigured } from "@/lib/supabase";
import {
  fetchHistoricalRows, fetchHistoricalMetas,
  insertHistoricalRow, updateHistoricalRow, deleteHistoricalRowById,
  replaceHistoricalData,
} from "@/utils/supabaseHistorical";
import {
  fetchUserTags, addUserTag, deleteUserTag,
} from "@/utils/supabaseProducts";

// ─── Predefined product category tags (per kind) ─────────────────────────────

// Sem tags de nicho embutidas — a empresa cria as próprias tags de produto.
const PREDEFINED_TAGS: Record<HistoricalKind, string[]> = {
  lancamento: [],
  evento:     [],
  perpetuo:   [],
  instagram:  [],
};

const MAX_CUSTOM_TAGS = 5;

// Sugestões de métricas livres pro funil de Evento — só atalhos pra preencher o rótulo, não são campos fixos.
const SUGGESTED_METRICS = ["Formulários preenchidos", "Pessoas ao vivo", "Pessoas no grupo"];

type SyncStatus = "idle" | "loading" | "synced" | "local" | "error";

// ─── Persistence ──────────────────────────────────────────────────────────────

const ROWS_KEY_V1 = "gsah_hist_rows_v1";
const ROWS_KEY_V2 = "gsah_hist_rows_v2";
const METAS_KEY = "gsah_hist_metas_v1";

function loadRows(): HistoricalRow[] {
  if (typeof window === "undefined") return [];
  const rawV2 = localStorage.getItem(ROWS_KEY_V2);
  if (rawV2) {
    try { return JSON.parse(rawV2); } catch { return []; }
  }
  const rawV1 = localStorage.getItem(ROWS_KEY_V1);
  if (rawV1) {
    try {
      const parsed = JSON.parse(rawV1) as Array<Partial<HistoricalRow>>;
      const migrated = parsed.map((r) => ({ ...r, kind: r.kind ?? "lancamento" })) as HistoricalRow[];
      localStorage.setItem(ROWS_KEY_V2, JSON.stringify(migrated));
      return migrated;
    } catch { return []; }
  }
  return [];
}
function loadMetas(): HistoricalMeta[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(METAS_KEY) ?? "[]"); } catch { return []; }
}
function saveRows(r: HistoricalRow[])  { try { localStorage.setItem(ROWS_KEY_V2,  JSON.stringify(r)); } catch {} }
function saveMetas(m: HistoricalMeta[]) { try { localStorage.setItem(METAS_KEY, JSON.stringify(m)); } catch {} }

// ─── Constants ────────────────────────────────────────────────────────────────

const MONTHS = [
  "JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO",
  "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO",
] as const;

const MONTH_ABBR: Record<string, string> = {
  JANEIRO: "Jan", FEVEREIRO: "Fev", "MARÇO": "Mar", ABRIL: "Abr",
  MAIO: "Mai", JUNHO: "Jun", JULHO: "Jul", AGOSTO: "Ago",
  SETEMBRO: "Set", OUTUBRO: "Out", NOVEMBRO: "Nov", DEZEMBRO: "Dez",
};
const MONTH_LABELS: Record<string, string> = {
  JANEIRO: "Janeiro", FEVEREIRO: "Fevereiro", "MARÇO": "Março", ABRIL: "Abril",
  MAIO: "Maio", JUNHO: "Junho", JULHO: "Julho", AGOSTO: "Agosto",
  SETEMBRO: "Setembro", OUTUBRO: "Outubro", NOVEMBRO: "Novembro", DEZEMBRO: "Dezembro",
};

// ─── Column resize defaults ───────────────────────────────────────────────────

const DEFAULT_COL_WIDTHS: Record<string, number> = {
  "Mês": 68, "Produto": 236, "Imersão": 118,
  "Investimento": 112, "Alcance": 90, "Cliques": 74, "CTR": 62,
  "Pag. View": 80, "Pré-chk": 72, "Ingressos": 82,
  "Fat. Ingresso": 108, "Vendas Pós": 86, "Fat. Pós": 90,
  "CAC": 100, "ROAS": 65, "Ações": 90,
  // Perpétuo
  "Leads": 70, "Vendas": 72, "Receita": 94, "MRR": 88,
  // Instagram
  "Seguid. Ganhos": 104, "Perdidos": 72, "Visitas": 72,
  "Curtidas": 70, "Comentários": 90, "Compart.": 76, "Tx. Eng.": 68,
  // Evento
  "Faturamento": 104,
};

// ─── Types ────────────────────────────────────────────────────────────────────

type TableSortKey = "date-asc" | "date-desc" | "invest-desc" | "invest-asc";

interface FormState {
  kind: HistoricalKind;
  tag: string;
  product: string; turma: string; month: string; year: string; campaignEndDate: string;
  investment: string; cpm: string; reach: string; clicks: string;
  pageViews: string; preCheckouts: string; sales: string; revenue: string;
  // Lançamento extras
  imersao: string;
  ingressosVendidos: string; faturamentoIngresso: string;
  vendasPos: string;         faturamentoPos: string;
  // Perpétuo extras
  leads: string; mrr: string; churn: string;
  // Instagram extras
  followersGained: string; followersLost: string; profileVisits: string;
  impressionsCount: string; likes: string; comments: string; shares: string;
  // Evento extras — métricas livres só desse registro (não viram molde)
  customMetrics: Array<{ id: string; label: string; value: string; inFunnel: boolean }>;
}

const HISTORY_TABS: Array<{ id: HistoricalKind; icon: React.ElementType }> = [
  { id: "lancamento", icon: Wallet },
  { id: "evento", icon: CalendarDays },
  { id: "perpetuo", icon: Repeat },
  { id: "instagram", icon: Camera },
];

const EMPTY_FORM: FormState = {
  kind: "lancamento",
  tag: "",
  product: "", turma: "", month: "JANEIRO", year: String(new Date().getFullYear()), campaignEndDate: "",
  investment: "", cpm: "", reach: "", clicks: "",
  pageViews: "", preCheckouts: "", sales: "", revenue: "",
  imersao: "", ingressosVendidos: "", faturamentoIngresso: "", vendasPos: "", faturamentoPos: "",
  leads: "", mrr: "", churn: "",
  followersGained: "", followersLost: "", profileVisits: "",
  impressionsCount: "", likes: "", comments: "", shares: "",
  customMetrics: [],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const p = (s: string): number => {
  if (!s.trim()) return 0;
  const t = s.replace(/[R$\s]/g, "").trim();
  if (!t) return 0;
  if (t.includes(",")) {
    // Formato BR: pontos = milhar, vírgula = decimal  →  "1.234,56"
    return parseFloat(t.replace(/\./g, "").replace(",", ".")) || 0;
  }
  // Sem vírgula: se o ponto está em posição de decimal (≠ 3 dígitos até o fim), é decimal
  if (/^\d+\.\d+$/.test(t) && !/\.\d{3}$/.test(t)) {
    return parseFloat(t) || 0;
  }
  // Senão, ponto(s) são separadores de milhar  →  "1.234"  ou "1.234.567"
  return parseFloat(t.replace(/\./g, "")) || 0;
};

const buildRow = (form: FormState, kind: HistoricalKind): HistoricalRow => {
  const investment = p(form.investment), revenue = p(form.revenue);
  const reach = p(form.reach), clicks = p(form.clicks);
  const pageViews = p(form.pageViews), preCheckouts = p(form.preCheckouts);
  const sales = p(form.sales);
  const leads = p(form.leads), mrr = p(form.mrr), churn = p(form.churn);
  const followersGained = p(form.followersGained), followersLost = p(form.followersLost);
  const profileVisits = p(form.profileVisits), impressionsCount = p(form.impressionsCount);
  const likes = p(form.likes), comments = p(form.comments), shares = p(form.shares);
  // Lançamento extras
  const ingressosVendidos  = p(form.ingressosVendidos);
  const faturamentoIngresso = p(form.faturamentoIngresso);
  const vendasPos          = p(form.vendasPos);
  const faturamentoPos     = p(form.faturamentoPos);

  const monthNum = MONTHS.indexOf(form.month as typeof MONTHS[number]) + 1 || 1;
  const year = parseInt(form.year) || new Date().getFullYear();
  const monthKey = `${year}-${String(monthNum).padStart(2, "0")}`;
  const abbr = MONTH_ABBR[form.month] ?? form.month.slice(0, 3);

  // Métricas livres do Evento — só vão pro registro se tiverem rótulo preenchido.
  const customMetrics: CustomMetric[] = form.customMetrics
    .filter((m) => m.label.trim())
    .map((m) => ({ id: m.id, label: m.label.trim(), value: p(m.value), inFunnel: m.inFunnel }));

  const base = {
    kind,
    tag: form.tag.trim() || undefined,
    product: form.product.trim(),
    turma: form.turma.trim() || undefined,
    month: form.month, year, monthKey,
    monthLabel: `${abbr}/${String(year).slice(2)}`,
    campaignEndDate: form.campaignEndDate || undefined,
    investment, revenue, reach, clicks, cpm: p(form.cpm),
    ctr: reach > 0 ? (clicks / reach) * 100 : 0,
    pageViews, pageViewRate: clicks > 0 ? (pageViews / clicks) * 100 : 0,
    preCheckouts, preCheckoutRate: pageViews > 0 ? (preCheckouts / pageViews) * 100 : 0,
    sales, salesRate: preCheckouts > 0 ? (sales / preCheckouts) * 100 : 0,
    cac: sales > 0 ? investment / sales : 0,
    roas: investment > 0 && revenue > 0 ? revenue / investment : 0,
    ...(kind === "evento" && customMetrics.length > 0 ? { customMetrics } : {}),
  };

  if (kind === "lancamento") {
    const totalRev = faturamentoIngresso + faturamentoPos;
    return {
      ...base,
      // Sobrescreve campos base com valores específicos do lançamento
      sales: vendasPos,
      revenue: totalRev || revenue,  // fallback para retrocompat
      salesRate: ingressosVendidos > 0 ? (vendasPos / ingressosVendidos) * 100 : 0,
      cac: vendasPos > 0 ? investment / vendasPos : 0,
      roas: investment > 0 && (totalRev || revenue) > 0 ? (totalRev || revenue) / investment : 0,
      // Campos extras armazenados em JSONB
      imersao: form.imersao.trim() || undefined,
      ingressosVendidos: ingressosVendidos || undefined,
      faturamentoIngresso: faturamentoIngresso || undefined,
      vendasPos: vendasPos || undefined,
      faturamentoPos: faturamentoPos || undefined,
    } as HistoricalRow;
  }
  if (kind === "perpetuo") {
    return { ...base, leads, mrr, churn,
      cac: leads > 0 ? investment / leads : 0 } as HistoricalRow;
  }
  if (kind === "instagram") {
    return { ...base,
      investment: 0, revenue: 0, sales: 0, cac: 0, roas: 0,
      newFollowers: followersGained, totalFollowers: followersGained - followersLost,
      organicReach: reach, accountsReached: impressionsCount,
      accountsEngaged: likes + comments + shares,
      saves: shares, likes, comments, shares,
      engagementRate: impressionsCount > 0 ? ((likes + comments + shares) / impressionsCount) * 100 : 0,
      reach: profileVisits, clicks: followersGained,
    } as HistoricalRow;
  }
  return base as HistoricalRow;
};

const rowToForm = (r: HistoricalRow): FormState => {
  const rx = r as unknown as Record<string, unknown>;
  const num = (k: string) => (rx[k] as number | undefined) ?? 0;
  const str = (k: string) => num(k) > 0 ? String(num(k)) : "";
  const money = fmtNum;

  return {
    kind: r.kind,
    tag: r.tag ?? "",
    product: r.product, turma: r.turma ?? "", month: r.month, year: String(r.year),
    campaignEndDate: r.campaignEndDate ?? "",
    investment: money(r.investment),
    cpm: money(r.cpm),
    reach: r.reach > 0 ? String(r.reach) : "",
    clicks: r.clicks > 0 ? String(r.clicks) : "",
    pageViews: r.pageViews > 0 ? String(r.pageViews) : "",
    preCheckouts: r.preCheckouts > 0 ? String(r.preCheckouts) : "",
    sales: r.sales > 0 ? String(r.sales) : "",
    revenue: money(r.revenue),
    // Lançamento extras
    imersao: (rx.imersao as string | undefined) ?? "",
    ingressosVendidos: str("ingressosVendidos"),
    faturamentoIngresso: money(num("faturamentoIngresso")),
    // Retrocompat: se vendasPos não existe, usa sales; se faturamentoPos não existe, usa revenue
    vendasPos: str("vendasPos") || (baseKind(r.kind) === "lancamento" && r.sales > 0 ? String(r.sales) : ""),
    faturamentoPos: num("faturamentoPos") > 0
      ? money(num("faturamentoPos"))
      : (baseKind(r.kind) === "lancamento" && num("faturamentoIngresso") === 0 && r.revenue > 0 ? money(r.revenue) : ""),
    // Perpetuo
    leads: str("leads"),
    mrr:   money(num("mrr")),
    churn: str("churn"),
    // Instagram
    followersGained: str("newFollowers"),
    followersLost: "",
    profileVisits: baseKind(r.kind) === "instagram" ? String(r.reach) : "",
    impressionsCount: str("accountsReached"),
    likes: str("likes"),
    comments: str("comments"),
    shares: str("shares"),
    // Evento — métricas livres do registro
    customMetrics: ((rx.customMetrics as CustomMetric[] | undefined) ?? []).map((m) => ({
      id: m.id, label: m.label, value: m.value > 0 ? String(m.value) : "", inFunnel: m.inFunnel,
    })),
  };
};

// ─── Currency mask ────────────────────────────────────────────────────────────

function formatMoneyInput(raw: string): string {
  const n = p(raw);
  if (!n && raw.replace(/[R$\s.,]/g, "").length > 0) return raw;
  if (!n) return raw;
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const fmtNum = (n: number) =>
  n > 0 ? n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "";

// ─── Entry Form modal ─────────────────────────────────────────────────────────

// Cabeçalho de seção estilo HubSettings: chip de ícone + título (+ subtítulo).
function SectionHead({ icon: Icon, title, sub }: { icon: React.ElementType; title: string; sub?: string }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl" style={{ background: "var(--dm-primary-soft)", border: "1px solid var(--dm-primary-border)" }}>
        <Icon size={16} style={{ color: "var(--dm-primary)" }} />
      </div>
      <div>
        <p className="text-sm font-bold leading-tight" style={{ color: "var(--dm-text-primary)" }}>{title}</p>
        {sub && <p className="text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>{sub}</p>}
      </div>
    </div>
  );
}

interface EntryFormProps {
  form: FormState; products: string[]; isEditing: boolean;
  customTags: string[];
  onChange: (f: FormState) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
  onAddTag: (tag: string) => void;
}

function EntryForm({ form, products, isEditing, customTags, onChange, onSubmit, onClose, onAddTag }: EntryFormProps) {
  const { company } = useCompany();
  const histLabels = company?.settings?.[HISTORY_TAB_LABELS_KEY] as Record<string, string> | undefined;
  const customTabs = readCustomHistoryTabs(company?.settings);
  const fk = baseKind(form.kind); // shape do formulário (built-in ou genérico)
  const [tagDraft, setTagDraft] = useState("");
  const [showTagInput, setShowTagInput] = useState(false);

  const set = (key: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      onChange({ ...form, [key]: e.target.value });

  const blurMoney = (key: keyof FormState) => () =>
    onChange({ ...form, [key]: formatMoneyInput(form[key] as string) });

  const allTags = [...(PREDEFINED_TAGS[form.kind] ?? []), ...customTags];
  const canAddTag = customTags.length < MAX_CUSTOM_TAGS;

  // Métricas livres do funil de Evento — só desse registro, não viram molde da empresa.
  function addCustomMetric(label = "") {
    // eslint-disable-next-line react-hooks/purity -- só roda no clique (handler), nunca durante o render
    const id = `cm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    onChange({ ...form, customMetrics: [...form.customMetrics, { id, label, value: "", inFunnel: false }] });
  }
  function updateCustomMetric(id: string, patch: Partial<FormState["customMetrics"][number]>) {
    onChange({ ...form, customMetrics: form.customMetrics.map((m) => (m.id === id ? { ...m, ...patch } : m)) });
  }
  function removeCustomMetric(id: string) {
    onChange({ ...form, customMetrics: form.customMetrics.filter((m) => m.id !== id) });
  }

  function handleAddTag() {
    const trimmed = tagDraft.trim();
    if (!trimmed || allTags.includes(trimmed)) return;
    onAddTag(trimmed);
    onChange({ ...form, tag: trimmed });
    setTagDraft("");
    setShowTagInput(false);
  }

  const preview = useMemo(() => {
    const inv = p(form.investment), rev = p(form.revenue);
    const reach = p(form.reach), clicks = p(form.clicks);
    const pageViews = p(form.pageViews), preCheckouts = p(form.preCheckouts);
    const sales = p(form.sales);
    // Lançamento-specific
    const ingressos   = p(form.ingressosVendidos);
    const fatIngresso = p(form.faturamentoIngresso);
    const vendPos     = p(form.vendasPos);
    const fatPos      = p(form.faturamentoPos);
    const totalRev    = fatIngresso + fatPos;
    return {
      ctr: reach > 0 ? (clicks / reach) * 100 : null,
      pageViewRate: clicks > 0 ? (pageViews / clicks) * 100 : null,
      preCheckoutRate: pageViews > 0 ? (preCheckouts / pageViews) * 100 : null,
      salesRate: preCheckouts > 0 ? (sales / preCheckouts) * 100 : null,
      cac: sales > 0 && inv > 0 ? inv / sales : null,
      roas: inv > 0 && rev > 0 ? rev / inv : null,
      // lancamento
      txIngresso: preCheckouts > 0 && ingressos > 0 ? (ingressos / preCheckouts) * 100 : null,
      txPos: ingressos > 0 && vendPos > 0 ? (vendPos / ingressos) * 100 : null,
      cacLanc: vendPos > 0 && inv > 0 ? inv / vendPos : null,
      roasLanc: inv > 0 && totalRev > 0 ? totalRev / inv : null,
      fatIngresso: fatIngresso || null,
      fatPos: fatPos || null,
    };
  }, [form]);

  const fieldCls = "h-9 w-full rounded-lg border px-3 text-sm outline-none transition focus:border-[color:var(--dm-primary)] focus:ring-2 focus:ring-[color:var(--dm-primary-soft)] border-[color:var(--dm-border-default)] bg-[var(--dm-bg-elevated)] text-[color:var(--dm-text-primary)]";
  const labelCls = "flex flex-col gap-1 text-xs font-medium text-[color:var(--dm-text-secondary)]";

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-md" />
      <div
        className="relative z-10 flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border shadow-2xl"
        style={{ background: "var(--dm-bg-surface)", borderColor: "var(--dm-border-default)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-shrink-0 items-center justify-between border-b px-5 py-4" style={{ borderColor: "var(--dm-border-default)" }}>
          <h2 className="text-base font-bold" style={{ color: "var(--dm-text-primary)" }}>
            {isEditing ? "Editar Registro" : "Adicionar Registro"}
          </h2>
          <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-lg transition hover:opacity-70" style={{ color: "var(--dm-text-tertiary)" }}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {/* Tipo de dado */}
          <div className="rounded-xl border border-[color:var(--dm-border-default)] bg-[var(--dm-bg-elevated)] p-5">
            <SectionHead icon={Layers} title="Tipo de dado" sub="Escolha o que você está registrando" />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                ...HISTORY_TABS.map((t) => ({ id: t.id as HistoricalKind, Icon: t.icon, label: historyKindLabel(t.id, histLabels), custom: false })),
                ...customTabs.map((t) => ({ id: t.id as HistoricalKind, Icon: Tag, label: t.label, custom: true })),
              ].map(({ id, Icon, label, custom }) => {
                const active = form.kind === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => onChange({ ...form, kind: id, tag: "" })}
                    className="flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-xs font-semibold transition"
                    style={active
                      ? { borderColor: "var(--dm-primary)", background: "var(--dm-primary-soft)", color: "var(--dm-primary)" }
                      : { borderColor: "var(--dm-border-default)", color: "var(--dm-text-secondary)" }}
                  >
                    <Icon size={14} />
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl border border-[color:var(--dm-border-default)] bg-[var(--dm-bg-elevated)] p-5">
            <SectionHead icon={FileText} title="Identificação" sub="Produto, turma e período" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className={`${labelCls} sm:col-span-2`}>
                Produto / Campanha *
                <input list="products-list" required value={form.product} onChange={set("product")} placeholder="Ex: nome do produto" className={fieldCls} />
                <datalist id="products-list">{products.map((pr) => <option key={pr} value={pr} />)}</datalist>
              </label>
              <label className={labelCls}>
                Turma / Edição
                <input value={form.turma} onChange={set("turma")} placeholder="Ex: 3" className={fieldCls} />
              </label>
              {fk === "lancamento" && (
                <label className={`${labelCls} sm:col-span-3`}>
                  Nome da Imersão <span className="font-normal text-slate-400">(opcional)</span>
                  <input value={form.imersao} onChange={set("imersao")} placeholder="Ex: nome do evento ou imersão" className={fieldCls} />
                </label>
              )}
              <label className={labelCls}>
                Mês *
                <select required value={form.month} onChange={set("month")} className={fieldCls}>
                  {MONTHS.map((m) => <option key={m} value={m}>{MONTH_LABELS[m] ?? m}</option>)}
                </select>
              </label>
              <label className={labelCls}>
                Ano *
                <input type="number" required min={2020} max={2099} value={form.year} onChange={set("year")} className={fieldCls} />
              </label>
              <label className={labelCls}>
                Término da campanha
                <input type="date" value={form.campaignEndDate} onChange={set("campaignEndDate")} className={fieldCls} />
              </label>
            </div>
          </div>

          {/* ── Categoria / Tag ── */}
          {allTags.length > 0 || canAddTag ? (
            <div className="px-4 py-4 sm:px-6">
              <SectionHead icon={Tag} title="Categoria / Tag" sub="Classifique o registro" />
              <div className="flex flex-wrap gap-2">
                {allTags.map((t) => {
                  const active = form.tag === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => onChange({ ...form, tag: active ? "" : t })}
                      className="flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition"
                      style={active
                        ? { borderColor: "var(--dm-primary)", background: "var(--dm-primary-soft)", color: "var(--dm-primary)" }
                        : { borderColor: "var(--dm-border-default)", color: "var(--dm-text-secondary)" }}
                    >
                      <Tag size={11} />
                      {t}
                    </button>
                  );
                })}
                {showTagInput ? (
                  <div className="flex items-center gap-1">
                    <input
                      autoFocus
                      value={tagDraft}
                      onChange={(e) => setTagDraft(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddTag(); } if (e.key === "Escape") { setShowTagInput(false); setTagDraft(""); } }}
                      placeholder="Nome da tag"
                      className="h-7 w-32 rounded-full border px-3 text-xs outline-none focus:ring-2 focus:ring-[color:var(--dm-primary-soft)] border-[color:var(--dm-primary)] bg-[var(--dm-bg-elevated)] text-[color:var(--dm-text-primary)]"
                    />
                    <button type="button" onClick={handleAddTag} className="rounded-full px-2 py-0.5 text-xs font-semibold text-white" style={{ background: "var(--dm-primary)" }}>OK</button>
                    <button type="button" onClick={() => { setShowTagInput(false); setTagDraft(""); }} className="rounded-full border px-2 py-0.5 text-xs hover:opacity-80" style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-tertiary)" }}>✕</button>
                  </div>
                ) : canAddTag ? (
                  <button
                    type="button"
                    onClick={() => setShowTagInput(true)}
                    className="flex items-center gap-1 rounded-full border border-dashed px-3 py-1 text-xs transition hover:border-[color:var(--dm-primary-border)] hover:text-[color:var(--dm-primary)]"
                    style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-tertiary)" }}
                  >
                    <Plus size={11} /> Nova tag
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          {/* ── Kind-contextual fields ── */}
          {fk === "instagram" ? (
            /* Instagram: followers & engagement */
            <div className="rounded-xl border border-[color:var(--dm-border-default)] bg-[var(--dm-bg-elevated)] p-5">
              <SectionHead icon={Camera} title="Dados do Perfil" sub="Métricas do Instagram" />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <label className={labelCls}>Seguidores Ganhos *<input required value={form.followersGained} onChange={set("followersGained")} placeholder="340" className={fieldCls} /></label>
                <label className={labelCls}>Seguidores Perdidos<input value={form.followersLost} onChange={set("followersLost")} placeholder="45" className={fieldCls} /></label>
                <label className={labelCls}>Visitas ao Perfil<input value={form.profileVisits} onChange={set("profileVisits")} placeholder="12400" className={fieldCls} /></label>
                <label className={labelCls}>Alcance Orgânico<input value={form.reach} onChange={set("reach")} placeholder="85000" className={fieldCls} /></label>
                <label className={labelCls}>Impressões<input value={form.impressionsCount} onChange={set("impressionsCount")} placeholder="120000" className={fieldCls} /></label>
                <label className={labelCls}>Cliques no Link<input value={form.clicks} onChange={set("clicks")} placeholder="820" className={fieldCls} /></label>
                <label className={labelCls}>Curtidas<input value={form.likes} onChange={set("likes")} placeholder="4100" className={fieldCls} /></label>
                <label className={labelCls}>Comentários<input value={form.comments} onChange={set("comments")} placeholder="230" className={fieldCls} /></label>
                <label className={labelCls}>Compartilhamentos<input value={form.shares} onChange={set("shares")} placeholder="180" className={fieldCls} /></label>
              </div>
              {/* Instagram preview */}
              <div className="mt-3 rounded-lg px-3 py-3 border border-[color:var(--dm-border-subtle)] bg-[var(--dm-bg-surface)]">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[color:var(--dm-text-tertiary)]">Calculado automaticamente</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { label: "Saldo", val: `${p(form.followersGained) - p(form.followersLost) >= 0 ? "+" : ""}${p(form.followersGained) - p(form.followersLost)}` },
                    { label: "CTR Link", val: p(form.reach) > 0 ? `${((p(form.clicks)/p(form.reach))*100).toFixed(2)}%` : "—" },
                    { label: "Tx. Eng.", val: p(form.impressionsCount) > 0 ? `${(((p(form.likes)+p(form.comments)+p(form.shares))/p(form.impressionsCount))*100).toFixed(2)}%` : "—" },
                  ].map(({ label, val }) => (
                    <div key={label} className="rounded-lg border border-[color:var(--dm-border-default)] bg-[var(--dm-bg-elevated)] px-3 py-1.5">
                      <p className="text-xs text-[color:var(--dm-text-tertiary)]">{label}</p>
                      <p className="text-sm font-semibold text-[color:var(--dm-text-primary)]">{val}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : fk === "perpetuo" ? (
            /* Perpétuo: continuous product funnel */
            <div className="rounded-xl border border-[color:var(--dm-border-default)] bg-[var(--dm-bg-elevated)] p-5">
              <SectionHead icon={BarChart2} title="Métricas do Mês" sub="Resultados do período" />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <label className={labelCls}>Investimento (R$) *<input required value={form.investment} onChange={set("investment")} onBlur={blurMoney("investment")} placeholder="8.544,26" className={fieldCls} /></label>
                <label className={labelCls}>CPM (R$)<input value={form.cpm} onChange={set("cpm")} onBlur={blurMoney("cpm")} placeholder="11,47" className={fieldCls} /></label>
                <label className={labelCls}>Alcance<input value={form.reach} onChange={set("reach")} placeholder="744957" className={fieldCls} /></label>
                <label className={labelCls}>Cliques<input value={form.clicks} onChange={set("clicks")} placeholder="4074" className={fieldCls} /></label>
                <label className={labelCls}>Leads<input value={form.leads} onChange={set("leads")} placeholder="382" className={fieldCls} /></label>
                <label className={labelCls}>Vendas do Mês *<input required value={form.sales} onChange={set("sales")} placeholder="46" className={fieldCls} /></label>
                <label className={labelCls}>Receita do Mês (R$)<input value={form.revenue} onChange={set("revenue")} onBlur={blurMoney("revenue")} placeholder="16.309,00" className={fieldCls} /></label>
                <label className={labelCls}>MRR (R$)<input value={form.mrr} onChange={set("mrr")} onBlur={blurMoney("mrr")} placeholder="16.309,00" className={fieldCls} /></label>
                <label className={labelCls}>Churn (%)<input value={form.churn} onChange={set("churn")} placeholder="2.5" className={fieldCls} /></label>
              </div>
              <div className="mt-3 rounded-lg px-3 py-3 border border-[color:var(--dm-border-subtle)] bg-[var(--dm-bg-surface)]">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[color:var(--dm-text-tertiary)]">Calculado automaticamente</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { label: "CTR",      val: preview.ctr !== null ? `${preview.ctr.toFixed(2)}%` : "—" },
                    { label: "Tx. Lead", val: p(form.clicks) > 0 ? `${((p(form.leads)/p(form.clicks))*100).toFixed(1)}%` : "—" },
                    { label: "Tx. Conv.",val: p(form.leads) > 0 ? `${((p(form.sales)/p(form.leads))*100).toFixed(1)}%` : "—" },
                    { label: "CAC",      val: preview.cac !== null ? formatCurrency(preview.cac) : "—" },
                    { label: "ROAS",     val: preview.roas !== null ? `${preview.roas.toFixed(2)}x` : "—" },
                  ].map(({ label, val }) => (
                    <div key={label} className="rounded-lg border border-[color:var(--dm-border-default)] bg-[var(--dm-bg-elevated)] px-3 py-1.5">
                      <p className="text-xs text-[color:var(--dm-text-tertiary)]">{label}</p>
                      <p className="text-sm font-semibold text-[color:var(--dm-text-primary)]">{val}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : fk === "lancamento" ? (
            /* Lançamento: funil + breakdown imersão / pós */
            <div className="rounded-xl border border-[color:var(--dm-border-default)] bg-[var(--dm-bg-elevated)] p-5 space-y-4">
              {/* Funil de tráfego */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[color:var(--dm-text-tertiary)]">Funil de tráfego</p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <label className={labelCls}>Investimento (R$) *<input required value={form.investment} onChange={set("investment")} onBlur={blurMoney("investment")} placeholder="185.665,00" className={fieldCls} /></label>
                  <label className={labelCls}>CPM (R$)<input value={form.cpm} onChange={set("cpm")} onBlur={blurMoney("cpm")} placeholder="11,47" className={fieldCls} /></label>
                  <label className={labelCls}>Alcance<input value={form.reach} onChange={set("reach")} placeholder="12027081" className={fieldCls} /></label>
                  <label className={labelCls}>Cliques<input value={form.clicks} onChange={set("clicks")} placeholder="89536" className={fieldCls} /></label>
                  <label className={labelCls}>Visualiz. de Página<input value={form.pageViews} onChange={set("pageViews")} placeholder="67996" className={fieldCls} /></label>
                  <label className={labelCls}>Pré-checkout<input value={form.preCheckouts} onChange={set("preCheckouts")} placeholder="2720" className={fieldCls} /></label>
                </div>
              </div>

              {/* Imersão */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[color:var(--dm-text-tertiary)]">
                  Imersão{form.imersao ? ` — ${form.imersao}` : ""}
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <label className={labelCls}>Ingressos Vendidos<input value={form.ingressosVendidos} onChange={set("ingressosVendidos")} placeholder="1140" className={fieldCls} /></label>
                  <label className={labelCls}>Faturamento do Ingresso (R$)<input value={form.faturamentoIngresso} onChange={set("faturamentoIngresso")} onBlur={blurMoney("faturamentoIngresso")} placeholder="28.213,80" className={fieldCls} /></label>
                </div>
              </div>

              {/* Pós-graduação */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[color:var(--dm-text-tertiary)]">Pós-graduação</p>
                <div className="grid grid-cols-2 gap-3">
                  <label className={labelCls}>Vendas de Pós *<input required value={form.vendasPos} onChange={set("vendasPos")} placeholder="93" className={fieldCls} /></label>
                  <label className={labelCls}>Faturamento do Pós (R$)<input value={form.faturamentoPos} onChange={set("faturamentoPos")} onBlur={blurMoney("faturamentoPos")} placeholder="16.503,00" className={fieldCls} /></label>
                </div>
              </div>

              {/* Calculado automaticamente */}
              <div className="rounded-lg px-3 py-3 border border-[color:var(--dm-border-subtle)] bg-[var(--dm-bg-surface)]">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[color:var(--dm-text-tertiary)]">Calculado automaticamente</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { label: "CTR",          val: preview.ctr !== null           ? `${preview.ctr.toFixed(2)}%`           : "—" },
                    { label: "Tx. Página",   val: preview.pageViewRate !== null   ? `${preview.pageViewRate.toFixed(1)}%`  : "—" },
                    { label: "Tx. Pré-chk", val: preview.preCheckoutRate !== null ? `${preview.preCheckoutRate.toFixed(1)}%` : "—" },
                    { label: "Tx. Ingresso", val: preview.txIngresso !== null     ? `${preview.txIngresso.toFixed(1)}%`    : "—" },
                    { label: "Tx. Pós",     val: preview.txPos !== null           ? `${preview.txPos.toFixed(1)}%`          : "—" },
                    { label: "CAC",         val: preview.cacLanc !== null         ? formatCurrency(preview.cacLanc)          : "—" },
                    { label: "ROAS",        val: preview.roasLanc !== null        ? `${preview.roasLanc.toFixed(2)}x`        : "—" },
                  ].map(({ label, val }) => (
                    <div key={label} className="rounded-lg border border-[color:var(--dm-border-default)] bg-[var(--dm-bg-elevated)] px-3 py-1.5">
                      <p className="text-xs text-[color:var(--dm-text-tertiary)]">{label}</p>
                      <p className="text-sm font-semibold text-[color:var(--dm-text-primary)]">{val}</p>
                    </div>
                  ))}
                  {/* Breakdown de faturamento */}
                  {(preview.fatIngresso !== null || preview.fatPos !== null) && (
                    <div className="w-full mt-1 flex flex-wrap gap-2">
                      {preview.fatIngresso !== null && (
                        <div className="rounded-lg border border-[color:var(--dm-border-default)] bg-[var(--dm-bg-elevated)] px-3 py-1.5">
                          <p className="text-xs text-[color:var(--dm-text-tertiary)]">Fat. Ingresso</p>
                          <p className="text-sm font-semibold" style={{ color: "var(--dm-text-primary)" }}>{formatCurrency(preview.fatIngresso)}</p>
                        </div>
                      )}
                      {preview.fatPos !== null && (
                        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 dark:border-emerald-700 dark:bg-emerald-900/20">
                          <p className="text-xs text-emerald-400 dark:text-emerald-400">Fat. Pós</p>
                          <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">{formatCurrency(preview.fatPos)}</p>
                        </div>
                      )}
                      {preview.fatIngresso !== null && preview.fatPos !== null && (
                        <div className="rounded-lg border border-[color:var(--dm-border-default)] bg-[var(--dm-bg-elevated)] px-3 py-1.5">
                          <p className="text-xs text-[color:var(--dm-text-tertiary)]">Total</p>
                          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{formatCurrency(preview.fatIngresso + preview.fatPos)}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* Evento: funil padrão */
            <div className="rounded-xl border border-[color:var(--dm-border-default)] bg-[var(--dm-bg-elevated)] p-5">
              <SectionHead icon={Filter} title="Funil de tráfego" sub="Investimento e métricas de mídia" />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <label className={labelCls}>Investimento (R$) *<input required value={form.investment} onChange={set("investment")} onBlur={blurMoney("investment")} placeholder="8.544,26" className={fieldCls} /></label>
                <label className={labelCls}>CPM (R$)<input value={form.cpm} onChange={set("cpm")} onBlur={blurMoney("cpm")} placeholder="11,47" className={fieldCls} /></label>
                <label className={labelCls}>Alcance<input value={form.reach} onChange={set("reach")} placeholder="744957" className={fieldCls} /></label>
                <label className={labelCls}>Cliques<input value={form.clicks} onChange={set("clicks")} placeholder="4074" className={fieldCls} /></label>
                <label className={labelCls}>Visualiz. de Página<input value={form.pageViews} onChange={set("pageViews")} placeholder="2107" className={fieldCls} /></label>
                <label className={labelCls}>Pré-checkout<input value={form.preCheckouts} onChange={set("preCheckouts")} placeholder="717" className={fieldCls} /></label>
                <label className={labelCls}>Ingressos Vendidos *
                  <input required value={form.sales} onChange={set("sales")} placeholder="46" className={fieldCls} />
                </label>
                <label className={labelCls}>Faturamento (R$)<input value={form.revenue} onChange={set("revenue")} onBlur={blurMoney("revenue")} placeholder="16.309,00" className={fieldCls} /></label>
              </div>

              {/* Métricas personalizadas — livres, só desse registro */}
              <div className="mt-3 rounded-lg px-3 py-3 border border-[color:var(--dm-border-subtle)] bg-[var(--dm-bg-surface)]">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[color:var(--dm-text-tertiary)]">Métricas personalizadas</p>
                {form.customMetrics.length > 0 && (
                  <div className="mb-2 flex flex-col gap-2">
                    {form.customMetrics.map((m) => (
                      <div key={m.id} className="flex flex-wrap items-center gap-2">
                        <input
                          value={m.label}
                          onChange={(e) => updateCustomMetric(m.id, { label: e.target.value })}
                          placeholder="Nome da métrica"
                          className={`${fieldCls} flex-1 min-w-[140px]`}
                        />
                        <input
                          value={m.value}
                          onChange={(e) => updateCustomMetric(m.id, { value: e.target.value })}
                          placeholder="0"
                          className={`${fieldCls} w-24`}
                        />
                        <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400">
                          <input
                            type="checkbox"
                            checked={m.inFunnel}
                            onChange={(e) => updateCustomMetric(m.id, { inFunnel: e.target.checked })}
                            className="h-3.5 w-3.5 accent-brand"
                          />
                          No funil
                        </label>
                        <button
                          type="button"
                          onClick={() => removeCustomMetric(m.id)}
                          aria-label={`Remover métrica ${m.label || "sem nome"}`}
                          className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-red-100 hover:text-red-500 dark:hover:bg-red-900/30 dark:hover:text-red-400"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-1.5">
                  {SUGGESTED_METRICS.filter((s) => !form.customMetrics.some((m) => m.label === s)).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => addCustomMetric(s)}
                      className="inline-flex items-center gap-1 rounded-full border border-dashed px-2.5 py-1 text-[11px] font-medium transition hover:border-[color:var(--dm-primary-border)] hover:text-[color:var(--dm-primary)]"
                      style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-tertiary)" }}
                    >
                      <Plus size={10} /> {s}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => addCustomMetric()}
                    className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition hover:opacity-80"
                    style={{ borderColor: "var(--dm-border-default)", background: "var(--dm-bg-elevated)", color: "var(--dm-text-secondary)" }}
                  >
                    <Plus size={10} /> Campo personalizado
                  </button>
                </div>
              </div>

              <div className="mt-3 rounded-lg px-3 py-3 border border-[color:var(--dm-border-subtle)] bg-[var(--dm-bg-surface)]">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[color:var(--dm-text-tertiary)]">Calculado automaticamente</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { label: "CTR",          val: preview.ctr !== null             ? `${preview.ctr.toFixed(2)}%`             : "—" },
                    { label: "Tx. Página",   val: preview.pageViewRate !== null     ? `${preview.pageViewRate.toFixed(1)}%`    : "—" },
                    { label: "Tx. Pré-chk", val: preview.preCheckoutRate !== null  ? `${preview.preCheckoutRate.toFixed(1)}%` : "—" },
                    { label: "Tx. Ingresso", val: preview.salesRate !== null        ? `${preview.salesRate.toFixed(1)}%`       : "—" },
                    { label: "CAC",          val: preview.cac !== null              ? formatCurrency(preview.cac)              : "—" },
                    { label: "ROAS",         val: preview.roas !== null             ? `${preview.roas.toFixed(2)}x`            : "—" },
                  ].map(({ label, val }) => (
                    <div key={label} className="rounded-lg border border-[color:var(--dm-border-default)] bg-[var(--dm-bg-elevated)] px-3 py-1.5">
                      <p className="text-xs text-[color:var(--dm-text-tertiary)]">{label}</p>
                      <p className="text-sm font-semibold text-[color:var(--dm-text-primary)]">{val}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          </div>

          <div className="flex flex-shrink-0 flex-col-reverse justify-end gap-2 border-t px-5 py-4 sm:flex-row" style={{ borderColor: "var(--dm-border-default)" }}>
            <button type="button" onClick={onClose}
              className="rounded-lg border px-4 py-2 text-sm font-semibold transition hover:opacity-80"
              style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-secondary)" }}>
              Cancelar
            </button>
            <button type="submit"
              className="rounded-lg px-5 py-2 text-sm font-bold text-white transition hover:opacity-90"
              style={{ background: "var(--dm-btn-primary-bg)" }}>
              {isEditing ? "Salvar alterações" : "Adicionar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Product + Turma cell ─────────────────────────────────────────────────────

function ProductCell({ product, turma, tag }: { product: string; turma?: string; tag?: string }) {
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <span>{product}</span>
      {turma && (
        <span className="rounded-full bg-[#16A34A]/10 px-1.5 py-0.5 text-[10px] font-bold text-[#15803D] dark:bg-[#22C55E]/15 dark:text-[#22C55E]">
          T{turma}
        </span>
      )}
      {tag && (
        <span className="inline-flex items-center gap-0.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-[#151821] dark:text-slate-400">
          <Tag size={8} />
          {tag}
        </span>
      )}
    </span>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string; value: string; sub?: string;
  icon: React.ElementType; accent: string; iconColor: string;
}

function StatCard({ label, value, sub, icon: Icon }: StatCardProps) {
  return (
    <article
      className="glass-panel rounded-2xl p-5"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium" style={{ color: "var(--dm-text-secondary)" }}>{label}</p>
          <p className="mt-1 text-xl font-bold" style={{ color: "var(--dm-text-primary)" }}>{value}</p>
          {sub && <p className="mt-0.5 text-xs" style={{ color: "var(--dm-text-tertiary)" }}>{sub}</p>}
        </div>
        <div
          className="flex h-9 w-9 items-center justify-center rounded-lg"
          style={{ backgroundColor: "var(--dm-brand-50)", color: "var(--dm-brand-500)" }}
        >
          <Icon size={17} />
        </div>
      </div>
    </article>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface HistoricalViewProps {
  selectedKind?: HistoricalKind;
  onKindChange?: (kind: HistoricalKind) => void;
}

export function HistoricalView({ selectedKind: propKind, onKindChange }: HistoricalViewProps = {}) {
  const { company } = useCompany();
  const histLabels = company?.settings?.[HISTORY_TAB_LABELS_KEY] as Record<string, string> | undefined;
  const [rows,  setRowsState]  = useState<HistoricalRow[]>(loadRows);
  const [metas, setMetasState] = useState<HistoricalMeta[]>(loadMetas);
  const [internalKind, setInternalKind] = useState<HistoricalKind>("lancamento");
  const selectedKind = propKind ?? internalKind;
  const viewKind = baseKind(selectedKind); // shape de stats/headers/tabela (custom → lancamento)
  const setSelectedKind = (kind: HistoricalKind) => {
    setInternalKind(kind);
    onKindChange?.(kind);
  };
  const [selectedTag, setSelectedTag]   = useState("all");
  const [customTags, setCustomTags]     = useState<Record<HistoricalKind, string[]>>({
    lancamento: [], evento: [], perpetuo: [], instagram: [],
  });
  const [addingTag, setAddingTag]       = useState(false);
  const [newTagDraft, setNewTagDraft]   = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(
    isSupabaseConfigured ? "loading" : "local",
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const [colWidths, setColWidths] = useState<Record<string, number>>({});

  const startResize = useCallback((col: string, startX: number, startWidth: number) => {
    const onMove = (e: MouseEvent) => {
      const newW = Math.max(50, startWidth + (e.clientX - startX));
      setColWidths((prev) => ({ ...prev, [col]: newW }));
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, []);

  // Sort + form state
  const [tableSort, setTableSort]   = useState<TableSortKey>("date-asc");
  const [showForm, setShowForm]     = useState(false);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [form, setForm]             = useState<FormState>(EMPTY_FORM);

  // Persist helpers
  const setRows = useCallback((updater: HistoricalRow[] | ((prev: HistoricalRow[]) => HistoricalRow[])) => {
    setRowsState((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      saveRows(next);
      return next;
    });
  }, []);

  const setMetas = useCallback((updater: HistoricalMeta[] | ((prev: HistoricalMeta[]) => HistoricalMeta[])) => {
    setMetasState((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      saveMetas(next);
      return next;
    });
  }, []);

  // ── Initial Supabase load ──
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    setSyncStatus("loading");
    Promise.all([fetchHistoricalRows(), fetchHistoricalMetas(), fetchUserTags()])
      .then(([remoteRows, remoteMetas, remoteTags]) => {
        setRowsState(remoteRows);
        setMetasState(remoteMetas);
        saveRows(remoteRows);
        saveMetas(remoteMetas);
        setCustomTags(remoteTags);
        setSyncStatus("synced");
      })
      .catch(() => {
        setSyncStatus("error");
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Unique product names for autocomplete in form ──
  const products = useMemo(() => Array.from(new Set(rows.map((r) => r.product))).sort(), [rows]);

  // ── Available tags for the current kind (only those with matching rows) ──
  const kindRows = useMemo(
    () => rows.filter((r) => r.kind === selectedKind),
    [rows, selectedKind],
  );

  const availableTags = useMemo(() => {
    const matches = (r: HistoricalRow, tag: string) =>
      r.tag === tag || r.product.toLowerCase().includes(tag.toLowerCase());
    const predefined = (PREDEFINED_TAGS[selectedKind] ?? []).filter((tag) =>
      kindRows.some((r) => matches(r, tag)),
    );
    const custom = (customTags[selectedKind] ?? []).filter((tag) =>
      kindRows.some((r) => matches(r, tag)),
    );
    return [...predefined, ...custom];
  }, [kindRows, selectedKind, customTags]);

  // custom tags that exist but have no data yet (still show in management)
  const allCustomTags = customTags[selectedKind] ?? [];

  const filtered = useMemo(
    () => (selectedTag === "all"
      ? kindRows
      : kindRows.filter((r) =>
          r.tag === selectedTag || r.product.toLowerCase().includes(selectedTag.toLowerCase()),
        )),
    [kindRows, selectedTag],
  );

  const activeMeta = useMemo(
    () => metas.find((m) => m.product.toLowerCase().includes(selectedTag.toLowerCase())) ?? metas[0] ?? null,
    [metas, selectedTag],
  );

  // ── CSV upload ──
  const handleFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".csv")) { setError("Envie um arquivo .csv"); return; }
    setLoading(true); setError(null);
    try {
      const result = await parseHistoricalCsvFile(file);
      if (result.rows.length === 0) { setError("Nenhum dado encontrado. Verifique o formato."); return; }
      if (isSupabaseConfigured) {
        setSyncStatus("loading");
        const saved = await replaceHistoricalData(result.rows, result.metas);
        setRowsState(saved.rows);
        setMetasState(saved.metas);
        saveRows(saved.rows);
        saveMetas(saved.metas);
        setSyncStatus("synced");
      } else {
        setRows(result.rows);
        setMetas(result.metas);
      }
      setSelectedTag("all");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao processar arquivo.");
      if (isSupabaseConfigured) setSyncStatus("error");
    } finally { setLoading(false); }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
    e.target.value = "";
  };

  // ── Manual entry ──
  const openAdd = useCallback(() => { setForm({ ...EMPTY_FORM, kind: selectedKind }); setEditingIdx(null); setShowForm(true); }, [selectedKind]);

  const openEdit = useCallback((idx: number) => {
    setForm(rowToForm(rows[idx])); setEditingIdx(idx); setShowForm(true);
  }, [rows]);

  const handleFormSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const newRow = buildRow(form, form.kind);
    if (isSupabaseConfigured) {
      setSyncStatus("loading");
      try {
        if (editingIdx !== null && rows[editingIdx]?.id) {
          const saved = await updateHistoricalRow(rows[editingIdx].id!, newRow);
          setRows((prev) => prev.map((r, i) => (i === editingIdx ? saved : r)));
        } else {
          const saved = await insertHistoricalRow(newRow);
          setRows((prev) => [...prev, saved]);
        }
        setSyncStatus("synced");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao salvar.");
        setSyncStatus("error");
        return;
      }
    } else {
      setRows((prev) =>
        editingIdx !== null ? prev.map((r, i) => (i === editingIdx ? newRow : r)) : [...prev, newRow],
      );
    }
    setShowForm(false); setEditingIdx(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, editingIdx, rows, selectedKind, setRows]);

  const handleDuplicate = useCallback(async (idx: number) => {
    const src = rows[idx];
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id: _id, ...rest } = src as HistoricalRow & { id?: string };
    const copy = { ...rest } as HistoricalRow;
    if (isSupabaseConfigured) {
      setSyncStatus("loading");
      try {
        const saved = await insertHistoricalRow(copy);
        setRows((prev) => [...prev, saved]);
        setSyncStatus("synced");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao duplicar.");
        setSyncStatus("error");
      }
    } else {
      setRows((prev) => [...prev, copy]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, setRows]);

  const handleDelete = useCallback(async (idx: number) => {
    if (!confirm("Remover este registro?")) return;
    if (isSupabaseConfigured && rows[idx]?.id) {
      setSyncStatus("loading");
      try {
        await deleteHistoricalRowById(rows[idx].id!);
        setRows((prev) => prev.filter((_, i) => i !== idx));
        setSyncStatus("synced");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao remover.");
        setSyncStatus("error");
      }
    } else {
      setRows((prev) => prev.filter((_, i) => i !== idx));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, setRows]);

  // ── Aggregates ──
  const totals = useMemo(() => {
    const inv = filtered.reduce((s, r) => s + r.investment, 0);
    const rev = filtered.reduce((s, r) => s + r.revenue, 0);
    const sales = filtered.reduce((s, r) => s + r.sales, 0);
    const cacRows = filtered.filter((r) => r.cac > 0);
    const avgCac = cacRows.length ? cacRows.reduce((s, r) => s + r.cac, 0) / cacRows.length : 0;
    return { inv, rev, sales, avgCac, roas: inv > 0 && rev > 0 ? rev / inv : 0 };
  }, [filtered]);

  const chartData = useMemo(() => {
    const map = new Map<string, { label: string; investment: number; revenue: number; sales: number }>();
    filtered.forEach((r) => {
      const cur = map.get(r.monthKey) ?? { label: r.monthLabel, investment: 0, revenue: 0, sales: 0 };
      cur.investment += r.investment;
      cur.revenue    += r.revenue;
      cur.sales      += r.sales;
      map.set(r.monthKey, cur);
    });
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v);
  }, [filtered]);

  const funnel = useMemo(() => {
    if (filtered.length === 0) return [];

    if (viewKind === "instagram") {
      const gained  = filtered.reduce((s, r) => s + ((r as { newFollowers?: number }).newFollowers ?? 0), 0);
      const visits  = filtered.reduce((s, r) => s + r.reach, 0);
      const clicks  = filtered.reduce((s, r) => s + r.clicks, 0);
      const engaged = filtered.reduce((s, r) => s + ((r as { accountsEngaged?: number }).accountsEngaged ?? 0), 0);
      return [
        { label: "Visitas ao Perfil", value: visits,  rate: 100, fromLabel: "" },
        { label: "Seguidores Ganhos", value: gained,  rate: visits > 0 ? (gained / visits) * 100 : 0, fromLabel: "das visitas" },
        { label: "Cliques no Link",   value: clicks,  rate: visits > 0 ? (clicks / visits) * 100 : 0, fromLabel: "das visitas" },
        { label: "Engajamentos",      value: engaged, rate: visits > 0 ? (engaged / visits) * 100 : 0, fromLabel: "das visitas" },
      ];
    }

    if (viewKind === "perpetuo") {
      const reach  = filtered.reduce((s, r) => s + r.reach, 0);
      const clicks = filtered.reduce((s, r) => s + r.clicks, 0);
      const leads  = filtered.reduce((s, r) => s + ((r as { leads?: number }).leads ?? 0), 0);
      const sales  = filtered.reduce((s, r) => s + r.sales, 0);
      return [
        { label: "Alcance",   value: reach,  rate: 100,                                        fromLabel: "" },
        { label: "Cliques",   value: clicks, rate: reach > 0  ? (clicks / reach) * 100  : 0,  fromLabel: "do alcance" },
        { label: "Leads",     value: leads,  rate: clicks > 0 ? (leads  / clicks) * 100 : 0,  fromLabel: "dos cliques" },
        { label: "Vendas/mês",value: sales,  rate: leads > 0  ? (sales  / leads)  * 100 : 0,  fromLabel: "dos leads" },
      ];
    }

    // Lançamento + Evento
    const reach        = filtered.reduce((s, r) => s + r.reach, 0);
    const clicks       = filtered.reduce((s, r) => s + r.clicks, 0);
    const pageViews    = filtered.reduce((s, r) => s + r.pageViews, 0);
    const preCheckouts = filtered.reduce((s, r) => s + r.preCheckouts, 0);
    const sales        = filtered.reduce((s, r) => s + r.sales, 0);
    const salesLabel   = viewKind === "evento" ? "Ingressos Vendidos" : "Vendas";
    const stages = [
      { label: "Alcance",          value: reach,        rate: 100,                                              fromLabel: "" },
      { label: "Cliques",          value: clicks,       rate: reach > 0        ? (clicks / reach) * 100        : 0, fromLabel: "do alcance" },
      { label: "Visualiz. Página", value: pageViews,    rate: clicks > 0       ? (pageViews / clicks) * 100    : 0, fromLabel: "dos cliques" },
      { label: "Pré-checkout",     value: preCheckouts, rate: pageViews > 0    ? (preCheckouts / pageViews) * 100 : 0, fromLabel: "das páginas" },
      { label: salesLabel,         value: sales,        rate: preCheckouts > 0 ? (sales / preCheckouts) * 100  : 0, fromLabel: "dos pré-checkout" },
    ];

    // Métricas personalizadas marcadas "No funil" (só Evento) — agregadas por
    // rótulo entre os registros filtrados, encadeadas após as etapas fixas.
    if (viewKind === "evento") {
      const customAgg = new Map<string, number>();
      for (const r of filtered) {
        for (const m of (r as { customMetrics?: CustomMetric[] }).customMetrics ?? []) {
          if (!m.inFunnel) continue;
          customAgg.set(m.label, (customAgg.get(m.label) ?? 0) + m.value);
        }
      }
      for (const [label, value] of customAgg) {
        const prev = stages[stages.length - 1].value;
        stages.push({ label, value, rate: prev > 0 ? (value / prev) * 100 : 0, fromLabel: "da etapa anterior" });
      }
    }

    return stages;
  }, [filtered, selectedKind]);

  const sortedFiltered = useMemo(() => {
    const arr = [...filtered];
    switch (tableSort) {
      case "date-asc":    return arr.sort((a, b) => a.monthKey.localeCompare(b.monthKey));
      case "date-desc":   return arr.sort((a, b) => b.monthKey.localeCompare(a.monthKey));
      case "invest-desc": return arr.sort((a, b) => b.investment - a.investment);
      case "invest-asc":  return arr.sort((a, b) => a.investment - b.investment);
      default:            return arr;
    }
  }, [filtered, tableSort]);

  const hasData = rows.length > 0;

  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const gridStroke   = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.05)";
  const tickFill     = isDark ? "#6F7686"                : "#9CA3AF";
  const tooltipStyle = {
    borderRadius: 10,
    border: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.07)"}`,
    background: isDark ? "#11131A" : "#FFFFFF",
    color: isDark ? "#F4F5F7" : "#151821",
    fontSize: 12,
  };

  return (
    <>
      {showForm && (
        <EntryForm
          form={form}
          products={products}
          isEditing={editingIdx !== null}
          customTags={customTags[form.kind] ?? []}
          onChange={setForm}
          onSubmit={handleFormSubmit}
          onClose={() => { setShowForm(false); setEditingIdx(null); }}
          onAddTag={async (tag) => {
            const next = { ...customTags, [form.kind]: [...(customTags[form.kind] ?? []), tag] };
            setCustomTags(next);
            if (isSupabaseConfigured) {
              addUserTag(form.kind, tag).catch((err) => {
                console.error("[Histórico] falha ao salvar tag:", err);
                toast.error(`Tag "${tag}" não foi salva: ${err instanceof Error ? err.message : "erro desconhecido"}.`);
                setCustomTags((prev) => ({ ...prev, [form.kind]: (prev[form.kind] ?? []).filter((t) => t !== tag) }));
              });
            }
          }}
        />
      )}

      <div className="space-y-5">
        {/* Kind tabs moved to sidebar — rendered by Dashboard.tsx */}

        {/* ── Dashboard header ── */}
        <div className="glass-panel flex flex-wrap items-start justify-between gap-4 rounded-2xl px-5 py-5 sm:px-6">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Histórico de Lançamentos</h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {hasData
                ? `${filtered.length} registro${filtered.length !== 1 ? "s" : ""} em ${historyKindLabel(selectedKind, histLabels)} · ${kindRows.length} produto${kindRows.length !== 1 ? "s" : ""}`
                : "Nenhum dado ainda. Importe um CSV ou adicione manualmente."}
            </p>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            {/* Sync status badge */}
            {syncStatus === "loading" && (
              <span className="flex items-center gap-1 text-xs text-slate-400">
                <Loader2 size={12} className="animate-spin" /> Sincronizando…
              </span>
            )}
            {syncStatus === "synced" && (
              <span className="flex items-center gap-1 text-xs text-emerald-600">
                <Cloud size={12} /> Sincronizado
              </span>
            )}
            {syncStatus === "local" && (
              <span className="flex items-center gap-1 text-xs text-slate-400">
                <CloudOff size={12} /> Local
              </span>
            )}
            {syncStatus === "error" && (
              <span className="flex items-center gap-1 text-xs text-red-500">
                <CloudOff size={12} /> Falha na sync
              </span>
            )}
            <button
              onClick={openAdd}
              className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-xs font-semibold text-white transition hover:bg-brand-hover"
            >
              <Plus size={13} /> Adicionar
            </button>
            <button
              onClick={() => inputRef.current?.click()}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-600 dark:bg-[#151821] dark:text-slate-300 dark:hover:bg-slate-600"
            >
              <Upload size={13} /> {loading ? "Importando…" : "Importar CSV"}
            </button>
            <input ref={inputRef} type="file" accept=".csv" className="hidden" onChange={onFileChange} title="CSV aceita coluna Tipo (Lançamento/Evento/Perpétuo/Instagram). Sem coluna, entra como Lançamento." />
          </div>
        </div>

        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-600 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">{error}</p>
        )}

        {/* ── Tag filters ── */}
        {hasData && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              {/* "Todos" pill — always visible */}
              <button
                onClick={() => setSelectedTag("all")}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition ${selectedTag === "all" ? "border-transparent bg-brand text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-[#11131A] dark:text-slate-300 dark:hover:bg-slate-700"}`}
              >
                <Package size={10} /> Todos
              </button>

              {/* Predefined + custom tags (only those with data) */}
              {availableTags.map((tag) => {
                const isCustom = allCustomTags.includes(tag);
                return (
                  <div key={tag} className="flex items-center gap-0.5">
                    <button
                      onClick={() => setSelectedTag(selectedTag === tag ? "all" : tag)}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition ${selectedTag === tag ? "border-transparent bg-brand text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-[#11131A] dark:text-slate-300 dark:hover:bg-slate-700"}`}
                    >
                      {isCustom && <Tag size={9} className="opacity-70" />}
                      {tag}
                    </button>
                    {isCustom && (
                      <button
                        onClick={async () => {
                          const next = { ...customTags, [selectedKind]: allCustomTags.filter(t => t !== tag) };
                          setCustomTags(next);
                          if (selectedTag === tag) setSelectedTag("all");
                          try {
                            await deleteUserTag(selectedKind, tag);
                          } catch (err) {
                            console.error("[Histórico] falha ao remover tag:", err);
                            toast.error(`Não foi possível remover a tag "${tag}".`);
                            setCustomTags((prev) => ({ ...prev, [selectedKind]: [...(prev[selectedKind] ?? []), tag] }));
                          }
                        }}
                        className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full text-slate-400 hover:bg-red-100 hover:text-red-500 dark:hover:bg-red-900/30 dark:hover:text-red-400 transition"
                        title="Remover tag"
                      >
                        <X size={9} />
                      </button>
                    )}
                  </div>
                );
              })}

              {/* "+ tag" button — visible only if under the limit */}
              {allCustomTags.length < MAX_CUSTOM_TAGS && isSupabaseConfigured && (
                addingTag ? (
                  <div className="flex items-center gap-1">
                    <input
                      autoFocus
                      value={newTagDraft}
                      onChange={(e) => setNewTagDraft(e.target.value)}
                      onKeyDown={async (e) => {
                        if (e.key === "Enter") {
                          const name = newTagDraft.trim();
                          if (!name || allCustomTags.includes(name)) { setAddingTag(false); setNewTagDraft(""); return; }
                          const next = { ...customTags, [selectedKind]: [...allCustomTags, name] };
                          setCustomTags(next);
                          setNewTagDraft(""); setAddingTag(false);
                          try {
                            await addUserTag(selectedKind, name);
                          } catch (err) {
                            console.error("[Histórico] falha ao salvar tag:", err);
                            toast.error(`Tag "${name}" não foi salva: ${err instanceof Error ? err.message : "erro desconhecido"}.`);
                            setCustomTags((prev) => ({ ...prev, [selectedKind]: (prev[selectedKind] ?? []).filter((t) => t !== name) }));
                          }
                        }
                        if (e.key === "Escape") { setAddingTag(false); setNewTagDraft(""); }
                      }}
                      placeholder="Nome da tag…"
                      className="h-7 rounded-full border border-[#16A34A]/50 bg-white px-3 text-xs outline-none focus:ring-2 focus:ring-[#16A34A]/15 dark:border-[#22C55E]/50 dark:bg-[#11131A] dark:text-slate-200"
                    />
                    <button onClick={() => { setAddingTag(false); setNewTagDraft(""); }} className="text-slate-400 hover:text-slate-600"><X size={12} /></button>
                  </div>
                ) : (
                  <button
                    onClick={() => setAddingTag(true)}
                    className="inline-flex items-center gap-1 rounded-full border border-dashed border-slate-300 px-3 py-1 text-xs font-medium text-slate-400 transition hover:border-[#16A34A] hover:text-[#16A34A] dark:border-slate-600 dark:text-slate-500 dark:hover:border-[#22C55E] dark:hover:text-[#22C55E]"
                  >
                    <Plus size={10} /> Tag personalizada
                  </button>
                )
              )}
            </div>

            {/* Show tag count hint when custom tags exist without data */}
            {allCustomTags.filter(t => !availableTags.includes(t)).length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {allCustomTags.filter(t => !availableTags.includes(t)).map(tag => (
                  <div key={tag} className="flex items-center gap-0.5">
                    <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-slate-200 px-2.5 py-0.5 text-[10px] text-slate-400 dark:border-slate-700 dark:text-slate-600">
                      <Tag size={8} /> {tag} <span className="opacity-60">· sem dados</span>
                    </span>
                    <button
                      onClick={async () => {
                        const next = { ...customTags, [selectedKind]: allCustomTags.filter(t2 => t2 !== tag) };
                        setCustomTags(next);
                        try {
                          await deleteUserTag(selectedKind, tag);
                        } catch (err) {
                          console.error("[Histórico] falha ao remover tag:", err);
                          toast.error(`Não foi possível remover a tag "${tag}".`);
                          setCustomTags((prev) => ({ ...prev, [selectedKind]: [...(prev[selectedKind] ?? []), tag] }));
                        }
                      }}
                      className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full text-slate-300 hover:bg-red-100 hover:text-red-400 transition"
                    >
                      <X size={8} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Stat cards ── */}
        {viewKind === "instagram" ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Seguidores Ganhos"  value={formatNumber(filtered.reduce((s,r)=>s+((r as {newFollowers?:number}).newFollowers??0),0))} icon={TrendingUp}   accent="bg-emerald-500" iconColor="text-emerald-500" />
            <StatCard label="Visitas ao Perfil"  value={formatNumber(filtered.reduce((s,r)=>s+r.reach,0))}                                         icon={Target}       accent="bg-teal-500"    iconColor="text-teal-500" />
            <StatCard label="Cliques no Link"    value={formatNumber(filtered.reduce((s,r)=>s+r.clicks,0))}                                         icon={BarChart2}    accent="bg-slate-400"  iconColor="text-slate-500" />
            <StatCard label="Total Engajamentos" value={formatNumber(filtered.reduce((s,r)=>s+((r as {accountsEngaged?:number}).accountsEngaged??0),0))} icon={ShoppingCart} accent="bg-amber-500" iconColor="text-amber-500" />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard label="Total Investido"   value={formatCurrency(totals.inv)}  icon={DollarSign}  accent="bg-slate-400"    iconColor="text-slate-500" />
            <StatCard label="Total Faturamento" value={formatCurrency(totals.rev)}  icon={TrendingUp}  accent="bg-emerald-500" iconColor="text-emerald-500" sub={totals.roas > 0 ? `ROAS ${totals.roas.toFixed(2)}x` : undefined} />
            <StatCard label={viewKind === "evento" ? "Ingressos Vendidos" : viewKind === "perpetuo" ? "Vendas/Mês (total)" : "Total de Vendas"}
                      value={formatNumber(totals.sales)} icon={ShoppingCart} accent="bg-teal-500" iconColor="text-teal-500" />
            <StatCard label="ROAS"              value={totals.roas > 0 ? `${totals.roas.toFixed(2)}x` : "—"} icon={Target}     accent="bg-amber-500"  iconColor="text-amber-500" />
            <StatCard label="CAC Médio"         value={totals.avgCac > 0 ? formatCurrency(totals.avgCac) : "—"} icon={BarChart2} accent="bg-slate-400"  iconColor="text-slate-500" />
          </div>
        )}

        {/* ── Empty-state onboarding ── */}
        {!hasData && (
          <HistoricoEmpty
            onImportCsv={() => inputRef.current?.click()}
            onAddManual={openAdd}
          />
        )}

        {/* ── Charts (only when data loaded) ── */}
        {hasData && chartData.length > 0 && (
          <div className="grid gap-5 xl:grid-cols-5">
            {/* Monthly trend — takes 3 cols */}
            <article className="glass-panel rounded-2xl p-5 xl:col-span-3">
              <h3 className="mb-4 text-sm font-semibold text-slate-800 dark:text-slate-200">Evolução Mensal</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="gradInv" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#94A3B8" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#94A3B8" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gradRev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#059669" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#059669" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                    <XAxis dataKey="label" stroke={tickFill} tick={{ fontSize: 11, fill: tickFill }} />
                    <YAxis yAxisId="left"  stroke={tickFill} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 10, fill: tickFill }} />
                    <YAxis yAxisId="right" orientation="right" stroke={tickFill} tick={{ fontSize: 10, fill: tickFill }} />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(value, name) =>
                        name === "Vendas" ? [String(value), name] : [formatCurrency(Number(value)), name]
                      }
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar yAxisId="left" dataKey="investment" name="Investimento" fill="#94A3B8" opacity={0.85} radius={[3, 3, 0, 0]} />
                    <Bar yAxisId="left" dataKey="revenue"    name="Faturamento"  fill="#059669" opacity={0.8} radius={[3, 3, 0, 0]} />
                    <Line yAxisId="right" type="monotone" dataKey="sales" name="Vendas" stroke="#22C55E" strokeWidth={2} dot={{ r: 3, fill: "#22C55E" }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </article>

            {/* Funnel — takes 2 cols */}
            {funnel.length > 0 && funnel[0].value > 0 && (
              <article className="rounded-xl border border-slate-200 bg-white p-5 xl:col-span-2 dark:border-slate-700 dark:bg-[#11131A]">
                <h3 className="mb-4 text-sm font-semibold text-slate-800 dark:text-slate-200">Funil de Conversão</h3>
                <div className="space-y-3">
                  {funnel.map((stage, idx) => {
                    const maxVal = funnel[0].value;
                    const widthPct = maxVal > 0 ? (stage.value / maxVal) * 100 : 0;
                    const colors = ["bg-[#14532D]", "bg-[#15803D]", "bg-[#16A34A]", "bg-[#22C55E]", "bg-[#4ADE80]", "bg-[#15803D]", "bg-[#16A34A]", "bg-[#22C55E]"];
                    return (
                      <div key={stage.label}>
                        <div className="mb-1 flex items-center justify-between text-xs">
                          <span className="font-medium text-slate-700 dark:text-slate-300">{stage.label}</span>
                          <span className="text-slate-500 dark:text-slate-400">{formatNumber(stage.value)}{idx > 0 ? ` · ${formatPercent(stage.rate)}` : ""}</span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-[#151821]">
                          <div className={`h-full rounded-full ${colors[idx % colors.length]}`} style={{ width: `${widthPct.toFixed(1)}%` }} />
                        </div>
                        {idx < funnel.length - 1 && (
                          <div className="mt-1 flex justify-center">
                            <ArrowRight size={10} className="text-slate-300 dark:text-slate-600" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </article>
            )}
          </div>
        )}

        {/* ── META comparison ── */}
        {hasData && activeMeta && (
          <article className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 dark:border-slate-700 dark:bg-[#11131A]">
            <h3 className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-200">Comparativo vs META</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {[
                { label: "Invest./mês",  actual: totals.inv / Math.max(1, chartData.length), target: activeMeta.investment,      fmt: formatCurrency,                         lowerIsBetter: false },
                { label: "CPM (R$)",     actual: filtered.reduce((s, r) => s + r.cpm, 0) / Math.max(1, filtered.length),         target: activeMeta.cpm, fmt: (v: number) => `R$ ${v.toFixed(2)}`, lowerIsBetter: true },
                { label: "CTR (%)",      actual: filtered.reduce((s, r) => s + r.ctr, 0) / Math.max(1, filtered.length),         target: activeMeta.ctr, fmt: (v: number) => `${v.toFixed(2)}%`, lowerIsBetter: false },
                { label: "Tx. Página",   actual: filtered.reduce((s, r) => s + r.pageViewRate, 0) / Math.max(1, filtered.length),    target: activeMeta.pageViewRate, fmt: (v: number) => `${v.toFixed(1)}%`, lowerIsBetter: false },
                { label: "Tx. Pré-chk", actual: filtered.reduce((s, r) => s + r.preCheckoutRate, 0) / Math.max(1, filtered.length), target: activeMeta.preCheckoutRate, fmt: (v: number) => `${v.toFixed(1)}%`, lowerIsBetter: false },
                { label: "Vendas/mês",  actual: totals.sales / Math.max(1, chartData.length), target: activeMeta.salesTarget, fmt: (v: number) => v.toFixed(0), lowerIsBetter: false },
              ].map(({ label, actual, target, fmt, lowerIsBetter }) => {
                if (target === 0) return null;
                const beating = lowerIsBetter ? actual <= target : actual >= target;
                const pct = target > 0 ? (actual / target) * 100 : 0;
                return (
                  <div key={label} className={`rounded-lg border p-3 ${beating ? "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/20" : "border-red-100 bg-red-50 dark:border-red-800 dark:bg-red-900/20"}`}>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-200">{fmt(actual)}</p>
                    <div className="mt-1 flex items-center gap-1">
                      {beating ? <CheckCircle2 size={11} className="text-emerald-500" /> : <XCircle size={11} className="text-red-400" />}
                      <p className="text-xs text-slate-500 dark:text-slate-400">meta: {fmt(target)}</p>
                    </div>
                    <div className="mt-1.5 h-1 w-full rounded-full bg-slate-200 dark:bg-[#151821]">
                      <div className={`h-1 rounded-full ${beating ? "bg-emerald-500" : "bg-red-400"}`} style={{ width: `${Math.min(100, pct).toFixed(0)}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </article>
        )}

        {/* ── Data table ── */}
        {hasData && (
          <article className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-[#11131A]">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Dados Mensais Detalhados</h3>
              <div className="flex items-center gap-2">
                {/* Sort control */}
                <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-0.5 dark:border-slate-600 dark:bg-[#151821]">
                  {([
                    { key: "date-asc",    Icon: ArrowUp,   title: "Mais antigo primeiro" },
                    { key: "date-desc",   Icon: ArrowDown, title: "Mais novo primeiro"   },
                    { key: "invest-desc", Icon: ArrowUpDown, title: "Maior investimento" },
                    { key: "invest-asc",  Icon: ArrowDown, title: "Menor investimento"  },
                  ] as const).map(({ key, Icon, title }) => (
                    <button
                      key={key}
                      type="button"
                      title={title}
                      onClick={() => setTableSort(key)}
                      className={`flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold transition ${
                        tableSort === key
                          ? "bg-white text-[#16A34A] shadow-sm dark:bg-[#11131A] dark:text-[#22C55E]"
                          : "text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
                      }`}
                    >
                      <Icon size={10} />
                      {key === "date-asc"    ? "Antigo"  :
                       key === "date-desc"   ? "Novo"    :
                       key === "invest-desc" ? "Maior $" : "Menor $"}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-[color:var(--dm-text-tertiary)]">{sortedFiltered.length} registros</p>
                {Object.keys(colWidths).length > 0 && (
                  <button
                    type="button"
                    onClick={() => setColWidths({})}
                    className="flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-400 transition hover:border-[#16A34A]/40 hover:text-[#16A34A] dark:border-slate-600 dark:bg-[#151821] dark:text-slate-500 dark:hover:text-[#22C55E]"
                    title="Voltar ao ajuste automático"
                  >
                    ↺ Redefinir
                  </button>
                )}
              </div>
            </div>
            <div className="overflow-x-auto">
              {(() => {
                const headers = viewKind === "instagram"
                  ? ["Mês","Produto","Seguid. Ganhos","Perdidos","Visitas","Alcance","Cliques","Curtidas","Comentários","Compart.","Tx. Eng.","Ações"]
                  : viewKind === "perpetuo"
                  ? ["Mês","Produto","Investimento","Alcance","Cliques","CTR","Leads","Vendas","Receita","MRR","CAC","ROAS","Ações"]
                  : viewKind === "lancamento"
                  ? ["Mês","Produto","Imersão","Investimento","Alcance","Cliques","CTR","Pag. View","Pré-chk","Ingressos","Fat. Ingresso","Vendas Pós","Fat. Pós","CAC","ROAS","Ações"]
                  : ["Mês","Produto","Investimento","Alcance","Cliques","CTR","Pag. View","Pré-chk","Ingressos","Faturamento","CAC","ROAS","Ações"];
                const hasCustom = Object.keys(colWidths).length > 0;
                const totalW = hasCustom
                  ? headers.reduce((s, h) => s + (colWidths[h] ?? DEFAULT_COL_WIDTHS[h] ?? 90), 0)
                  : undefined;
                return (
              <table
                style={hasCustom ? { tableLayout: "fixed", width: totalW } : { tableLayout: "auto", width: "100%" }}
                className="divide-y divide-slate-200 text-xs dark:divide-slate-700"
              >
                <thead className="bg-slate-50 text-left uppercase tracking-wide text-slate-500 dark:bg-[#151821]/50 dark:text-slate-400">
                  <tr>
                    {headers.map((h) => {
                      const w = colWidths[h] ?? DEFAULT_COL_WIDTHS[h] ?? 90;
                      return (
                        <th
                          key={h}
                          style={hasCustom ? { width: w, position: "relative" } : { position: "relative" }}
                          className="px-3 py-2 font-semibold overflow-hidden text-ellipsis whitespace-nowrap group/th"
                          title={h}
                        >
                          {h}
                          {h !== "Ações" && (
                            <div
                              onMouseDown={(e) => {
                                e.preventDefault();
                                const th = e.currentTarget.parentElement as HTMLTableCellElement;
                                startResize(h, e.clientX, th.offsetWidth);
                              }}
                              style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 8, cursor: "col-resize" }}
                              className="select-none flex items-center justify-center"
                            >
                              <div
                                style={{ width: 1, height: "60%" }}
                                className="bg-slate-200 group-hover/th:bg-[#16A34A] dark:bg-slate-600 dark:group-hover/th:bg-[#22C55E] transition-colors rounded-full"
                              />
                            </div>
                          )}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700 dark:divide-slate-700 dark:text-slate-300">
                  {sortedFiltered.map((r, i) => {
                    const realIdx = rows.indexOf(r);
                    const rx = r as unknown as Record<string, number>;
                    const actionBtns = (
                      <td className="whitespace-nowrap px-3 py-2">
                        <div className="flex items-center gap-0.5">
                          <button onClick={() => openEdit(realIdx)} className="rounded p-1.5 text-slate-500 hover:bg-[#16A34A]/10 hover:text-[#16A34A] dark:text-slate-400 dark:hover:bg-[#22C55E]/15 dark:hover:text-[#22C55E]" title="Editar">
                            <Pencil size={13} />
                          </button>
                          <button onClick={() => handleDuplicate(realIdx)} className="rounded p-1.5 text-slate-500 hover:bg-emerald-50 hover:text-emerald-600 dark:text-slate-400 dark:hover:bg-emerald-900/30 dark:hover:text-emerald-400" title="Duplicar">
                            <Copy size={13} />
                          </button>
                          <button onClick={() => handleDelete(realIdx)} className="rounded p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-500 dark:text-slate-400 dark:hover:bg-red-900/30 dark:hover:text-red-400" title="Excluir">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    );
                    if (baseKind(r.kind) === "instagram") {
                      // reach → profileVisits, clicks → followersGained (repurposed in buildRow)
                      const gained = r.clicks ?? 0;
                      const net    = (rx.totalFollowers ?? 0);
                      const lost   = gained - net;
                      const visits = r.reach ?? 0;
                      const impressions = rx.accountsReached ?? 0;
                      const engRate = rx.engagementRate ?? 0;
                      return (
                        <tr key={i} className="group hover:bg-slate-50 dark:hover:bg-slate-700/50">
                          <td className="whitespace-nowrap px-3 py-2 font-medium">{r.monthLabel}</td>
                          <td className="whitespace-nowrap px-3 py-2">
                            <ProductCell product={r.product} turma={r.turma} tag={r.tag} />
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-emerald-600 dark:text-emerald-400 font-semibold">{formatNumber(gained)}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-red-500">{lost > 0 ? `-${formatNumber(lost)}` : "—"}</td>
                          <td className="whitespace-nowrap px-3 py-2">{visits > 0 ? formatNumber(visits) : "—"}</td>
                          <td className="whitespace-nowrap px-3 py-2">{impressions > 0 ? formatNumber(impressions) : "—"}</td>
                          <td className="whitespace-nowrap px-3 py-2">{r.clicks > 0 ? formatNumber(r.clicks) : "—"}</td>
                          <td className="whitespace-nowrap px-3 py-2">{rx.likes > 0 ? formatNumber(rx.likes) : "—"}</td>
                          <td className="whitespace-nowrap px-3 py-2">{rx.comments > 0 ? formatNumber(rx.comments) : "—"}</td>
                          <td className="whitespace-nowrap px-3 py-2">{rx.shares > 0 ? formatNumber(rx.shares) : "—"}</td>
                          <td className="whitespace-nowrap px-3 py-2">{engRate > 0 ? `${engRate.toFixed(2)}%` : "—"}</td>
                          {actionBtns}
                        </tr>
                      );
                    }
                    if (baseKind(r.kind) === "perpetuo") {
                      const leads = rx.leads ?? 0;
                      const mrr   = rx.mrr   ?? 0;
                      return (
                        <tr key={i} className="group hover:bg-slate-50 dark:hover:bg-slate-700/50">
                          <td className="whitespace-nowrap px-3 py-2 font-medium">{r.monthLabel}</td>
                          <td className="whitespace-nowrap px-3 py-2">
                            <ProductCell product={r.product} turma={r.turma} tag={r.tag} />
                          </td>
                          <td className="whitespace-nowrap px-3 py-2">{r.investment > 0 ? formatCurrency(r.investment) : "—"}</td>
                          <td className="whitespace-nowrap px-3 py-2">{r.reach > 0 ? formatNumber(r.reach) : "—"}</td>
                          <td className="whitespace-nowrap px-3 py-2">{r.clicks > 0 ? formatNumber(r.clicks) : "—"}</td>
                          <td className="whitespace-nowrap px-3 py-2">{r.ctr > 0 ? `${r.ctr.toFixed(2)}%` : "—"}</td>
                          <td className="whitespace-nowrap px-3 py-2 font-semibold">{leads > 0 ? formatNumber(leads) : "—"}</td>
                          <td className="whitespace-nowrap px-3 py-2">{r.sales > 0 ? formatNumber(r.sales) : "—"}</td>
                          <td className="whitespace-nowrap px-3 py-2">{r.revenue > 0 ? formatCurrency(r.revenue) : "—"}</td>
                          <td className="whitespace-nowrap px-3 py-2">{mrr > 0 ? formatCurrency(mrr) : "—"}</td>
                          <td className="whitespace-nowrap px-3 py-2">{r.cac > 0 ? formatCurrency(r.cac) : "—"}</td>
                          <td className="whitespace-nowrap px-3 py-2">{r.roas > 0 ? `${r.roas.toFixed(2)}x` : "—"}</td>
                          {actionBtns}
                        </tr>
                      );
                    }
                    // lancamento
                    if (baseKind(r.kind) === "lancamento") {
                      const ingressos   = (rx.ingressosVendidos   as number) || 0;
                      const fatIngresso = (rx.faturamentoIngresso  as number) || 0;
                      const vendPos     = (rx.vendasPos            as number) || r.sales;
                      // Retrocompat: se fatPos/fatIngresso não existem, revenue vai tudo em Fat. Pós
                      const fatPos      = (rx.faturamentoPos       as number) ||
                                          (fatIngresso === 0 ? r.revenue : 0);
                      const imersao     = (r as unknown as Record<string, unknown>).imersao as string | undefined;
                      return (
                        <tr key={i} className="group hover:bg-slate-50 dark:hover:bg-slate-700/50">
                          <td className="whitespace-nowrap px-3 py-2 font-medium">{r.monthLabel}</td>
                          <td className="whitespace-nowrap px-3 py-2">
                            <ProductCell product={r.product} turma={r.turma} tag={r.tag} />
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 max-w-[120px] truncate text-[color:var(--dm-text-tertiary)]" title={imersao}>
                            {imersao ?? "—"}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2">{r.investment > 0 ? formatCurrency(r.investment) : "—"}</td>
                          <td className="whitespace-nowrap px-3 py-2">{r.reach > 0 ? formatNumber(r.reach) : "—"}</td>
                          <td className="whitespace-nowrap px-3 py-2">{r.clicks > 0 ? formatNumber(r.clicks) : "—"}</td>
                          <td className="whitespace-nowrap px-3 py-2">{r.ctr > 0 ? `${r.ctr.toFixed(2)}%` : "—"}</td>
                          <td className="whitespace-nowrap px-3 py-2">{r.pageViews > 0 ? formatNumber(r.pageViews) : "—"}</td>
                          <td className="whitespace-nowrap px-3 py-2">{r.preCheckouts > 0 ? formatNumber(r.preCheckouts) : "—"}</td>
                          <td className="whitespace-nowrap px-3 py-2 font-semibold text-teal-600 dark:text-teal-400">{ingressos > 0 ? formatNumber(ingressos) : "—"}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-teal-600 dark:text-teal-400">{fatIngresso > 0 ? formatCurrency(fatIngresso) : "—"}</td>
                          <td className="whitespace-nowrap px-3 py-2 font-semibold text-emerald-600 dark:text-emerald-400">{vendPos > 0 ? formatNumber(vendPos) : "—"}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-emerald-600 dark:text-emerald-400">{fatPos > 0 ? formatCurrency(fatPos) : "—"}</td>
                          <td className="whitespace-nowrap px-3 py-2">{r.cac > 0 ? formatCurrency(r.cac) : "—"}</td>
                          <td className="whitespace-nowrap px-3 py-2">{r.roas > 0 ? `${r.roas.toFixed(2)}x` : "—"}</td>
                          {actionBtns}
                        </tr>
                      );
                    }
                    // evento
                    return (
                      <tr key={i} className="group hover:bg-slate-50 dark:hover:bg-slate-700/50">
                        <td className="whitespace-nowrap px-3 py-2 font-medium">{r.monthLabel}</td>
                        <td className="whitespace-nowrap px-3 py-2">
                          <ProductCell product={r.product} turma={r.turma} tag={r.tag} />
                        </td>
                        <td className="whitespace-nowrap px-3 py-2">{r.investment > 0 ? formatCurrency(r.investment) : "—"}</td>
                        <td className="whitespace-nowrap px-3 py-2">{r.reach > 0 ? formatNumber(r.reach) : "—"}</td>
                        <td className="whitespace-nowrap px-3 py-2">{r.clicks > 0 ? formatNumber(r.clicks) : "—"}</td>
                        <td className="whitespace-nowrap px-3 py-2">{r.ctr > 0 ? `${r.ctr.toFixed(2)}%` : "—"}</td>
                        <td className="whitespace-nowrap px-3 py-2">{r.pageViews > 0 ? formatNumber(r.pageViews) : "—"}</td>
                        <td className="whitespace-nowrap px-3 py-2">{r.preCheckouts > 0 ? formatNumber(r.preCheckouts) : "—"}</td>
                        <td className="whitespace-nowrap px-3 py-2 font-semibold">{r.sales > 0 ? formatNumber(r.sales) : "—"}</td>
                        <td className="whitespace-nowrap px-3 py-2">{r.revenue > 0 ? formatCurrency(r.revenue) : "—"}</td>
                        <td className="whitespace-nowrap px-3 py-2">{r.cac > 0 ? formatCurrency(r.cac) : "—"}</td>
                        <td className="whitespace-nowrap px-3 py-2">{r.roas > 0 ? `${r.roas.toFixed(2)}x` : "—"}</td>
                        {actionBtns}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
                );
              })()}
            </div>
          </article>
        )}
      </div>
    </>
  );
}
