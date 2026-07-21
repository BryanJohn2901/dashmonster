"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, ExternalLink, Plus, SlidersHorizontal, Trash2, Edit2, X, Search, GripVertical } from "lucide-react";
import { ALL_KPI_OPTIONS, KPI_GROUPS } from "@/lib/templates";
import {
  evaluateFormula, validateFormula, formatCustom, newCustomMetricId,
  type CustomMetric, type CustomFormat,
} from "@/lib/customMetrics";

const TABLE_CONFIG_KEY = "gsah_profile_table_config_v1";
const DEFAULT_COLS = ["spend", "reach", "leads", "sales", "revenue", "roas"];
const ITEMS_PER_PAGE = 15;

const ROAS_GREEN = "#05CD99";
const ROAS_AMBER = "#F4A60D";
const ROAS_RED   = "#EE5D50";
const BRAND_GRAD  = "linear-gradient(135deg,#16A34A 0%,#15803D 100%)";

// ─── Tipos ───────────────────────────────────────────────────────────────────

type BreakdownView = "campaign" | "adset" | "ad";

export interface CampaignRow {
  id: string;
  name: string;
  values: Record<string, number>; // raw + derive já calculados
}

interface TableConfig {
  cols: string[];
  custom: CustomMetric[];
  sort: { col: string; dir: "asc" | "desc" } | null;
  view?: BreakdownView;
}

interface ResolvedMetric {
  id: string;
  label: string;
  tooltip?: string;
  invert?: boolean;
  fmt: (v: number) => string;
  isCustom: boolean;
  custom?: CustomMetric;
}

const FORMAT_LABELS: { value: CustomFormat; label: string }[] = [
  { value: "currency",   label: "Moeda (R$)" },
  { value: "int",        label: "Número" },
  { value: "decimal",    label: "Decimal" },
  { value: "percent",    label: "Porcentagem (%)" },
  { value: "multiplier", label: "Multiplicador (x)" },
];

// Conjunto de ids built-in válidos como operandos de fórmula.
const ALLOWED_FORMULA_IDS = new Set(ALL_KPI_OPTIONS.map((k) => k.id));

// ─── Persistência ───────────────────────────────────────────────────────────

const VALID_VIEWS = new Set<BreakdownView>(["campaign", "adset", "ad"]);

function loadConfig(profileId: string): TableConfig {
  const fallback: TableConfig = { cols: DEFAULT_COLS, custom: [], sort: null, view: "campaign" };
  if (typeof window === "undefined") return fallback;
  try {
    const stored = JSON.parse(localStorage.getItem(TABLE_CONFIG_KEY) ?? "{}") as Record<string, Partial<TableConfig>>;
    const saved = stored[profileId];
    if (!saved) return fallback;
    const custom = Array.isArray(saved.custom) ? saved.custom : [];
    const known = new Set([...ALLOWED_FORMULA_IDS, ...custom.map((c) => c.id)]);
    const cols = (Array.isArray(saved.cols) ? saved.cols : DEFAULT_COLS).filter((id) => known.has(id));
    return {
      cols: cols.length > 0 ? cols : DEFAULT_COLS,
      custom,
      sort: saved.sort ?? null,
      view: saved.view && VALID_VIEWS.has(saved.view) ? saved.view : "campaign",
    };
  } catch {
    return fallback;
  }
}

// ─── Componente ───────────────────────────────────────────────────────────────

const VIEW_OPTIONS: { value: BreakdownView; label: string; labelPlural: string }[] = [
  { value: "campaign", label: "Campanha",            labelPlural: "campanhas" },
  { value: "adset",    label: "Conjunto de anúncio", labelPlural: "conjuntos" },
  { value: "ad",       label: "Anúncio",             labelPlural: "anúncios"  },
];

export function CampaignMetricsTable({
  profileId, campaignRows, adsetRows, adRows, totalsValues,
  adLinks, adLinksLoading, statusByView, drillDown,
  onViewChange, onCampaignDrillDown, onAdsetDrillDown,
}: {
  profileId: string;
  campaignRows: CampaignRow[];
  adsetRows?: CampaignRow[];
  adRows?: CampaignRow[];
  totalsValues: Record<string, number>;
  adLinks?: Record<string, string>;
  adLinksLoading?: boolean;
  statusByView?: Partial<Record<BreakdownView, Record<string, string>>>;
  drillDown?: { campaignId: string; campaignName: string; adsetId?: string; adsetName?: string } | null;
  onViewChange?: (view: BreakdownView) => void;
  onCampaignDrillDown?: (id: string, name: string) => void;
  onAdsetDrillDown?: (id: string, name: string) => void;
}) {
  const [config, setConfig] = useState<TableConfig>(() => loadConfig(profileId));
  const [view, setView] = useState<BreakdownView>(() => config.view ?? "campaign");
  const [page, setPage] = useState(1);

  const persist = (next: TableConfig) => {
    setConfig(next);
    try {
      const stored = JSON.parse(localStorage.getItem(TABLE_CONFIG_KEY) ?? "{}") as Record<string, TableConfig>;
      localStorage.setItem(TABLE_CONFIG_KEY, JSON.stringify({ ...stored, [profileId]: next }));
    } catch {}
  };

  const changeView = (v: BreakdownView) => {
    setView(v);
    onViewChange?.(v);
    persist({ ...config, view: v });
  };

  useEffect(() => setPage(1), [view]);
  const { cols, custom, sort } = config;

  // ── Resolução de métricas (built-in + custom) ──────────────────────────────
  const metricById = useMemo(() => {
    const builtIn = new Map<string, ResolvedMetric>(
      ALL_KPI_OPTIONS.map((k) => [k.id, {
        id: k.id, label: k.label, tooltip: k.tooltip, invert: k.invert,
        fmt: k.format, isCustom: false,
      }]),
    );
    for (const cm of custom) {
      builtIn.set(cm.id, {
        id: cm.id, label: cm.label, invert: cm.invert,
        fmt: (v: number) => formatCustom(v, cm.format), isCustom: true, custom: cm,
      });
    }
    return builtIn;
  }, [custom]);

  const resolveMetric = (id: string): ResolvedMetric | undefined => metricById.get(id);

  const metricValue = (m: ResolvedMetric, values: Record<string, number>): number | null => {
    if (m.isCustom) return evaluateFormula(m.custom!.formula, values);
    const v = values[m.id];
    return typeof v === "number" && Number.isFinite(v) ? v : 0;
  };

  // ── Rows ativas conforme view selecionada ──────────────────────────────────
  const activeRows = view === "adset" ? (adsetRows ?? campaignRows) : view === "ad" ? (adRows ?? campaignRows) : campaignRows;
  const viewMeta   = VIEW_OPTIONS.find((v) => v.value === view)!;

  // ── Ordenação ──────────────────────────────────────────────────────────────
  const handleSort = (col: string) => {
    const next: TableConfig["sort"] =
      sort && sort.col === col
        ? { col, dir: sort.dir === "desc" ? "asc" : "desc" }
        : { col, dir: "desc" };
    persist({ ...config, sort: next });
  };

  const sortedRows = useMemo(() => {
    if (!sort) return activeRows;
    const dir = sort.dir === "asc" ? 1 : -1;
    const m = sort.col === "campaign" ? null : resolveMetric(sort.col);
    return [...activeRows].sort((a, b) => {
      if (sort.col === "campaign") return a.name.localeCompare(b.name) * dir;
      if (!m) return 0;
      const va = metricValue(m, a.values) ?? 0;
      const vb = metricValue(m, b.values) ?? 0;
      return (va - vb) * dir;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRows, sort, custom]);

  // ── Menu de contexto ───────────────────────────────────────────────────────
  const [menu, setMenu] = useState<{ x: number; y: number; index: number; mode: "root" | "replace" | "add" } | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(null);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenu(null); };
    const onScroll = () => setMenu(null);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [menu]);

  const openMenu = (e: React.MouseEvent, index: number) => {
    e.preventDefault();
    const x = Math.min(e.clientX, window.innerWidth - 280);
    const y = Math.min(e.clientY, window.innerHeight - 320);
    setMenu({ x, y, index, mode: "root" });
  };

  const replaceCol = (index: number, id: string) => {
    if (cols.includes(id) && cols[index] !== id) {
      // evita duplicar: se já existe, só remove a antiga posição e mantém a existente
      const next = cols.filter((_, i) => i !== index);
      persist({ ...config, cols: next });
    } else {
      const next = [...cols];
      next[index] = id;
      persist({ ...config, cols: next });
    }
    setMenu(null);
  };

  const addColAfter = (index: number, id: string) => {
    if (cols.includes(id)) { setMenu(null); return; }
    const next = [...cols];
    next.splice(index + 1, 0, id);
    persist({ ...config, cols: next });
    setMenu(null);
  };

  const removeCol = (index: number) => {
    if (cols.length <= 1) return;
    persist({ ...config, cols: cols.filter((_, i) => i !== index) });
    setMenu(null);
  };

  // ── Modais ────────────────────────────────────────────────────────────────
  const [showCols, setShowCols] = useState(false);
  const [builder, setBuilder] = useState<{ editing: CustomMetric | null; fromCol: number | null } | null>(null);

  const saveCustom = (cm: CustomMetric, fromCol: number | null) => {
    const exists = custom.some((c) => c.id === cm.id);
    const nextCustom = exists ? custom.map((c) => (c.id === cm.id ? cm : c)) : [...custom, cm];
    let nextCols = cols;
    if (!exists) {
      if (fromCol != null && fromCol >= 0) { nextCols = [...cols]; nextCols[fromCol] = cm.id; }
      else if (!cols.includes(cm.id)) nextCols = [...cols, cm.id];
    }
    persist({ ...config, custom: nextCustom, cols: nextCols });
    setBuilder(null);
  };

  const deleteCustom = (id: string) => {
    persist({
      ...config,
      custom: custom.filter((c) => c.id !== id),
      cols: cols.filter((c) => c !== id),
    });
  };

  // ── Render célula ──────────────────────────────────────────────────────────
  const renderCell = (id: string, values: Record<string, number>, isFooter = false) => {
    const m = resolveMetric(id);
    if (!m) return <span className="text-slate-400 dark:text-slate-600">—</span>;
    const val = metricValue(m, values);

    if (id === "roas") {
      const spend = values.spend ?? 0;
      if (spend <= 0 || val == null || val === 0) return <span className="text-slate-400 dark:text-slate-600">—</span>;
      const cls = val >= 3   ? "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400 ring-emerald-500/20"
                : val >= 1.5 ? "bg-slate-500/10 text-slate-600 dark:bg-slate-500/20 dark:text-slate-300 ring-slate-500/20"
                : val >= 1   ? "bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400 ring-amber-500/20"
                :              "bg-red-500/10 text-red-600 dark:bg-red-500/20 dark:text-red-400 ring-red-500/20";
      return (
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ${cls}`}
          style={{ fontFamily: "var(--font-display)" }}>
          {val.toFixed(2)}x
        </span>
      );
    }

    if (id === "ctr" || id === "ctr_all") {
      if (val == null || val === 0) return <span className="text-slate-400 dark:text-slate-600">—</span>;
      const cls = val >= 3   ? "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400"
                : val >= 1.5 ? "bg-slate-500/10 text-slate-600 dark:bg-slate-500/20 dark:text-slate-300"
                : val >= 0.5 ? "bg-slate-500/10 text-slate-600 dark:bg-slate-500/20 dark:text-slate-400"
                :              "bg-red-500/10 text-red-600 dark:bg-red-500/20 dark:text-red-400";
      return (
        <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-bold ${cls}`}
          style={{ fontFamily: "var(--font-display)" }}>
          {val.toFixed(2)}%
        </span>
      );
    }

    if (val == null || val === 0) {
      if (isFooter) return <span className="text-slate-400 dark:text-slate-600">—</span>;
      return <span className="text-slate-400 dark:text-slate-600">—</span>;
    }
    return (
      <span style={{ fontFamily: "var(--font-display)" }}>{m.fmt(val)}</span>
    );
  };

  const totalPages  = Math.max(1, Math.ceil(activeRows.length / ITEMS_PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const visibleRows = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return sortedRows.slice(start, start + ITEMS_PER_PAGE);
  }, [sortedRows, currentPage]);
  const firstIdx = (currentPage - 1) * ITEMS_PER_PAGE + 1;
  const lastIdx  = Math.min(currentPage * ITEMS_PER_PAGE, activeRows.length);
  const showTotals = activeRows.length > 0;

  return (
    <article className="glass-panel w-full min-w-0 overflow-hidden rounded-3xl shadow-lg">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/50 px-5 py-4 sm:px-6 sm:py-5 dark:border-slate-700/50">
        <div>
          {/* Breadcrumb minimalista — só aparece em drill-down */}
          {drillDown && (
            <div className="mb-1 flex items-center gap-1 text-[11px] text-slate-400 dark:text-slate-500">
              <button type="button"
                onClick={() => changeView("campaign")}
                className="hover:text-emerald-500 transition-colors">
                Todas as campanhas
              </button>
              <ChevronRight size={10} className="flex-shrink-0" />
              {drillDown.adsetId ? (
                <>
                  <button type="button"
                    onClick={() => changeView("adset")}
                    className="max-w-[160px] truncate hover:text-emerald-500 transition-colors">
                    {drillDown.campaignName}
                  </button>
                  <ChevronRight size={10} className="flex-shrink-0" />
                  <span className="max-w-[160px] truncate font-semibold text-slate-600 dark:text-slate-300">
                    {drillDown.adsetName}
                  </span>
                </>
              ) : (
                <span className="max-w-[200px] truncate font-semibold text-slate-600 dark:text-slate-300">
                  {drillDown.campaignName}
                </span>
              )}
            </div>
          )}
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100"
            style={{ fontFamily: "var(--font-poppins),Poppins,sans-serif" }}>
            Performance por {viewMeta.label}
          </h3>
          <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
            {firstIdx}–{lastIdx} de {activeRows.length} {viewMeta.labelPlural}
            {(view === "campaign" || (view === "adset" && !drillDown)) && " · clique na linha para detalhar"}
            {view !== "campaign" && " · clique no cabeçalho ordena · botão direito edita"}
            {view === "ad" && adLinksLoading && " · carregando links dos criativos…"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Seletor de nível */}
          <div className="flex rounded-[10px] p-0.5" style={{ backgroundColor: "var(--dm-bg-elevated)" }}>
            {VIEW_OPTIONS.map((opt) => (
              <button key={opt.value} type="button" onClick={() => changeView(opt.value)}
                className="rounded-[8px] px-3 py-1.5 text-[11px] font-semibold transition-all"
                style={view === opt.value
                  ? { background: BRAND_GRAD, color: "#fff", boxShadow: "0 2px 8px rgba(22,163,74,0.28)" }
                  : { color: "var(--dm-text-tertiary)" }}>
                {opt.label}
              </button>
            ))}
          </div>
          {/* Paginação */}
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1}
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 disabled:opacity-30 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-700">
                <ChevronLeft size={14} />
              </button>
              <span className="min-w-[44px] text-center text-xs font-semibold text-slate-600 dark:text-slate-400">
                {currentPage} / {totalPages}
              </span>
              <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 disabled:opacity-30 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-700">
                <ChevronRight size={14} />
              </button>
            </div>
          )}
          <button type="button" onClick={() => setShowCols(true)}
            className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[11px] font-semibold transition hover:opacity-80"
            style={{ backgroundColor: "var(--dm-bg-elevated)", color: "var(--dm-text-tertiary)", border: "1px solid var(--dm-border-default)" }}>
            <SlidersHorizontal size={11} />
            Colunas
          </button>
        </div>
      </div>

      {/* Tabela */}
      <div className="w-full overflow-x-auto">
        <table className="w-full min-w-[600px] text-sm">
          <thead>
            <tr className="bg-slate-100/50 text-left dark:bg-slate-800/50">
              <th onClick={() => handleSort("campaign")}
                className="cursor-pointer select-none border-b border-slate-200/50 px-5 py-3.5 text-[11px] font-bold uppercase tracking-wider whitespace-nowrap text-slate-500 transition hover:opacity-70 dark:border-slate-700/50 dark:text-slate-400">
                {viewMeta.label}
              </th>
              {cols.map((id, index) => {
                const m = resolveMetric(id);
                const isBadge = id === "roas" || id === "ctr" || id === "ctr_all";
                return (
                  <th key={id + index}
                    onClick={() => handleSort(id)}
                    onContextMenu={(e) => openMenu(e, index)}
                    title={m?.tooltip}
                    className={`cursor-pointer select-none border-b border-slate-200/50 px-5 py-3.5 text-[11px] font-bold uppercase tracking-wider whitespace-nowrap text-slate-500 transition hover:opacity-70 dark:border-slate-700/50 dark:text-slate-400 ${isBadge ? "text-center" : "text-right"}`}>
                    {m?.label ?? id}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100/50 dark:divide-slate-700/50">
            {visibleRows.map((row) => {
              const hasSpend   = (row.values.spend ?? 0) > 0;
              const hasImps    = (row.values.impressions ?? 0) > 0;
              // effective_status propaga pausa do pai para baixo na hierarquia:
              // - "ACTIVE"          → o próprio item e todos os pais estão ativos
              // - "PAUSED"          → pausado pelo seu próprio toggle
              // - "CAMPAIGN_PAUSED" → campanha pai pausada (adset/anúncio seria ativo)
              // - "ADSET_PAUSED"    → conjunto pai pausado (anúncio seria ativo)
              // - "DISAPPROVED"     → reprovado pela Meta
              // - "PENDING_REVIEW"  → aguardando análise
              // - "WITH_ISSUES"     → com problemas
              const realStatus = statusByView?.[view]?.[row.id];
              let dotColor: string;
              let dotTip: string;
              if (realStatus === "ACTIVE") {
                dotColor = "#16A34A"; dotTip = "Ativo";
              } else if (realStatus === "PAUSED") {
                dotColor = "#94a3b8"; dotTip = "Pausado";
              } else if (realStatus === "CAMPAIGN_PAUSED") {
                dotColor = "#94a3b8"; dotTip = "Pausado · campanha pai pausada";
              } else if (realStatus === "ADSET_PAUSED") {
                dotColor = "#94a3b8"; dotTip = "Pausado · conjunto pai pausado";
              } else if (realStatus === "DISAPPROVED") {
                dotColor = "#EE5D50"; dotTip = "Reprovado pela Meta";
              } else if (realStatus === "PENDING_REVIEW" || realStatus === "IN_PROCESS" || realStatus === "PREAPPROVED") {
                dotColor = "#F4A60D"; dotTip = "Em análise";
              } else if (realStatus === "WITH_ISSUES") {
                dotColor = "#F4A60D"; dotTip = "Com problemas";
              } else if (realStatus === "DELETED") {
                dotColor = "#64748b"; dotTip = "Removido";
              } else if (realStatus === "ARCHIVED") {
                dotColor = "#64748b"; dotTip = "Arquivado";
              } else {
                // Status real ainda não carregado ou indisponível — usa entrega no
                // período como aproximação (comportamento anterior).
                dotColor = hasSpend ? "#16A34A" : hasImps ? "#F4A60D" : "#94a3b8";
                dotTip   = hasSpend ? "Com entrega no período"
                         : hasImps  ? "Impressões sem investimento"
                         :            "Sem entrega no período";
              }
              const creativeLink = view === "ad" ? adLinks?.[row.id] : undefined;
              return (
              <tr
                key={row.id}
                className={`transition-all hover:bg-white/50 dark:hover:bg-slate-800/50 ${view !== "ad" ? "cursor-pointer" : ""}`}
                onClick={() => {
                  if (view === "campaign") { onCampaignDrillDown?.(row.id, row.name); changeView("adset"); }
                  else if (view === "adset") { onAdsetDrillDown?.(row.id, row.name); changeView("ad"); }
                }}
              >
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-2.5 min-w-0 group/name">
                    <span
                      title={dotTip}
                      className="flex-shrink-0 h-2 w-2 rounded-full"
                      style={{ backgroundColor: dotColor, boxShadow: dotColor === "#16A34A" ? `0 0 0 3px ${dotColor}22` : undefined }}
                    />
                    {creativeLink ? (
                      <a
                        href={creativeLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={creativeLink}
                        onClick={(e) => e.stopPropagation()}
                        className="flex min-w-0 items-center gap-1 text-[13px] font-semibold text-slate-800 transition-colors hover:text-emerald-600 hover:underline dark:text-slate-200 dark:hover:text-emerald-400"
                      >
                        <span className="truncate max-w-[240px]">{row.name}</span>
                        <ExternalLink size={11} className="flex-shrink-0 opacity-0 transition-opacity group-hover/name:opacity-60" />
                      </a>
                    ) : (
                      <span title={row.name} className="truncate max-w-[260px] text-[13px] font-semibold text-slate-800 dark:text-slate-200">
                        {row.name}
                      </span>
                    )}
                  </div>
                </td>
                {cols.map((id, index) => {
                  const isBadge = id === "roas" || id === "ctr" || id === "ctr_all";
                  return (
                    <td key={id + index}
                      className={`whitespace-nowrap px-5 py-3.5 text-[13px] text-slate-600 dark:text-slate-400 ${isBadge ? "text-center" : "text-right tabular-nums"}`}>
                      {renderCell(id, row.values)}
                    </td>
                  );
                })}
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer totais */}
      {showTotals && (
        <div className="flex flex-col items-start justify-between gap-2 border-t border-slate-200/50 bg-slate-100/30 px-5 py-4 sm:flex-row sm:items-center sm:px-6 dark:border-slate-700/50 dark:bg-slate-800/30">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Total período ({activeRows.length} {viewMeta.labelPlural})
          </p>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
            {cols.slice(0, 5).map((id) => {
              const m = resolveMetric(id);
              if (!m) return null;
              const isBadge = id === "roas" || id === "ctr" || id === "ctr_all";
              return (
                <span key={id} className="text-slate-500 dark:text-slate-400">
                  {m.label}:{" "}
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    {isBadge ? renderCell(id, totalsValues, true) : (metricValue(m, totalsValues) ?? 0) > 0 ? m.fmt(metricValue(m, totalsValues)!) : "—"}
                  </span>
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Menu de contexto */}
      {menu && (
        <ContextMenu
          menu={menu}
          menuRef={menuRef}
          cols={cols}
          metricById={metricById}
          custom={custom}
          onReplace={replaceCol}
          onAdd={addColAfter}
          onRemove={removeCol}
          onSetMode={(mode) => setMenu((m) => (m ? { ...m, mode } : m))}
          onCreate={() => { const idx = menu.index; setMenu(null); setBuilder({ editing: null, fromCol: idx }); }}
        />
      )}

      {/* Modal de colunas */}
      {showCols && (
        <ColumnsModal
          cols={cols}
          custom={custom}
          metricById={metricById}
          onClose={() => setShowCols(false)}
          onChange={(nextCols) => persist({ ...config, cols: nextCols })}
          onReset={() => persist({ ...config, cols: DEFAULT_COLS })}
          onCreate={() => setBuilder({ editing: null, fromCol: null })}
          onEditCustom={(cm) => setBuilder({ editing: cm, fromCol: null })}
          onDeleteCustom={deleteCustom}
        />
      )}

      {/* Builder de métrica */}
      {builder && (
        <MetricBuilder
          editing={builder.editing}
          totalsValues={totalsValues}
          onClose={() => setBuilder(null)}
          onSave={(cm) => saveCustom(cm, builder.fromCol)}
        />
      )}
    </article>
  );
}

// ─── Menu de contexto (substituir / adicionar / remover / criar) ───────────────

function ContextMenu({
  menu, menuRef, cols, metricById, custom, onReplace, onAdd, onRemove, onSetMode, onCreate,
}: {
  menu: { x: number; y: number; index: number; mode: "root" | "replace" | "add" };
  menuRef: React.RefObject<HTMLDivElement | null>;
  cols: string[];
  metricById: Map<string, ResolvedMetric>;
  custom: CustomMetric[];
  onReplace: (index: number, id: string) => void;
  onAdd: (index: number, id: string) => void;
  onRemove: (index: number) => void;
  onSetMode: (mode: "root" | "replace" | "add") => void;
  onCreate: () => void;
}) {
  const colLabel = metricById.get(cols[menu.index] ?? "")?.label ?? "";

  return (
    <div ref={menuRef} className="fixed z-[70] w-64 overflow-hidden rounded-[14px] shadow-horizon"
      style={{ left: menu.x, top: menu.y, backgroundColor: "var(--dm-bg-surface)", border: "1px solid var(--dm-border-default)" }}>
      {menu.mode === "root" && (
        <div className="py-1.5">
          <p className="truncate px-3 py-1 text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>
            {colLabel}
          </p>
          <MenuItem label="Substituir métrica" onClick={() => onSetMode("replace")} />
          <MenuItem label="Adicionar coluna à direita" onClick={() => onSetMode("add")} />
          <MenuItem label="Remover coluna" disabled={cols.length <= 1} onClick={() => onRemove(menu.index)} />
          <div className="my-1 border-t" style={{ borderColor: "var(--dm-border-subtle)" }} />
          <MenuItem label="Criar métrica" icon={<Plus size={12} />} accent onClick={onCreate} />
        </div>
      )}
      {(menu.mode === "replace" || menu.mode === "add") && (
        <MetricPicker
          cols={cols}
          custom={custom}
          metricById={metricById}
          excludeForAdd={menu.mode === "add"}
          onBack={() => onSetMode("root")}
          onPick={(id) => (menu.mode === "replace" ? onReplace(menu.index, id) : onAdd(menu.index, id))}
        />
      )}
    </div>
  );
}

function MenuItem({ label, onClick, disabled, icon, accent }: {
  label: string; onClick: () => void; disabled?: boolean; icon?: React.ReactNode; accent?: boolean;
}) {
  return (
    <button type="button" disabled={disabled} onClick={onClick}
      className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] font-medium transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
      style={{ color: accent ? "var(--dm-brand-500)" : "var(--dm-text-secondary)" }}>
      {icon}
      {label}
    </button>
  );
}

// ─── Lista de métricas para escolher (busca + grupos) ──────────────────────────

function MetricPicker({
  cols, custom, metricById, excludeForAdd, onBack, onPick,
}: {
  cols: string[];
  custom: CustomMetric[];
  metricById: Map<string, ResolvedMetric>;
  excludeForAdd: boolean;
  onBack: () => void;
  onPick: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();

  const groups = useMemo(() => {
    const grouped = new Set(KPI_GROUPS.flatMap((g) => g.kpiIds));
    const base = KPI_GROUPS.map((g) => ({ label: g.label, ids: g.kpiIds.filter((id) => metricById.has(id)) }));
    const ungrouped = ALL_KPI_OPTIONS.filter((k) => !grouped.has(k.id)).map((k) => k.id);
    if (ungrouped.length > 0) base.push({ label: "Outros", ids: ungrouped });
    if (custom.length > 0) base.push({ label: "Personalizadas", ids: custom.map((c) => c.id) });
    return base
      .map((g) => ({
        label: g.label,
        ids: g.ids.filter((id) => {
          if (excludeForAdd && cols.includes(id)) return false;
          if (!query) return true;
          return (metricById.get(id)?.label ?? "").toLowerCase().includes(query);
        }),
      }))
      .filter((g) => g.ids.length > 0);
  }, [query, cols, custom, metricById, excludeForAdd]);

  return (
    <div className="flex max-h-[300px] flex-col">
      <div className="flex items-center gap-2 border-b px-2.5 py-2" style={{ borderColor: "var(--dm-border-subtle)" }}>
        <button type="button" onClick={onBack} className="text-[11px] font-semibold transition hover:opacity-70" style={{ color: "var(--dm-text-tertiary)" }}>‹</button>
        <Search size={12} style={{ color: "var(--dm-text-tertiary)" }} />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar métrica…"
          className="w-full bg-transparent text-[12px] outline-none" style={{ color: "var(--dm-text-primary)" }} />
      </div>
      <div className="overflow-y-auto py-1">
        {groups.length === 0 && (
          <p className="px-3 py-3 text-center text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>Nada encontrado</p>
        )}
        {groups.map((g) => (
          <div key={g.label}>
            <p className="px-3 pt-1.5 pb-0.5 text-[9px] font-bold uppercase tracking-widest" style={{ color: "var(--dm-text-tertiary)" }}>{g.label}</p>
            {g.ids.map((id) => (
              <button key={id} type="button" onClick={() => onPick(id)}
                className="flex w-full items-center justify-between px-3 py-1.5 text-left text-[12px] transition hover:bg-white/5"
                style={{ color: "var(--dm-text-secondary)" }}>
                <span className="truncate">{metricById.get(id)?.label ?? id}</span>
                {cols.includes(id) && <Check size={11} style={{ color: "var(--dm-brand-500)" }} />}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Modal de colunas (toggle + drag reorder + gerenciar custom) ───────────────

function ColumnsModal({
  cols, custom, metricById, onClose, onChange, onReset, onCreate, onEditCustom, onDeleteCustom,
}: {
  cols: string[];
  custom: CustomMetric[];
  metricById: Map<string, ResolvedMetric>;
  onClose: () => void;
  onChange: (cols: string[]) => void;
  onReset: () => void;
  onCreate: () => void;
  onEditCustom: (cm: CustomMetric) => void;
  onDeleteCustom: (id: string) => void;
}) {
  const dragId = useRef<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  const toggle = (id: string) =>
    onChange(cols.includes(id) ? cols.filter((c) => c !== id) : [...cols, id]);

  const reorder = (src: string, target: string) => {
    if (src === target) return;
    const next = [...cols];
    const fi = next.indexOf(src);
    const ti = next.indexOf(target);
    if (fi < 0 || ti < 0) return;
    next.splice(fi, 1);
    next.splice(ti, 0, src);
    onChange(next);
  };

  const groups = useMemo(() => {
    const grouped = new Set(KPI_GROUPS.flatMap((g) => g.kpiIds));
    const base = KPI_GROUPS.map((g) => ({ label: g.label, ids: g.kpiIds.filter((id) => metricById.has(id)) }));
    const ungrouped = ALL_KPI_OPTIONS.filter((k) => !grouped.has(k.id)).map((k) => k.id);
    if (ungrouped.length > 0) base.push({ label: "Outros", ids: ungrouped });
    return base.filter((g) => g.ids.length > 0);
  }, [metricById]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="flex w-full max-w-xl flex-col overflow-hidden rounded-[20px] shadow-horizon"
        style={{ backgroundColor: "var(--dm-bg-surface)", border: "1px solid var(--dm-border-default)", maxHeight: "85vh" }}
        onClick={(e) => e.stopPropagation()}>
        <div className="h-1.5 w-full flex-shrink-0" style={{ background: BRAND_GRAD }} />
        <div className="flex flex-shrink-0 items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid var(--dm-border-default)" }}>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-[10px]" style={{ background: BRAND_GRAD }}>
              <SlidersHorizontal size={15} className="text-white" />
            </div>
            <div>
              <h2 className="text-[15px] font-bold" style={{ color: "var(--dm-text-primary)", fontFamily: "var(--font-poppins),Poppins,sans-serif" }}>
                Colunas da tabela
              </h2>
              <p className="text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>
                {cols.length} coluna{cols.length !== 1 ? "s" : ""} · arraste as ativas para reordenar
              </p>
            </div>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full transition hover:opacity-70"
            style={{ backgroundColor: "var(--dm-bg-elevated)", color: "var(--dm-text-tertiary)" }}>
            <X size={15} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Colunas ativas — drag para reordenar */}
          <div>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--dm-text-tertiary)" }}>Colunas ativas</p>
            <div className="flex flex-wrap gap-1.5">
              {cols.map((id) => (
                <span key={id} draggable
                  onDragStart={() => { dragId.current = id; }}
                  onDragOver={(e) => { e.preventDefault(); if (dragId.current && dragId.current !== id) setDragOver(id); }}
                  onDrop={(e) => { e.preventDefault(); if (dragId.current) reorder(dragId.current, id); dragId.current = null; setDragOver(null); }}
                  onDragEnd={() => { dragId.current = null; setDragOver(null); }}
                  className="flex cursor-grab items-center gap-1.5 rounded-[10px] px-2.5 py-1.5 text-[11px] font-semibold transition"
                  style={{
                    backgroundColor: "rgba(49,52,145,0.09)",
                    border: `1.5px solid ${dragOver === id ? "var(--dm-brand-500)" : "rgba(49,52,145,0.30)"}`,
                    color: "var(--dm-brand-500)",
                  }}>
                  <GripVertical size={11} className="opacity-50" />
                  {metricById.get(id)?.label ?? id}
                  <button type="button" onClick={() => toggle(id)} className="transition hover:opacity-60" disabled={cols.length <= 1}>
                    <X size={11} />
                  </button>
                </span>
              ))}
            </div>
          </div>

          {/* Métricas personalizadas */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--dm-text-tertiary)" }}>Personalizadas</p>
              <button type="button" onClick={onCreate}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold text-white" style={{ background: BRAND_GRAD }}>
                <Plus size={10} /> Criar métrica
              </button>
            </div>
            {custom.length === 0 ? (
              <p className="text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>Nenhuma. Crie uma a partir das métricas existentes (ex: Faturamento ÷ Investimento).</p>
            ) : (
              <div className="space-y-1">
                {custom.map((cm) => (
                  <div key={cm.id} className="flex items-center justify-between rounded-[10px] px-3 py-2" style={{ backgroundColor: "var(--dm-bg-elevated)", border: "1px solid var(--dm-border-default)" }}>
                    <button type="button" onClick={() => toggle(cm.id)} className="flex min-w-0 items-center gap-2 text-left">
                      <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full"
                        style={{ background: cols.includes(cm.id) ? BRAND_GRAD : "transparent", border: cols.includes(cm.id) ? "none" : "1.5px solid var(--dm-border-default)" }}>
                        {cols.includes(cm.id) && <Check size={9} className="text-white" />}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[12px] font-semibold" style={{ color: "var(--dm-text-primary)" }}>{cm.label}</span>
                        <span className="block truncate text-[10px] tabular-nums" style={{ color: "var(--dm-text-tertiary)" }}>{cm.formula}</span>
                      </span>
                    </button>
                    <div className="flex flex-shrink-0 items-center gap-1">
                      <button type="button" onClick={() => onEditCustom(cm)} className="flex h-6 w-6 items-center justify-center rounded-md transition hover:bg-white/10" style={{ color: "var(--dm-text-tertiary)" }}><Edit2 size={11} /></button>
                      <button type="button" onClick={() => onDeleteCustom(cm.id)} className="flex h-6 w-6 items-center justify-center rounded-md transition hover:bg-white/10" style={{ color: ROAS_RED }}><Trash2 size={11} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Catálogo agrupado */}
          {groups.map((g) => (
            <div key={g.label}>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--dm-text-tertiary)" }}>{g.label}</p>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {g.ids.map((id) => {
                  const selected = cols.includes(id);
                  return (
                    <button key={id} type="button" onClick={() => toggle(id)}
                      className="flex items-center gap-2 rounded-[12px] px-3 py-2 text-left text-[12px] transition"
                      style={{
                        backgroundColor: selected ? "rgba(49,52,145,0.09)" : "var(--dm-bg-elevated)",
                        border: `1.5px solid ${selected ? "rgba(49,52,145,0.40)" : "var(--dm-border-default)"}`,
                        color: selected ? "var(--dm-brand-500)" : "var(--dm-text-secondary)",
                      }}>
                      <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full"
                        style={{ background: selected ? BRAND_GRAD : "transparent", border: selected ? "none" : "1.5px solid var(--dm-border-default)" }}>
                        {selected && <Check size={9} className="text-white" />}
                      </span>
                      <span className="truncate font-medium">{metricById.get(id)?.label ?? id}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-shrink-0 items-center justify-between border-t px-6 py-4" style={{ borderColor: "var(--dm-border-default)" }}>
          <button type="button" onClick={onReset} className="text-[11px] font-semibold transition hover:opacity-70" style={{ color: "var(--dm-text-tertiary)" }}>
            Restaurar padrão
          </button>
          <button type="button" onClick={onClose} className="rounded-[10px] px-4 py-2 text-[12px] font-bold text-white" style={{ background: BRAND_GRAD }}>
            Concluído
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Builder de métrica (fórmula) ──────────────────────────────────────────────

function MetricBuilder({
  editing, totalsValues, onClose, onSave,
}: {
  editing: CustomMetric | null;
  totalsValues: Record<string, number>;
  onClose: () => void;
  onSave: (cm: CustomMetric) => void;
}) {
  const [label, setLabel] = useState(editing?.label ?? "");
  const [formula, setFormula] = useState(editing?.formula ?? "");
  const [format, setFormat] = useState<CustomFormat>(editing?.format ?? "decimal");
  const [invert, setInvert] = useState<boolean>(editing?.invert ?? false);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const valid = validateFormula(formula, ALLOWED_FORMULA_IDS);
  const previewVal = valid.ok ? evaluateFormula(formula, totalsValues) : null;
  const canSave = valid.ok && label.trim().length > 0;

  const insert = (tok: string) => {
    const el = inputRef.current;
    const start = el?.selectionStart ?? formula.length;
    const end = el?.selectionEnd ?? formula.length;
    const needSpace = start > 0 && !/\s$/.test(formula.slice(0, start));
    const text = (needSpace ? " " : "") + tok + " ";
    const next = formula.slice(0, start) + text + formula.slice(end);
    setFormula(next);
    requestAnimationFrame(() => {
      el?.focus();
      const pos = start + text.length;
      el?.setSelectionRange(pos, pos);
    });
  };

  const groups = useMemo(() => {
    const grouped = new Set(KPI_GROUPS.flatMap((g) => g.kpiIds));
    const map = new Map(ALL_KPI_OPTIONS.map((k) => [k.id, k]));
    const base = KPI_GROUPS.map((g) => ({ label: g.label, kpis: g.kpiIds.map((id) => map.get(id)).filter(Boolean) as typeof ALL_KPI_OPTIONS }));
    const ungrouped = ALL_KPI_OPTIONS.filter((k) => !grouped.has(k.id));
    if (ungrouped.length > 0) base.push({ label: "Outros", kpis: ungrouped });
    return base;
  }, []);

  const save = () => {
    if (!canSave) return;
    onSave({
      id: editing?.id ?? newCustomMetricId(),
      label: label.trim(),
      formula: formula.trim(),
      format,
      invert,
    });
  };

  return (
    <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="flex w-full max-w-lg flex-col overflow-hidden rounded-[20px] shadow-horizon"
        style={{ backgroundColor: "var(--dm-bg-surface)", border: "1px solid var(--dm-border-default)", maxHeight: "88vh" }}
        onClick={(e) => e.stopPropagation()}>
        <div className="h-1.5 w-full flex-shrink-0" style={{ background: BRAND_GRAD }} />
        <div className="flex flex-shrink-0 items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid var(--dm-border-default)" }}>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-[10px]" style={{ background: BRAND_GRAD }}>
              <Plus size={15} className="text-white" />
            </div>
            <h2 className="text-[15px] font-bold" style={{ color: "var(--dm-text-primary)", fontFamily: "var(--font-poppins),Poppins,sans-serif" }}>
              {editing ? "Editar métrica" : "Criar métrica"}
            </h2>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full transition hover:opacity-70"
            style={{ backgroundColor: "var(--dm-bg-elevated)", color: "var(--dm-text-tertiary)" }}>
            <X size={15} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {/* Nome + formato */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--dm-text-tertiary)" }}>Nome</label>
              <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex: Custo por venda"
                className="w-full rounded-[10px] px-3 py-2 text-[13px] outline-none"
                style={{ backgroundColor: "var(--dm-bg-elevated)", border: "1px solid var(--dm-border-default)", color: "var(--dm-text-primary)" }} />
            </div>
            <div className="w-40">
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--dm-text-tertiary)" }}>Formato</label>
              <select value={format} onChange={(e) => setFormat(e.target.value as CustomFormat)}
                className="w-full rounded-[10px] px-2 py-2 text-[13px] outline-none"
                style={{ backgroundColor: "var(--dm-bg-elevated)", border: "1px solid var(--dm-border-default)", color: "var(--dm-text-primary)" }}>
                {FORMAT_LABELS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </div>
          </div>

          {/* Fórmula */}
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--dm-text-tertiary)" }}>Fórmula</label>
            <textarea ref={inputRef} value={formula} onChange={(e) => setFormula(e.target.value)} rows={2}
              placeholder="Ex: revenue / spend"
              className="w-full resize-none rounded-[10px] px-3 py-2 font-mono text-[13px] outline-none"
              style={{ backgroundColor: "var(--dm-bg-elevated)", border: `1px solid ${formula && !valid.ok ? ROAS_RED : "var(--dm-border-default)"}`, color: "var(--dm-text-primary)" }} />
            {/* Operadores */}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {[{ s: "+", t: "+" }, { s: "−", t: "-" }, { s: "×", t: "*" }, { s: "÷", t: "/" }, { s: "(", t: "(" }, { s: ")", t: ")" }].map((op) => (
                <button key={op.s} type="button" onClick={() => insert(op.t)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-[14px] font-bold transition hover:opacity-80"
                  style={{ backgroundColor: "var(--dm-bg-elevated)", border: "1px solid var(--dm-border-default)", color: "var(--dm-text-secondary)" }}>
                  {op.s}
                </button>
              ))}
              <button type="button" onClick={() => setFormula((f) => f.replace(/\s*\S+\s*$/, ""))}
                className="flex h-8 items-center justify-center rounded-lg px-2.5 text-[11px] font-semibold transition hover:opacity-80"
                style={{ backgroundColor: "var(--dm-bg-elevated)", border: "1px solid var(--dm-border-default)", color: "var(--dm-text-secondary)" }}>⌫</button>
              <button type="button" onClick={() => setFormula("")}
                className="flex h-8 items-center justify-center rounded-lg px-2.5 text-[11px] font-semibold transition hover:opacity-80"
                style={{ backgroundColor: "var(--dm-bg-elevated)", border: "1px solid var(--dm-border-default)", color: "var(--dm-text-secondary)" }}>Limpar</button>
            </div>
          </div>

          {/* Preview */}
          <div className="rounded-[10px] px-3 py-2" style={{ backgroundColor: "var(--dm-bg-elevated)" }}>
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--dm-text-tertiary)" }}>Pré-visualização (total do período)</p>
            {!formula.trim() ? (
              <p className="text-[13px]" style={{ color: "var(--dm-text-tertiary)" }}>Monte a fórmula clicando nas métricas abaixo…</p>
            ) : valid.ok ? (
              <p className="text-[20px] font-bold tabular-nums" style={{ color: "var(--dm-text-primary)" }}>
                {previewVal != null ? formatCustom(previewVal, format) : "—"}
              </p>
            ) : (
              <p className="text-[12px] font-semibold" style={{ color: ROAS_RED }}>{valid.error}</p>
            )}
          </div>

          {/* invert */}
          <button type="button" onClick={() => setInvert((v) => !v)} className="flex items-center gap-2 text-[12px]" style={{ color: "var(--dm-text-secondary)" }}>
            <span className="flex h-4 w-4 items-center justify-center rounded-[5px]"
              style={{ background: invert ? BRAND_GRAD : "transparent", border: invert ? "none" : "1.5px solid var(--dm-border-default)" }}>
              {invert && <Check size={9} className="text-white" />}
            </span>
            Menor é melhor (ex: custos)
          </button>

          {/* Paleta de métricas */}
          <div>
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--dm-text-tertiary)" }}>Métricas disponíveis</p>
            <div className="space-y-2">
              {groups.map((g) => (
                <div key={g.label}>
                  <p className="mb-1 text-[9px] font-bold uppercase tracking-widest" style={{ color: "var(--dm-text-tertiary)", opacity: 0.7 }}>{g.label}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {g.kpis.map((k) => (
                      <button key={k.id} type="button" onClick={() => insert(k.id)} title={k.id}
                        className="rounded-lg px-2 py-1 text-[11px] font-medium transition hover:opacity-80"
                        style={{ backgroundColor: "var(--dm-bg-elevated)", border: "1px solid var(--dm-border-default)", color: "var(--dm-text-secondary)" }}>
                        {k.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-shrink-0 items-center justify-end gap-2 border-t px-6 py-4" style={{ borderColor: "var(--dm-border-default)" }}>
          <button type="button" onClick={onClose} className="rounded-[10px] px-4 py-2 text-[12px] font-semibold transition hover:opacity-70"
            style={{ color: "var(--dm-text-tertiary)" }}>Cancelar</button>
          <button type="button" onClick={save} disabled={!canSave}
            className="rounded-[10px] px-4 py-2 text-[12px] font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-40"
            style={{ background: BRAND_GRAD }}>
            {editing ? "Salvar" : "Criar"}
          </button>
        </div>
      </div>
    </div>
  );
}
