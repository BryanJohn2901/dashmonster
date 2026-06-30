"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ALL_METRIC_IDS, useMetricVisibility } from "@/hooks/useMetricVisibility";
import { useAvatarUrl, resolveAvatarSrc } from "@/hooks/useAvatarUrl";
import { useDateRange } from "@/hooks/useDateRange";
import {
  Activity, BadgeDollarSign, BarChart2, BookOpen, CalendarDays,
  CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, CircleDollarSign, Download, Dumbbell, FileText,
  FileUp, Filter, Flag, GraduationCap, Home, ImageIcon, Link2, Loader2, LogOut, Menu, Moon,
  Building2, Megaphone, MousePointerClick, Package, Pencil, Plus, Repeat, RotateCcw, Search, Settings2, SlidersHorizontal, Sun,
  Target, Trash2, TrendingUp, Trophy, Upload, UserRound, Users, Wallet, X, XCircle, Zap,
  LayoutDashboard, History, LineChart, Sparkles, Database, Dna, Weight, HeartPulse,
  Medal, PersonStanding, Flame, BookText, MonitorSmartphone, Ticket, Library, VenetianMask,
  Radar
} from "lucide-react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { CampaignData, LeadRow, ProductCategory, SourceChannel } from "@/types/campaign";
import type { UserAccountEntry, UserCategory } from "@/types/userConfig";
import {
  PTA_PAINEL_SAVE_NAV_EVENT,
  mapPainelInternalFilterToDashboardGroupId,
  type PainelSaveNavDetail,
} from "@/utils/painelDashboardNavigation";
import { CampaignConfig, CampaignSummary, CustomGroup, CustomSection, ColorKey, GroupSection, useCampaignStore } from "@/hooks/useCampaignStore";
import { useCampaignCenter, type CampaignIntent } from "@/hooks/useCampaignCenter";
import { classifyCampaign, classifyCourse } from "@/utils/campaignClassifier";
import {
  fetchMetaAdAccounts, fetchMetaCampaigns, loadMetaCredentials, saveMetaCredentials,
} from "@/utils/metaApi";
import { LEADS_MIGRATION_FILE, type MetaSyncResult } from "@/utils/supabaseCampaigns";
import { fetchLeads as fetchDbLeads, subscribeLeads } from "@/utils/supabaseLeads";
import { isSupabaseConfigured } from "@/lib/supabase";
import type { MetaAdAccount, MetaCampaign } from "@/utils/metaApi";
import { CategoryGate, CATEGORY_LABEL, CATEGORY_ICON, CATEGORY_DOT, ICON_MAP, COLOR_HEX } from "@/components/CategoryGate";
import {
  aggregateByCampaign, aggregateTotals, applyOverrides, buildBudgetDistribution,
  buildCampaignComparison, buildDailyTrend, formatCurrency, formatDatePtBr, formatNumber, formatPercent,
} from "@/utils/metrics";
import { reportFunnelFromValues } from "@/components/FunnelCard";
import { OverviewBento } from "@/components/OverviewBento";
import { DateRangePicker } from "@/components/DateRangePicker";
import { ExportReportButton } from "@/components/ExportReportButton";
import type { ReportData } from "@/types/report";
import { ChartsSection } from "@/components/charts/ChartsSection";
import { CampaignTable } from "@/components/CampaignTable";
import { useGoalsStore, type Goals } from "@/hooks/useGoalsStore";
import { CampaignAnalysis } from "@/components/CampaignAnalysis";
import { HistoricalView } from "@/components/HistoricalView";
import { LeadsView } from "@/components/LeadsView";
import { TrackingEventsView } from "@/components/TrackingEventsView";
import { HISTORY_TAB_LABELS_KEY, historyKindLabel, readCustomHistoryTabs, type HistoricalKind } from "@/types/historical";
import { useCompany } from "@/hooks/useCompany";
import { BestCreatives } from "@/components/BestCreatives";
import { ProfileAnalysis } from "@/components/ProfileAnalysis";
import { useAdvertiserStore } from "@/hooks/useAdvertiserStore";
import { ProductBase } from "@/components/products/ProductBase";
import { DashMonsterLogo } from "@/components/DashMonsterLogo";
import { DashboardWelcome } from "@/components/empty/DashboardWelcome";
import { AnaliseEmpty } from "@/components/empty/AnaliseEmpty";
import { CriativosEmpty } from "@/components/empty/CriativosEmpty";
import { MyAccount, accountTabsForRole } from "@/components/MyAccount";
import { EmpresaTab } from "@/components/EmpresaTab";
import { HubSettings } from "@/components/hub/HubSettings";
import { toast } from "@/hooks/useToast";
import { exportDashboardCsv } from "@/utils/exportCsv";
import { useManualMetrics } from "@/hooks/useManualMetrics";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DataSource {
  type: SourceChannel;
  label: string;
}

interface DashboardProps {
  campaigns: CampaignData[];
  dataSource?: DataSource | null;
  syncStatus?: { syncing: boolean; result?: MetaSyncResult; error?: string };
  /** false se a migration 013 (coluna leads) ainda não foi aplicada no Supabase. */
  campaignMetricsHasLeadsColumn?: boolean;
  currentUser: { name: string; email: string };
  categories?: UserCategory[];
  accountEntries?: UserAccountEntry[];
  onImportCsv: (file: File) => Promise<void>;
  onImportUrl: (url: string) => Promise<void>;
  onImportMeta?: (accounts: Record<string, string>, dateFrom: string, dateTo: string, campaignFilter?: Record<string, string[]>) => Promise<void>;
  onCategoriesChange?: (cats: UserCategory[]) => void;
  onEntriesChange?:    (entries: UserAccountEntry[]) => void;
  onRefresh?: () => Promise<void>;
  onClearData?: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onBackToWorkspace?: () => void;
  onUpdateProfile: (name: string) => Promise<void>;
  onOpenControlPanel?: () => void;
}

function formatDataSourcePill(ds: DataSource | null | undefined): { title: string; subtitle?: string } | null {
  if (!ds) return null;
  const titles: Record<DataSource["type"], string> = {
    meta: "Meta Ads",
    csv: "CSV",
    google_sheets: "Google Sheets",
    eduzz: "Eduzz",
    sheet: "Planilha",
  };
  return { title: titles[ds.type], subtitle: ds.label };
}

type MainTab = "overview" | "history" | "leads" | "tracking" | "profiles" | "products" | "empresa" | "myaccount";
type DashSubTab = "overview" | "analysis" | "creatives";

const DASH_SUB_TABS: Array<{ id: DashSubTab; label: string; icon: React.ElementType }> = [
  { id: "overview",  label: "Visão Geral", icon: LayoutDashboard },
  { id: "analysis",  label: "Análise",     icon: LineChart },
  { id: "creatives", label: "Criativos",   icon: Sparkles },
];

// Bloco "Campanhas" da Visão Geral: tabela por campanha vs. resumo diário.
type CampanhasView = "performance" | "daily";
const CAMPANHAS_VIEW_KEY = "pta_campanhas_view_v1";
const CAMPANHAS_VIEWS: Array<{ id: CampanhasView; label: string; icon: React.ElementType }> = [
  { id: "performance", label: "Performance por Campanha", icon: Megaphone },
  { id: "daily",       label: "Resumo diário",            icon: CalendarDays },
];

type SortBy = "date-desc" | "date-asc" | "invest-desc" | "invest-asc" | "roas-desc" | "ctr-desc";

const SORT_LABELS: Record<SortBy, string> = {
  "date-desc":   "Mais recente",
  "date-asc":    "Mais antigo",
  "invest-desc": "Maior investimento",
  "invest-asc":  "Menor investimento",
  "roas-desc":   "Maior ROAS",
  "ctr-desc":    "Maior CTR",
};

// ─── History sub-tabs (sidebar) ───────────────────────────────────────────────

const SIDEBAR_HISTORY_TABS: Array<{ id: HistoricalKind; icon: React.ElementType }> = [
  { id: "lancamento", icon: Wallet },
  { id: "evento",     icon: CalendarDays },
  { id: "perpetuo",   icon: Repeat },
  { id: "instagram",  icon: UserRound },
];

// ─── MyAccount sub-tabs (sidebar) ─────────────────────────────────────────────

// Config da empresa saiu da Minha conta → virou a aba de topo "Empresa".
type MyAccountTabId = "profile"|"privacy"|"notifications"|"personalization";
const SIDEBAR_ACCOUNT_TABS: Array<{ id: MyAccountTabId; label: string; icon: React.ElementType }> = [
  { id: "profile",         label: "Meu perfil",     icon: UserRound    },
  { id: "privacy",         label: "Privacidade",     icon: Zap          },
  { id: "notifications",   label: "Notificações",    icon: Activity     },
  { id: "personalization", label: "Personalização",  icon: SlidersHorizontal },
];

// ─── Nav config ───────────────────────────────────────────────────────────────

const MAIN_TABS: Array<{ id: MainTab; label: string; shortLabel: string; icon: React.ElementType }> = [
  { id: "overview",   label: "Dashboard",             shortLabel: "Dashboard", icon: LayoutDashboard },
  { id: "history",    label: "Histórico",             shortLabel: "Histórico", icon: History },
  { id: "tracking",   label: "Tracking",              shortLabel: "Tracking",  icon: Radar },
  { id: "profiles",   label: "Perfil de Anunciantes", shortLabel: "Perfil",    icon: Target },
  { id: "products",   label: "Base de Produtos",      shortLabel: "Produtos",  icon: Database },
  { id: "empresa",    label: "Empresa",               shortLabel: "Empresa",   icon: Building2 },
  { id: "myaccount",  label: "Minha conta",            shortLabel: "Conta",     icon: UserRound },
];

// ─── Campaign groups ──────────────────────────────────────────────────────────

interface GroupConfig {
  id: string; label: string; icon: React.ElementType;
  section: GroupSection;
  iconBg: string; iconColor: string;
  activeDot: string; activePulse: string;
  selectedBg: string; selectedText: string; selectedBorder: string;
}

// Sistema preto/branco + verde: as seções não usam mais cores próprias (azul,
// violeta, âmbar, rosa). Ícone neutro; verde só no estado ativo/selecionado.
const G_NEUTRAL = {
  iconBg: "bg-[var(--dm-bg-elevated)]", iconColor: "text-[color:var(--dm-text-secondary)]",
  activeDot: "bg-[#16A34A]", activePulse: "bg-[#22C55E]",
  selectedBg: "bg-[#16A34A]/10 dark:bg-[#22C55E]/10", selectedText: "text-[#16A34A] dark:text-[#22C55E]", selectedBorder: "border-[#16A34A]/30 dark:border-[#22C55E]/30",
};

const G_BLUE = G_NEUTRAL;
const G_EMERALD = G_NEUTRAL;
const G_VIOLET = G_NEUTRAL;
const G_AMBER = G_NEUTRAL;
const G_ROSE = G_NEUTRAL;

const CAMPAIGN_GROUPS: GroupConfig[] = [
  // ── Pós Graduação ──────────────────────────────────────────────────────────
  { section: "pos", id: "biomecanica",  label: "Biomecânica (BM)",           icon: Dna,             ...G_BLUE },
  { section: "pos", id: "musculacao",   label: "Musculação (MPA)",            icon: Weight,          ...G_BLUE },
  { section: "pos", id: "fisiologia",   label: "Fisiologia (FE)",             icon: HeartPulse,      ...G_BLUE },
  { section: "pos", id: "bodybuilding", label: "Bodybuilding (BB)",           icon: Medal,           ...G_BLUE },
  { section: "pos", id: "feminino",     label: "Trein. Feminino (SM)",        icon: PersonStanding,  ...G_BLUE },
  { section: "pos", id: "funcional",    label: "Trein. Funcional (TF)",       icon: Flame,           ...G_BLUE },
  // ── Livros ─────────────────────────────────────────────────────────────────
  { section: "livros",   id: "livros",         label: "Livro de Biomecânica", icon: BookText,        ...G_EMERALD },
  { section: "livros",   id: "livroMarketing", label: "Livro de Marketing",   icon: Library,         ...G_EMERALD },
  // ── Ebooks ─────────────────────────────────────────────────────────────────
  { section: "ebooks",   id: "ebookJoelho",    label: "Ebook Bio Joelho",     icon: MonitorSmartphone, ...G_VIOLET },
  { section: "ebooks",   id: "ebookColuna",    label: "Ebook Bio Coluna",     icon: MonitorSmartphone, ...G_VIOLET },
  // ── Perpétuo ───────────────────────────────────────────────────────────────
  { section: "perpetuo", id: "perpetuo",       label: "Notável Play",         icon: RotateCcw,       ...G_AMBER },
  // ── Eventos ────────────────────────────────────────────────────────────────
  { section: "eventos",  id: "bs",           label: "Biomechanic Specialist", icon: Ticket,          ...G_ROSE },
  { section: "eventos",  id: "mentoria",     label: "Mentoria Scala",         icon: Ticket,          ...G_ROSE },
  { section: "eventos",  id: "next",         label: "Next",                   icon: Ticket,          ...G_ROSE },
  { section: "eventos",  id: "powertrainer", label: "Power Trainer",          icon: Ticket,          ...G_ROSE },
];

// Default styles for custom-created groups (keyed by built-in section)
const SECTION_DEFAULTS: Record<string, Omit<GroupConfig, "id" | "label" | "section">> = {
  pos:      { icon: GraduationCap, ...G_BLUE },
  livros:   { icon: BookText,      ...G_EMERALD },
  ebooks:   { icon: MonitorSmartphone, ...G_VIOLET },
  perpetuo: { icon: RotateCcw,     ...G_AMBER },
  eventos:  { icon: Ticket,        ...G_ROSE },
};

const SECTION_LABELS_BUILTIN: Record<string, string> = {
  pos:      "Pós Graduação",
  livros:   "Livros",
  ebooks:   "Ebooks",
  perpetuo: "Perpétuo",
  eventos:  "Eventos",
};

// Legacy alias kept for compatibility
const SECTION_LABELS = SECTION_LABELS_BUILTIN;

/**
 * Resolve o rótulo de uma seção. Prioridade: nome da categoria da EMPRESA
 * (user_categories, renomeável por empresa) → label built-in (template PTA) →
 * seção custom → o próprio id. O slug fica estável; só o nome exibido muda.
 */
function getSectionLabel(
  sectionId: string,
  customSections: CustomSection[],
  categories?: UserCategory[],
): string {
  const cat = categories?.find((c) => c.slug === sectionId);
  if (cat?.name) return cat.name;
  if (sectionId in SECTION_LABELS_BUILTIN) return SECTION_LABELS_BUILTIN[sectionId];
  return customSections.find((s) => s.id === sectionId)?.label ?? sectionId;
}

/** Color config per ColorKey — for custom sections. */
const COLOR_CONFIG_MAP: Record<ColorKey, Omit<GroupConfig, "id" | "label" | "section" | "icon">> = {
  blue:    G_BLUE,
  emerald: G_EMERALD,
  violet:  G_VIOLET,
  amber:   G_AMBER,
  rose:    G_ROSE,
  pink: {
    iconBg: "bg-pink-50 dark:bg-pink-900/20",    iconColor: "text-pink-500 dark:text-pink-400",
    activeDot: "bg-pink-500",                     activePulse: "bg-pink-400",
    selectedBg: "bg-pink-50 dark:bg-pink-900/10", selectedText: "text-pink-600 dark:text-pink-400",
    selectedBorder: "border-pink-200 dark:border-pink-800",
  },
  cyan: {
    iconBg: "bg-cyan-50 dark:bg-cyan-900/20",    iconColor: "text-cyan-500 dark:text-cyan-400",
    activeDot: "bg-cyan-500",                     activePulse: "bg-cyan-400",
    selectedBg: "bg-cyan-50 dark:bg-cyan-900/10", selectedText: "text-cyan-600 dark:text-cyan-400",
    selectedBorder: "border-cyan-200 dark:border-cyan-800",
  },
  orange: {
    iconBg: "bg-orange-50 dark:bg-orange-900/20",    iconColor: "text-orange-500 dark:text-orange-400",
    activeDot: "bg-orange-500",                       activePulse: "bg-orange-400",
    selectedBg: "bg-orange-50 dark:bg-orange-900/10", selectedText: "text-orange-600 dark:text-orange-400",
    selectedBorder: "border-orange-200 dark:border-orange-800",
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

// classifyCourse lives in campaignClassifier.ts — re-exported here as alias
// for backwards-compatibility with local call sites.
const getLaunchGroup = classifyCourse;

const getSubLaunchCode = (name: string): string => {
  const match = name.match(/\b([A-Za-z]{1,4}\s?-?\d{1,2})\b/);
  if (!match?.[1]) return "";
  return match[1].replace(/[\s-]/g, "").toUpperCase();
};

// ─── Goals Panel ─────────────────────────────────────────────────────────────

interface GoalField {
  key: keyof Goals;
  label: string;
  placeholder: string;
  prefix?: string;
  suffix?: string;
}

const GOAL_SECTIONS: { label: string; fields: GoalField[] }[] = [
  {
    label: "Financeiro",
    fields: [
      { key: "investment",  label: "Orçamento",  placeholder: "Ex: 5000",  prefix: "R$" },
      { key: "revenue",     label: "Receita",    placeholder: "Ex: 20000", prefix: "R$" },
      { key: "roas",        label: "ROAS",       placeholder: "Ex: 3.0",   suffix: "x" },
      { key: "roi",         label: "ROI",        placeholder: "Ex: 200",   suffix: "%" },
    ],
  },
  {
    label: "Vendas",
    fields: [
      { key: "sales_total",    label: "Vendas Total",       placeholder: "Ex: 100" },
      { key: "sales_ingresso", label: "Vendas Ingresso",    placeholder: "Ex: 50"  },
      { key: "cpa_ingresso",   label: "Custo/Ingresso",     placeholder: "Ex: 80",  prefix: "R$" },
      { key: "sales_pos",      label: "Vendas Pós",         placeholder: "Ex: 30"  },
      { key: "cpa_pos",        label: "Custo/Pós",          placeholder: "Ex: 150", prefix: "R$" },
      { key: "cpa_venda",      label: "Custo/Venda",        placeholder: "Ex: 60",  prefix: "R$" },
    ],
  },
  {
    label: "Eficiência",
    fields: [
      { key: "conversions", label: "Conversões", placeholder: "Ex: 100" },
      { key: "leads",       label: "Leads",      placeholder: "Ex: 50"  },
      { key: "cpa",         label: "CPA",        placeholder: "Ex: 50",   prefix: "R$" },
      { key: "cpl",         label: "CPL",        placeholder: "Ex: 20",   prefix: "R$" },
      { key: "ctr",         label: "CTR",        placeholder: "Ex: 2.0",  suffix: "%" },
      { key: "cpc",         label: "CPC",        placeholder: "Ex: 1.50", prefix: "R$" },
      { key: "cpm",         label: "CPM",        placeholder: "Ex: 15",   prefix: "R$" },
    ],
  },
  {
    label: "Volume",
    fields: [
      { key: "clicks",      label: "Cliques",    placeholder: "Ex: 5000" },
      { key: "impressions", label: "Impressões", placeholder: "Ex: 50000" },
    ],
  },
];

function GoalsPanel({
  goals, groupLabel, onSetGoal, onReset, onClose,
}: {
  goals: Goals;
  groupLabel: string;
  onSetGoal: <K extends keyof Goals>(key: K, value: Goals[K]) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <>
      <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]" onClick={onClose} />
      <div
        className="fixed inset-y-0 right-0 z-50 flex w-full flex-col overflow-hidden border-l shadow-2xl sm:max-w-[420px]"
        style={{ backgroundColor: "var(--dm-bg-surface)", borderColor: "var(--dm-border-default)" }}
      >
        <div className="flex flex-shrink-0 items-center justify-between border-b px-6 py-4" style={{ borderColor: "var(--dm-border-default)" }}>
          <div>
            <div className="flex items-center gap-2">
              <Flag size={14} className="text-brand" />
              <h2 className="text-sm font-semibold" style={{ color: "var(--dm-text-primary)" }}>Metas de Performance</h2>
            </div>
            <p className="mt-0.5 pl-[22px] text-[11px]" style={{ color: "var(--dm-text-secondary)" }}>{groupLabel}</p>
          </div>
          <button onClick={onClose}
            className="rounded-lg p-1.5 transition hover:bg-[var(--dm-bg-elevated)]"
            style={{ color: "var(--dm-text-tertiary)" }}>
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="space-y-5">
            {GOAL_SECTIONS.map(({ label: sectionLabel, fields }) => (
              <div key={sectionLabel}>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--dm-text-tertiary)" }}>
                  {sectionLabel}
                </p>
                <div className="space-y-2">
                  {fields.map(({ key, label, placeholder, prefix, suffix }) => (
                    <div key={key} className="flex items-center gap-3">
                      <span className="w-32 flex-shrink-0 text-xs font-medium" style={{ color: "var(--dm-text-secondary)" }}>{label}</span>
                      <div className="relative flex-1">
                        {prefix && (
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>{prefix}</span>
                        )}
                        <input
                          type="number"
                          min={0}
                          step="any"
                          value={goals[key] ?? ""}
                          onChange={(e) => {
                            const v = e.target.value === "" ? null : Number(e.target.value);
                            onSetGoal(key, v as Goals[typeof key]);
                          }}
                          placeholder={placeholder}
                          className={`h-9 w-full rounded-lg border text-xs outline-none transition ${prefix ? "pl-7 pr-3" : suffix ? "pl-3 pr-7" : "px-3"}`}
                          style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-elevated)", color: "var(--dm-text-primary)" }}
                        />
                        {suffix && (
                          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>{suffix}</span>
                        )}
                      </div>
                      {goals[key] != null && (
                        <button type="button" onClick={() => onSetGoal(key, null as Goals[typeof key])}
                          className="flex-shrink-0 transition hover:text-red-400"
                          style={{ color: "var(--dm-text-tertiary)" }}>
                          <X size={12} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="sticky bottom-0 border-t px-6 py-4 flex gap-3" style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-surface)" }}>
          <button type="button" onClick={onReset}
            className="h-9 flex flex-1 items-center justify-center gap-1.5 rounded-lg border text-xs font-semibold transition hover:border-red-300 hover:bg-red-50 hover:text-red-500"
            style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-secondary)" }}>
            <RotateCcw size={11} /> Limpar metas
          </button>
          <button type="button" onClick={onClose}
            className="h-9 flex flex-1 items-center justify-center rounded-lg text-xs font-semibold text-white transition hover:opacity-90"
            style={{ backgroundColor: "var(--dm-brand-500, #16A34A)" }}>
            Concluído
          </button>
        </div>
      </div>
    </>,
    document.body
  );
}

// ─── Theme Toggle ─────────────────────────────────────────────────────────────

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <button
      type="button"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      className="flex h-8 w-8 items-center justify-center rounded-lg border transition"
      style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-surface)", color: "var(--dm-text-secondary)" }}
      title="Alternar tema"
    >
      <Sun size={15} className="hidden dark:block" />
      <Moon size={15} className="block dark:hidden" />
    </button>
  );
}

/* Sidebar inline theme toggle — dois botões lado a lado (estilo NeuroBank) */
function SidebarThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);
  // resolvedTheme só existe após o mount (next-themes lê localStorage/SO no client) —
  // usar antes disso causa mismatch de hidratação entre server e client.
  const isDark = mounted && resolvedTheme === "dark";
  return (
    <div
      className="flex items-center gap-0.5 rounded-full p-[3px]"
      style={{ background: "var(--dm-bg-page)" }}
    >
      {/* Moon = dark mode */}
      <button
        type="button"
        onClick={() => setTheme("dark")}
        className="flex h-[30px] w-[30px] items-center justify-center rounded-full transition-all duration-200"
        style={isDark
          ? { background: "var(--dm-primary)", color: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,0.3)" }
          : { color: "var(--dm-text-tertiary)" }
        }
        title="Modo escuro"
      >
        <Moon size={14} />
      </button>
      {/* Sun = light mode */}
      <button
        type="button"
        onClick={() => setTheme("light")}
        className="flex h-[30px] w-[30px] items-center justify-center rounded-full transition-all duration-200"
        style={!isDark
          ? { background: "var(--dm-primary)", color: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,0.2)" }
          : { color: "var(--dm-text-tertiary)" }
        }
        title="Modo claro"
      >
        <Sun size={14} />
      </button>
    </div>
  );
}

/* Rail theme toggle — botão único (estilo mock) */
function RailThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);
  const isDark = mounted && resolvedTheme === "dark";
  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label="Alternar tema"
      data-tip="Tema"
      className="dm-sidebar-tooltip flex h-10 w-10 items-center justify-center rounded-xl transition-colors hover:bg-[var(--dm-nav-hover-bg)]"
      style={{ color: "#8A8F84" }}
    >
      {isDark ? <Sun size={19} strokeWidth={1.9} /> : <Moon size={19} strokeWidth={1.9} />}
    </button>
  );
}

function UserMenu({
  name,
  email,
  onEditProfile,
  onSignOut,
}: {
  name: string;
  email: string;
  onEditProfile: () => void;
  onSignOut: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const displayName = name.trim() || email.split("@")[0] || "Usuario";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition"
        style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-surface)", color: "var(--dm-text-secondary)" }}
      >
        <UserRound size={13} />
        <span className="hidden max-w-[120px] truncate sm:inline">{displayName}</span>
        <ChevronDown size={12} className={`transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <>
          <button type="button" className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-label="Fechar menu de usuario" />
          <div className="absolute right-0 top-full z-50 mt-2 w-[220px] rounded-xl border p-1.5 shadow-xl" style={{ backgroundColor: "var(--dm-bg-surface)", borderColor: "var(--dm-border-default)" }}>
            <div className="mb-1 border-b px-2 py-1.5" style={{ borderColor: "var(--dm-border-subtle)" }}>
              <p className="truncate text-xs font-semibold" style={{ color: "var(--dm-text-primary)" }}>{displayName}</p>
              <p className="truncate text-[11px]" style={{ color: "var(--dm-text-secondary)" }}>{email}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onEditProfile();
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium transition"
              style={{ color: "var(--dm-text-secondary)" }}
            >
              <Pencil size={12} />
              Editar perfil
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                void onSignOut();
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
            >
              <LogOut size={12} />
              Sair
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Toggle Switch ────────────────────────────────────────────────────────────

function ToggleSwitch({
  checked, onChange, activeBg,
}: { checked: boolean; onChange: (v: boolean) => void; activeBg: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={(e) => { e.stopPropagation(); onChange(!checked); }}
      className="relative h-4 w-7 flex-shrink-0 rounded-full transition-colors duration-200 focus:outline-none"
      style={{ backgroundColor: checked ? "var(--dm-brand-500)" : "var(--dm-border-strong)" }}
    >
      <span
        className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-all duration-200 ${
          checked ? "left-[14px]" : "left-0.5"
        }`}
      />
    </button>
  );
}

// ─── Import popover ───────────────────────────────────────────────────────────

type ImportTab = "sheets" | "csv" | "meta";

type DatePreset = "7d" | "14d" | "30d" | "90d" | "max";

const DATE_PRESET_LABELS: Record<DatePreset, string> = {
  "7d":  "7 dias",
  "14d": "14 dias",
  "30d": "30 dias",
  "90d": "90 dias",
  "max": "Todo período",
};

function dateRangeFromPreset(preset: DatePreset): { from: string; to: string } {
  const fmt  = (d: Date) => d.toISOString().slice(0, 10);
  const to   = new Date();
  const from = new Date();
  if (preset === "max") {
    from.setFullYear(to.getFullYear() - 3); // Meta supports ~37 months max
  } else {
    const days = preset === "7d" ? 7 : preset === "14d" ? 14 : preset === "30d" ? 30 : 90;
    from.setDate(to.getDate() - days + 1);
  }
  return { from: fmt(from), to: fmt(to) };
}

interface ImportPopoverProps {
  onImportCsv: (file: File) => Promise<void>;
  onImportUrl: (url: string) => Promise<void>;
  onImportMeta?: (accounts: Record<string, string>, dateFrom: string, dateTo: string, campaignFilter?: Record<string, string[]>) => Promise<void>;
  campaignConfigs: Record<string, CampaignConfig>;
  onSaveCampaignConfig: (group: string, config: CampaignConfig) => void;
  onClose: () => void;
  onCampaignsVerified: (groupId: string, campaigns: CampaignSummary[]) => void;
  savedCampaignsByGroup: Record<string, CampaignSummary[]>;
  savedSelectedCampaigns: Record<string, string[]>;
  onSaveCampaignSelection: (groupId: string, ids: string[]) => void;
  onClearCampaignSelection?: (groupId: string) => void;
  customGroups: CustomGroup[];
  onAddCustomGroup: (group: CustomGroup) => void;
  onOpenControlPanel?: () => void;
  customSections: CustomSection[];
}

// ─── Account row (dynamic "add what you need" UX) ─────────────────────────────
interface AccountRow { rowId: string; groupId: string; accountId: string }

function ImportPopover({
  onImportCsv, onImportUrl, onImportMeta, campaignConfigs, onSaveCampaignConfig, onClose,
  onCampaignsVerified, savedCampaignsByGroup, savedSelectedCampaigns, onSaveCampaignSelection,
  onClearCampaignSelection,
  customGroups, onAddCustomGroup, onOpenControlPanel, customSections, initialTab, inline,
}: ImportPopoverProps & { initialTab?: ImportTab; inline?: boolean }) {
  const [tab, setTab]                     = useState<ImportTab>(initialTab ?? "sheets");
  const [url, setUrl]                     = useState("");
  const [loading, setLoading]             = useState<"url" | "csv" | null>(null);
  const [accessToken, setAccessToken]     = useState(() => loadMetaCredentials().accessToken);

  // Single account mode: only one row allowed at a time.
  const [accountRows, setAccountRows]     = useState<AccountRow[]>(() => {
    const first = Object.entries(campaignConfigs)
      .filter(([, cfg]) => cfg?.adAccountId?.trim())
      .slice(0, 1)
      .map(([groupId, cfg]) => ({ rowId: groupId, groupId, accountId: cfg.adAccountId }));
    return first.length > 0 ? first : [{ rowId: "primary", groupId: CAMPAIGN_GROUPS[0]?.id ?? "primary", accountId: "" }];
  });

  // Derived lookup — compatible with all handlers that key by groupId
  const adAccountIds = Object.fromEntries(accountRows.map((r) => [r.groupId, r.accountId]));

  const [metaSaved, setMetaSaved]         = useState(false);
  const [fetchingAccounts, setFetchingAccounts] = useState(false);
  const [metaAccounts, setMetaAccounts]   = useState<MetaAdAccount[]>([]);
  const [openDropdownRow, setOpenDropdownRow] = useState<string | null>(null);
  const [dropdownRect, setDropdownRect]   = useState<{ top: number; left: number; width: number } | null>(null);
  const inputWrapperRefs                  = useRef<Map<string, HTMLDivElement>>(new Map());
  const [datePreset, setDatePreset]       = useState<DatePreset>("max");
  const dateRange = dateRangeFromPreset(datePreset);
  // Show the full accounts section only after "Conectar" or if accounts were previously saved
  const showAccountsSection = metaAccounts.length > 0 || accountRows.some((r) => r.accountId.trim());
  const [importingMeta, setImportingMeta] = useState(false);
  const fileRef                           = useRef<HTMLInputElement>(null);

  // Open account dropdown anchored to the input wrapper via fixed positioning
  const openAccountDropdown = useCallback((rowId: string) => {
    if (openDropdownRow === rowId) { setOpenDropdownRow(null); setDropdownRect(null); return; }
    const el = inputWrapperRefs.current.get(rowId);
    if (el) {
      const r = el.getBoundingClientRect();
      setDropdownRect({ top: r.bottom + 2, left: r.left, width: r.width });
    }
    setOpenDropdownRow(rowId);
  }, [openDropdownRow]);

  // ── All groups (static + custom) ────────────────────────────────────────────
  const allGroupsInPopover = useMemo<GroupConfig[]>(() => [
    ...CAMPAIGN_GROUPS,
    ...customGroups.map((cg): GroupConfig => {
      const isBuiltin = cg.section in SECTION_DEFAULTS;
      if (isBuiltin) {
        return { ...SECTION_DEFAULTS[cg.section], id: cg.id, label: cg.label, section: cg.section as GroupSection };
      }
      const customSec = customSections.find((s) => s.id === cg.section);
      const colorKey: ColorKey = customSec?.colorKey ?? "blue";
      const colorCfg = COLOR_CONFIG_MAP[colorKey];
      const ResolvedIcon = ICON_MAP[customSec?.iconName ?? "Package"] ?? Package;
      return { ...colorCfg, icon: ResolvedIcon, id: cg.id, label: cg.label, section: cg.section as GroupSection };
    }),
  ], [customGroups, customSections]);

  // ── Add-campaign multi-step wizard ──────────────────────────────────────────
  type WizardStep = "idle" | "section" | "group" | "new-name";
  const [wizardStep, setWizardStep]         = useState<WizardStep>("idle");
  const [wizardSection, setWizardSection]   = useState<GroupSection | null>(null);
  const [wizardNewName, setWizardNewName]   = useState("");

  const wizardGroupsForSection = useMemo(
    () => allGroupsInPopover.filter((g) => g.section === wizardSection),
    [allGroupsInPopover, wizardSection],
  );

  const usedGroupIds = new Set(accountRows.map((r) => r.groupId));

  const handleWizardSelectGroup = (groupId: string) => {
    setAccountRows((p) => [...p, { rowId: `row-${Date.now()}`, groupId, accountId: "" }]);
    setWizardStep("idle"); setWizardSection(null); setWizardNewName("");
  };

  const handleWizardCreateNew = () => {
    const name = wizardNewName.trim();
    if (!name || !wizardSection) return;
    const id = `custom-${wizardSection}-${Date.now()}`;
    onAddCustomGroup({ id, label: name, section: wizardSection });
    setAccountRows((p) => [...p, { rowId: `row-${Date.now()}`, groupId: id, accountId: "" }]);
    setWizardStep("idle"); setWizardSection(null); setWizardNewName("");
  };

  const cancelWizard = () => { setWizardStep("idle"); setWizardSection(null); setWizardNewName(""); };

  // ── Campaign picker state ────────────────────────────────────────────────────
  // campaigns fetched per ad-account ID (shared across groups using the same account)
  const [campaignsByAccount, setCampaignsByAccount] = useState<Record<string, MetaCampaign[]>>({});
  // per-group: which campaign IDs are selected — init from persisted store
  const [selectedCampaigns, setSelectedCampaigns]   = useState<Record<string, string[]>>(() => ({ ...savedSelectedCampaigns }));
  // per-group: expand/collapse campaign list
  const [expandedGroup, setExpandedGroup]           = useState<string | null>(null);
  // per-group: loading / ok / error status for verification
  type VerifyStatus = "idle" | "loading" | "ok" | "error";
  const [verifyStatus, setVerifyStatus]             = useState<Record<string, VerifyStatus>>({});
  const [verifyError, setVerifyError]               = useState<Record<string, string>>({});

  const handleUrl = async (e: FormEvent) => {
    e.preventDefault();
    setLoading("url");
    try { await onImportUrl(url); onClose(); } finally { setLoading(null); }
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading("csv");
    try { await onImportCsv(file); onClose(); } finally { setLoading(null); e.target.value = ""; }
  };

  const handleSaveMeta = async (e: FormEvent) => {
    e.preventDefault();

    // 1. Persist credentials + account configs
    saveMetaCredentials({ accessToken });
    accountRows.forEach((r) => {
      if (r.accountId.trim()) onSaveCampaignConfig(r.groupId, { adAccountId: r.accountId.trim() });
    });

    // 2. Build campaign filter (only for groups with a strict subset selected)
    const campaignFilter: Record<string, string[]> = {};
    accountRows.forEach((r) => {
      const accountId = r.accountId.trim();
      if (!accountId) return;
      const allCamps  = campaignsByAccount[accountId] ?? [];
      const selected  = selectedCampaigns[r.groupId];
      if (allCamps.length > 0 && selected && selected.length < allCamps.length) {
        campaignFilter[r.groupId] = selected;
      }
    });

    // 3. Auto-fetch insights if handler is available
    if (onImportMeta) {
      setImportingMeta(true);
      try {
        await onImportMeta(
          adAccountIds,
          dateRange.from,
          dateRange.to,
          Object.keys(campaignFilter).length > 0 ? campaignFilter : undefined,
        );
        // Sync the dashboard campaign filter to match what was actually imported.
        // If the user picked a strict subset → apply it as the active filter so
        // only those campaigns appear in the sidebar and charts.
        // If the user imported everything → clear any stale filter.
        accountRows.forEach((r) => {
          if (!r.accountId.trim()) return;
          const importedIds = campaignFilter[r.groupId]; // defined only when a strict subset was chosen
          if (importedIds && importedIds.length > 0) {
            onSaveCampaignSelection(r.groupId, importedIds);
          } else if (onClearCampaignSelection) {
            onClearCampaignSelection(r.groupId);
          }
        });
        onClose(); // close popover on success
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Falha ao buscar dados da Meta.");
      } finally {
        setImportingMeta(false);
      }
    } else {
      setMetaSaved(true);
      setTimeout(() => setMetaSaved(false), 2000);
    }
  };

  const handleFetchAccounts = async () => {
    setFetchingAccounts(true);
    try {
      const accounts = await fetchMetaAdAccounts(accessToken);
      setMetaAccounts(accounts);
      if (accounts.length === 0) toast.warning("Nenhuma conta encontrada para este token.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao buscar contas.");
      setMetaAccounts([]);
    } finally {
      setFetchingAccounts(false);
    }
  };

  // Deduplica chamadas simultâneas para o mesmo adAccountId (handleVerifyAll paralelo)
  const pendingVerifyRef = useRef<Record<string, Promise<MetaCampaign[]>>>({});

  /** Verify + fetch campaigns for a single group. Shows green/red status. */
  const handleVerifyGroup = async (groupId: string) => {
    const accountId = adAccountIds[groupId]?.trim();
    if (!accountId || !accessToken) return;

    // Toggle collapse if already expanded and OK
    if (expandedGroup === groupId && verifyStatus[groupId] === "ok") {
      setExpandedGroup(null);
      return;
    }

    setExpandedGroup(groupId);
    setVerifyStatus((p) => ({ ...p, [groupId]: "loading" }));
    setVerifyError((p) => { const c = { ...p }; delete c[groupId]; return c; });

    // Sempre busca da API — garante que novas campanhas criadas na BM apareçam.
    // Deduplica chamadas para o mesmo accountId (evita rate-limit quando vários
    // grupos compartilham o mesmo adAccountId no handleVerifyAll paralelo).
    if (!pendingVerifyRef.current[accountId]) {
      pendingVerifyRef.current[accountId] = fetchMetaCampaigns(accountId, accessToken)
        .finally(() => { delete pendingVerifyRef.current[accountId]; });
    }

    try {
      const campaigns = await pendingVerifyRef.current[accountId]!;
      setCampaignsByAccount((p) => ({ ...p, [accountId]: campaigns }));
      // Restore previous selection if it exists; otherwise default to all selected
      setSelectedCampaigns((p) => {
        const existing = savedSelectedCampaigns[groupId];
        return {
          ...p,
          [groupId]: existing?.length ? existing : campaigns.map((c) => c.id),
        };
      });
      setVerifyStatus((p) => ({ ...p, [groupId]: "ok" }));
      if (campaigns.length === 0) {
        setVerifyError((p) => ({ ...p, [groupId]: "Nenhuma campanha ativa/pausada encontrada." }));
        setVerifyStatus((p) => ({ ...p, [groupId]: "error" }));
      } else {
        onCampaignsVerified(groupId, campaigns.map((c) => ({ id: c.id, name: c.name, status: c.status })));
      }
    } catch (e) {
      setVerifyStatus((p) => ({ ...p, [groupId]: "error" }));
      setVerifyError((p) => ({
        ...p,
        [groupId]: e instanceof Error ? e.message : "Erro ao verificar conta.",
      }));
    }
  };

  /** Verify all configured rows in parallel. */
  const handleVerifyAll = async () => {
    const rowsWithAccount = accountRows.filter((r) => r.accountId.trim());
    if (rowsWithAccount.length === 0) return;
    await Promise.allSettled(rowsWithAccount.map((r) => handleVerifyGroup(r.groupId)));
  };

  /** Change which group a row maps to. */
  const handleChangeRowGroup = (rowId: string, newGroupId: string) => {
    const old = accountRows.find((r) => r.rowId === rowId);
    setAccountRows((p) => p.map((r) => r.rowId === rowId ? { ...r, groupId: newGroupId, accountId: "" } : r));
    if (old) {
      setVerifyStatus((p) => { const c = { ...p }; delete c[old.groupId]; return c; });
      setVerifyError((p)  => { const c = { ...p }; delete c[old.groupId]; return c; });
      setSelectedCampaigns((p) => { const c = { ...p }; delete c[old.groupId]; return c; });
    }
    if (expandedGroup === old?.groupId) setExpandedGroup(null);
  };

  /** Update the account ID on a row (resets verify state). */
  const handleChangeRowAccount = (rowId: string, newAccountId: string) => {
    const row = accountRows.find((r) => r.rowId === rowId);
    if (!row) return;
    setAccountRows((p) => p.map((r) => r.rowId === rowId ? { ...r, accountId: newAccountId } : r));
    setVerifyStatus((p) => { const c = { ...p }; delete c[row.groupId]; return c; });
    setVerifyError((p)  => { const c = { ...p }; delete c[row.groupId]; return c; });
    setSelectedCampaigns((p) => { const c = { ...p }; delete c[row.groupId]; return c; });
    if (expandedGroup === row.groupId) setExpandedGroup(null);
  };

  /** Remove a row entirely. */
  const handleRemoveRow = (rowId: string) => {
    const row = accountRows.find((r) => r.rowId === rowId);
    setAccountRows((p) => p.filter((r) => r.rowId !== rowId));
    if (row) {
      setVerifyStatus((p) => { const c = { ...p }; delete c[row.groupId]; return c; });
      setVerifyError((p)  => { const c = { ...p }; delete c[row.groupId]; return c; });
      setSelectedCampaigns((p) => { const c = { ...p }; delete c[row.groupId]; return c; });
      if (expandedGroup === row.groupId) setExpandedGroup(null);
    }
  };

  /** Add a new empty row using the first unconfigured group. */
  const handleAddRow = (forcedGroupId?: string) => {
    const usedIds = new Set(accountRows.map((r) => r.groupId));
    const targetId = forcedGroupId ?? allGroupsInPopover.find((g) => !usedIds.has(g.id))?.id;
    if (!targetId) return;
    setAccountRows((p) => [...p, { rowId: `row-${Date.now()}`, groupId: targetId, accountId: "" }]);
  };

  /** Toggle a single campaign selection within a group. */
  const handleToggleCampaign = (groupId: string, campaignId: string, allForAccount: Array<{ id: string }>) => {
    const current = selectedCampaigns[groupId] ?? allForAccount.map((c) => c.id);
    const next    = current.includes(campaignId)
      ? current.filter((id) => id !== campaignId)
      : [...current, campaignId];
    setSelectedCampaigns((p) => ({ ...p, [groupId]: next }));
  };

  /** Select or deselect all campaigns for a group. */
  const handleSelectAllCampaigns = (groupId: string, allForAccount: Array<{ id: string }>, selectAll: boolean) => {
    const next = selectAll ? allForAccount.map((c) => c.id) : [];
    setSelectedCampaigns((p) => ({ ...p, [groupId]: next }));
  };

  const tabCls = (t: ImportTab) =>
    `flex-1 rounded-md py-1.5 text-xs font-medium transition ${
      tab === t ? "bg-[var(--dm-text-primary)] text-[var(--dm-text-inverse)]" : "text-[var(--dm-text-secondary)]"
    }`;

  const inputCls = "h-9 w-full rounded-lg border px-3 text-xs outline-none transition focus:ring-1 focus:ring-[var(--dm-brand-500)] focus:border-[var(--dm-brand-500)]";

  return (
    <>
      {/* Backdrop (popover only) */}
      {!inline && <div className="fixed inset-0 z-40" onClick={onClose} />}

      <div
        className={inline
          ? "flex w-full flex-col rounded-2xl border shadow-sm"
          : "absolute right-0 top-full z-50 mt-2 flex max-h-[calc(100vh-80px)] w-[92vw] max-w-[440px] flex-col rounded-2xl border shadow-2xl sm:w-[440px]"
        }
        style={{ backgroundColor: "var(--dm-bg-surface)", borderColor: "var(--dm-border-default)" }}
      >

        {/* Fixed header */}
        <div className="flex-shrink-0 border-b p-5 pb-4" style={{ borderColor: "var(--dm-border-default)" }}>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold" style={{ color: "var(--dm-text-primary)" }}>Conectar Meta ADS</p>
              <p className="text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>Conecte sua fonte de dados</p>
            </div>
            {inline ? (
              <button
                onClick={onClose}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-medium transition hover:opacity-80"
                style={{ color: "var(--dm-text-tertiary)" }}
              >
                ← Voltar
              </button>
            ) : (
              <button
                onClick={onClose}
                className="flex h-7 w-7 items-center justify-center rounded-full transition"
                style={{ color: "var(--dm-text-tertiary)" }}
              >
                <X size={15} />
              </button>
            )}
          </div>

          {/* Tabs */}
          <div className="flex gap-1 rounded-lg p-1" style={{ backgroundColor: "var(--dm-bg-elevated)" }}>
            <button className={tabCls("sheets")} onClick={() => setTab("sheets")}>Google Sheets</button>
            <button className={tabCls("csv")}    onClick={() => setTab("csv")}>CSV</button>
            <button className={tabCls("meta")}   onClick={() => setTab("meta")}>Meta Ads</button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className={inline ? "p-5" : "flex-1 overflow-y-auto p-5"}>

        {tab === "sheets" && (
          <form onSubmit={handleUrl} className="space-y-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold" style={{ color: "var(--dm-text-secondary)" }}>URL da planilha pública</label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Link2 size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--dm-text-tertiary)" }} />
                  <input
                    type="url" required value={url} onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://docs.google.com/spreadsheets/..."
                    className={`${inputCls} pl-8 pr-3`}
                    style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-elevated)", color: "var(--dm-text-primary)" }}
                  />
                </div>
                <button type="submit" disabled={!!loading}
                  className="flex h-9 items-center gap-1.5 rounded-lg bg-brand px-3 text-xs font-semibold text-white transition hover:bg-brand-hover disabled:opacity-60">
                  {loading === "url" ? <Loader2 size={12} className="animate-spin" /> : <TrendingUp size={12} />}
                  {loading === "url" ? "Carregando…" : "Carregar"}
                </button>
              </div>
              <p className="mt-1.5 text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>A planilha precisa estar com acesso público (Qualquer pessoa com o link)</p>
            </div>
          </form>
        )}

        {tab === "csv" && (
          <div className="space-y-3">
            <label className="mb-1.5 block text-xs font-semibold" style={{ color: "var(--dm-text-secondary)" }}>Arquivo CSV exportado</label>
            <button type="button" onClick={() => fileRef.current?.click()} disabled={!!loading}
              className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed py-6 text-center transition hover:border-[var(--dm-brand-400)] disabled:opacity-60"
              style={{ borderColor: "var(--dm-border-default)" }}>
              {loading === "csv"
                ? <Loader2 size={20} className="animate-spin" style={{ color: "var(--dm-brand-500)" }} />
                : <Upload size={20} style={{ color: "var(--dm-text-tertiary)" }} />}
              <div>
                <p className="text-xs font-semibold" style={{ color: "var(--dm-text-secondary)" }}>
                  {loading === "csv" ? "Importando arquivo…" : "Clique para selecionar"}
                </p>
                <p className="text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>Somente arquivos .csv</p>
              </div>
            </button>
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
          </div>
        )}

        {tab === "meta" && (
          <div className="flex flex-col items-center gap-4 py-4 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl"
              style={{ backgroundColor: "var(--dm-bg-elevated)" }}>
              <Settings2 size={24} style={{ color: "var(--dm-brand-500)" }} />
            </div>
            <div>
              <p className="text-sm font-bold" style={{ color: "var(--dm-text-primary)" }}>
                Configure no Painel de Controle
              </p>
              <p className="mt-1.5 text-[12px] leading-relaxed" style={{ color: "var(--dm-text-secondary)" }}>
                As conexões Meta Ads são gerenciadas no Painel de Controle.
                Vincule contas, organize por categoria e selecione campanhas com facilidade.
              </p>
            </div>
            <button
              type="button"
              onClick={() => { onOpenControlPanel?.(); onClose(); }}
              className="flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-bold text-white transition hover:opacity-90"
              style={{ backgroundColor: "var(--dm-brand-500)" }}
            >
              <Settings2 size={14} />
              Abrir Painel de Controle
            </button>
            <p className="text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>
              Ou use o botão ⚙️ no canto superior direito do dashboard.
            </p>
          </div>
        )}
        </div>{/* end scrollable */}
      </div>

      {/* ── Fixed account dropdown — rendered outside overflow containers ── */}
      {openDropdownRow && dropdownRect && metaAccounts.length > 0 && (
        <>
          {/* click-outside backdrop */}
          <div className="fixed inset-0 z-[70]" onClick={() => { setOpenDropdownRow(null); setDropdownRect(null); }} />
          <div
            className="fixed z-[80] max-h-52 overflow-y-auto rounded-xl shadow-2xl"
            style={{ background: "var(--dm-bg-elevated)", border: "1px solid var(--dm-border-default)", top: dropdownRect.top, left: dropdownRect.left, minWidth: Math.max(dropdownRect.width, 240) }}
          >
            {metaAccounts.map((acc) => (
              <button
                key={acc.id}
                type="button"
                onClick={() => {
                  handleChangeRowAccount(openDropdownRow, acc.id);
                  setOpenDropdownRow(null);
                  setDropdownRect(null);
                }}
                className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-[11px] transition hover:bg-slate-50 dark:hover:bg-slate-700 ${
                  acc.id === accountRows.find((r) => r.rowId === openDropdownRow)?.accountId
                    ? "bg-[#16A34A]/10 dark:bg-[#22C55E]/10"
                    : ""
                }`}
              >
                <span className="flex-1 min-w-0">
                  <span className="block truncate font-semibold text-slate-800 dark:text-slate-200">{acc.name}</span>
                  <span className="block font-mono text-[9px] text-slate-400 dark:text-slate-500">{acc.id}</span>
                </span>
                {acc.account_status !== 1 && (
                  <span className="shrink-0 rounded-full bg-amber-50 px-1.5 py-0.5 text-[9px] font-medium text-amber-600 dark:bg-amber-900/20 dark:text-amber-400">
                    Inativa
                  </span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );
}

// ─── Context bar (replaces right panel) ──────────────────────────────────────

interface ContextBarProps {
  selectedGroup:        string;
  groups:               GroupConfig[];
  customSections:       CustomSection[];
  categories?:          UserCategory[];
  showCourseGroups:     boolean;
  onSelectGroup:        (id: string) => void;
  checkedCampaignIds:   string[];
  campaignsByGroup:     Record<string, CampaignSummary[]>;
  onCheckedCampaignIds: (ids: string[]) => void;
  onClearCampaignFilter:() => void;
  dateFrom:             string;
  dateTo:               string;
  onDateFrom:           (v: string) => void;
  onDateTo:             (v: string) => void;
  hasActiveFilters:     boolean;
  onClearFilters:       () => void;
}

function ContextPill({
  label, active, isOpen, icon, onClick,
}: { label: string; active?: boolean; isOpen?: boolean; icon?: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-all"
      style={{
        background:   active || isOpen ? "rgba(22,163,74,0.12)" : "var(--dm-bg-elevated)",
        borderColor:  active || isOpen ? "rgba(91,96,210,0.35)"  : "var(--dm-border-default)",
        color:        active || isOpen ? "var(--dm-primary)"      : "var(--dm-text-secondary)",
      }}
    >
      {icon}
      <span className="max-w-[160px] truncate">{label}</span>
      <ChevronDown size={11} className={`transition-transform ${isOpen ? "rotate-180" : ""}`} />
    </button>
  );
}

function ContextBar({
  selectedGroup, groups, customSections, categories, showCourseGroups, onSelectGroup,
  checkedCampaignIds, campaignsByGroup, onCheckedCampaignIds, onClearCampaignFilter,
  dateFrom, dateTo, onDateFrom, onDateTo, hasActiveFilters, onClearFilters,
}: ContextBarProps) {
  const [openPopover, setOpenPopover] = useState<"group" | "campaign" | "period" | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  const [pendingFrom, setPendingFrom] = useState(dateFrom);
  const [pendingTo,   setPendingTo]   = useState(dateTo);
  useEffect(() => { setPendingFrom(dateFrom); }, [dateFrom]);
  useEffect(() => { setPendingTo(dateTo); }, [dateTo]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) setOpenPopover(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const toggle = (p: "group" | "campaign" | "period") =>
    setOpenPopover(prev => prev === p ? null : p);

  const groupLabel = selectedGroup === "all"
    ? "Todos os grupos"
    : (groups.find(g => g.id === selectedGroup)?.label ?? selectedGroup);

  // Dedup por id: a mesma campanha aparece em vários grupos que dividem a conta.
  // Sem dedup, keys do React se repetem e a lista não re-renderiza ao filtrar.
  const allCampaigns = useMemo(() => {
    const seen = new Set<string>();
    const out: { id: string; name: string; status?: string }[] = [];
    for (const c of Object.values(campaignsByGroup).flat()) {
      if (!c || seen.has(c.id)) continue;
      seen.add(c.id);
      out.push(c);
    }
    return out;
  }, [campaignsByGroup]);
  const [campSearch, setCampSearch] = useState("");
  const visibleCampaigns = useMemo(() => {
    const q = campSearch.trim().toLowerCase();
    return q ? allCampaigns.filter(c => (c.name ?? "").toLowerCase().includes(q)) : allCampaigns;
  }, [allCampaigns, campSearch]);

  const campaignLabel = checkedCampaignIds.length === 0
    ? `${allCampaigns.length} campanhas`
    : `${checkedCampaignIds.length} / ${allCampaigns.length}`;

  const periodLabel =
    dateFrom && dateTo   ? `${formatDatePtBr(dateFrom)} — ${formatDatePtBr(dateTo)}`
    : dateFrom           ? `A partir de ${formatDatePtBr(dateFrom)}`
    : dateTo             ? `Até ${formatDatePtBr(dateTo)}`
    : "Todo o período";

  const popoverBase: React.CSSProperties = {
    position:    "absolute",
    top:         "calc(100% + 6px)",
    zIndex:      50,
    background:  "var(--dm-bg-surface)",
    border:      "1px solid var(--dm-border-default)",
    borderRadius: 16,
    boxShadow:   "0 8px 32px rgba(0,0,0,0.18)",
    minWidth:    220,
  };

  return (
    <div ref={barRef} className="relative flex flex-wrap items-center gap-2">

      {/* ── Group pill ── */}
      {showCourseGroups && (
        <div className="relative">
          <ContextPill
            label={groupLabel}
            active={selectedGroup !== "all"}
            isOpen={openPopover === "group"}
            onClick={() => toggle("group")}
          />
          {openPopover === "group" && (
            <div style={{ ...popoverBase, left: 0, maxHeight: 320, overflowY: "auto" }}>
              <div className="py-1.5 px-1">
                <button
                  type="button"
                  onClick={() => { onSelectGroup("all"); setOpenPopover(null); }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[13px] transition"
                  style={{
                    fontWeight:   selectedGroup === "all" ? 600 : 400,
                    color:        selectedGroup === "all" ? "var(--dm-primary)" : "var(--dm-text-primary)",
                    background:   selectedGroup === "all" ? "rgba(22,163,74,0.08)" : "transparent",
                  }}
                >
                  <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: selectedGroup === "all" ? "var(--dm-primary)" : "var(--dm-border-strong)" }} />
                  Todos os grupos
                </button>
                {(() => {
                  let lastSection = "";
                  return groups.map(g => {
                    const newSection = g.section !== lastSection;
                    lastSection = g.section;
                    return (
                      <div key={g.id}>
                        {newSection && (
                          <p className="px-3 pt-2 pb-1 text-[9px] font-bold uppercase tracking-widest" style={{ color: "var(--dm-text-tertiary)" }}>
                            {getSectionLabel(g.section, customSections, categories)}
                          </p>
                        )}
                        <button
                          type="button"
                          onClick={() => { onSelectGroup(g.id); setOpenPopover(null); }}
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[13px] transition"
                          style={{
                            fontWeight: selectedGroup === g.id ? 600 : 400,
                            color:      selectedGroup === g.id ? "var(--dm-primary)" : "var(--dm-text-primary)",
                            background: selectedGroup === g.id ? "rgba(22,163,74,0.08)" : "transparent",
                          }}
                        >
                          <g.icon size={13} className="flex-shrink-0" style={{ color: selectedGroup === g.id ? "var(--dm-primary)" : "var(--dm-text-tertiary)" } as React.CSSProperties} />
                          <span className="truncate">{g.label}</span>
                        </button>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Campaign pill ── */}
      <div className="relative">
        <ContextPill
          label={campaignLabel}
          active={checkedCampaignIds.length > 0}
          isOpen={openPopover === "campaign"}
          onClick={() => toggle("campaign")}
        />
        {openPopover === "campaign" && (
          <div style={{ ...popoverBase, left: 0, width: 280 }}>
            <div className="p-2 border-b" style={{ borderColor: "var(--dm-border-subtle)" }}>
              <div className="flex items-center gap-1.5 rounded-lg px-2 py-1.5" style={{ background: "var(--dm-bg-elevated)" }}>
                <Search size={12} style={{ color: "var(--dm-text-tertiary)" }} />
                <input
                  type="text"
                  placeholder="Buscar campanha..."
                  value={campSearch}
                  onChange={e => setCampSearch(e.target.value)}
                  className="flex-1 bg-transparent text-[12px] outline-none"
                  style={{ color: "var(--dm-text-primary)" }}
                />
              </div>
            </div>
            <div className="flex items-center justify-between px-3 py-1.5 border-b" style={{ borderColor: "var(--dm-border-subtle)" }}>
              <button
                type="button"
                onClick={() => onCheckedCampaignIds(allCampaigns.map(c => c.id))}
                className="text-[11px] font-semibold"
                style={{ color: "var(--dm-primary)" }}
              >Selecionar tudo</button>
              <button
                type="button"
                onClick={() => { onCheckedCampaignIds([]); onClearCampaignFilter(); }}
                className="text-[11px] font-semibold"
                style={{ color: "var(--dm-text-tertiary)" }}
              >Limpar</button>
            </div>
            <div style={{ maxHeight: 260, overflowY: "auto" }} className="py-1 px-1">
              {visibleCampaigns.map(c => {
                const checked = checkedCampaignIds.includes(c.id);
                return (
                  <label
                    key={c.id}
                    className="flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 transition"
                    style={{ background: checked ? "rgba(22,163,74,0.06)" : "transparent" }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        const next = checked
                          ? checkedCampaignIds.filter(id => id !== c.id)
                          : [...checkedCampaignIds, c.id];
                        onCheckedCampaignIds(next);
                      }}
                      className="h-3.5 w-3.5 flex-shrink-0 accent-[var(--dm-primary)]"
                    />
                    <span className="truncate text-[12px]" style={{ color: "var(--dm-text-primary)" }}>{c.name}</span>
                  </label>
                );
              })}
              {visibleCampaigns.length === 0 && (
                <p className="px-3 py-4 text-center text-[12px]" style={{ color: "var(--dm-text-tertiary)" }}>Nenhuma campanha encontrada</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Period pill ── */}
      <DateRangePicker from={dateFrom} to={dateTo} onChange={(f, t) => { onDateFrom(f); onDateTo(t); }} />

      {/* ── Clear all ── */}
      {hasActiveFilters && (
        <button
          type="button"
          onClick={onClearFilters}
          className="flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[11px] font-semibold transition"
          style={{ color: "var(--dm-text-tertiary)", background: "transparent" }}
        >
          <X size={11} /> Limpar
        </button>
      )}
    </div>
  );
}

// ─── Campaign sidebar content ─────────────────────────────────────────────────

interface CampaignPanelProps {
  selectedGroup: string;
  selectedTurma: string;
  activeCampaigns: Record<string, boolean>;
  turmasByGroup: Record<string, string[]>;
  dateFrom: string;
  dateTo: string;
  searchCampaign: string;
  showCourseGroups: boolean;
  groups: GroupConfig[];
  customSections: CustomSection[];
  categories?: UserCategory[];
  selectedCampaign: string;
  campaignsByGroup: Record<string, CampaignSummary[]>;
  checkedCampaignIds: string[];
  sortBy: SortBy;
  onSelectGroup: (id: string) => void;
  onSelectTurma: (t: string) => void;
  onSelectCampaign: (id: string) => void;
  onToggleActive: (id: string, v: boolean) => void;
  onDateFrom: (v: string) => void;
  onDateTo: (v: string) => void;
  onSearch: (v: string) => void;
  onClearFilters: () => void;
  onSortBy: (v: SortBy) => void;
  onCheckedCampaignIds: (ids: string[]) => void;
  onClearCampaignFilter: () => void;
  isFilterExplicit: boolean;
  hasActiveFilters: boolean;
  onCollapse?: () => void;
}

function CampaignPanel({
  selectedGroup, selectedTurma, activeCampaigns, turmasByGroup,
  dateFrom, dateTo, searchCampaign, showCourseGroups,
  groups, customSections, categories, selectedCampaign, campaignsByGroup, checkedCampaignIds, sortBy,
  onSelectGroup, onSelectTurma, onSelectCampaign, onToggleActive,
  onDateFrom, onDateTo, onSearch, onClearFilters, onSortBy, onCheckedCampaignIds,
  onClearCampaignFilter, isFilterExplicit, hasActiveFilters, onCollapse,
}: CampaignPanelProps) {
  const activeCount = Object.values(activeCampaigns).filter(Boolean).length;
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [campSearch, setCampSearch] = useState("");

  // ── Pending date state: only applied when "Aplicar" is clicked ──
  const [pendingFrom, setPendingFrom] = useState(dateFrom);
  const [pendingTo,   setPendingTo]   = useState(dateTo);
  // Keep pending in sync when parent clears filters externally
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setPendingFrom(dateFrom); }, [dateFrom]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setPendingTo(dateTo); }, [dateTo]);
  const pendingChanged = pendingFrom !== dateFrom || pendingTo !== dateTo;

  const applyDates = () => {
    onDateFrom(pendingFrom);
    onDateTo(pendingTo);
  };

  // Flatten all campaign names across all groups for search suggestions
  const allCampaignNames = useMemo(() => {
    const seen = new Set<string>();
    Object.values(campaignsByGroup).forEach((camps) =>
      camps.forEach((c) => seen.add(c.name)),
    );
    return Array.from(seen).sort();
  }, [campaignsByGroup]);

  const searchSuggestions = useMemo(() => {
    if (!searchCampaign || searchCampaign.length < 2) return [];
    const q = searchCampaign.toLowerCase();
    return allCampaignNames.filter((n) => n.toLowerCase().includes(q)).slice(0, 7);
  }, [searchCampaign, allCampaignNames]);

  return (
    <div className="flex h-full flex-col">
      {/* Header — curso vs filtros */}
      <div className="flex min-h-12 flex-shrink-0 items-center justify-between gap-2 border-b px-4 py-2" style={{ borderColor: "var(--dm-border-default)" }}>
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "var(--dm-text-tertiary)" }}>
            {showCourseGroups ? "Grupos e campanhas" : "Filtros"}
          </p>
          {activeCount > 0 && showCourseGroups && (
            <span className="w-fit rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ backgroundColor: "var(--dm-brand-50)", color: "var(--dm-brand-500)" }}>
              {activeCount} curso{activeCount !== 1 ? "s" : ""} em destaque
            </span>
          )}
        </div>
        {onCollapse && (
          <button
            type="button"
            onClick={onCollapse}
            title="Recolher painel"
            className="hidden lg:flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md border transition hover:bg-[var(--dm-bg-elevated)]"
            style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-tertiary)" }}
          >
            <ChevronRight size={12} />
          </button>
        )}
      </div>

      {/* Campaign course list — only for Pós Graduação */}
      {showCourseGroups && (
      <div className="flex-1 overflow-y-auto py-1">
        {/* "All" option */}
        <button
          onClick={() => onSelectGroup("all")}
          className="flex w-full items-center gap-2.5 px-4 py-3 text-left transition"
          style={{
            backgroundColor: selectedGroup === "all" ? "var(--dm-brand-50)" : undefined,
          }}
        >
          <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: selectedGroup === "all" ? "var(--dm-brand-500)" : "var(--dm-border-strong)" }} />
          <span className="text-[13px] font-semibold" style={{ color: selectedGroup === "all" ? "var(--dm-brand-600)" : "var(--dm-text-primary)" }}>
            Todos os cursos
          </span>
        </button>

        <div className="mx-4 my-1 h-px" style={{ backgroundColor: "var(--dm-border-subtle)" }} />

        {groups.map((group, idx) => {
          const isSelected  = selectedGroup === group.id;
          const isActive    = activeCampaigns[group.id] ?? false;
          const turmaList   = turmasByGroup[group.id] ?? [];
          const prevSection = idx > 0 ? groups[idx - 1].section : null;
          const isNewSection = group.section !== prevSection;

          return (
            <div key={group.id}>
              {/* Section divider — shown at the start of each new section */}
              {isNewSection && (
                <div className={`${idx > 0 ? "mt-2 border-t" : ""} px-4 pb-1 pt-2.5`} style={{ borderColor: "var(--dm-border-subtle)" }}>
                  <p className="text-[10px] font-extrabold uppercase tracking-widest"
                    style={{ color: "var(--dm-text-tertiary)" }}>
                    {getSectionLabel(group.section, customSections, categories)}
                  </p>
                </div>
              )}
              <div
                role="button"
                tabIndex={0}
                onClick={() => onSelectGroup(isSelected ? "all" : group.id)}
                onKeyDown={(e) => e.key === "Enter" && onSelectGroup(isSelected ? "all" : group.id)}
                className="flex w-full cursor-pointer items-center gap-3 px-4 py-2 text-left transition"
                style={{
                  backgroundColor: isSelected ? "var(--dm-brand-50)" : undefined,
                  borderRight: isSelected ? "2px solid var(--dm-brand-400)" : "2px solid transparent",
                }}
              >
                <span className="relative flex h-2 w-2 flex-shrink-0 items-center justify-center">
                  {isActive && (
                    <span className="absolute h-3 w-3 animate-ping rounded-full opacity-40 bg-[#22C55E]" />
                  )}
                  <span className="relative h-2 w-2 rounded-full" style={{ backgroundColor: isActive ? "var(--dm-brand-500)" : "var(--dm-border-strong)" }} />
                </span>

                <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md" style={{ backgroundColor: "var(--dm-brand-50)", color: "var(--dm-brand-500)" }}>
                  <group.icon size={13} />
                </div>

                <span className="flex-1 truncate text-[13px] font-semibold leading-tight" style={{ color: isSelected ? "var(--dm-brand-600)" : "var(--dm-text-primary)" }}>
                  {group.label}
                </span>

                <ToggleSwitch
                  checked={isActive}
                  onChange={(v) => onToggleActive(group.id, v)}
                  activeBg={group.activeDot}
                />
              </div>

              {isSelected && (
                <div className="px-4 pb-2.5 pt-1" style={{ backgroundColor: "var(--dm-brand-50)" }}>
                  <p className="mb-1.5 ml-[38px] text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>Turmas</p>
                  <div className="ml-[38px] flex flex-wrap gap-1.5">
                    <button
                      onClick={() => onSelectTurma("all")}
                      className="rounded-md px-2 py-1 text-[11px] font-semibold transition"
                      style={selectedTurma === "all"
                        ? { backgroundColor: "var(--dm-brand-500)", color: "#fff" }
                        : { border: "1px solid var(--dm-border-default)", backgroundColor: "var(--dm-bg-surface)", color: "var(--dm-text-secondary)" }}
                    >
                      Todas
                    </button>
                    {turmaList.map((t) => (
                      <button
                        key={t}
                        onClick={() => onSelectTurma(t)}
                        className="rounded-md px-2 py-1 text-[11px] font-semibold transition"
                        style={selectedTurma === t
                          ? { backgroundColor: "var(--dm-brand-500)", color: "#fff" }
                          : { border: "1px solid var(--dm-border-default)", backgroundColor: "var(--dm-bg-surface)", color: "var(--dm-text-secondary)" }}
                      >
                        {t}
                      </button>
                    ))}
                    {turmaList.length === 0 && (
                      <span className="text-[11px] italic" style={{ color: "var(--dm-text-tertiary)" }}>Sem turmas carregadas</span>
                    )}
                  </div>

                  {/* Campaign selector — checkbox list with search */}
                  {(campaignsByGroup[group.id] ?? []).length > 0 && (() => {
                    const camps = campaignsByGroup[group.id] ?? [];
                    const allIds = camps.map((c) => c.id);
                    const visibleCamps = campSearch
                      ? camps.filter((c) => c.name.toLowerCase().includes(campSearch.toLowerCase()))
                      : camps;
                    // isFilterExplicit = key exists in store (even if empty = deselect-all)
                    const activeChecked = isFilterExplicit ? checkedCampaignIds.length : allIds.length;
                    const allExplicit = isFilterExplicit && checkedCampaignIds.length === allIds.length;
                    const noneExplicit = isFilterExplicit && checkedCampaignIds.length === 0;
                    return (
                      <div className="ml-[38px] mt-2 border-t pt-2" style={{ borderColor: "var(--dm-border-default)" }}>
                        {/* Header row */}
                        <div className="mb-1.5 flex items-center justify-between">
                          <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>
                            Campanha{" "}
                            <span className="rounded px-1 text-[9px] font-bold" style={{ backgroundColor: isFilterExplicit ? "var(--dm-brand-50)" : "var(--dm-bg-elevated)", color: isFilterExplicit ? "var(--dm-brand-500)" : "var(--dm-text-tertiary)" }}>
                              {activeChecked}/{allIds.length}
                            </span>
                          </p>
                          <div className="flex items-center gap-1.5">
                            {isFilterExplicit ? (
                              <>
                                {!allExplicit && (
                                  <button type="button" onClick={() => onCheckedCampaignIds([...allIds])}
                                    className="text-[9px] font-semibold text-[#16A34A] transition hover:opacity-80 dark:text-[#22C55E]">
                                    Sel. tudo
                                  </button>
                                )}
                                {!noneExplicit && (
                                  <button type="button" onClick={() => onCheckedCampaignIds([])}
                                    className="text-[9px] font-semibold text-slate-400 transition hover:text-red-500 dark:text-slate-500 dark:hover:text-red-400">
                                    Desmarcar
                                  </button>
                                )}
                                <button type="button" onClick={onClearCampaignFilter}
                                  className="text-[9px] font-semibold text-slate-300 transition hover:text-slate-500 dark:text-slate-600 dark:hover:text-slate-400">
                                  Limpar
                                </button>
                              </>
                            ) : (
                              <button type="button" onClick={() => onCheckedCampaignIds([...allIds])}
                                className="text-[9px] font-semibold text-slate-400 transition hover:text-[#16A34A] dark:text-slate-500 dark:hover:text-[#22C55E]">
                                Filtrar
                              </button>
                            )}
                          </div>
                        </div>
                        {/* Search inside campaign list */}
                        <div className="relative mb-1.5">
                          <input
                            type="text"
                            value={campSearch}
                            onChange={(e) => setCampSearch(e.target.value)}
                            placeholder={`Buscar entre ${allIds.length} campanhas…`}
                            className="h-6 w-full rounded-md border px-2 text-[10px] outline-none transition"
                            style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-elevated)", color: "var(--dm-text-primary)" }}
                          />
                          {campSearch && (
                            <button onClick={() => setCampSearch("")}
                              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                              <X size={9} />
                            </button>
                          )}
                        </div>
                        <div className="max-h-52 overflow-y-auto rounded-lg border" style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-surface)" }}>
                          {visibleCamps.length === 0 && (
                            <p className="px-2 py-2 text-[10px] italic" style={{ color: "var(--dm-text-tertiary)" }}>
                              Nenhuma campanha encontrada.
                            </p>
                          )}
                          {visibleCamps.map((camp) => {
                            const isChecked = !isFilterExplicit || checkedCampaignIds.includes(camp.id);
                            return (
                              <label key={camp.id}
                                className="flex cursor-pointer items-center gap-2 px-2 py-2 transition hover:bg-black/5 dark:hover:bg-white/5">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => {
                                    const base = isFilterExplicit ? checkedCampaignIds : [...allIds];
                                    const next = isChecked
                                      ? base.filter((id) => id !== camp.id)
                                      : [...base, camp.id];
                                    onCheckedCampaignIds(next);
                                  }}
                                  className="h-3.5 w-3.5 flex-shrink-0 rounded accent-blue-600"
                                />
                                <span className="flex-1 truncate text-[11px] font-medium" style={{ color: "var(--dm-text-secondary)" }} title={camp.name}>
                                  {camp.status !== "ACTIVE" && <span className="mr-0.5 text-amber-400">◐</span>}
                                  {camp.name}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          );
        })}
      </div>
      )} {/* end showCourseGroups */}

      {/* Filters — always visible */}
      <div
        className={`flex-shrink-0 border-t ${showCourseGroups ? "" : "flex-1"}`}
        style={{ borderColor: "var(--dm-border-default)" }}
      >
        {/* Filter header */}
        <div className="flex items-center justify-between px-4 py-3">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest" style={{ color: "var(--dm-text-tertiary)" }}>
            <SlidersHorizontal size={11} aria-hidden /> Período e busca
          </p>
          {hasActiveFilters && (
            <button
              onClick={onClearFilters}
              className="rounded px-2 py-0.5 text-[11px] font-semibold text-red-500 transition hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950/30"
            >
              Limpar
            </button>
          )}
        </div>

        <div className="space-y-3 px-4 pb-4">
          {/* Date range */}
          <div>
            <p className="mb-1.5 text-[11px] font-semibold" style={{ color: "var(--dm-text-secondary)" }}>Período</p>
            <DateRangePicker from={dateFrom} to={dateTo} onChange={(f, t) => { onDateFrom(f); onDateTo(t); }} />
          </div>

          {/* Campaign search */}
          <div>
            <p className="mb-1.5 text-[11px] font-semibold" style={{ color: "var(--dm-text-secondary)" }}>Buscar campanha</p>
            <div className="relative">
              <input
                type="text"
                value={searchCampaign}
                onChange={(e) => { onSearch(e.target.value); setShowSuggestions(true); }}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                placeholder="Nome da campanha…"
                className="h-9 w-full rounded-lg border px-3 text-xs outline-none transition"
                style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-elevated)", color: "var(--dm-text-primary)" }}
              />
              {searchCampaign && (
                <button
                  onClick={() => onSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
                >
                  <X size={12} />
                </button>
              )}
              {showSuggestions && searchSuggestions.length > 0 && (
                <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-lg border shadow-lg" style={{ backgroundColor: "var(--dm-bg-surface)", borderColor: "var(--dm-border-default)" }}>
                  {searchSuggestions.map((name) => (
                    <button
                      key={name}
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); onSearch(name); setShowSuggestions(false); }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition hover:bg-black/5 dark:hover:bg-white/5"
                      style={{ color: "var(--dm-text-secondary)" }}
                    >
                      <Filter size={9} className="flex-shrink-0" style={{ color: "var(--dm-text-tertiary)" } as React.CSSProperties} />
                      <span className="truncate">{name}</span>
                    </button>
                  ))}
                  {allCampaignNames.filter((n) => n.toLowerCase().includes(searchCampaign.toLowerCase())).length > 7 && (
                    <p className="px-3 py-1.5 text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>
                      +{allCampaignNames.filter((n) => n.toLowerCase().includes(searchCampaign.toLowerCase())).length - 7} mais resultados
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Sort */}
          <div>
            <p className="mb-1.5 text-[11px] font-semibold" style={{ color: "var(--dm-text-secondary)" }}>Ordenar por</p>
            <select
              value={sortBy}
              onChange={(e) => onSortBy(e.target.value as SortBy)}
              className="h-9 w-full rounded-lg border px-2 text-xs outline-none transition"
              style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-elevated)", color: "var(--dm-text-primary)" }}
            >
              {(Object.entries(SORT_LABELS) as [SortBy, string][]).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function Dashboard({
  campaigns,
  dataSource,
  syncStatus,
  campaignMetricsHasLeadsColumn = true,
  currentUser,
  categories = [],
  accountEntries = [],
  onCategoriesChange,
  onEntriesChange,
  onImportCsv,
  onImportUrl,
  onImportMeta,
  onRefresh,
  onClearData,
  onSignOut,
  onBackToWorkspace,
  onUpdateProfile,
  onOpenControlPanel,
}: DashboardProps) {
  const [mainTab, setMainTabState] = useState<MainTab>(() => {
    try {
      const saved = localStorage.getItem("dm_main_tab");
      if (saved && MAIN_TABS.some((t) => t.id === saved)) return saved as MainTab;
    } catch {}
    return "overview";
  });
  const setMainTab = useCallback((tab: MainTab) => {
    setMainTabState(tab);
    try { localStorage.setItem("dm_main_tab", tab); } catch {}
  }, []);
  const [dashSubTab, setDashSubTab]         = useState<DashSubTab>("overview");
  // Bloco "Campanhas" da Visão Geral: Performance por Campanha vs. Resumo diário.
  const [campanhasView, setCampanhasView] = useState<CampanhasView>(() => {
    if (typeof window === "undefined") return "performance";
    return localStorage.getItem(CAMPANHAS_VIEW_KEY) === "daily" ? "daily" : "performance";
  });
  const selectCampanhasView = useCallback((v: CampanhasView) => {
    setCampanhasView(v);
    try { localStorage.setItem(CAMPANHAS_VIEW_KEY, v); } catch {}
  }, []);
  const [histKind, setHistKind]             = useState<HistoricalKind>("lancamento");
  const { company: activeCompany, isOwner } = useCompany();
  // Usuário padrão (não-dono) só vê abas de conta pessoais na sidebar; o painel
  // de controle da empresa é exclusivo do dono. Mesma regra do MyAccount.
  const visibleAccountTabIds = accountTabsForRole(isOwner);
  // Conta + Empresa saíram do dash → centralizadas no modal de Configurações do hub.
  const visibleMainTabs = MAIN_TABS.filter((t) => t.id !== "empresa" && t.id !== "myaccount");
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Tab salvo (localStorage) pode apontar p/ empresa/myaccount removidos → cai p/ overview.
  useEffect(() => {
    if (mainTab === "empresa" || mainTab === "myaccount") setMainTab("overview");
  }, [mainTab, setMainTab]);
  const histLabels = activeCompany?.settings?.[HISTORY_TAB_LABELS_KEY] as Record<string, string> | undefined;
  const customHistTabs = readCustomHistoryTabs(activeCompany?.settings);
  const [myAccountTab, setMyAccountTab]     = useState<MyAccountTabId>("profile");

  // ── Sistema de abas (browser tabs) ─────────────────────────────────────────
  // Cada aba = uma view (mainTab + sub). Trocar de aba reaplica a navegação.
  type OpenTab = { id: string; label: string; baseLabel?: string; tab: MainTab; sub?: string };
  const [openTabs, setOpenTabs] = useState<OpenTab[]>(() => (
    [{ id: "tab-init", label: "Visão Geral", tab: "overview", sub: "overview" }]
  ));
  const [activeTabId, setActiveTabId] = useState("tab-init");

  // Item aberto dentro da aba (produto/perfil) — fica salvo p/ navegação rápida.
  const [productViewId, setProductViewId] = useState<string | null>(null);
  const [profileViewId, setProfileViewId] = useState<string | null>(null);

  // Renomeia a aba ATIVA p/ o nome do item aberto (e guarda o nome-base p/ restaurar).
  const setActiveTabItem = (itemLabel: string | null) => {
    setOpenTabs((prev) => prev.map((t) => {
      if (t.id !== activeTabId) return t;
      if (itemLabel) return { ...t, label: itemLabel, baseLabel: t.baseLabel ?? t.label };
      return { ...t, label: t.baseLabel ?? t.label, baseLabel: undefined };
    }));
  };
  const applyTabNav = (t: OpenTab) => {
    setMainTab(t.tab);
    if (t.tab === "overview") setDashSubTab((t.sub as DashSubTab) ?? "overview");
    else if (t.tab === "history" && t.sub) setHistKind(t.sub as HistoricalKind);
    else if (t.tab === "myaccount") setMyAccountTab((t.sub as MyAccountTabId) ?? "profile");
  };
  const openTab = (label: string, tab: MainTab, sub?: string) => {
    const existing = openTabs.find((t) => t.label === label);
    if (existing) { setActiveTabId(existing.id); applyTabNav(existing); return; }
    const nt: OpenTab = { id: "tab-" + Date.now(), label, tab, sub };
    setOpenTabs((p) => [...p, nt]);
    setActiveTabId(nt.id);
    applyTabNav(nt);
  };
  const activateTab = (id: string) => {
    const t = openTabs.find((x) => x.id === id);
    if (t) { setActiveTabId(id); applyTabNav(t); }
  };
  const closeTab = (id: string) => {
    setOpenTabs((prev) => {
      if (prev.length <= 1) return prev; // mantém ao menos 1 aba
      const rest = prev.filter((t) => t.id !== id);
      if (activeTabId === id) {
        const nt = rest[rest.length - 1];
        setActiveTabId(nt.id);
        applyTabNav(nt);
      }
      return rest;
    });
  };

  const {
    dateFrom, dateTo,
    setDateFrom: setDateFromPersist,
    setDateTo:   setDateToPersist,
  } = useDateRange();

  // ── Leads de outras fontes (planilha/Eduzz) p/ a quebra por canal no overview ─
  const [dbLeads, setDbLeads] = useState<LeadRow[]>([]);
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const load = () => fetchDbLeads().then(setDbLeads).catch(() => {});
    void load();
    const channel = subscribeLeads(load);
    return () => { void channel.unsubscribe(); };
  }, []);

  const leadsByOrigin = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of dbLeads) {
      const d = l.createdTime?.slice(0, 10);
      if (dateFrom && d && d < dateFrom) continue;
      if (dateTo && d && d > dateTo) continue;
      map.set(l.origem, (map.get(l.origem) ?? 0) + 1);
    }
    return Array.from(map, ([origem, leads]) => ({ origem, leads }));
  }, [dbLeads, dateFrom, dateTo]);

  // ── Metric visibility — shared across all tabs ────────────────────────────
  const { isVisible: isMetricVisible } = useMetricVisibility();

  // ── User avatar (photo or icon) ────────────────────────────────────────────
  const { avatarUrl } = useAvatarUrl();
  const { resolvedTheme } = useTheme();
  const resolvedAvatarSrc = resolveAvatarSrc(avatarUrl, resolvedTheme === "dark");
  const [pickCategoryOpen, setPickCategoryOpen] = useState(false);
  const [searchCampaign, setSearchCampaign] = useState("");
  const [showImport, setShowImport]         = useState(false);
  const [importInitialTab, setImportInitialTab] = useState<ImportTab>("meta");
  const [inlineImportTab, setInlineImportTab]   = useState<ImportTab | null>(null);

  const openImport = (tab: ImportTab = "meta") => {
    setImportInitialTab(tab);
    setShowImport(true);
  };
  const [showMobileNav, setShowMobileNav]   = useState(false);
  const [showMobilePanel, setShowMobilePanel] = useState(false);
  // Rail fixo de ícones — NUNCA expande (decisão de design: largura constante).
  const sidebarCollapsed = true;
  const [rightCollapsed, setRightCollapsed] = useState(false);
  // Flyout do rail: sub-abas ancoradas ao ícone, abertas no CLIQUE (mock).
  const [railFlyout, setRailFlyout] = useState<{ tab: MainTab; top: number } | null>(null);
  // Launcher "Nova aba": menu de abertura rápida (seções, perfis, bases).
  const [newTabOpen, setNewTabOpen] = useState(false);

  // Expansão desabilitada — rail permanece sempre estreito.
  const toggleSidebar = (_next: boolean) => {};

  const [sortBy, setSortBy] = useState<SortBy>("date-desc");
  const [checkedCampaignIds, setCheckedCampaignIds] = useState<string[]>([]);
  const [showGoals, setShowGoals] = useState(false);

  const { getGoals, setGoal, resetGoals } = useGoalsStore();
  const { profiles: advertiserProfiles } = useAdvertiserStore();
  const { overrides: manualOverrides, setOverride: setManualOverride } = useManualMetrics();

  const {
    selectedGroup, selectedTurma, activeCampaigns, campaignConfigs,
    selectedCategory, campaignsByGroup, selectedCampaign, selectedCampaignsByGroup, enabledSections,
    customGroups, addCustomGroup,
    customSections, addCustomSection, removeCustomSection,
    setSelectedGroup, setSelectedTurma, toggleActive, setCampaignConfig,
    setSelectedCategory, setCampaignsForGroup, setSelectedCampaign, setEnabledSections,
    setCampaignSelectionForGroup, clearCampaignSelectionForGroup, syncPanelConfig,
  } = useCampaignStore();

  // Guard por assinatura de VALOR: categories/accountEntries podem receber nova
  // referência a cada render (derivados sem memo). Sem isso, syncPanelConfig faz
  // setState → re-render → nova ref → loop infinito ("Maximum update depth").
  const lastSyncSig = useRef<string>("");
  useEffect(() => {
    const sig = JSON.stringify([categories, accountEntries]);
    if (sig === lastSyncSig.current) return;
    lastSyncSig.current = sig;
    syncPanelConfig(categories, accountEntries);
  }, [accountEntries, categories, syncPanelConfig]);

  const activeIgUserId = advertiserProfiles.find(p => p.groupId === selectedGroup)?.instagramUserId;

  // Goals are per-group; "all" uses the "global" bucket
  const goalsGroupKey = selectedGroup === "all" ? "global" : selectedGroup;
  const goals = getGoals(goalsGroupKey);

  // Sync sidebar checkboxes from persisted selections when the selected group or
  // store data changes (including the initial localStorage hydration).
  // Also auto-clears stale saved IDs that no longer exist in the current campaignsByGroup,
  // preventing the "ghost filter" bug where an old selection silently shows nothing.
  useEffect(() => {
    const normId = (x: string) => String(x).trim();
    if (selectedGroup === "all") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCheckedCampaignIds([]);
      return;
    }
    const saved = selectedCampaignsByGroup[selectedGroup];
    if (!saved?.length) {
      setCheckedCampaignIds([]);
      return;
    }
    const savedNorm = saved.map(normId);
    const summaries = campaignsByGroup[selectedGroup] ?? [];
    const currentGroupIds = summaries.map((c) => normId(c.id)).filter(Boolean);
    if (currentGroupIds.length > 0) {
      const idSet = new Set(currentGroupIds);
      const valid = savedNorm.filter((id) => idSet.has(id));
      if (valid.length === 0) {
        // Guardava IDs que não batem com a lista (ex.: tipos JSON diferentes) —
        // gravar [] deixava o filtro explícito ativo e escondia todos os dados.
        clearCampaignSelectionForGroup(selectedGroup);
        setCheckedCampaignIds([]);
        toast.info("Mostramos todas as campanhas deste grupo: os IDs guardados não coincidiam com a lista atual.");
        return;
      }
      if (valid.length !== savedNorm.length) {
        setCampaignSelectionForGroup(selectedGroup, valid);
        setCheckedCampaignIds(valid);
      } else {
        setCheckedCampaignIds(valid);
      }
    } else {
      // Campaign list not loaded yet — keep saved IDs as-is until list arrives
      setCheckedCampaignIds(savedNorm);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGroup, selectedCampaignsByGroup, campaignsByGroup]);

  // Após salvar conta no Painel: foca categoria, grupo, conta Meta e campanhas escolhidas.
  useEffect(() => {
    const onApply = (ev: Event) => {
      const custom = ev as CustomEvent<PainelSaveNavDetail>;
      const d = custom.detail;
      if (!d?.entry?.adAccountId?.trim()) return;

      const { entry, categorySlug, isCustom } = d;
      const summaries: CampaignSummary[] = entry.campaigns.map((c) => ({
        id: c.id,
        name: c.name,
        status: c.status,
      }));
      const subset =
        entry.selectedCampaignIds.length > 0 &&
        entry.selectedCampaignIds.length < entry.campaigns.length;

      setMainTab("overview");

      if (isCustom) {
        // Use the same prefix as syncPanelConfig so IDs stay consistent.
        // syncPanelConfig will re-create the customGroup automatically when
        // accountEntries updates — no need to addCustomGroup here.
        const gid = `panel-entry-${entry.id}`;
        setSelectedCategory(categorySlug);
        setSelectedGroup(gid);
        setCampaignConfig(gid, { adAccountId: entry.adAccountId });
        setCampaignsForGroup(gid, summaries);
        if (subset) setCampaignSelectionForGroup(gid, entry.selectedCampaignIds);
        else clearCampaignSelectionForGroup(gid);
        return;
      }

      const slug = categorySlug as ProductCategory;
      const groupId = mapPainelInternalFilterToDashboardGroupId(categorySlug, entry.internalFilter);
      setSelectedCategory(slug);
      setSelectedGroup(groupId);
      setCampaignConfig(groupId, { adAccountId: entry.adAccountId });
      setCampaignsForGroup(groupId, summaries);
      if (subset) setCampaignSelectionForGroup(groupId, entry.selectedCampaignIds);
      else clearCampaignSelectionForGroup(groupId);
    };

    window.addEventListener(PTA_PAINEL_SAVE_NAV_EVENT, onApply);
    return () => window.removeEventListener(PTA_PAINEL_SAVE_NAV_EVENT, onApply);
  }, [
    setSelectedCategory,
    setSelectedGroup,
    setCampaignConfig,
    setCampaignsForGroup,
    setCampaignSelectionForGroup,
    clearCampaignSelectionForGroup,
    setMainTab,
  ]);

  // Persist sidebar checkbox changes back to the store so they survive remounts.
  const handleCheckedCampaignIds = useCallback((ids: string[]) => {
    setCheckedCampaignIds(ids);
    if (selectedGroup !== "all") {
      setCampaignSelectionForGroup(selectedGroup, ids);
    }
  }, [selectedGroup, setCampaignSelectionForGroup]);

  // Clear the filter entirely (removes the key from the store → back to "show all" with no filter active)
  const handleClearCampaignFilter = useCallback(() => {
    setCheckedCampaignIds([]);
    if (selectedGroup !== "all") clearCampaignSelectionForGroup(selectedGroup);
  }, [selectedGroup, clearCampaignSelectionForGroup]);

  // Whether an explicit filter is active for the current group
  // (key exists in store even if empty = "deselect all" mode where nothing should show)
  const isFilterExplicit = selectedGroup !== "all" && selectedGroup in selectedCampaignsByGroup;

  // Merge static groups with custom-created ones
  const allGroups = useMemo<GroupConfig[]>(() => [
    ...CAMPAIGN_GROUPS,
    ...customGroups.map((cg): GroupConfig => {
      const isBuiltin = cg.section in SECTION_DEFAULTS;
      if (isBuiltin) {
        return { ...SECTION_DEFAULTS[cg.section], id: cg.id, label: cg.label, section: cg.section as GroupSection };
      }
      const customSec = customSections.find((s) => s.id === cg.section);
      const colorKey: ColorKey = customSec?.colorKey ?? "blue";
      const colorCfg = COLOR_CONFIG_MAP[colorKey];
      const ResolvedIcon = ICON_MAP[customSec?.iconName ?? "Package"] ?? Package;
      return { ...colorCfg, icon: ResolvedIcon, id: cg.id, label: cg.label, section: cg.section as GroupSection };
    }),
  ], [customGroups, customSections]);

  // ── Account → section map for Meta data ──────────────────────────────────────
  const accountSectionMap = useMemo<Record<string, ProductCategory>>(() => {
    const map: Record<string, ProductCategory> = {};
    allGroups.forEach((g) => {
      const rawId = campaignConfigs[g.id]?.adAccountId ?? "";
      if (rawId) {
        const bare = rawId.replace(/^act_/, "");
        map[bare] = g.section as ProductCategory;
        map[rawId] = g.section as ProductCategory;
      }
    });
    return map;
  }, [campaignConfigs]);

  // ── Mapa campanha→seção a partir da CONFIG da empresa (D-2) ─────────────────
  // A config (qual campanha está em qual grupo/filtro) é a fonte de verdade por
  // empresa. Substitui a classificação por keyword hardcoded (PTA) como primária.
  const campaignSectionMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const g of allGroups) {
      for (const camp of campaignsByGroup[g.id] ?? []) {
        const set = map.get(camp.name) ?? new Set<string>();
        set.add(g.section);
        map.set(camp.name, set);
      }
    }
    return map;
  }, [allGroups, campaignsByGroup]);

  // ── Category filtering (first pass) ─────────────────────────────────────────
  const categorizedCampaigns = useMemo(() => {
    if (!selectedCategory) return campaigns;
    return campaigns.filter((c) => {
      if (c.id.startsWith("meta-")) {
        // In-memory Meta campaign — adAccountId embedded in id
        const accountId = c.id.split("-")[1]; // "act_123456789"
        return (
          accountSectionMap[accountId] === selectedCategory ||
          accountSectionMap[accountId.replace(/^act_/, "")] === selectedCategory
        );
      }
      // Config da empresa MANDA: se a campanha está configurada em algum grupo,
      // usa a seção dele (adapta por empresa, sem keyword hardcoded).
      const configured = campaignSectionMap.get(c.campaignName);
      if (configured && configured.size > 0) return configured.has(selectedCategory);
      // Sem config: fallback ao classificador por nome (legado PTA).
      return classifyCampaign(c.campaignName) === selectedCategory;
    });
  }, [campaigns, selectedCategory, accountSectionMap, campaignSectionMap]);

  const turmasByGroup = useMemo<Record<string, string[]>>(() => {
    const map: Record<string, Set<string>> = {};
    categorizedCampaigns.forEach((item) => {
      let group = "";
      if (item.id.startsWith("meta-")) {
        const itemAccountId = item.id.split("-")[1];
        const bare = itemAccountId.replace(/^act_/, "");
        group = allGroups.find((g) => {
          const a = campaignConfigs[g.id]?.adAccountId ?? "";
          return a === itemAccountId || a.replace(/^act_/, "") === bare;
        })?.id ?? "";
      } else {
        group = getLaunchGroup(item.campaignName);
      }
      if (!group) return;
      const code = getSubLaunchCode(item.campaignName);
      if (!code) return;
      (map[group] ??= new Set()).add(code);
    });
    return Object.fromEntries(
      Object.entries(map).map(([g, s]) => [
        g,
        Array.from(s).sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true })),
      ]),
    );
  }, [categorizedCampaigns, campaignConfigs]);

  const filteredCampaigns = useMemo(() => {
    return categorizedCampaigns.filter((item) => {
      if (dateFrom && item.date < dateFrom) return false;
      if (dateTo && item.date > dateTo) return false;
      if (selectedGroup !== "all") {
        const adAccountId = campaignConfigs[selectedGroup]?.adAccountId ?? "";
        if (item.id.startsWith("meta-") && adAccountId) {
          // In-memory Meta campaign: filter by adAccountId embedded in the id
          const itemAccountId = item.id.split("-")[1];
          const bare = adAccountId.replace(/^act_/, "");
          if (itemAccountId !== adAccountId && itemAccountId.replace(/^act_/, "") !== bare) return false;
        } else if (!item.id.startsWith("meta-")) {
          const nameGroup = getLaunchGroup(item.campaignName);
          if (nameGroup === selectedGroup) {
            // Predefined group matched by campaign name — OK
          } else if (adAccountId) {
            // Custom group (has adAccountId) — name-based classification doesn't apply.
            // Match by verified campaign names from Meta API verification step.
            const verifiedCamps = campaignsByGroup[selectedGroup] ?? [];
            if (verifiedCamps.length > 0) {
              const verifiedNames = new Set(verifiedCamps.map((c) => c.name));
              if (!verifiedNames.has(item.campaignName)) return false;
            }
            // If no campaigns verified yet, no name-based filter — show all candidates
          } else {
            // Not a custom group and name doesn't match — exclude
            return false;
          }
        }
      }
      if (selectedTurma !== "all" && getSubLaunchCode(item.campaignName) !== selectedTurma) return false;
      if (selectedCampaign !== "all") {
        const groupCamps = campaignsByGroup[selectedGroup] ?? [];
        const campName = groupCamps.find((c) => c.id === selectedCampaign)?.name;
        if (campName && item.campaignName !== campName) return false;
      }
      if (isFilterExplicit && selectedGroup !== "all") {
        if (checkedCampaignIds.length === 0) return false; // deselect-all: nothing shows

        const groupCamps = campaignsByGroup[selectedGroup] ?? [];
        if (groupCamps.length > 0) {
          // Resolve checked campaign IDs → names
          const checkedNames = new Set(
            groupCamps.filter((c) => checkedCampaignIds.includes(c.id)).map((c) => c.name),
          );
          if (checkedNames.size > 0) {
            // Normal case: only show campaigns whose name is in the checked set
            if (!checkedNames.has(item.campaignName)) return false;
          } else {
            // IDs saved but none resolved to names (stale data after re-verification):
            // safe default — show nothing so the user knows to re-select
            return false;
          }
        }
        // groupCamps empty (checkboxes not loaded yet): don't block, show all
      }
      if (searchCampaign && !item.campaignName.toLowerCase().includes(searchCampaign.toLowerCase())) return false;
      return true;
    });
  }, [categorizedCampaigns, dateFrom, dateTo, selectedGroup, selectedTurma, selectedCampaign, checkedCampaignIds, isFilterExplicit, searchCampaign, campaignConfigs, campaignsByGroup]);

  const sortedCampaigns = useMemo(() => {
    const s = [...filteredCampaigns];
    switch (sortBy) {
      case "date-asc":    return s.sort((a, b) => a.date.localeCompare(b.date));
      case "invest-desc": return s.sort((a, b) => b.investment - a.investment);
      case "invest-asc":  return s.sort((a, b) => a.investment - b.investment);
      case "roas-desc":   return s.sort((a, b) => b.roas - a.roas);
      case "ctr-desc":    return s.sort((a, b) => b.ctr - a.ctr);
      default:            return s.sort((a, b) => b.date.localeCompare(a.date));
    }
  }, [filteredCampaigns, sortBy]);

  const campaignsWithOverrides = useMemo(
    () => applyOverrides(filteredCampaigns, manualOverrides),
    [filteredCampaigns, manualOverrides],
  );
  const totals             = aggregateTotals(campaignsWithOverrides);
  const allCampaignTotals  = useMemo(() => aggregateTotals(campaigns), [campaigns]);

  // Key for manual Eduzz edits: por campanha (compartilhado entre Dashboard e
  // Perfil de Anunciantes) quando há campanha única; senão por grupo.
  const eduzzEditKey = selectedCampaign !== "all"
    ? `camp::${selectedCampaign}`
    : `grp::${selectedGroup}`;

  // ── Eduzz manual sales totals — from the edit key (single context value) ──────
  const eduzzTotals = useMemo(() => {
    const ov = manualOverrides[eduzzEditKey];
    return {
      salesIngresso: ov?.salesIngresso ?? 0,
      salesPos:      ov?.salesPos      ?? 0,
      salesTotal:    ov?.salesTotal    ?? 0,
    };
  }, [eduzzEditKey, manualOverrides]);

  // Fallback de conversões: quando o Meta não traz conversões (0) mas há vendas
  // manuais lançadas (Eduzz), usa essas vendas como "Conversões" no card e no
  // funil — pra não mostrar 0 quando o pixel não captura.
  const manualSales = eduzzTotals.salesTotal > 0
    ? eduzzTotals.salesTotal
    : (eduzzTotals.salesIngresso + eduzzTotals.salesPos);
  const usingManualConversions = totals.totalConversions === 0 && manualSales > 0;
  const effectiveConversions = usingManualConversions ? manualSales : totals.totalConversions;
  // Tx. de conversão = conversões ÷ leads (mesma base da última etapa do funil),
  // pra não divergir do funil; cai para ÷ cliques quando não há leads.
  const effectiveConvRate = totals.totalLeads > 0
    ? (effectiveConversions / totals.totalLeads) * 100
    : totals.totalClicks > 0 ? (effectiveConversions / totals.totalClicks) * 100 : 0;

  // ── Resultado pela intenção da campanha (objective configurado na Meta) ─────
  // Quando todas as campanhas do filtro atual compartilham a mesma intenção,
  // o card "Conversões" vira o resultado certo daquela intenção (Leads, Vendas,
  // Cliques…) — espelhando o que o gestor configurou dentro da Meta.
  const { entries: centerEntries } = useCampaignCenter();
  const dominantIntent = useMemo<CampaignIntent | null>(() => {
    if (centerEntries.length === 0 || filteredCampaigns.length === 0) return null;
    const intentByName = new Map(centerEntries.map((e) => [e.campaignName, e.intent]));
    const found = new Set<CampaignIntent>();
    for (const c of filteredCampaigns) {
      const i = intentByName.get(c.campaignName);
      if (i) found.add(i);
    }
    return found.size === 1 ? [...found][0]! : null;
  }, [centerEntries, filteredCampaigns]);

  const intentResult = (() => {
    const t = totals;
    switch (dominantIntent) {
      case "lead_gen":
        return { label: "Resultados · Leads", value: t.totalLeads, sub: `CPL: ${formatCurrency(t.cpl)}` };
      case "direct_sale":
        return { label: "Resultados · Vendas", value: effectiveConversions, sub: `Tx.: ${formatPercent(effectiveConvRate)}` };
      case "profile_growth":
        return { label: "Resultados · Visitas ao perfil",
          value: t.totalPageViews > 0 ? t.totalPageViews : t.totalClicks,
          sub: `Cliques: ${formatNumber(t.totalClicks)}` };
      case "traffic":
        return { label: "Resultados · Cliques", value: t.totalClicks, sub: `CTR: ${formatPercent(t.ctr)}` };
      case "awareness":
        return { label: "Resultados · Impressões", value: t.totalImpressions, sub: `CPM: ${formatCurrency(t.cpm)}` };
      case "remarketing":
        return { label: "Resultados · Conversões", value: effectiveConversions, sub: `Tx.: ${formatPercent(effectiveConvRate)}` };
      default:
        return null;
    }
  })();

  // Builder do relatório — monta ReportData a partir dos totais visíveis + funil.
  const buildReportData = useCallback((): ReportData => {
    const t = totals;
    const inv = t.totalInvestment;
    // Ids batem com ALL_METRIC_IDS → "Configuração atual" respeita o que está
    // visível em "Personalizar cartões".
    const reportGroups: ReportData["groups"] = [
      { id: "g_fin", label: "Financeiro", items: [
        {
          id: "investment",
          label: "Total Investido",
          value: formatCurrency(t.totalInvestment),
          sub: `CTR médio: ${formatPercent(t.ctr)}`,
          accent: "rose",
          goalValue: goals.investment,
          goalLabel: goals.investment != null ? formatCurrency(goals.investment) : undefined,
          goalPct: goals.investment != null ? (t.totalInvestment / goals.investment) * 100 : null,
          goalInvert: true
        },
        {
          id: "revenue",
          label: "Receita Total",
          value: formatCurrency(t.totalRevenue),
          sub: `ROAS: ${t.roas.toFixed(2)}x`,
          accent: "green",
          goalValue: goals.revenue,
          goalLabel: goals.revenue != null ? formatCurrency(goals.revenue) : undefined,
          goalPct: goals.revenue != null ? (t.totalRevenue / goals.revenue) * 100 : null
        },
        {
          id: "roas",
          label: "ROAS",
          value: `${t.roas.toFixed(2)}x`,
          accent: "brand",
          goalValue: goals.roas,
          goalLabel: goals.roas != null ? `${goals.roas.toFixed(1)}x` : undefined,
          goalPct: goals.roas != null ? (t.roas / goals.roas) * 100 : null
        },
        {
          id: "sales_total",
          label: "Vendas Total",
          value: formatNumber(eduzzTotals.salesTotal),
          sub: "Eduzz — manual",
          accent: "green",
          goalValue: goals.sales_total,
          goalLabel: goals.sales_total != null ? formatNumber(goals.sales_total) : undefined,
          goalPct: goals.sales_total != null ? (eduzzTotals.salesTotal / goals.sales_total) * 100 : null
        },
        {
          id: "sales_ingresso",
          label: "Vendas de Ingresso",
          value: formatNumber(eduzzTotals.salesIngresso),
          sub: "Eduzz — manual",
          accent: "green",
          goalValue: goals.sales_ingresso,
          goalLabel: goals.sales_ingresso != null ? formatNumber(goals.sales_ingresso) : undefined,
          goalPct: goals.sales_ingresso != null ? (eduzzTotals.salesIngresso / goals.sales_ingresso) * 100 : null
        },
        {
          id: "sales_pos",
          label: "Vendas de Pós",
          value: formatNumber(eduzzTotals.salesPos),
          sub: "Eduzz — manual",
          accent: "green",
          goalValue: goals.sales_pos,
          goalLabel: goals.sales_pos != null ? formatNumber(goals.sales_pos) : undefined,
          goalPct: goals.sales_pos != null ? (eduzzTotals.salesPos / goals.sales_pos) * 100 : null
        },
        (() => { const v = eduzzTotals.salesIngresso > 0 ? t.totalInvestment / eduzzTotals.salesIngresso : 0; return {
          id: "cpa_ingresso", label: "Custo/Ingresso", value: v > 0 ? formatCurrency(v) : "—", accent: "amber" as const,
          goalValue: goals.cpa_ingresso, goalLabel: goals.cpa_ingresso != null ? formatCurrency(goals.cpa_ingresso) : undefined,
          goalPct: goals.cpa_ingresso != null && v > 0 ? (goals.cpa_ingresso / v) * 100 : null, goalInvert: true
        }; })(),
        (() => { const v = eduzzTotals.salesPos > 0 ? t.totalInvestment / eduzzTotals.salesPos : 0; return {
          id: "cpa_pos", label: "Custo/Pós", value: v > 0 ? formatCurrency(v) : "—", accent: "amber" as const,
          goalValue: goals.cpa_pos, goalLabel: goals.cpa_pos != null ? formatCurrency(goals.cpa_pos) : undefined,
          goalPct: goals.cpa_pos != null && v > 0 ? (goals.cpa_pos / v) * 100 : null, goalInvert: true
        }; })(),
        (() => { const v = eduzzTotals.salesTotal > 0 ? t.totalInvestment / eduzzTotals.salesTotal : 0; return {
          id: "cpa_venda", label: "Custo/Venda", value: v > 0 ? formatCurrency(v) : "—", accent: "amber" as const,
          goalValue: goals.cpa_venda, goalLabel: goals.cpa_venda != null ? formatCurrency(goals.cpa_venda) : undefined,
          goalPct: goals.cpa_venda != null && v > 0 ? (goals.cpa_venda / v) * 100 : null, goalInvert: true
        }; })(),
      ]},
      { id: "g_efic", label: "Eficiência", items: [
        {
          id: "roi",
          label: "ROI",
          value: formatPercent(t.roi),
          accent: t.roi >= 0 ? "green" : "rose",
          goalValue: goals.roi,
          goalLabel: goals.roi != null ? `${goals.roi.toFixed(0)}%` : undefined,
          goalPct: goals.roi != null ? (t.roi / goals.roi) * 100 : null
        },
        {
          id: "cpa",
          label: "CPA Médio",
          value: formatCurrency(t.cpa),
          accent: "rose",
          goalValue: goals.cpa,
          goalLabel: goals.cpa != null ? formatCurrency(goals.cpa) : undefined,
          goalPct: goals.cpa != null && t.cpa > 0 ? (goals.cpa / t.cpa) * 100 : null,
          goalInvert: true
        },
        {
          id: "ctr",
          label: "CTR Médio",
          value: formatPercent(t.ctr),
          accent: "sky",
          goalValue: goals.ctr,
          goalLabel: goals.ctr != null ? `${goals.ctr.toFixed(1)}%` : undefined,
          goalPct: goals.ctr != null ? (t.ctr / goals.ctr) * 100 : null
        },
        {
          id: "cpc",
          label: "CPC Médio",
          value: formatCurrency(t.cpc),
          accent: "rose",
          goalValue: goals.cpc,
          goalLabel: goals.cpc != null ? formatCurrency(goals.cpc) : undefined,
          goalPct: goals.cpc != null && t.cpc > 0 ? (goals.cpc / t.cpc) * 100 : null,
          goalInvert: true
        },
        {
          id: "conversions",
          label: intentResult?.label ?? "Conversões",
          value: formatNumber(intentResult?.value ?? effectiveConversions),
          sub: intentResult?.sub ?? `Tx.: ${formatPercent(effectiveConvRate)}${usingManualConversions ? " · manual" : ""}`,
          accent: "green",
          goalValue: intentResult ? undefined : goals.conversions,
          goalLabel: !intentResult && goals.conversions != null ? formatNumber(goals.conversions) : undefined,
          goalPct: !intentResult && goals.conversions != null ? (effectiveConversions / goals.conversions) * 100 : null
        },
      ]},
      { id: "g_vol", label: "Volume", items: [
        {
          id: "impressions",
          label: "Impressões",
          value: formatNumber(t.totalImpressions),
          accent: "slate",
          goalValue: goals.impressions,
          goalLabel: goals.impressions != null ? formatNumber(goals.impressions) : undefined,
          goalPct: goals.impressions != null ? (t.totalImpressions / goals.impressions) * 100 : null
        },
        {
          id: "clicks",
          label: "Cliques",
          value: formatNumber(t.totalClicks),
          sub: `CTR: ${formatPercent(t.ctr)}`,
          accent: "slate",
          goalValue: goals.clicks,
          goalLabel: goals.clicks != null ? formatNumber(goals.clicks) : undefined,
          goalPct: goals.clicks != null ? (t.totalClicks / goals.clicks) * 100 : null
        },
        {
          id: "cpm",
          label: "CPM Médio",
          value: formatCurrency(t.cpm),
          accent: "slate",
          goalValue: goals.cpm,
          goalLabel: goals.cpm != null ? formatCurrency(goals.cpm) : undefined,
          goalPct: goals.cpm != null && t.cpm > 0 ? (goals.cpm / t.cpm) * 100 : null,
          goalInvert: true
        },
        {
          id: "leads",
          label: "Leads",
          value: formatNumber(t.totalLeads),
          sub: `CPL: ${formatCurrency(t.cpl)}`,
          accent: "slate",
          goalValue: goals.leads,
          goalLabel: goals.leads != null ? formatNumber(goals.leads) : undefined,
          goalPct: goals.leads != null ? (t.totalLeads / goals.leads) * 100 : null
        },
        {
          id: "cpl",
          label: "CPL Médio",
          value: formatCurrency(t.cpl),
          accent: "slate",
          goalValue: goals.cpl,
          goalLabel: goals.cpl != null ? formatCurrency(goals.cpl) : undefined,
          goalPct: goals.cpl != null && t.cpl > 0 ? (goals.cpl / t.cpl) * 100 : null,
          goalInvert: true
        },
      ]},
    ];
    // Mantém só métricas visíveis (Personalizar cartões); descarta grupo vazio.
    const groups = reportGroups
      .map((g) => ({ ...g, items: g.items.filter((it) => isMetricVisible(it.id)) }))
      .filter((g) => g.items.length > 0);
    const funnel = reportFunnelFromValues({
      impressions: t.totalImpressions, clicks: t.totalClicks, conversions: effectiveConversions,
      leads: t.totalLeads, pageViews: t.totalPageViews, investment: inv, storageScope: currentUser.email,
    });
    const title = selectedGroup !== "all"
      ? (allGroups.find((g) => g.id === selectedGroup)?.label ?? selectedGroup)
      : "Todos os grupos";
    const period = dateFrom && dateTo ? `${dateFrom} → ${dateTo}` : "Todo o período";
    return { title, period, groups, funnel };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totals, eduzzTotals, effectiveConversions, effectiveConvRate, usingManualConversions, isMetricVisible, currentUser.email, selectedGroup, allGroups, dateFrom, dateTo, goals, dominantIntent]);

  // CPV — computed from spend / salesTotal (derived, not editable)
  // totals available after aggregation below, so computed inline at render time
  const needsLeadsMigration = !campaignMetricsHasLeadsColumn;
  const needsLeadsResync =
    campaignMetricsHasLeadsColumn &&
    dataSource?.type === "meta" &&
    campaigns.length > 0 &&
    allCampaignTotals.totalLeads === 0 &&
    allCampaignTotals.totalClicks > 0;
  const dailyTrend         = buildDailyTrend(filteredCampaigns);
  const campaignComparison = buildCampaignComparison(filteredCampaigns);
  const budgetDistribution = buildBudgetDistribution(filteredCampaigns);
  const aggregated         = useMemo(() => aggregateByCampaign(filteredCampaigns), [filteredCampaigns]);

  /**
   * Campaign ID filter passed to BestCreatives.
   *
   * Primary source: explicit header dropdown selection (checkedCampaignIds when isFilterExplicit=true).
   *
   * Fallback: ControlPanel entry selection.
   * Reason: the Dashboard's selectedGroup might have been created by the Meta import flow with a
   * different group ID than the one computed by syncPanelConfig for the ControlPanel entry (which
   * uses resolvePanelEntryGroupId). In that case isFilterExplicit=false even though the entry has
   * selectedCampaignIds. We bridge the gap by looking up entries with a matching adAccountId.
   *
   * Ambiguity guard: if multiple entries match the same adAccountId with DIFFERENT selections,
   * we don't guess — return undefined so all creatives are shown.
   */
  const bestCreativesFilter = useMemo<string[] | undefined>(() => {
    // 1. Explicit header filter always wins
    if (isFilterExplicit && checkedCampaignIds.length > 0) return checkedCampaignIds;
    if (selectedGroup === "all") return undefined;

    // 2. ControlPanel entry fallback: find enabled entries with a campaign sub-selection
    const acctId = (campaignConfigs[selectedGroup]?.adAccountId ?? "").replace(/^act_/, "");
    if (!acctId) return undefined;

    const matching = accountEntries.filter(
      (e) =>
        e.isEnabled &&
        e.adAccountId.replace(/^act_/, "") === acctId &&
        e.selectedCampaignIds.length > 0 &&
        e.selectedCampaignIds.length < e.campaigns.length,
    );
    if (matching.length === 0) return undefined;

    // Only apply if all matching entries agree on the same selection (no ambiguity)
    const canonical = [...matching[0].selectedCampaignIds].sort().join(",");
    if (matching.every((e) => [...e.selectedCampaignIds].sort().join(",") === canonical)) {
      return matching[0].selectedCampaignIds;
    }
    return undefined; // multiple entries, different selections — don't guess
  }, [isFilterExplicit, checkedCampaignIds, selectedGroup, campaignConfigs, accountEntries]);

  const showRightPanel     = mainTab !== "history" && mainTab !== "leads" && mainTab !== "tracking" && mainTab !== "profiles" && mainTab !== "products";
  const showCourseGroups   = selectedCategory !== null;
  const sidebarGroups      = selectedCategory
    ? allGroups.filter((g) => g.section === (selectedCategory as string))
    : allGroups;
  const currentTab         = MAIN_TABS.find((t) => t.id === mainTab)!;
  const hasActiveFilters   = !!(dateFrom || dateTo || searchCampaign || selectedGroup !== "all" || selectedCampaign !== "all" || isFilterExplicit);

  const dataSourcePill = useMemo(() => formatDataSourcePill(dataSource), [dataSource]);

  const lastSyncHint = useMemo(() => {
    const r = syncStatus?.result;
    if (!r?.synced || !r.dateFrom || !r.dateTo) return null;
    return `${r.synced} registo(s) · ${formatDatePtBr(r.dateFrom)} — ${formatDatePtBr(r.dateTo)}`;
  }, [syncStatus?.result]);

  const overviewSelectionSummary = useMemo(() => {
    if (!selectedCategory) return null;
    const catKey = selectedCategory as ProductCategory;
    const catName = getSectionLabel(String(selectedCategory), customSections, categories);
    const groupName =
      selectedGroup === "all"
        ? "Todos os grupos desta categoria"
        : (allGroups.find((g) => g.id === selectedGroup)?.label ?? selectedGroup);
    const period =
      dateFrom && dateTo
        ? `${formatDatePtBr(dateFrom)} — ${formatDatePtBr(dateTo)}`
        : dateFrom
          ? `A partir de ${formatDatePtBr(dateFrom)}`
          : dateTo
            ? `Até ${formatDatePtBr(dateTo)}`
            : "Todo o período disponível";
    return { catName, groupName, period };
  }, [selectedCategory, selectedGroup, allGroups, dateFrom, dateTo]);

  // Whether the current tab needs a category to be meaningful
  const needsCategory = mainTab !== "history" && mainTab !== "leads" && mainTab !== "tracking" && mainTab !== "profiles" && mainTab !== "products";

  const handleClearFilters = () => {
    setDateFromPersist(""); setDateToPersist(""); setSearchCampaign(""); setSelectedGroup("all"); setSelectedCampaign("all"); setCheckedCampaignIds([]);
  };

  const handleSelectGroup = (id: string) => {
    setSelectedGroup(id);
    if (id === "all") {
      setCheckedCampaignIds([]);
    } else {
      const saved = selectedCampaignsByGroup[id];
      setCheckedCampaignIds(saved ?? []);
    }
    setShowMobilePanel(false);
  };

  const handleSelectCampaign = (id: string) => {
    setSelectedCampaign(id);
    setShowMobilePanel(false);
  };

  /* Inline sub-items rendered below active parent */
  const renderSubItems = (parentId: MainTab) => {
    if (parentId === "overview") {
      return DASH_SUB_TABS.map(({ id, label, icon: Icon }) => {
        const active = dashSubTab === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => setDashSubTab(id)}
            className="flex w-full items-center gap-2 text-left transition-all duration-150"
            style={{
              height:       34,
              borderRadius: "var(--dm-shape-sm)",
              paddingLeft:  8,
              paddingRight: 8,
              background:   active ? "rgba(22,163,74,0.12)" : "transparent",
              color:        active ? "var(--dm-primary)" : "var(--dm-text-tertiary)",
              fontWeight:   active ? 600 : 400,
              fontSize:     12,
            }}
          >
            <Icon size={12} className="flex-shrink-0" />
            <span className="truncate">{label}</span>
          </button>
        );
      });
    }
    if (parentId === "history") {
      const histTabs = [
        ...SIDEBAR_HISTORY_TABS.map((t) => ({ id: t.id as HistoricalKind, Icon: t.icon, label: historyKindLabel(t.id, histLabels) })),
        ...customHistTabs.map((t) => ({ id: t.id as HistoricalKind, Icon: Flag, label: t.label })),
      ];
      return histTabs.map(({ id, Icon, label }) => {
        const active = histKind === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => setHistKind(id)}
            className="flex w-full items-center gap-2 text-left transition-all duration-150"
            style={{
              height:       34,
              borderRadius: "var(--dm-shape-sm)",
              paddingLeft:  8,
              paddingRight: 8,
              background:   active ? "rgba(22,163,74,0.12)" : "transparent",
              color:        active ? "var(--dm-primary)" : "var(--dm-text-tertiary)",
              fontWeight:   active ? 600 : 400,
              fontSize:     12,
            }}
          >
            <Icon size={12} className="flex-shrink-0" />
            <span className="truncate">{label}</span>
          </button>
        );
      });
    }
    if (parentId === "myaccount") {
      return SIDEBAR_ACCOUNT_TABS.filter((t) => visibleAccountTabIds.includes(t.id)).map(({ id, label, icon: Icon }) => {
        const active = myAccountTab === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => setMyAccountTab(id)}
            className="flex w-full items-center gap-2 text-left transition-all duration-150"
            style={{
              height:       34,
              borderRadius: "var(--dm-shape-sm)",
              paddingLeft:  8,
              paddingRight: 8,
              background:   active ? "rgba(22,163,74,0.12)" : "transparent",
              color:        active ? "var(--dm-primary)" : "var(--dm-text-tertiary)",
              fontWeight:   active ? 600 : 400,
              fontSize:     12,
            }}
          >
            <Icon size={12} className="flex-shrink-0" />
            <span className="truncate">{label}</span>
          </button>
        );
      });
    }
    return null;
  };

  // ── Itens do flyout do rail (sub-abas por seção) ────────────────────────────
  // Tabs com sub-abas: o flyout abre no HOVER do ícone (rail não expande).
  const RAIL_FLYOUT_TABS: MainTab[] = ["overview", "history"];
  const flyoutItemsFor = (tab: MainTab): { key: string; label: string; active: boolean; onSelect: () => void }[] => {
    if (tab === "overview")
      return DASH_SUB_TABS.map((t) => ({ key: t.id, label: t.label, active: dashSubTab === t.id, onSelect: () => { setMainTab("overview"); setDashSubTab(t.id); } }));
    if (tab === "history")
      return [
        ...SIDEBAR_HISTORY_TABS.map((t) => ({ key: t.id, label: historyKindLabel(t.id, histLabels), active: histKind === t.id, onSelect: () => { setMainTab("history"); setHistKind(t.id); } })),
        ...customHistTabs.map((t) => ({ key: t.id, label: t.label, active: histKind === (t.id as HistoricalKind), onSelect: () => { setMainTab("history"); setHistKind(t.id as HistoricalKind); } })),
      ];
    if (tab === "myaccount")
      return SIDEBAR_ACCOUNT_TABS.filter((t) => visibleAccountTabIds.includes(t.id)).map((t) => ({ key: t.id, label: t.label, active: myAccountTab === t.id, onSelect: () => { setMainTab("myaccount"); setMyAccountTab(t.id); } }));
    return [];
  };

  /* Nav items list — reutilizado dentro do card expandido */
  const navItemsList = (
    <nav className="flex flex-col gap-0.5 py-2 px-2">
      {visibleMainTabs.map(({ id, label, icon: Icon }) => {
        const isActive = mainTab === id;
        const hasSubItems = ["overview", "history", "myaccount"].includes(id);
        return (
          <div key={id}>
            <button
              onClick={() => { setMainTab(id); setShowMobileNav(false); }}
              className="flex w-full items-center gap-2.5 text-[13px] transition-all duration-150 text-left"
              style={{
                height:       42,
                borderRadius: "var(--dm-shape-md)",
                paddingLeft:  12,
                paddingRight: 12,
                background:   isActive ? "rgba(22,163,74,0.18)"          : "transparent",
                border:       isActive ? "1px solid rgba(91,96,210,0.28)" : "1px solid transparent",
                color:        isActive ? "var(--dm-nav-active-text)"      : "var(--dm-nav-default-text)",
                fontWeight:   isActive ? 600 : 400,
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  (e.currentTarget as HTMLElement).style.background = "var(--dm-bg-surface-hover)";
                  (e.currentTarget as HTMLElement).style.color      = "var(--dm-nav-hover-text)";
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  (e.currentTarget as HTMLElement).style.background = "transparent";
                  (e.currentTarget as HTMLElement).style.color      = "var(--dm-nav-default-text)";
                }
              }}
            >
              {isActive && (
                <span
                  className="mr-1 h-1.5 w-1.5 flex-shrink-0 rounded-full"
                  style={{ background: "var(--dm-primary)" }}
                />
              )}
              <Icon size={16} className="flex-shrink-0" />
              <span className="ml-1 truncate">{label}</span>
            </button>
            {/* Sub-items inline below active parent */}
            {isActive && hasSubItems && (
              <div
                className="mt-1 mb-2 ml-3 pl-3 flex flex-col gap-0.5"
                style={{ borderLeft: "2px solid rgba(91,96,210,0.22)" }}
              >
                {renderSubItems(id)}
              </div>
            )}
          </div>
        );
      })}

      {/* Perpétuo shortcut */}
      <div className="mt-2 px-0">
        <div className="mb-2 h-px mx-1" style={{ backgroundColor: "var(--dm-border-subtle)" }} />
        <p className="mb-1 px-1 text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>Dashboards</p>
        <Link
          href="/produto/perpetuo"
          className="flex w-full items-center gap-2.5 text-[13px] transition-all duration-150"
          style={{
            height:       42,
            borderRadius: "var(--dm-shape-md)",
            paddingLeft:  12,
            paddingRight: 12,
            color:        "var(--dm-nav-default-text)",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = "var(--dm-bg-surface-hover)";
            (e.currentTarget as HTMLElement).style.color      = "var(--dm-nav-hover-text)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = "transparent";
            (e.currentTarget as HTMLElement).style.color      = "var(--dm-nav-default-text)";
          }}
        >
          <RotateCcw size={16} className="flex-shrink-0 text-amber-500" />
          <span className="ml-1 truncate">Perpétuo</span>
          <span className="ml-auto text-[9px] font-semibold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "var(--dm-bg-elevated)", color: "var(--dm-text-tertiary)" }}>↗</span>
        </Link>
      </div>
    </nav>
  );

  /* Kept for mobile (unchanged behaviour) */
  const navContent = navItemsList;

  const campaignPanelProps: CampaignPanelProps = {
    selectedGroup, selectedTurma, activeCampaigns, turmasByGroup,
    dateFrom, dateTo, searchCampaign,
    showCourseGroups,
    groups: sidebarGroups,
    customSections,
    categories,
    selectedCampaign,
    campaignsByGroup,
    checkedCampaignIds,
    sortBy,
    onSelectGroup: handleSelectGroup,
    onSelectTurma: (t) => { setSelectedTurma(t); setShowMobilePanel(false); },
    onSelectCampaign: handleSelectCampaign,
    onToggleActive: toggleActive,
    onDateFrom: setDateFromPersist,
    onDateTo: setDateToPersist,
    onSearch: setSearchCampaign,
    onClearFilters: handleClearFilters,
    onSortBy: setSortBy,
    onCheckedCampaignIds: handleCheckedCampaignIds,
    onClearCampaignFilter: handleClearCampaignFilter,
    isFilterExplicit,
    hasActiveFilters,
    onCollapse: () => setRightCollapsed(true),
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--dm-bg-page)]">
      {/* ── Mobile nav overlay ── */}
      {showMobileNav && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setShowMobileNav(false)}>
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm dark:bg-black/60" />
        </div>
      )}

      {/* ── Mobile campaign panel overlay ── */}
      {showMobilePanel && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setShowMobilePanel(false)}>
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm dark:bg-black/60" />
        </div>
      )}

      {/* ── Left sidebar — NeuroBank style ── */}
      <aside
        className={`dm-rail fixed inset-y-0 left-0 z-50 flex flex-col transition-transform duration-300 w-[86vw] max-w-[280px] lg:relative lg:translate-x-0 lg:z-auto lg:max-w-none lg:flex-shrink-0 ${
          showMobileNav ? "translate-x-0 shadow-2xl" : "-translate-x-full"
        }`}
        style={{
          background:   "var(--dm-bg-sidebar)",
          boxShadow:    "0 8px 24px rgba(14,17,8,0.18)",
          width:         sidebarCollapsed ? 74 : 280,
        }}
      >
        {sidebarCollapsed ? (
          /* ══════════════ RAIL FIXO (icon-only) ══════════════ */
          <div className="flex flex-1 flex-col items-center py-4 overflow-visible">
            {/* Logo lime = clicar volta ao hub de seleção (Workspace) */}
            <button
              type="button"
              onClick={() => { if (onBackToWorkspace) onBackToWorkspace(); else { openTab("Visão Geral", "overview", "overview"); setRailFlyout(null); } }}
              aria-label="Voltar ao Workspace"
              title="Voltar ao Workspace"
              className="mb-2 flex h-9 w-9 items-center justify-center rounded-xl transition hover:opacity-80"
              style={{ background: "#B6F500" }}
            >
              <DashMonsterLogo size={18} className="text-[#0E1108] dark:!text-[#0E1108]" />
            </button>

            {/* Nav centralizado — flyout no CLIQUE, ativo lime + barra esquerda */}
            <div className="flex flex-1 flex-col justify-center gap-1.5">
              {visibleMainTabs.map(({ id, label, icon: Icon }) => {
                const hasFlyout = RAIL_FLYOUT_TABS.includes(id);
                const active = mainTab === id;
                return (
                  <button
                    key={id}
                    onClick={(e) => {
                      if (hasFlyout) {
                        const top = e.currentTarget.getBoundingClientRect().top;
                        setRailFlyout((prev) => (prev?.tab === id ? null : { tab: id, top }));
                      } else {
                        openTab(label, id); setRailFlyout(null); setShowMobileNav(false);
                      }
                    }}
                    aria-label={label}
                    data-tip={hasFlyout ? undefined : label}
                    className={`${hasFlyout ? "" : "dm-sidebar-tooltip"} flex h-11 w-11 items-center justify-center rounded-xl transition-colors`}
                    style={active
                      ? { background: "var(--dm-nav-active-bg)", color: "var(--dm-nav-active-text)" }
                      : { color: "var(--dm-nav-default-text)" }
                    }
                  >
                    <Icon size={20} strokeWidth={1.9} />
                  </button>
                );
              })}
            </div>

            {/* Bottom — tema, configurações, avatar (mock) */}
            <div className="flex flex-col items-center gap-1.5">
              <RailThemeToggle />
              <button
                type="button"
                onClick={() => { setSettingsOpen(true); setRailFlyout(null); }}
                aria-label="Configurações"
                data-tip="Configurações"
                className="dm-sidebar-tooltip flex h-10 w-10 items-center justify-center rounded-xl transition-colors hover:bg-[var(--dm-nav-hover-bg)]"
                style={{ color: "#8A8F84" }}
              >
                <Settings2 size={19} strokeWidth={1.9} />
              </button>
              <button
                type="button"
                onClick={() => { setSettingsOpen(true); }}
                aria-label="Meu perfil"
                className="mt-1 flex h-8 w-8 items-center justify-center rounded-full overflow-hidden transition hover:opacity-85"
                style={{ background: "var(--dm-primary)" }}
              >
                {resolvedAvatarSrc ? (
                  <img src={resolvedAvatarSrc} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-xs font-semibold text-white">
                    {currentUser.name.trim()
                      ? currentUser.name.trim().split(" ").filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("")
                      : currentUser.email.slice(0, 2).toUpperCase()}
                  </span>
                )}
              </button>
            </div>
          </div>
        ) : (
          /* ══════════════ EXPANDED ══════════════ */
          <>
            {/* Brand glow (decorative) */}
            <div
              className="pointer-events-none absolute -left-14 -top-14 h-48 w-48 rounded-full"
              style={{ background: "radial-gradient(circle, rgba(22,163,74,0.10) 0%, transparent 70%)" }}
            />

            {/* ── Brand row ── */}
            <div className="flex flex-shrink-0 items-center justify-between px-4 pt-5 pb-0">
              {/* Logo = clicar vai ao overview; click longo = collapse via desktop button abaixo */}
              <button
                type="button"
                onClick={() => { setMainTab("overview"); setShowMobileNav(false); }}
                className="flex items-center gap-2 transition hover:opacity-80"
                title="Início"
              >
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-[8px] flex-shrink-0"
                  style={{ background: "#B6F500" }}
                >
                  <DashMonsterLogo size={16} className="text-[#0E1108]" />
                </div>
                <span
                  className="text-[14px] uppercase tracking-wide"
                  style={{ fontFamily: "var(--font-poppins)", fontWeight: 700, color: "#FFFFFF" }}
                >
                  Dash<span style={{ fontWeight: 400 }}>Monster</span>
                </span>
              </button>
              {/* Collapse (desktop) / Close (mobile) */}
              <button
                onClick={() => { toggleSidebar(true); setShowMobileNav(false); }}
                className="flex h-7 w-7 items-center justify-center rounded-lg transition hover:bg-[var(--dm-bg-elevated)]"
                style={{ color: "var(--dm-text-tertiary)" }}
                title="Recolher"
                aria-expanded="true"
                aria-label="Recolher sidebar"
              >
                <X size={14} className="lg:hidden" />
                <ChevronLeft size={13} className="hidden lg:block" />
              </button>
            </div>

            {/* ── Welcome card — §6 doc spec ── */}
            <div
              className="mx-3 mt-4 flex-shrink-0 p-[18px]"
              style={{
                background:   "var(--dm-bg-card-soft)",
                border:       "1px solid var(--dm-border-subtle)",
                borderRadius: 20,
              }}
            >
              <div className="flex items-center justify-between mb-3">
                {/* Avatar */}
                <button
                  type="button"
                  onClick={() => { setSettingsOpen(true); }}
                  title="Ir para Meu perfil"
                  className="relative h-10 w-10 flex-shrink-0 rounded-full overflow-hidden transition hover:opacity-85"
                  style={{ boxShadow: "0 0 0 2px var(--dm-primary-soft)" }}
                >
                  {resolvedAvatarSrc ? (
                    <img src={resolvedAvatarSrc} alt="Avatar" className="h-full w-full object-cover" />
                  ) : (
                    <div
                      className="flex h-full w-full items-center justify-center text-[13px] font-bold text-white"
                      style={{ background: "linear-gradient(135deg, var(--dm-primary) 0%, var(--dm-primary-vivid) 100%)" }}
                    >
                      {currentUser.name.trim()
                        ? currentUser.name.trim().split(" ").filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("")
                        : currentUser.email.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                </button>
                <SidebarThemeToggle />
              </div>
              {/* Data */}
              <p className="text-[10px] font-bold uppercase tracking-widest leading-tight" style={{ color: "var(--dm-text-tertiary)" }}>
                {new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })
                  .replace(/^\w/, c => c.toUpperCase())}
              </p>
              {/* Saudação */}
              <p className="mt-1 text-[15px] font-bold leading-snug" style={{ color: "var(--dm-text-primary)" }}>
                Bem-vindo, <span style={{ color: "var(--dm-primary)" }}>
                  {currentUser.name.trim().split(" ").filter(Boolean)[0] || currentUser.email.split("@")[0] || "Usuário"}!
                </span>
              </p>
            </div>

            {/* ── Nav section label ── */}
            <p
              className="mx-5 mt-3 mb-1 flex-shrink-0 text-[10px] font-semibold uppercase"
              style={{ color: "var(--dm-text-tertiary)", letterSpacing: "0.12em" }}
            >
              Escolha uma seção
            </p>

            {/* ── Nav card ── */}
            <div className="mx-3 flex-shrink-0 rounded-2xl overflow-hidden" style={{ background: "var(--dm-bg-elevated)" }}>
              {navItemsList}
            </div>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Divider */}
            <div className="mx-4 flex-shrink-0 h-px" style={{ background: "var(--dm-divider)" }} />

            {/* ── Footer / CTA card ── */}
            <div className="mx-3 mb-4 mt-3 flex-shrink-0">
              <div
                className="rounded-2xl px-4 py-3"
                style={{ background: "#16A34A" }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className="h-2 w-2 flex-shrink-0 rounded-full"
                    style={{ background: campaigns.length > 0 ? "#05CD99" : "rgba(255,255,255,0.35)" }}
                  />
                  <span className="text-[12px] font-bold text-white">
                    {campaigns.length > 0 ? "Dados carregados" : "Sem dados"}
                  </span>
                </div>
                <p className="text-[11px] leading-snug pl-4" style={{ color: "rgba(255,255,255,0.80)" }}>
                  {campaigns.length > 0
                    ? `${campaigns.length.toLocaleString("pt-BR")} linhas`
                    : "Conecte uma fonte pelo painel ⚙️"}
                </p>
                {dataSourcePill && (
                  <p className="mt-0.5 text-[11px] pl-4 truncate" style={{ color: "rgba(255,255,255,0.65)" }}
                    title={dataSourcePill.subtitle || dataSourcePill.title}>
                    {dataSourcePill.title}
                    {dataSourcePill.subtitle ? ` · ${dataSourcePill.subtitle}` : ""}
                  </p>
                )}
                {dataSource?.type === "meta" && onRefresh && (
                  <button
                    type="button"
                    title="Atualizar números com a Meta (últimos dias)"
                    onClick={() => void onRefresh()}
                    disabled={syncStatus?.syncing}
                    className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition"
                    style={{
                      background: "rgba(255,255,255,0.12)",
                      color: "rgba(255,255,255,0.90)",
                    }}
                  >
                    <RotateCcw size={11} className={syncStatus?.syncing ? "animate-spin" : ""} />
                    {syncStatus?.syncing ? "Atualizando..." : "Atualizar Meta"}
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </aside>

      {/* ── Flyout do rail (sub-abas ancoradas ao ícone) ── */}
      {sidebarCollapsed && railFlyout && typeof document !== "undefined" && createPortal(
        <>
          <div className="fixed inset-0 z-[55]" onClick={() => setRailFlyout(null)} />
          <div
            className="fixed z-[56] flex flex-col gap-0.5 rounded-2xl p-2"
            style={{ left: 70, top: Math.max(8, Math.min(railFlyout.top, (typeof window !== "undefined" ? window.innerHeight : 800) - 280)), minWidth: 200, background: "var(--dm-bg-surface)", boxShadow: "0 8px 28px rgba(16,24,40,0.14)" }}
          >
            <p className="px-2.5 pt-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>
              {MAIN_TABS.find((t) => t.id === railFlyout.tab)?.label}
            </p>
            {flyoutItemsFor(railFlyout.tab).map((it) => (
              <button
                key={it.key}
                type="button"
                onClick={() => { openTab(it.label, railFlyout.tab, it.key); setRailFlyout(null); setShowMobileNav(false); }}
                className="flex w-full items-center rounded-lg px-2.5 py-2 text-left text-sm font-medium transition-colors"
                style={{ color: it.active ? "var(--dm-primary)" : "var(--dm-text-secondary)", background: it.active ? "var(--dm-primary-soft)" : "transparent" }}
                onMouseEnter={(e) => { if (!it.active) { e.currentTarget.style.background = "var(--dm-primary-soft)"; e.currentTarget.style.color = "var(--dm-primary)"; } }}
                onMouseLeave={(e) => { if (!it.active) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--dm-text-secondary)"; } }}
              >
                {it.label}
              </button>
            ))}
          </div>
        </>,
        document.body,
      )}

      {/* ── Center ── */}
      <div className="flex flex-1 flex-col overflow-hidden">

        {/* ── Barra única: abas (esq) + categoria/ações (dir) ── */}
        <div
          className="flex-shrink-0 flex items-center justify-between gap-2 px-3 pt-2"
          style={{ background: "var(--dm-bg-surface)", borderBottom: "1px solid var(--dm-border-default)" }}
        >
          {/* Esquerda — abas + Nova aba */}
          <div className="flex min-w-0 items-center gap-1 overflow-x-auto">
            <button
              onClick={() => setShowMobileNav(true)}
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700 lg:hidden"
              type="button"
              aria-label="Abrir menu"
            >
              <Menu size={18} />
            </button>
            {openTabs.map((t) => {
              const on = t.id === activeTabId;
              return (
                <div
                  key={t.id}
                  onClick={() => activateTab(t.id)}
                  className="group flex flex-shrink-0 items-center gap-2 pl-3 pr-2 py-2 rounded-t-lg cursor-pointer text-sm transition-colors"
                  style={{
                    background:  on ? "var(--dm-bg-page)" : "transparent",
                    color:       on ? "var(--dm-text-primary)" : "var(--dm-text-secondary)",
                    fontWeight:  on ? 600 : 500,
                    borderTop:   on ? "2px solid var(--dm-primary)" : "2px solid transparent",
                  }}
                >
                  <span className="whitespace-nowrap">{t.label}</span>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); closeTab(t.id); }}
                    className="flex h-5 w-5 items-center justify-center rounded opacity-50 transition hover:opacity-100 hover:bg-[var(--dm-bg-surface-hover)]"
                    style={{ color: "var(--dm-text-secondary)" }}
                    aria-label="Fechar aba"
                  >
                    <X size={13} />
                  </button>
                </div>
              );
            })}
            <div className="relative flex-shrink-0">
              <button
                type="button"
                onClick={() => setNewTabOpen((v) => !v)}
                title="Nova aba"
                aria-label="Nova aba"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700"
              >
                <Plus size={16} />
              </button>
              {newTabOpen && (
                <>
                  <div className="fixed inset-0 z-[55]" onClick={() => setNewTabOpen(false)} />
                  <div
                    className="absolute left-0 top-full z-[56] mt-1 flex max-h-[72vh] w-64 flex-col gap-0.5 overflow-y-auto rounded-2xl p-2"
                    style={{ background: "var(--dm-bg-surface)", boxShadow: "0 8px 28px rgba(16,24,40,0.14)", border: "1px solid var(--dm-border-default)" }}
                  >
                    {(() => {
                      const NTGroup = ({ title }: { title: string }) => (
                        <p className="px-2.5 pt-1.5 pb-1 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>{title}</p>
                      );
                      const NTItem = ({ label, run }: { label: string; run: () => void }) => (
                        <button
                          type="button"
                          onClick={() => { run(); setNewTabOpen(false); }}
                          className="flex w-full items-center rounded-lg px-2.5 py-2 text-left text-sm font-medium transition-colors"
                          style={{ color: "var(--dm-text-secondary)" }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--dm-primary-soft)"; e.currentTarget.style.color = "var(--dm-primary)"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--dm-text-secondary)"; }}
                        >
                          <span className="truncate">{label}</span>
                        </button>
                      );
                      return (
                        <>
                          <NTGroup title="Sistema" />
                          <NTItem label="Visão Geral" run={() => openTab("Visão Geral", "overview", "overview")} />
                          <NTItem label="Análise" run={() => openTab("Análise", "overview", "analysis")} />
                          <NTItem label="Criativos" run={() => openTab("Criativos", "overview", "creatives")} />
                          <NTItem label="Histórico" run={() => openTab("Histórico", "history", "lancamento")} />
                          <NTItem label="Tracking" run={() => openTab("Tracking", "tracking")} />
                          <NTItem label="Perfil de Anunciantes" run={() => openTab("Perfil de Anunciantes", "profiles")} />
                          <NTItem label="Base de Produtos" run={() => openTab("Base de Produtos", "products")} />
                          <NTItem label="Configurações" run={() => setSettingsOpen(true)} />

                          {advertiserProfiles.length > 0 && (
                            <>
                              <NTGroup title="Perfis configurados" />
                              {advertiserProfiles.map((p) => (
                                <NTItem key={p.groupId || p.name} label={p.name} run={() => { if (p.groupId) setSelectedGroup(p.groupId); openTab(p.name, "profiles"); }} />
                              ))}
                            </>
                          )}

                          {allGroups.length > 0 && (
                            <>
                              <NTGroup title="Bases" />
                              {allGroups.map((g) => (
                                <NTItem key={g.id} label={g.label} run={() => { setSelectedGroup(g.id); openTab(g.label, "overview", "overview"); }} />
                              ))}
                            </>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Direita — minimalista: só ícones (ghost); Relatório = único CTA */}
          <div className="flex flex-shrink-0 items-center gap-1 pb-2">
            {/* Categoria */}
            {needsCategory && campaigns.length > 0 && (
              selectedCategory ? (() => {
                const cat = selectedCategory as ProductCategory;
                const CatIcon = CATEGORY_ICON[cat] ?? Flag;
                const dot     = CATEGORY_DOT[cat] ?? "var(--dm-brand-500)";
                return (
                  <button
                    type="button"
                    onClick={() => setSelectedCategory(null)}
                    title={`${getSectionLabel(String(cat), customSections, categories)} — trocar categoria`}
                    aria-label="Trocar categoria"
                    className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700"
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: dot }} />
                    <CatIcon size={15} aria-hidden />
                  </button>
                );
              })() : (
                <button
                  type="button"
                  onClick={() => setPickCategoryOpen(true)}
                  title="Escolher categoria"
                  aria-label="Escolher categoria"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700"
                >
                  <SlidersHorizontal size={16} />
                </button>
              )
            )}

            {/* Metas */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowGoals((v) => !v)}
                title="Metas"
                aria-label="Metas"
                className={`flex h-8 w-8 items-center justify-center rounded-lg transition ${
                  showGoals
                    ? "bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400"
                    : "text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700"
                }`}
              >
                <Flag size={16} />
              </button>
              {showGoals && (
                <GoalsPanel
                  goals={goals}
                  groupLabel={selectedGroup === "all" ? "Global" : (allGroups.find(g => g.id === selectedGroup)?.label ?? selectedGroup)}
                  onSetGoal={(key, value) => setGoal(goalsGroupKey, key, value)}
                  onReset={() => resetGoals(goalsGroupKey)}
                  onClose={() => setShowGoals(false)}
                />
              )}
            </div>

            {/* Exportar CSV */}
            {campaigns.length > 0 && (
              <button
                type="button"
                title="Exportar CSV"
                aria-label="Exportar CSV"
                onClick={() => exportDashboardCsv({
                  campaigns: campaignsWithOverrides,
                  totals,
                  dateFrom,
                  dateTo,
                  overrides: manualOverrides,
                })}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700"
              >
                <Download size={16} />
              </button>
            )}

            {/* Relatório — único CTA */}
            {campaigns.length > 0 && mainTab === "overview" && (
              <ExportReportButton
                buildData={buildReportData}
                fileName={`relatorio_${selectedGroup}_${dateFrom}_${dateTo}`}
              />
            )}
          </div>

        </div>

        {/* Main scrollable content */}
        <main className="flex-1 overflow-y-auto px-4 py-5 md:px-7 md:py-7">
          <div className="mx-auto w-full max-w-[1720px]">

          {/* ── Overview: sem dados → onboarding; com dados → dashboard (categoria opcional no topo) ── */}
          {mainTab === "overview" && (
            campaigns.length === 0 ? (
              inlineImportTab ? (
                /* ── Step 2: source selected — tutorial gone, form centered ── */
                <div className="mx-auto max-w-2xl py-6" style={{ animation: "dm-fade-up 0.28s ease both" }}>
                  <ImportPopover
                    inline
                    initialTab={inlineImportTab}
                    onImportCsv={onImportCsv}
                    onImportUrl={onImportUrl}
                    onImportMeta={onImportMeta}
                    campaignConfigs={campaignConfigs}
                    onSaveCampaignConfig={setCampaignConfig}
                    onClose={() => setInlineImportTab(null)}
                    onCampaignsVerified={setCampaignsForGroup}
                    savedCampaignsByGroup={campaignsByGroup}
                    savedSelectedCampaigns={selectedCampaignsByGroup}
                    onSaveCampaignSelection={setCampaignSelectionForGroup}
                    onClearCampaignSelection={clearCampaignSelectionForGroup}
                    customGroups={customGroups}
                    onAddCustomGroup={addCustomGroup}
                    onOpenControlPanel={onOpenControlPanel}
                    customSections={customSections}
                  />
                </div>
              ) : (
                /* ── Step 1: full tutorial + source picker ───────────────── */
                <DashboardWelcome
                  onOpenControlPanel={onOpenControlPanel}
                  onSelectTab={(tab) => setInlineImportTab(tab)}
                />
              )
            ) : (
              /* ── Dashboard com dados (todas as campanhas até escolher categoria no topo) ── */
              <div className="space-y-6">
                {(needsLeadsMigration || needsLeadsResync) && (
                  <div
                    className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm dark:border-amber-800/60 dark:bg-amber-950/40"
                    role="alert"
                  >
                    <p className="font-semibold text-amber-900 dark:text-amber-100">
                      {needsLeadsMigration ? "Ação necessária — coluna Leads no Supabase" : "Re-sincronizar dados Meta (Leads)"}
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-amber-800 dark:text-amber-200/90">
                      {needsLeadsMigration ? (
                        <>
                          Cole o SQL de{" "}
                          <code className="rounded bg-amber-100/80 px-1 dark:bg-amber-900/50">
                            supabase/migrations/{LEADS_MIGRATION_FILE}
                          </code>{" "}
                          no <strong>SQL Editor</strong> do Supabase e execute. Depois use{" "}
                          <strong>Atualizar Meta</strong> no topo para reimportar com leads.
                        </>
                      ) : (
                        <>
                          A coluna <strong>leads</strong> já existe, mas os dados atuais foram sincronizados antes dela.
                          Faça um novo sync Meta para preencher leads (formulários e eventos de pixel).
                        </>
                      )}
                    </p>
                    {dataSource?.type === "meta" && onRefresh && (
                      <button
                        type="button"
                        onClick={() => void onRefresh()}
                        disabled={syncStatus?.syncing || needsLeadsMigration}
                        className="mt-3 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-100 dark:hover:bg-amber-900/50"
                      >
                        {syncStatus?.syncing ? "A sincronizar…" : "Atualizar Meta agora"}
                      </button>
                    )}
                    {needsLeadsMigration && (
                      <p className="mt-2 text-[10px] text-amber-700 dark:text-amber-300/80">
                        O sync Meta só funciona depois de executar a migration no Supabase.
                      </p>
                    )}
                  </div>
                )}

                {/* ── Context bar ── */}
                {selectedCategory && (
                  <ContextBar
                    selectedGroup={selectedGroup}
                    groups={sidebarGroups}
                    customSections={customSections}
                    categories={categories}
                    showCourseGroups={showCourseGroups}
                    onSelectGroup={handleSelectGroup}
                    checkedCampaignIds={checkedCampaignIds}
                    campaignsByGroup={campaignsByGroup}
                    onCheckedCampaignIds={handleCheckedCampaignIds}
                    onClearCampaignFilter={handleClearCampaignFilter}
                    dateFrom={dateFrom}
                    dateTo={dateTo}
                    onDateFrom={setDateFromPersist}
                    onDateTo={setDateToPersist}
                    hasActiveFilters={hasActiveFilters}
                    onClearFilters={handleClearFilters}
                  />
                )}

                {dashSubTab === "overview" && (<>
                {/* Indicadores → bento: funil + 4 cards editáveis (lápis) */}
                {filteredCampaigns.length > 0 && (
                  <OverviewBento totals={totals} campaigns={campaignsWithOverrides} conversions={effectiveConversions} leadsByOrigin={leadsByOrigin} />
                )}

                {filteredCampaigns.length === 0 && (
                  <div className="flex flex-col gap-2 rounded-xl border px-4 py-3 text-sm sm:flex-row sm:items-center" style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-elevated)", color: "var(--dm-text-secondary)" }}>
                    <div className="flex items-start gap-3">
                      <Filter size={15} className="mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="font-medium" style={{ color: "var(--dm-text-primary)" }}>
                          Nenhuma campanha encontrada com os filtros aplicados.
                        </p>
                        {dataSource?.type === "meta" && onRefresh && (
                          <p className="mt-1 text-xs" style={{ color: "var(--dm-text-tertiary)" }}>
                            Se acabou de vincular contas no Painel, use <strong>Atualizar Meta</strong> na barra lateral para puxar os últimos dias de dados.
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-shrink-0 gap-2 sm:ml-auto">
                      <button type="button" onClick={handleClearFilters} className="rounded-lg border px-3 py-1.5 text-xs font-semibold underline-offset-2 hover:underline" style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-secondary)" }}>
                        Limpar filtros
                      </button>
                    </div>
                  </div>
                )}

                {/* Campanhas — Performance por Campanha · Resumo diário */}
                {filteredCampaigns.length > 0 && (
                  <section className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h2 className="text-sm font-bold tracking-tight sm:text-base" style={{ color: "var(--dm-text-primary)" }}>Campanhas</h2>
                      <div className="flex items-center gap-1 rounded-xl border p-1" style={{ borderColor: "var(--dm-border-subtle)", background: "var(--dm-bg-surface)" }}>
                        {CAMPANHAS_VIEWS.map(({ id, label, icon: Icon }) => {
                          const on = campanhasView === id;
                          return (
                            <button key={id} type="button" onClick={() => selectCampanhasView(id)} aria-pressed={on}
                              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold transition"
                              style={{ background: on ? "var(--dm-primary-soft)" : "transparent", color: on ? "var(--dm-primary)" : "var(--dm-text-tertiary)" }}>
                              <Icon size={13} /> <span className="hidden sm:inline">{label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    {campanhasView === "performance"
                      ? <CampaignTable campaigns={sortedCampaigns} isMetricVisible={isMetricVisible} />
                      : <ChartsSection dailyTrend={dailyTrend} campaignComparison={campaignComparison} budgetDistribution={budgetDistribution} />}
                  </section>
                )}
                </>)}

                {dashSubTab === "analysis" && (
                  aggregated.length === 0 ? (
                    <AnaliseEmpty
                      onImport={() => onOpenControlPanel ? onOpenControlPanel() : openImport("sheets")}
                    />
                  ) : (
                    <CampaignAnalysis campaigns={aggregated} selectedCategory={selectedCategory as ProductCategory | null} isMetricVisible={isMetricVisible} igUserId={activeIgUserId} dateFrom={dateFrom} dateTo={dateTo} />
                  )
                )}

                {dashSubTab === "creatives" && (
                  campaigns.length === 0 ? (
                    <CriativosEmpty
                      variant="no-data"
                      onConnect={() => onOpenControlPanel ? onOpenControlPanel() : openImport("sheets")}
                      onImportCsv={() => openImport("csv")}
                    />
                  ) : (
                    <BestCreatives
                      campaigns={aggregated}
                      adAccountId={
                        selectedGroup !== "all"
                          ? campaignConfigs[selectedGroup]?.adAccountId
                          : [...new Set(
                              Object.values(campaignConfigs)
                                .map((c) => c?.adAccountId ?? "")
                                .filter(Boolean),
                            )]
                      }
                      dateFrom={dateFrom || undefined}
                      dateTo={dateTo || undefined}
                      selectedCampaignIds={bestCreativesFilter}
                      selectedGroupName={selectedGroup !== "all" ? (allGroups.find((g) => g.id === selectedGroup)?.label ?? selectedGroup) : undefined}
                      onConnect={() => onOpenControlPanel ? onOpenControlPanel() : openImport("sheets")}
                    />
                  )
                )}
              </div>
            )
          )}

          {mainTab === "history" && <HistoricalView selectedKind={histKind} onKindChange={setHistKind} />}

          {mainTab === "leads" && <LeadsView />}

          {mainTab === "tracking" && <TrackingEventsView />}

          {mainTab === "products"  && (
            <ProductBase
              viewId={productViewId}
              onOpenView={(p) => { setProductViewId(p.id); setActiveTabItem(p.nome || "Produto"); }}
              onCloseView={() => { setProductViewId(null); setActiveTabItem(null); }}
            />
          )}
          {mainTab === "profiles" && (
            <ProfileAnalysis
              campaignGroupOptions={allGroups.map((g) => ({ id: g.id, label: g.label, section: g.section }))}
              campaignConfigs={campaignConfigs}
              appliedDateRange={{ from: dateFrom, to: dateTo }}
            />
          )}

          {mainTab === "empresa" && isOwner && (
            <EmpresaTab
              categories={categories}
              accountEntries={accountEntries}
              onCategoriesChange={onCategoriesChange ?? (() => {})}
              onEntriesChange={onEntriesChange ?? (() => {})}
              syncStatus={syncStatus}
              campaignCount={campaigns.length}
              dataSource={dataSource}
              onRefresh={onRefresh}
              onClearData={onClearData}
            />
          )}

          {mainTab === "myaccount" && (
            <MyAccount
              userName={currentUser.name}
              userEmail={currentUser.email}
              onUpdateProfile={onUpdateProfile}
              onSignOut={onSignOut}
              activeTab={myAccountTab}
              onTabChange={setMyAccountTab}
            />
          )}

          </div>
        </main>
      </div>

      {/* Right panel removed — campaigns filtered via context bar */}

      <HubSettings
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        userName={currentUser.name}
        email={currentUser.email}
        onUpdateProfile={onUpdateProfile}
        onSignOut={onSignOut}
        categories={categories}
      />

      {pickCategoryOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm"
          role="presentation"
          onClick={() => setPickCategoryOpen(false)}
        >
          <div
            className="relative max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl border shadow-2xl"
            style={{ backgroundColor: "var(--dm-bg-surface)", borderColor: "var(--dm-border-default)" }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="pick-category-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex justify-end border-b px-3 py-2" style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-surface)" }}>
              <button
                type="button"
                onClick={() => setPickCategoryOpen(false)}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>
            <div id="pick-category-title" className="sr-only">Escolher área de negócio</div>
            <CategoryGate
              onSelect={(c) => {
                setSelectedCategory(c);
                setPickCategoryOpen(false);
              }}
              customSections={customSections}
              onAddSection={addCustomSection}
              onRemoveSection={removeCustomSection}
            />
          </div>
        </div>
      )}

    </div>
  );
}
