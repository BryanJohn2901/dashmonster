"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ALL_METRIC_IDS, METRIC_LABELS, useMetricVisibility } from "@/hooks/useMetricVisibility";
import { useAvatarUrl, resolveAvatarSrc } from "@/hooks/useAvatarUrl";
import { useDateRange } from "@/hooks/useDateRange";
import {
  Activity, BadgeDollarSign, BarChart2, BookOpen, CalendarDays,
  CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, CircleDollarSign, Download, Dumbbell, FileText,
  FileUp, Filter, Flag, GraduationCap, Home, ImageIcon, Link2, Loader2, LogOut, Menu, Moon,
  MousePointerClick, Package, Pencil, Plus, Repeat, RotateCcw, Search, Settings2, SlidersHorizontal, Sun,
  Target, Trash2, TrendingUp, Trophy, Upload, UserRound, Users, Wallet, X, XCircle, Zap,
  LayoutDashboard, History, LineChart, Sparkles, Database, Dna, Weight, HeartPulse,
  Medal, PersonStanding, Flame, BookText, MonitorSmartphone, Ticket, Library, VenetianMask,
  UserCheck
} from "lucide-react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { CampaignData, ProductCategory } from "@/types/campaign";
import type { UserAccountEntry, UserCategory } from "@/types/userConfig";
import {
  PTA_PAINEL_SAVE_NAV_EVENT,
  mapPainelInternalFilterToDashboardGroupId,
  type PainelSaveNavDetail,
} from "@/utils/painelDashboardNavigation";
import { CampaignConfig, CampaignSummary, CustomGroup, CustomSection, ColorKey, GroupSection, useCampaignStore } from "@/hooks/useCampaignStore";
import { classifyCampaign, classifyCourse } from "@/utils/campaignClassifier";
import {
  fetchMetaAdAccounts, fetchMetaCampaigns, loadMetaCredentials, saveMetaCredentials,
} from "@/utils/metaApi";
import { LEADS_MIGRATION_FILE, type MetaSyncResult } from "@/utils/supabaseCampaigns";
import type { MetaAdAccount, MetaCampaign } from "@/utils/metaApi";
import { CategoryGate, CATEGORY_LABEL, CATEGORY_ICON, CATEGORY_DOT, ICON_MAP, COLOR_HEX } from "@/components/CategoryGate";
import {
  aggregateByCampaign, aggregateTotals, applyOverrides, buildBudgetDistribution,
  buildCampaignComparison, buildDailyTrend, formatCurrency, formatDatePtBr, formatNumber, formatPercent,
} from "@/utils/metrics";
import { KpiCard } from "@/components/KpiCard";
import { FunnelCard } from "@/components/FunnelCard";
import { ChartsSection } from "@/components/charts/ChartsSection";
import { CampaignTable } from "@/components/CampaignTable";
import { useGoalsStore, type Goals } from "@/hooks/useGoalsStore";
import { CampaignAnalysis } from "@/components/CampaignAnalysis";
import { HistoricalView } from "@/components/HistoricalView";
import { LeadsView } from "@/components/LeadsView";
import { HISTORICAL_KIND_LABELS, type HistoricalKind } from "@/types/historical";
import { BestCreatives } from "@/components/BestCreatives";
import { ProfileAnalysis } from "@/components/ProfileAnalysis";
import { useAdvertiserStore } from "@/hooks/useAdvertiserStore";
import { ProductBase } from "@/components/products/ProductBase";
import { DashMonsterLogo } from "@/components/DashMonsterLogo";
import { DashboardWelcome } from "@/components/empty/DashboardWelcome";
import { AnaliseEmpty } from "@/components/empty/AnaliseEmpty";
import { CriativosEmpty } from "@/components/empty/CriativosEmpty";
import { PixelFunnelSection } from "@/components/PixelFunnelSection";
import { MyAccount } from "@/components/MyAccount";
import { toast } from "@/hooks/useToast";
import { exportDashboardCsv } from "@/utils/exportCsv";
import { useManualMetrics } from "@/hooks/useManualMetrics";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DataSource {
  type: "google_sheets" | "csv" | "meta";
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
  onUpdateProfile: (name: string) => Promise<void>;
  onOpenControlPanel?: () => void;
}

function formatDataSourcePill(ds: DataSource | null | undefined): { title: string; subtitle?: string } | null {
  if (!ds) return null;
  const titles: Record<DataSource["type"], string> = {
    meta: "Meta Ads",
    csv: "CSV",
    google_sheets: "Google Sheets",
  };
  return { title: titles[ds.type], subtitle: ds.label };
}

type MainTab = "overview" | "history" | "leads" | "profiles" | "products" | "myaccount";
type DashSubTab = "overview" | "analysis" | "creatives";

const DASH_SUB_TABS: Array<{ id: DashSubTab; label: string; icon: React.ElementType }> = [
  { id: "overview",  label: "Visão Geral", icon: LayoutDashboard },
  { id: "analysis",  label: "Análise",     icon: LineChart },
  { id: "creatives", label: "Criativos",   icon: Sparkles },
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

type MyAccountTabId = "profile"|"accounts"|"integrations"|"sync"|"privacy"|"notifications"|"personalization";
const SIDEBAR_ACCOUNT_TABS: Array<{ id: MyAccountTabId; label: string; icon: React.ElementType }> = [
  { id: "profile",         label: "Meu perfil",     icon: UserRound    },
  { id: "accounts",        label: "Contas",          icon: Settings2    },
  { id: "integrations",    label: "Integrações",     icon: Link2        },
  { id: "sync",            label: "Sincronização",   icon: RotateCcw    },
  { id: "privacy",         label: "Privacidade",     icon: Zap          },
  { id: "notifications",   label: "Notificações",    icon: Activity     },
  { id: "personalization", label: "Personalização",  icon: SlidersHorizontal },
];

// ─── Nav config ───────────────────────────────────────────────────────────────

const MAIN_TABS: Array<{ id: MainTab; label: string; shortLabel: string; icon: React.ElementType }> = [
  { id: "overview",   label: "Dashboard",             shortLabel: "Dashboard", icon: LayoutDashboard },
  { id: "history",    label: "Histórico",             shortLabel: "Histórico", icon: History },
  { id: "leads",      label: "Leads",                 shortLabel: "Leads",     icon: UserCheck },
  { id: "profiles",   label: "Perfil de Anunciantes", shortLabel: "Perfil",    icon: Target },
  { id: "products",   label: "Base de Produtos",      shortLabel: "Produtos",  icon: Database },
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

const G_BLUE = {
  iconBg: "bg-blue-50 dark:bg-blue-900/20", iconColor: "text-blue-500 dark:text-blue-400",
  activeDot: "bg-blue-500", activePulse: "bg-blue-400",
  selectedBg: "bg-blue-50 dark:bg-blue-900/10", selectedText: "text-blue-600 dark:text-blue-400", selectedBorder: "border-blue-200 dark:border-blue-800",
};

const G_EMERALD = {
  iconBg: "bg-emerald-50 dark:bg-emerald-900/20", iconColor: "text-emerald-500 dark:text-emerald-400",
  activeDot: "bg-emerald-500", activePulse: "bg-emerald-400",
  selectedBg: "bg-emerald-50 dark:bg-emerald-900/10", selectedText: "text-emerald-600 dark:text-emerald-400", selectedBorder: "border-emerald-200 dark:border-emerald-800",
};

const G_VIOLET = {
  iconBg: "bg-violet-50 dark:bg-violet-900/20", iconColor: "text-violet-500 dark:text-violet-400",
  activeDot: "bg-violet-500", activePulse: "bg-violet-400",
  selectedBg: "bg-violet-50 dark:bg-violet-900/10", selectedText: "text-violet-600 dark:text-violet-400", selectedBorder: "border-violet-200 dark:border-violet-800",
};

const G_AMBER = {
  iconBg: "bg-amber-50 dark:bg-amber-900/20", iconColor: "text-amber-500 dark:text-amber-400",
  activeDot: "bg-amber-500", activePulse: "bg-amber-400",
  selectedBg: "bg-amber-50 dark:bg-amber-900/10", selectedText: "text-amber-600 dark:text-amber-400", selectedBorder: "border-amber-200 dark:border-amber-800",
};

const G_ROSE = {
  iconBg: "bg-rose-50 dark:bg-rose-900/20", iconColor: "text-rose-500 dark:text-rose-400",
  activeDot: "bg-rose-500", activePulse: "bg-rose-400",
  selectedBg: "bg-rose-50 dark:bg-rose-900/10", selectedText: "text-rose-600 dark:text-rose-400", selectedBorder: "border-rose-200 dark:border-rose-800",
};

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

/** Resolves a section label — built-in OR custom. */
function getSectionLabel(sectionId: string, customSections: CustomSection[]): string {
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

const GOAL_FIELDS: GoalField[] = [
  { key: "ctr",         label: "CTR",         placeholder: "Ex: 2.0",  suffix: "%" },
  { key: "roas",        label: "ROAS",        placeholder: "Ex: 3.0",  suffix: "x" },
  { key: "roi",         label: "ROI",         placeholder: "Ex: 200",  suffix: "%" },
  { key: "cpa",         label: "CPA",         placeholder: "Ex: 50",   prefix: "R$" },
  { key: "cpc",         label: "CPC",         placeholder: "Ex: 1.50", prefix: "R$" },
  { key: "cpm",         label: "CPM",         placeholder: "Ex: 15",   prefix: "R$" },
  { key: "leads",       label: "Leads",       placeholder: "Ex: 50"   },
  { key: "conversions", label: "Conversões",  placeholder: "Ex: 100"  },
  { key: "investment",  label: "Orçamento",   placeholder: "Ex: 5000", prefix: "R$" },
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
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute right-0 top-full z-50 mt-2 w-[320px] rounded-xl border shadow-2xl" style={{ backgroundColor: "var(--dm-bg-surface)", borderColor: "var(--dm-border-default)" }}>
        <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: "var(--dm-border-default)" }}>
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <Flag size={14} className="text-brand" />
              <p className="text-sm font-semibold" style={{ color: "var(--dm-text-primary)" }}>Metas de Performance</p>
            </div>
            <p className="pl-[22px] text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>
              {groupLabel}
            </p>
          </div>
          <button onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full transition"
            style={{ color: "var(--dm-text-tertiary)" }}>
            <X size={14} />
          </button>
        </div>

        <div className="p-5">
          <p className="mb-4 text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>
            Defina metas para cada métrica. Os KPIs mostrarão progresso em tempo real.
          </p>
          <div className="space-y-3">
            {GOAL_FIELDS.map(({ key, label, placeholder, prefix, suffix }) => (
              <div key={key} className="flex items-center gap-3">
                <span className="w-24 flex-shrink-0 text-xs font-medium" style={{ color: "var(--dm-text-secondary)" }}>{label}</span>
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
                    className={`h-8 w-full rounded-lg border text-xs outline-none transition ${prefix ? "pl-7 pr-3" : suffix ? "pl-3 pr-7" : "px-3"}`}
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

          <button type="button" onClick={onReset}
            className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-lg border py-2 text-[11px] font-semibold transition hover:border-red-200 hover:bg-red-50 hover:text-red-500"
            style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-secondary)" }}>
            <RotateCcw size={11} /> Limpar todas as metas
          </button>
        </div>
      </div>
    </>
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
  const isDark = resolvedTheme === "dark";
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
  const [datePreset, setDatePreset]       = useState<DatePreset>("30d");
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
                    ? "bg-blue-50 dark:bg-blue-900/20"
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
        background:   active || isOpen ? "rgba(49,52,145,0.12)" : "var(--dm-bg-elevated)",
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
  selectedGroup, groups, customSections, showCourseGroups, onSelectGroup,
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

  const allCampaigns = useMemo(() => Object.values(campaignsByGroup).flat(), [campaignsByGroup]);
  const [campSearch, setCampSearch] = useState("");
  const visibleCampaigns = useMemo(() => {
    const q = campSearch.toLowerCase();
    return q ? allCampaigns.filter(c => c.name.toLowerCase().includes(q)) : allCampaigns;
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
                    background:   selectedGroup === "all" ? "rgba(49,52,145,0.08)" : "transparent",
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
                            {getSectionLabel(g.section, customSections)}
                          </p>
                        )}
                        <button
                          type="button"
                          onClick={() => { onSelectGroup(g.id); setOpenPopover(null); }}
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[13px] transition"
                          style={{
                            fontWeight: selectedGroup === g.id ? 600 : 400,
                            color:      selectedGroup === g.id ? "var(--dm-primary)" : "var(--dm-text-primary)",
                            background: selectedGroup === g.id ? "rgba(49,52,145,0.08)" : "transparent",
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
                    style={{ background: checked ? "rgba(49,52,145,0.06)" : "transparent" }}
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
      <div className="relative">
        <ContextPill
          label={periodLabel}
          icon={<CalendarDays size={11} />}
          active={!!(dateFrom || dateTo)}
          isOpen={openPopover === "period"}
          onClick={() => toggle("period")}
        />
        {openPopover === "period" && (
          <div style={{ ...popoverBase, left: 0, width: 260, padding: 16 }}>
            <p className="mb-3 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>Período</p>
            <div className="space-y-2">
              <div>
                <label className="mb-1 block text-[11px] font-medium" style={{ color: "var(--dm-text-secondary)" }}>De</label>
                <input
                  type="date"
                  value={pendingFrom}
                  onChange={e => setPendingFrom(e.target.value)}
                  className="w-full rounded-lg border px-2.5 py-1.5 text-[12px]"
                  style={{ borderColor: "var(--dm-border-default)", background: "var(--dm-bg-elevated)", color: "var(--dm-text-primary)" }}
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium" style={{ color: "var(--dm-text-secondary)" }}>Até</label>
                <input
                  type="date"
                  value={pendingTo}
                  onChange={e => setPendingTo(e.target.value)}
                  className="w-full rounded-lg border px-2.5 py-1.5 text-[12px]"
                  style={{ borderColor: "var(--dm-border-default)", background: "var(--dm-bg-elevated)", color: "var(--dm-text-primary)" }}
                />
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => { setPendingFrom(""); setPendingTo(""); onDateFrom(""); onDateTo(""); }}
                className="flex-1 rounded-lg py-1.5 text-[11px] font-semibold transition"
                style={{ background: "var(--dm-bg-elevated)", color: "var(--dm-text-secondary)" }}
              >Limpar</button>
              <button
                type="button"
                onClick={() => { onDateFrom(pendingFrom); onDateTo(pendingTo); setOpenPopover(null); }}
                className="flex-1 rounded-lg py-1.5 text-[11px] font-semibold text-white transition"
                style={{ background: "var(--dm-primary)" }}
              >Aplicar</button>
            </div>
          </div>
        )}
      </div>

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
  groups, customSections, selectedCampaign, campaignsByGroup, checkedCampaignIds, sortBy,
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
                    {getSectionLabel(group.section, customSections)}
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
                    <span className="absolute h-3 w-3 animate-ping rounded-full opacity-40 bg-blue-400" />
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
                                    className="text-[9px] font-semibold text-blue-500 transition hover:text-blue-700 dark:text-blue-400">
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
                                className="text-[9px] font-semibold text-slate-400 transition hover:text-blue-500 dark:text-slate-500 dark:hover:text-blue-400">
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
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-medium" style={{ color: "var(--dm-text-tertiary)" }}>De</span>
                <input
                  type="date"
                  value={pendingFrom}
                  onChange={(e) => setPendingFrom(e.target.value)}
                  className="h-9 w-full rounded-lg border px-2 text-xs outline-none transition focus:ring-1"
                  style={{
                    borderColor: pendingFrom !== dateFrom ? "var(--dm-brand-400)" : "var(--dm-border-default)",
                    backgroundColor: "var(--dm-bg-elevated)",
                    color: "var(--dm-text-primary)",
                  }}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-medium" style={{ color: "var(--dm-text-tertiary)" }}>Até</span>
                <input
                  type="date"
                  value={pendingTo}
                  onChange={(e) => setPendingTo(e.target.value)}
                  className="h-9 w-full rounded-lg border px-2 text-xs outline-none transition focus:ring-1"
                  style={{
                    borderColor: pendingTo !== dateTo ? "var(--dm-brand-400)" : "var(--dm-border-default)",
                    backgroundColor: "var(--dm-bg-elevated)",
                    color: "var(--dm-text-primary)",
                  }}
                />
              </label>
            </div>

            {/* Apply button — only when pending differs from applied */}
            {pendingChanged && (
              <button
                onClick={applyDates}
                className="mt-2 w-full rounded-lg py-2 text-xs font-bold text-white transition active:scale-95"
                style={{ backgroundColor: "var(--dm-brand-500)" }}
              >
                Aplicar período
              </button>
            )}
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
  onUpdateProfile,
  onOpenControlPanel,
}: DashboardProps) {
  const [mainTab, setMainTab]               = useState<MainTab>("overview");
  const [dashSubTab, setDashSubTab]         = useState<DashSubTab>("overview");
  const [histKind, setHistKind]             = useState<HistoricalKind>("lancamento");
  const [myAccountTab, setMyAccountTab]     = useState<MyAccountTabId>("profile");
  const {
    dateFrom, dateTo,
    setDateFrom: setDateFromPersist,
    setDateTo:   setDateToPersist,
  } = useDateRange();

  // ── Metric visibility — shared across all tabs ────────────────────────────
  const { hidden: hiddenMetrics, toggle: toggleMetric, showAll: showAllMetrics, hideAll: hideAllMetrics, isVisible: isMetricVisible, allVisible: allMetricsVisible } = useMetricVisibility();

  // ── User avatar (photo or icon) ────────────────────────────────────────────
  const { avatarUrl } = useAvatarUrl();
  const { resolvedTheme } = useTheme();
  const resolvedAvatarSrc = resolveAvatarSrc(avatarUrl, resolvedTheme === "dark");
  const [showKpiPanel, setShowKpiPanel] = useState(false);
  const [pixelFunnelOpen, setPixelFunnelOpen] = useState(() => {
    try { return localStorage.getItem("pta_pixel_funnel_open_v1") !== "0"; } catch { return true; }
  });
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem("dm_sidebar_collapsed") === "1"; } catch { return false; }
  });
  const [rightCollapsed, setRightCollapsed] = useState(false);

  const toggleSidebar = (next: boolean) => {
    setSidebarCollapsed(next);
    try { localStorage.setItem("dm_sidebar_collapsed", next ? "1" : "0"); } catch {}
  };

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

  useEffect(() => {
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
      // Supabase-loaded campaign — classify by name using both functions for full coverage
      const byName = classifyCampaign(c.campaignName);
      if (byName === selectedCategory) return true;
      // For groups whose section is set but name classifier doesn't match (e.g. custom groups),
      // check if any group in the target section has this campaign name verified
      const groupsInCategory = allGroups.filter((g) => g.section === selectedCategory && campaignsByGroup[g.id]?.length);
      return groupsInCategory.some((g) =>
        campaignsByGroup[g.id].some((camp) => camp.name === c.campaignName),
      );
    });
  }, [campaigns, selectedCategory, accountSectionMap, allGroups, campaignsByGroup]);

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

  // Key for manual Eduzz edits: specific campaign when one is selected, else "global"
  const eduzzEditKey = selectedCampaign !== "all" ? selectedCampaign : "eduzz_global";

  // ── Eduzz manual sales totals — from the edit key (single context value) ──────
  const eduzzTotals = useMemo(() => {
    const ov = manualOverrides[eduzzEditKey];
    return {
      salesIngresso: ov?.salesIngresso ?? 0,
      salesPos:      ov?.salesPos      ?? 0,
      salesTotal:    ov?.salesTotal    ?? 0,
    };
  }, [eduzzEditKey, manualOverrides]);
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

  const showRightPanel     = mainTab !== "history" && mainTab !== "leads" && mainTab !== "profiles" && mainTab !== "products";
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
    const catName = getSectionLabel(String(selectedCategory), customSections);
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
  const needsCategory = mainTab !== "history" && mainTab !== "leads" && mainTab !== "profiles" && mainTab !== "products";

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
              background:   active ? "rgba(49,52,145,0.12)" : "transparent",
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
      return SIDEBAR_HISTORY_TABS.map(({ id, icon: Icon }) => {
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
              background:   active ? "rgba(49,52,145,0.12)" : "transparent",
              color:        active ? "var(--dm-primary)" : "var(--dm-text-tertiary)",
              fontWeight:   active ? 600 : 400,
              fontSize:     12,
            }}
          >
            <Icon size={12} className="flex-shrink-0" />
            <span className="truncate">{HISTORICAL_KIND_LABELS[id]}</span>
          </button>
        );
      });
    }
    if (parentId === "myaccount") {
      return SIDEBAR_ACCOUNT_TABS.map(({ id, label, icon: Icon }) => {
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
              background:   active ? "rgba(49,52,145,0.12)" : "transparent",
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

  /* Nav items list — reutilizado dentro do card expandido */
  const navItemsList = (
    <nav className="flex flex-col gap-0.5 py-2 px-2">
      {MAIN_TABS.map(({ id, label, icon: Icon }) => {
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
                background:   isActive ? "rgba(49,52,145,0.18)"          : "transparent",
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
        className={`fixed inset-y-0 left-0 z-50 flex flex-col shadow-horizon transition-all duration-300 w-[86vw] max-w-[280px] lg:relative lg:translate-x-0 lg:z-auto lg:max-w-none lg:flex-shrink-0 ${
          showMobileNav ? "translate-x-0 shadow-2xl" : "-translate-x-full"
        }`}
        style={{
          background:   "var(--dm-bg-sidebar)",
          borderRight:  "1px solid var(--dm-border-default)",
          width:         sidebarCollapsed ? 72 : 280,
        }}
      >
        {sidebarCollapsed ? (
          /* ══════════════ COLLAPSED ══════════════ */
          <div className="flex flex-1 flex-col items-center py-4 overflow-y-auto">
            {/* Logo = clicar expande */}
            <button
              type="button"
              onClick={() => toggleSidebar(false)}
              aria-expanded="false"
              aria-label="Expandir sidebar"
              data-tip="DashMonster"
              className="dm-sidebar-tooltip mb-3 flex h-11 w-11 items-center justify-center rounded-[10px] transition hover:opacity-80"
              style={{ background: "#313491" }}
            >
              <DashMonsterLogo size={20} className="text-white" />
            </button>

            <div className="mb-3 w-8 h-px" style={{ background: "var(--dm-border-default)" }} />

            {/* Icon-only nav — tooltips à direita */}
            <div className="flex flex-col items-center gap-1 w-full px-2">
              {MAIN_TABS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => { setMainTab(id); setShowMobileNav(false); }}
                  aria-label={label}
                  data-tip={label}
                  className="dm-sidebar-tooltip flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-150"
                  style={mainTab === id
                    ? { background: "rgba(49,52,145,0.24)", border: "1px solid rgba(91,96,210,0.32)", color: "var(--dm-nav-active-text)" }
                    : { color: "var(--dm-nav-default-text)" }
                  }
                >
                  <Icon size={18} />
                </button>
              ))}
            </div>

            {/* Perpétuo — collapsed icon */}
            <div className="mt-2 w-full px-2 flex flex-col items-center gap-1">
              <div className="w-7 h-px" style={{ background: "var(--dm-divider)" }} />
              <Link
                href="/produto/perpetuo"
                aria-label="Perpétuo"
                data-tip="Perpétuo"
                className="dm-sidebar-tooltip flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-150 text-amber-500 hover:bg-[var(--dm-bg-surface-hover)]"
              >
                <RotateCcw size={18} />
              </Link>
            </div>

            <div className="flex-1" />

            {/* Divider */}
            <div className="mx-2 h-px flex-shrink-0" style={{ background: "var(--dm-divider)" }} />

            {/* CTA — collapsed: icon only */}
            <div className="mb-4 mt-3 px-2 flex-shrink-0">
              <button
                type="button"
                className="flex h-10 w-10 items-center justify-center rounded-[10px] transition hover:opacity-80"
                style={{ background: "#313491" }}
                title={campaigns.length > 0 ? `${campaigns.length.toLocaleString("pt-BR")} linhas carregadas` : "Sem dados — conecte uma fonte"}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: campaigns.length > 0 ? "#05CD99" : "rgba(255,255,255,0.4)" }}
                />
              </button>
            </div>
          </div>
        ) : (
          /* ══════════════ EXPANDED ══════════════ */
          <>
            {/* Brand glow (decorative) */}
            <div
              className="pointer-events-none absolute -left-14 -top-14 h-48 w-48 rounded-full"
              style={{ background: "radial-gradient(circle, rgba(49,52,145,0.10) 0%, transparent 70%)" }}
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
                  style={{ background: "#313491" }}
                >
                  <DashMonsterLogo size={16} className="text-white" />
                </div>
                <span
                  className="text-[14px] uppercase tracking-wide"
                  style={{ fontFamily: "var(--font-poppins)", fontWeight: 700, color: "var(--dm-text-primary)" }}
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
                  onClick={() => { setMainTab("myaccount"); setMyAccountTab("profile"); }}
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
                style={{ background: "#313491" }}
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

      {/* ── Center ── */}
      <div className="flex flex-1 flex-col overflow-hidden">

        {/* Top header — contexto em cima, acções agrupadas */}
        {/* ── Frosted pill navbar — Horizon style ── */}
        <header className="relative z-10 mx-4 mt-4 mb-1 flex-shrink-0 rounded-2xl border backdrop-blur-xl bg-white/80 dark:bg-[#0b143780] shadow-sm" style={{ borderColor: "var(--dm-border-default)" }}>
          <div className="flex min-h-[3.25rem] flex-row items-center justify-between gap-2 px-3 py-2 sm:gap-3 sm:px-4 md:px-6">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <button
                onClick={() => setShowMobileNav(true)}
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700 lg:hidden"
                type="button"
                aria-label="Abrir menu"
              >
                <Menu size={18} />
              </button>

              <div className="min-w-0 flex flex-wrap items-center gap-1.5 text-sm">
                <button
                  type="button"
                  onClick={() => { setMainTab("overview"); }}
                  className="flex items-center gap-1 text-slate-400 transition hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-300"
                  title="Ir para Visão geral"
                >
                  <Home size={13} />
                  <span className="hidden md:inline">Início</span>
                </button>
                <span className="text-slate-300 dark:text-slate-600" aria-hidden>/</span>
                <span className="font-semibold text-slate-800 dark:text-slate-100">{currentTab.label}</span>

                {needsCategory && campaigns.length > 0 && (
                  selectedCategory ? (() => {
                  const cat = selectedCategory as ProductCategory;
                  const CatIcon = CATEGORY_ICON[cat] ?? Flag;
                  const dot     = CATEGORY_DOT[cat] ?? "var(--dm-brand-500)";
                  return (
                    <button
                      type="button"
                      onClick={() => setSelectedCategory(null)}
                      title="Escolher outra categoria"
                      className="ml-0.5 flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
                    >
                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: dot }} />
                      <CatIcon size={11} aria-hidden />
                      <span className="hidden sm:inline">{getSectionLabel(String(cat), customSections)}</span>
                      <span className="sr-only">Trocar categoria</span>
                      <X size={10} className="text-slate-400 dark:text-slate-500" aria-hidden />
                    </button>
                  );
                })() : (
                  <button
                    type="button"
                    onClick={() => setPickCategoryOpen(true)}
                    title="Filtrar dados por área de negócio"
                    className="ml-0.5 rounded-full border border-dashed border-slate-300 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    Escolher categoria
                  </button>
                )
                )}
              </div>
            </div>

            <div className="flex flex-shrink-0 flex-wrap items-center justify-end gap-1.5 sm:gap-2">
              {/* Mobile filter button removed — filters now accessible via context bar */}
              {/* User account button removed — accessible via sidebar avatar */}

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowGoals((v) => !v)}
                  className={`flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition ${
                    showGoals
                      ? "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                  }`}
                >
                  <Flag size={13} />
                  <span className="hidden sm:inline">Metas</span>
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

              <span className="hidden h-6 w-px self-center bg-slate-200 dark:bg-slate-600 sm:inline" aria-hidden />

              {campaigns.length > 0 && (
                <button
                  type="button"
                  title="Exportar campanhas filtradas como CSV"
                  onClick={() => exportDashboardCsv({
                    campaigns: campaignsWithOverrides,
                    totals,
                    dateFrom,
                    dateTo,
                    overrides: manualOverrides,
                  })}
                  className="flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  <Download size={13} />
                  <span className="hidden sm:inline">Exportar CSV</span>
                </button>
              )}
            </div>
          </div>

        </header>

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
                {false && overviewSelectionSummary && (
                  <section style={{ display: "none" }}>
                      <span>{filteredCampaigns.length} / {categorizedCampaigns.length} campanhas
                      </span>
                  </section>
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
                {/* KPI block */}
                <section className="space-y-3" aria-labelledby="kpi-section-title">
                  <div className="relative flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                    <div className="flex flex-wrap items-center gap-2 min-w-0">
                      {/* Dynamic header — tags when filter active */}
                      {selectedGroup !== "all" || checkedCampaignIds.length > 0 ? (
                        <>
                          {overviewSelectionSummary?.catName && (
                            <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold"
                              style={{ background: "rgba(49,52,145,0.12)", color: "var(--dm-primary)" }}>
                              {overviewSelectionSummary.catName}
                            </span>
                          )}
                          <h2 id="kpi-section-title" className="text-sm font-bold tracking-tight sm:text-base truncate max-w-xs" style={{ color: "var(--dm-text-primary)" }}>
                            {selectedGroup !== "all"
                              ? (allGroups.find(g => g.id === selectedGroup)?.label ?? selectedGroup)
                              : `${checkedCampaignIds.length} campanha${checkedCampaignIds.length !== 1 ? "s" : ""}`}
                          </h2>
                        </>
                      ) : (
                        <h2 id="kpi-section-title" className="text-sm font-bold tracking-tight sm:text-base" style={{ color: "var(--dm-text-primary)" }}>
                          Indicadores principais
                        </h2>
                      )}
                    </div>
                    <div className="relative sm:mb-0.5">
                    <button
                      type="button"
                      onClick={() => setShowKpiPanel((v) => !v)}
                      className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition hover:opacity-80"
                      style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-elevated)", color: "var(--dm-text-secondary)" }}
                    >
                      <SlidersHorizontal size={11} aria-hidden /> Personalizar cartões
                    </button>
                    {showKpiPanel && (
                      <div
                        className="absolute right-0 top-full z-30 mt-1 w-64 rounded-xl border p-3 shadow-lg"
                        style={{ background: "var(--dm-bg-surface)", borderColor: "var(--dm-border-default)" }}
                      >
                        <p className="text-[12px] font-semibold mb-0.5" style={{ color: "var(--dm-text-primary)" }}>
                          Visibilidade dos cartões
                        </p>
                        <p className="mb-3 text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>
                          Ative ou desative as métricas do dashboard
                        </p>
                        <div className="space-y-3">
                          {([
                            { label: "Financeiro",  ids: ["investment", "revenue", "roas", "roi"] as const },
                            { label: "Vendas",      ids: ["sales_total", "sales_ingresso", "cpa_ingresso", "sales_pos", "cpa_pos", "cpa_venda"] as const },
                            { label: "Eficiência",  ids: ["conversions", "leads", "cpa", "cpl", "ctr", "cpc", "cpm"] as const },
                            { label: "Volume",      ids: ["clicks", "impressions"] as const },
                          ] as const).map(({ label, ids }) => (
                            <div key={label}>
                              <p className="mb-1.5 px-1 text-[9px] font-bold uppercase tracking-widest"
                                style={{ color: "var(--dm-text-tertiary)" }}>
                                {label}
                              </p>
                              <div className="space-y-1">
                                {ids.map((id) => {
                                  const on = isMetricVisible(id);
                                  return (
                                    <label
                                      key={id}
                                      className="flex cursor-pointer items-center justify-between rounded-lg px-2.5 py-2 transition"
                                      style={{ background: "var(--dm-bg-surface)", border: `0.5px solid var(--dm-border-subtle)`, borderRadius: 8 }}
                                    >
                                      <p className="text-[12px] font-medium" style={{ color: "var(--dm-text-secondary)" }}>
                                        {METRIC_LABELS[id]}
                                      </p>
                                      <span
                                        className="relative ml-2 inline-flex h-5 w-9 flex-shrink-0 rounded-full transition-colors duration-200"
                                        style={{ background: on ? "var(--dm-primary)" : "var(--dm-border-strong)" }}
                                      >
                                        <span
                                          className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200"
                                          style={{ transform: on ? "translateX(16px)" : "translateX(2px)" }}
                                        />
                                        <input type="checkbox" checked={on} onChange={() => toggleMetric(id)} className="sr-only" />
                                      </span>
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="mt-3 flex gap-2">
                          <button
                            type="button"
                            onClick={() => setShowKpiPanel(false)}
                            className="flex-1 rounded-lg py-2 text-[11px] font-semibold transition hover:opacity-80"
                            style={{ background: "var(--dm-bg-elevated)", color: "var(--dm-text-secondary)" }}
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            onClick={allMetricsVisible ? hideAllMetrics : showAllMetrics}
                            className="flex-1 rounded-lg py-2 text-[11px] font-semibold text-white transition hover:opacity-90"
                            style={{ background: allMetricsVisible ? "var(--dm-border-strong)" : "var(--dm-primary)" }}
                          >
                            {allMetricsVisible ? "Ocultar todas" : "Mostrar todas"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* ── KPI 3-Tier layout ── */}
                {(() => {
                  /* Tier 1 — Financeiro */
                  const tier1 = [
                    isMetricVisible("investment") && (
                      <KpiCard key="investment" tier={1}
                        title="Total Investido" value={formatCurrency(totals.totalInvestment)}
                        subtitle={`CTR médio: ${formatPercent(totals.ctr)}`}
                        icon={Wallet} accentColor="red" invertTrend
                        goalValue={goals.investment} goalLabel={goals.investment != null ? formatCurrency(goals.investment) : undefined}
                        goalPct={goals.investment != null ? (totals.totalInvestment / goals.investment) * 100 : null}
                        goalInvert
                      />
                    ),
                    isMetricVisible("revenue") && (
                      <KpiCard key="revenue" tier={1}
                        title="Receita Total" value={formatCurrency(totals.totalRevenue)}
                        subtitle={`ROAS: ${totals.roas.toFixed(2)}x`}
                        icon={CircleDollarSign} accentColor="green"
                      />
                    ),
                    isMetricVisible("roas") && (
                      <KpiCard key="roas" tier={1}
                        title="ROAS" value={`${totals.roas.toFixed(2)}x`}
                        icon={TrendingUp} accentColor="primary"
                        goalValue={goals.roas} goalLabel={goals.roas != null ? `${goals.roas.toFixed(1)}x` : undefined}
                        goalPct={goals.roas != null ? (totals.roas / goals.roas) * 100 : null}
                      />
                    ),
                    isMetricVisible("sales_total") && (
                      <KpiCard key="sales_total" tier={1}
                        title="Vendas Total" value={formatNumber(eduzzTotals.salesTotal)}
                        subtitle="Eduzz — manual"
                        icon={GraduationCap} accentColor="green"
                        editable={true}
                        isManual={(manualOverrides[eduzzEditKey]?.salesTotal ?? 0) > 0}
                        onEdit={(v) => eduzzEditKey && setManualOverride(eduzzEditKey, { salesTotal: v })}
                      />
                    ),
                  ].filter(Boolean);

                  /* Tier 1.5 — Vendas Eduzz + CPAs derivados (auto-calculados) */
                  const cpvEduzz     = eduzzTotals.salesTotal     > 0 ? totals.totalInvestment / eduzzTotals.salesTotal     : 0;
                  const cpaIngresso  = eduzzTotals.salesIngresso  > 0 ? totals.totalInvestment / eduzzTotals.salesIngresso  : 0;
                  const cpaPos       = eduzzTotals.salesPos       > 0 ? totals.totalInvestment / eduzzTotals.salesPos       : 0;
                  const tierVendas = [
                    isMetricVisible("sales_ingresso") && (
                      <KpiCard key="sales_ingresso" tier={2}
                        title="Vendas de Ingresso" value={formatNumber(eduzzTotals.salesIngresso)}
                        subtitle="Eduzz — manual"
                        icon={Ticket} accentColor="green"
                        editable={true}
                        isManual={(manualOverrides[eduzzEditKey]?.salesIngresso ?? 0) > 0}
                        onEdit={(v) => eduzzEditKey && setManualOverride(eduzzEditKey, { salesIngresso: v })}
                      />
                    ),
                    isMetricVisible("cpa_ingresso") && (
                      <KpiCard key="cpa_ingresso" tier={2}
                        title="Custo p/ Venda de Ingresso" value={cpaIngresso > 0 ? formatCurrency(cpaIngresso) : "—"}
                        subtitle="Investimento ÷ V. Ingresso"
                        icon={BadgeDollarSign} accentColor="amber"
                        invertTrend
                      />
                    ),
                    isMetricVisible("sales_pos") && (
                      <KpiCard key="sales_pos" tier={2}
                        title="Vendas de Pós" value={formatNumber(eduzzTotals.salesPos)}
                        subtitle="Eduzz — manual"
                        icon={GraduationCap} accentColor="green"
                        editable={true}
                        isManual={(manualOverrides[eduzzEditKey]?.salesPos ?? 0) > 0}
                        onEdit={(v) => eduzzEditKey && setManualOverride(eduzzEditKey, { salesPos: v })}
                      />
                    ),
                    isMetricVisible("cpa_pos") && (
                      <KpiCard key="cpa_pos" tier={2}
                        title="Custo p/ Venda de Pós" value={cpaPos > 0 ? formatCurrency(cpaPos) : "—"}
                        subtitle="Investimento ÷ V. de Pós"
                        icon={BadgeDollarSign} accentColor="amber"
                        invertTrend
                      />
                    ),
                    isMetricVisible("cpa_venda") && (
                      <KpiCard key="cpa_venda" tier={2}
                        title="Custo por Venda" value={cpvEduzz > 0 ? formatCurrency(cpvEduzz) : "—"}
                        subtitle="Investimento ÷ Vendas Total"
                        icon={BadgeDollarSign} accentColor="amber"
                        invertTrend
                      />
                    ),
                  ].filter(Boolean);

                  /* Tier 2 — Eficiência */
                  const tier2 = [
                    isMetricVisible("roi") && (
                      <KpiCard key="roi" tier={2}
                        title="ROI" value={formatPercent(totals.roi)}
                        icon={TrendingUp} accentColor="primary"
                        goalValue={goals.roi} goalLabel={goals.roi != null ? `${goals.roi.toFixed(0)}%` : undefined}
                        goalPct={goals.roi != null ? (totals.roi / goals.roi) * 100 : null}
                      />
                    ),
                    isMetricVisible("cpa") && (
                      <KpiCard key="cpa" tier={2}
                        title="CPA Médio" value={formatCurrency(totals.cpa)}
                        icon={BadgeDollarSign} accentColor="amber" invertTrend
                        goalValue={goals.cpa} goalLabel={goals.cpa != null ? formatCurrency(goals.cpa) : undefined}
                        goalPct={goals.cpa != null && totals.cpa > 0 ? (goals.cpa / totals.cpa) * 100 : null}
                        goalInvert
                      />
                    ),
                    isMetricVisible("ctr") && (
                      <KpiCard key="ctr" tier={2}
                        title="CTR Médio" value={formatPercent(totals.ctr)}
                        icon={MousePointerClick} accentColor="blue"
                        goalValue={goals.ctr} goalLabel={goals.ctr != null ? `${goals.ctr.toFixed(1)}%` : undefined}
                        goalPct={goals.ctr != null ? (totals.ctr / goals.ctr) * 100 : null}
                      />
                    ),
                    isMetricVisible("cpc") && (
                      <KpiCard key="cpc" tier={2}
                        title="CPC Médio" value={formatCurrency(totals.cpc)}
                        icon={BadgeDollarSign} accentColor="amber" invertTrend
                        goalValue={goals.cpc} goalLabel={goals.cpc != null ? formatCurrency(goals.cpc) : undefined}
                        goalPct={goals.cpc != null && totals.cpc > 0 ? (goals.cpc / totals.cpc) * 100 : null}
                        goalInvert
                      />
                    ),
                    isMetricVisible("conversions") && (
                      <KpiCard key="conversions" tier={2}
                        title="Conversões" value={formatNumber(totals.totalConversions)}
                        subtitle={`Tx.: ${formatPercent(totals.conversionRate)}`}
                        icon={Target} accentColor="green"
                        goalValue={goals.conversions} goalLabel={goals.conversions != null ? formatNumber(goals.conversions) : undefined}
                        goalPct={goals.conversions != null ? (totals.totalConversions / goals.conversions) * 100 : null}
                      />
                    ),
                  ].filter(Boolean);

                  /* Tier 3 — Volume */
                  const tier3 = [
                    isMetricVisible("impressions") && (
                      <KpiCard key="impressions" tier={3}
                        title="Impressões" value={formatNumber(totals.totalImpressions)}
                        icon={Activity} accentColor="blue"
                      />
                    ),
                    isMetricVisible("clicks") && (
                      <KpiCard key="clicks" tier={3}
                        title="Cliques" value={formatNumber(totals.totalClicks)}
                        subtitle={`CTR: ${formatPercent(totals.ctr)}`}
                        icon={MousePointerClick} accentColor="primary"
                      />
                    ),
                    isMetricVisible("cpm") && (
                      <KpiCard key="cpm" tier={3}
                        title="CPM Médio" value={formatCurrency(totals.cpm)}
                        icon={Zap} accentColor="amber" invertTrend
                      />
                    ),
                    isMetricVisible("leads") && (
                      <KpiCard key="leads" tier={3}
                        title="Leads" value={formatNumber(totals.totalLeads)}
                        subtitle={totals.totalLeads > 0 ? `CPL: ${formatCurrency(totals.cpl)}` : undefined}
                        icon={Users} accentColor="violet"
                        goalValue={goals.leads} goalLabel={goals.leads != null ? formatNumber(goals.leads) : undefined}
                        goalPct={goals.leads != null ? (totals.totalLeads / goals.leads) * 100 : null}
                      />
                    ),
                    isMetricVisible("cpl") && totals.totalLeads > 0 && (
                      <KpiCard key="cpl" tier={3}
                        title="CPL Médio" value={formatCurrency(totals.cpl)}
                        icon={UserRound} accentColor="violet"
                      />
                    ),
                  ].filter(Boolean);

                  const hasAny = tier1.length + tierVendas.length + tier2.length + tier3.length > 0;

                  /* Tier label separator */
                  const TierLabel = ({ label }: { label: string }) => (
                    <div className="flex items-center gap-2 pt-1">
                      <span
                        className="flex-shrink-0 text-[10px] font-semibold uppercase"
                        style={{ color: "var(--dm-text-tertiary)", letterSpacing: "0.09em" }}
                      >
                        {label}
                      </span>
                      <div className="flex-1 h-px" style={{ background: "var(--dm-border-default)" }} />
                    </div>
                  );

                  return hasAny ? (
                    <div className="space-y-3">
                      {tier1.length > 0 && (
                        <>
                          <TierLabel label="Financeiro" />
                          <div className="grid grid-cols-1 gap-[10px] sm:grid-cols-2 lg:grid-cols-3">
                            {tier1}
                          </div>
                        </>
                      )}
                      {tierVendas.length > 0 && (
                        <>
                          <TierLabel label="Vendas" />
                          <div className="grid grid-cols-2 gap-[10px] sm:grid-cols-3 lg:grid-cols-4">
                            {tierVendas}
                          </div>
                        </>
                      )}
                      {tier2.length > 0 && (
                        <>
                          <TierLabel label="Eficiência" />
                          <div className="grid grid-cols-2 gap-[10px] sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                            {tier2}
                          </div>
                        </>
                      )}
                      {tier3.length > 0 && (
                        <>
                          <TierLabel label="Volume" />
                          <div className="grid grid-cols-2 gap-[10px] sm:grid-cols-3 lg:grid-cols-5">
                            {tier3}
                          </div>
                        </>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center justify-center rounded-xl border py-6"
                      style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-tertiary)" }}>
                      <p className="text-xs">
                        Nenhuma métrica visível.{" "}
                        <button className="underline" style={{ color: "var(--dm-primary)" }} onClick={showAllMetrics}>
                          Mostrar todas
                        </button>
                      </p>
                    </div>
                  );
                })()}
                </section>

                {/* Funnel */}
                <FunnelCard
                  impressions={totals.totalImpressions}
                  clicks={totals.totalClicks}
                  conversions={totals.totalConversions}
                  investment={totals.totalInvestment}
                  leads={totals.totalLeads}
                  storageScope={currentUser.email}
                />

                <ChartsSection dailyTrend={dailyTrend} campaignComparison={campaignComparison} budgetDistribution={budgetDistribution} />
                {/* Funil do Pixel — collapsible */}
                <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--dm-border-default)" }}>
                  <button
                    type="button"
                    onClick={() => setPixelFunnelOpen((prev) => {
                      const next = !prev;
                      try { localStorage.setItem("pta_pixel_funnel_open_v1", next ? "1" : "0"); } catch {}
                      return next;
                    })}
                    className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold transition-colors hover:opacity-80"
                    style={{ background: "var(--dm-bg-card)", color: "var(--dm-text-primary)" }}
                  >
                    <span className="flex items-center gap-2">
                      <Target size={14} className="text-violet-500" />
                      Funil do Pixel
                    </span>
                    {pixelFunnelOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                  {pixelFunnelOpen && (
                    <PixelFunnelSection
                      adAccountId={selectedGroup !== "all" ? campaignConfigs[selectedGroup]?.adAccountId : undefined}
                      dateFrom={dateFrom || undefined}
                      dateTo={dateTo || undefined}
                    />
                  )}
                </div>
                <CampaignTable campaigns={sortedCampaigns} isMetricVisible={isMetricVisible} />
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

          {mainTab === "products"  && <ProductBase />}
          {mainTab === "profiles" && (
            <ProfileAnalysis
              campaignGroupOptions={allGroups.map((g) => ({ id: g.id, label: g.label, section: g.section }))}
              campaignConfigs={campaignConfigs}
              appliedDateRange={{ from: dateFrom, to: dateTo }}
            />
          )}

          {mainTab === "myaccount" && (
            <MyAccount
              userName={currentUser.name}
              userEmail={currentUser.email}
              categories={categories}
              accountEntries={accountEntries}
              onCategoriesChange={onCategoriesChange ?? (() => {})}
              onEntriesChange={onEntriesChange ?? (() => {})}
              onUpdateProfile={onUpdateProfile}
              onSignOut={onSignOut}
              syncStatus={syncStatus}
              campaignCount={campaigns.length}
              dataSource={dataSource}
              onRefresh={onRefresh}
              onClearData={onClearData}
              activeTab={myAccountTab}
              onTabChange={setMyAccountTab}
            />
          )}

          </div>
        </main>
      </div>

      {/* Right panel removed — campaigns filtered via context bar */}

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
