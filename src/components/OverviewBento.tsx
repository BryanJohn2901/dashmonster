"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  Filter, Wallet, Coins, Target, Gauge, TrendingUp, MousePointerClick,
  Users, UserRound, Activity, BadgeDollarSign, Zap, Pencil, X, Check,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { CampaignData, DashboardTotals, OriginBreakdown } from "@/types/campaign";
import { formatBRL, formatInt, formatPercent } from "@/lib/format";
import { StatCard } from "@/components/ui/StatCard";
import { BreakdownChips, type TileBreakdown } from "@/components/ui/BreakdownChips";
import { SectionHeader } from "@/components/ui/SectionHeader";

// ─── Cores por canal (dentro do sistema, sem pastel) ──────────────────────────
const ORIGIN_COLORS: Record<string, string> = {
  "Meta Ads": "#16A34A", "Google": "#0D9488", "Orgânico": "#05CD99", "Eduzz": "#f59e0b", "Planilha": "#22C55E",
};
const ORIGIN_FALLBACK = ["#16A34A", "#0D9488", "#05CD99", "#f59e0b", "#22C55E", "#e11d48"];
const originColor = (origem: string, index: number): string =>
  ORIGIN_COLORS[origem] ?? ORIGIN_FALLBACK[index % ORIGIN_FALLBACK.length];

// ─── Catálogo de cards do bento (escolhíveis pelo lápis) ──────────────────────
const BENTO_KEY = "gsah_bento_cards_v1";
const DEFAULT_CARDS = ["investment", "results", "cpa", "roas"];
const MAX_CARDS = 4;

interface BentoMetric {
  id: string; label: string; value: string; sub?: string;
  data?: number[]; color: string; icon: LucideIcon; invertDelta?: boolean; breakdown?: TileBreakdown[];
}

function readCards(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(BENTO_KEY) ?? "null");
    return Array.isArray(raw) && raw.length === MAX_CARDS && raw.every((v) => typeof v === "string") ? raw : DEFAULT_CARDS;
  } catch { return DEFAULT_CARDS; }
}

// ─── Funil compacto ───────────────────────────────────────────────────────────

function FunnelTile({ stages }: { stages: { label: string; value: number; color: string; breakdown?: TileBreakdown[] }[] }) {
  const max = Math.max(...stages.map((s) => s.value), 1);
  return (
    <div className="flex h-full flex-col gap-3 rounded-2xl border p-5"
      style={{ backgroundColor: "var(--dm-bg-surface)", borderColor: "var(--dm-border-subtle)" }}>
      <SectionHeader icon={Filter} title="Funil de conversão" color="#16A34A" />
      <div className="flex flex-1 flex-col justify-center gap-2.5">
        {stages.map((s, i) => {
          const prev = i > 0 ? stages[i - 1].value : null;
          const conv = prev && prev > 0 ? (s.value / prev) * 100 : null;
          const widthPct = Math.max(6, (s.value / max) * 100);
          return (
            <div key={s.label} className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-semibold" style={{ color: "var(--dm-text-secondary)" }}>{s.label}</span>
                <span className="flex items-center gap-2">
                  {conv != null && (
                    <span className="rounded-full px-1.5 py-0.5 text-[9px] font-bold tabular-nums" style={{ color: "#16A34A", backgroundColor: "rgba(22,163,74,0.12)" }}>
                      {conv.toFixed(1)}%
                    </span>
                  )}
                  <span className="font-bold tabular-nums" style={{ color: "var(--dm-text-primary)" }}>{formatInt(s.value)}</span>
                </span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full" style={{ backgroundColor: "var(--dm-bg-elevated)" }}>
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${widthPct}%`, background: s.color }} />
              </div>
              {s.breakdown && s.breakdown.length > 1 && (
                <div className="pl-0.5"><BreakdownChips items={s.breakdown} size="xs" /></div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Picker dos 4 cards ───────────────────────────────────────────────────────

function CardPicker({ catalog, selected, onSave, onClose }: {
  catalog: BentoMetric[]; selected: string[]; onSave: (ids: string[]) => void; onClose: () => void;
}) {
  const [draft, setDraft] = useState<string[]>(selected);
  const toggle = (id: string) => setDraft((p) =>
    p.includes(id) ? p.filter((x) => x !== id) : p.length >= MAX_CARDS ? p : [...p, id]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md overflow-hidden rounded-2xl border" style={{ background: "var(--dm-bg-surface)", borderColor: "var(--dm-border-default)" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: "var(--dm-border-subtle)" }}>
          <div>
            <h3 className="text-sm font-bold" style={{ color: "var(--dm-text-primary)" }}>Cards principais</h3>
            <p className="text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>Escolha {MAX_CARDS} métricas · {draft.length}/{MAX_CARDS}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 transition hover:bg-[var(--dm-bg-elevated)]" style={{ color: "var(--dm-text-tertiary)" }}><X size={16} /></button>
        </div>
        <div className="max-h-[55vh] overflow-y-auto p-2">
          {catalog.map((m) => {
            const on = draft.includes(m.id);
            const full = draft.length >= MAX_CARDS && !on;
            return (
              <button key={m.id} type="button" onClick={() => toggle(m.id)} disabled={full}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition disabled:opacity-40"
                style={{ background: on ? "var(--dm-primary-soft)" : "transparent" }}>
                <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg" style={{ background: `${m.color}1a` }}>
                  <m.icon size={14} style={{ color: m.color }} />
                </span>
                <span className="flex-1 text-[13px] font-semibold" style={{ color: "var(--dm-text-primary)" }}>{m.label}</span>
                <span className="text-[12px] tabular-nums" style={{ color: "var(--dm-text-tertiary)" }}>{m.value}</span>
                <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border"
                  style={{ borderColor: on ? "var(--dm-primary)" : "var(--dm-border-default)", background: on ? "var(--dm-primary)" : "transparent" }}>
                  {on && <Check size={12} className="text-white" />}
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex gap-3 border-t px-5 py-4" style={{ borderColor: "var(--dm-border-subtle)" }}>
          <button type="button" onClick={onClose} className="h-9 flex-1 rounded-xl border text-xs font-semibold transition hover:opacity-80" style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-secondary)" }}>Cancelar</button>
          <button type="button" disabled={draft.length !== MAX_CARDS} onClick={() => onSave(draft)}
            className="h-9 flex-1 rounded-xl text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-40" style={{ background: "var(--dm-btn-primary-bg)" }}>Salvar</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ─── Bento da Visão Geral: funil + 4 cards configuráveis ──────────────────────

export function OverviewBento({ totals, campaigns, conversions, leadsByOrigin }: {
  totals: DashboardTotals;
  campaigns: CampaignData[];
  conversions: number;
  /** Leads da tabela `leads` (planilha/Eduzz) agrupados por origem. */
  leadsByOrigin?: { origem: string; leads: number }[];
}) {
  const [selected, setSelected] = useState<string[]>(() => (typeof window === "undefined" ? DEFAULT_CARDS : readCards()));
  const [picking, setPicking] = useState(false);
  const saveCards = (ids: string[]) => {
    setSelected(ids); setPicking(false);
    try { localStorage.setItem(BENTO_KEY, JSON.stringify(ids)); } catch {}
  };

  // ── Séries diárias (sparkline) ──────────────────────────────────────────────
  const series = useMemo(() => {
    const byDate = new Map<string, { inv: number; rev: number; conv: number; clk: number; imp: number }>();
    for (const c of campaigns) {
      const cur = byDate.get(c.date) ?? { inv: 0, rev: 0, conv: 0, clk: 0, imp: 0 };
      cur.inv += c.investment; cur.rev += c.revenue; cur.conv += c.conversions; cur.clk += c.clicks; cur.imp += c.impressions;
      byDate.set(c.date, cur);
    }
    const dates = [...byDate.keys()].sort();
    const rows = dates.map((d) => byDate.get(d)!);
    return {
      inv: rows.map((v) => v.inv), rev: rows.map((v) => v.rev), conv: rows.map((v) => v.conv),
      clk: rows.map((v) => v.clk), imp: rows.map((v) => v.imp),
      cpa: rows.map((v) => (v.conv > 0 ? v.inv / v.conv : 0)),
      roas: rows.map((v) => (v.inv > 0 ? v.rev / v.inv : 0)),
      roi: rows.map((v) => (v.inv > 0 ? ((v.rev - v.inv) / v.inv) * 100 : 0)),
      ctr: rows.map((v) => (v.imp > 0 ? (v.clk / v.imp) * 100 : 0)),
      cpc: rows.map((v) => (v.clk > 0 ? v.inv / v.clk : 0)),
      cpm: rows.map((v) => (v.imp > 0 ? (v.inv / v.imp) * 1000 : 0)),
    };
  }, [campaigns]);

  // ── Quebra por canal ────────────────────────────────────────────────────────
  const leadsBreakdownMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const b of totals.sourceBreakdown) if (b.leads > 0) map.set(b.origem, (map.get(b.origem) ?? 0) + b.leads);
    for (const l of leadsByOrigin ?? []) if (l.leads > 0) map.set(l.origem, (map.get(l.origem) ?? 0) + l.leads);
    return map;
  }, [totals.sourceBreakdown, leadsByOrigin]);
  const totalLeads = useMemo(() => Array.from(leadsBreakdownMap.values()).reduce((a, b) => a + b, 0), [leadsBreakdownMap]);

  const toChips = (rows: { origem: string; v: number }[], fmt: (v: number) => string): TileBreakdown[] =>
    rows.filter((r) => r.v > 0).sort((a, b) => b.v - a.v).map((r, i) => ({ label: r.origem, value: fmt(r.v), color: originColor(r.origem, i) }));
  const sel = (pick: (b: OriginBreakdown) => number, fmt: (v: number) => string) =>
    toChips(totals.sourceBreakdown.map((b) => ({ origem: b.origem, v: pick(b) })), fmt);
  const leadsChips = toChips(Array.from(leadsBreakdownMap, ([origem, v]) => ({ origem, v })), formatInt);

  const cpa = conversions > 0 ? totals.totalInvestment / conversions : 0;

  // ── Catálogo (ordem = ordem no picker) ──────────────────────────────────────
  const catalog: BentoMetric[] = useMemo(() => [
    { id: "investment",  label: "Investido",        value: formatBRL(totals.totalInvestment),   data: series.inv,  color: "#16A34A", icon: Wallet,            invertDelta: true,  breakdown: sel((b) => b.investment, formatBRL), sub: `CTR ${formatPercent(totals.ctr)}` },
    { id: "revenue",     label: "Receita",          value: formatBRL(totals.totalRevenue),      data: series.rev,  color: "#16A34A", icon: Coins,             breakdown: sel((b) => b.revenue, formatBRL) },
    { id: "results",     label: "Resultados",       value: formatInt(conversions),              data: series.conv, color: "#16A34A", icon: Target,            breakdown: sel((b) => b.conversions, formatInt) },
    { id: "roas",        label: "ROAS",             value: `${totals.roas.toFixed(2)}x`,        data: series.roas, color: "#e11d48", icon: Gauge,             sub: totals.totalRevenue > 0 ? `Receita ${formatBRL(totals.totalRevenue)}` : "sem receita" },
    { id: "cpa",         label: "Custo / Resultado",value: cpa > 0 ? formatBRL(cpa) : "—",       data: series.cpa,  color: "#f59e0b", icon: Coins,             invertDelta: true, sub: "CPA médio" },
    { id: "roi",         label: "ROI",              value: formatPercent(totals.roi),           data: series.roi,  color: "#16A34A", icon: TrendingUp },
    { id: "ctr",         label: "CTR Médio",        value: formatPercent(totals.ctr),           data: series.ctr,  color: "#94a3b8", icon: MousePointerClick },
    { id: "cpc",         label: "CPC Médio",        value: formatBRL(totals.cpc),               data: series.cpc,  color: "#f59e0b", icon: BadgeDollarSign,   invertDelta: true },
    { id: "cpm",         label: "CPM Médio",        value: formatBRL(totals.cpm),               data: series.cpm,  color: "#f59e0b", icon: Zap,               invertDelta: true },
    { id: "clicks",      label: "Cliques",          value: formatInt(totals.totalClicks),       data: series.clk,  color: "#16A34A", icon: MousePointerClick, sub: `CTR ${formatPercent(totals.ctr)}` },
    { id: "impressions", label: "Impressões",       value: formatInt(totals.totalImpressions),  data: series.imp,  color: "#94a3b8", icon: Activity },
    { id: "leads",       label: "Leads",            value: formatInt(totals.totalLeads),        color: "#22C55E", icon: Users,              sub: totals.totalLeads > 0 ? `CPL ${formatBRL(totals.cpl)}` : undefined, breakdown: leadsChips },
    { id: "cpl",         label: "CPL Médio",        value: totals.totalLeads > 0 ? formatBRL(totals.cpl) : "—", color: "#22C55E", icon: UserRound, invertDelta: true },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [totals, conversions, series, leadsChips]);

  const byId = useMemo(() => new Map(catalog.map((m) => [m.id, m])), [catalog]);
  const cards = selected.map((id) => byId.get(id)).filter((m): m is BentoMetric => !!m);

  const stages = [
    { label: "Impressões", value: totals.totalImpressions, color: "#16A34A" },
    { label: "Cliques",    value: totals.totalClicks,      color: "#94a3b8" },
    ...(totalLeads > 0 ? [{ label: "Leads", value: totalLeads, color: "#f59e0b", breakdown: leadsChips }] : []),
    { label: "Resultados", value: conversions,             color: "#05CD99" },
  ];

  return (
    <section className="space-y-3">
      {/* Cabeçalho do bento + ação de editar os 4 cards */}
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold tracking-tight sm:text-base" style={{ color: "var(--dm-text-primary)" }}>
          Indicadores principais
        </h2>
        <button type="button" onClick={() => setPicking(true)}
          className="flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-semibold transition hover:opacity-80"
          style={{ borderColor: "var(--dm-border-default)", background: "var(--dm-bg-surface)", color: "var(--dm-text-secondary)" }}>
          <Pencil size={12} /> Editar cards
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="sm:col-span-2 lg:col-span-1 lg:row-span-2">
          <FunnelTile stages={stages} />
        </div>
        {cards.map((m) => (
          <StatCard key={m.id} icon={m.icon} label={m.label} value={m.value} sub={m.sub}
            color={m.color} data={m.data} invertDelta={m.invertDelta} breakdown={m.breakdown} />
        ))}
      </div>

      {picking && <CardPicker catalog={catalog} selected={selected} onSave={saveCards} onClose={() => setPicking(false)} />}
    </section>
  );
}
