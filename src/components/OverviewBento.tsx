"use client";

import { useMemo, useState } from "react";
import { TrendingUp, TrendingDown, Wallet, Target, Coins, Gauge, Filter, Megaphone, Search, Settings2 } from "lucide-react";
import type { CampaignData, DashboardTotals } from "@/types/campaign";
import { formatBRL, formatInt, formatCompact, formatPercent } from "@/lib/format";

// ─── Sparkline (SVG inline, sem libs) ─────────────────────────────────────────

function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return <div className="h-7" />;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const w = 100, h = 28;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`);
  const area = `0,${h} ${pts.join(" ")} ${w},${h}`;
  const gid = useMemo(() => `spark-${Math.random().toString(36).slice(2)}`, []);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-7 w-full" aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${gid})`} />
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function pctChange(data: number[]): number | null {
  const nonZero = data.filter((v) => v !== 0);
  if (nonZero.length < 2) return null;
  const first = nonZero[0];
  const last = nonZero[nonZero.length - 1];
  if (first === 0) return null;
  return ((last - first) / Math.abs(first)) * 100;
}

function Delta({ value, invert }: { value: number | null; invert?: boolean }) {
  if (value == null || !isFinite(value)) return null;
  const good = invert ? value < 0 : value > 0;
  const flat = Math.abs(value) < 0.5;
  const color = flat ? "var(--dm-text-tertiary)" : good ? "#05CD99" : "#EE5D50";
  const Icon = value >= 0 ? TrendingUp : TrendingDown;
  return (
    <span className="flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums"
      style={{ color, backgroundColor: `${color}1a` }}>
      <Icon size={11} /> {value >= 0 ? "+" : ""}{value.toFixed(0)}%
    </span>
  );
}

// ─── Metric tile ──────────────────────────────────────────────────────────────

function MetricTile({ icon: Icon, label, value, sub, color, data, invertDelta }: {
  icon: typeof Wallet; label: string; value: string; sub?: string; color: string; data: number[]; invertDelta?: boolean;
}) {
  return (
    <div className="flex flex-col justify-between gap-2.5 rounded-2xl border p-4 transition-shadow hover:shadow-md"
      style={{ backgroundColor: "var(--dm-bg-surface)", borderColor: "var(--dm-border-default)" }}>
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>
          <span className="flex h-6 w-6 items-center justify-center rounded-lg" style={{ backgroundColor: `${color}1a` }}>
            <Icon size={13} style={{ color }} />
          </span>
          {label}
        </span>
        <Delta value={pctChange(data)} invert={invertDelta} />
      </div>
      <p className="text-[26px] font-bold leading-none tabular-nums" style={{ color: "var(--dm-text-primary)", fontFamily: "var(--font-poppins),Poppins,sans-serif" }}>
        {value}
      </p>
      <Sparkline data={data} color={color} />
      {sub && <span className="text-[10px] font-medium" style={{ color: "var(--dm-text-tertiary)" }}>{sub}</span>}
    </div>
  );
}

// ─── Funil compacto ───────────────────────────────────────────────────────────

function FunnelTile({ stages }: { stages: { label: string; value: number; color: string }[] }) {
  const max = Math.max(...stages.map((s) => s.value), 1);
  return (
    <div className="flex flex-col gap-3 rounded-2xl border p-5"
      style={{ backgroundColor: "var(--dm-bg-surface)", borderColor: "var(--dm-border-default)" }}>
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ backgroundColor: "rgba(99,102,200,0.12)" }}>
          <Filter size={14} style={{ color: "#6366C8" }} />
        </span>
        <span className="text-sm font-bold" style={{ color: "var(--dm-text-primary)", fontFamily: "var(--font-poppins),Poppins,sans-serif" }}>Funil de conversão</span>
      </div>
      <div className="flex flex-col gap-2.5">
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
                    <span className="rounded-full px-1.5 py-0.5 text-[9px] font-bold tabular-nums" style={{ color: "#6366C8", backgroundColor: "rgba(99,102,200,0.12)" }}>
                      {conv.toFixed(1)}%
                    </span>
                  )}
                  <span className="font-bold tabular-nums" style={{ color: "var(--dm-text-primary)" }}>{formatInt(s.value)}</span>
                </span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full" style={{ backgroundColor: "var(--dm-bg-elevated)" }}>
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${widthPct}%`, background: `linear-gradient(90deg, ${s.color}, ${s.color}cc)` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Tile de campanhas (ver + puxar) ──────────────────────────────────────────

function CampaignsTile({ campaigns, onManage }: { campaigns: CampaignData[]; onManage?: () => void }) {
  const [query, setQuery] = useState("");
  const list = useMemo(() => {
    const byName = new Map<string, { name: string; inv: number; res: number; imp: number }>();
    for (const c of campaigns) {
      const cur = byName.get(c.campaignName) ?? { name: c.campaignName, inv: 0, res: 0, imp: 0 };
      cur.inv += c.investment; cur.res += c.conversions; cur.imp += c.impressions;
      byName.set(c.campaignName, cur);
    }
    return [...byName.values()].sort((a, b) => b.inv - a.inv);
  }, [campaigns]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? list.filter((c) => c.name.toLowerCase().includes(q)) : list;
  }, [list, query]);
  const maxInv = Math.max(...list.map((c) => c.inv), 1);

  return (
    <div className="flex flex-col gap-3 rounded-2xl border p-5" style={{ backgroundColor: "var(--dm-bg-surface)", borderColor: "var(--dm-border-default)" }}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex items-center gap-2 text-sm font-bold" style={{ color: "var(--dm-text-primary)", fontFamily: "var(--font-poppins),Poppins,sans-serif" }}>
          <span className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ backgroundColor: "rgba(99,102,200,0.12)" }}>
            <Megaphone size={14} style={{ color: "#6366C8" }} />
          </span>
          Campanhas
          <span className="rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums" style={{ backgroundColor: "rgba(99,102,200,0.12)", color: "#6366C8" }}>{list.length}</span>
        </span>
        <div className="relative ml-auto min-w-[160px] flex-1 sm:max-w-xs">
          <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--dm-text-tertiary)" }} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar campanha…"
            aria-label="Buscar campanha"
            className="h-9 w-full rounded-xl border pl-8 pr-3 text-[12px] outline-none transition focus:ring-1"
            style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-elevated)", color: "var(--dm-text-primary)" }} />
        </div>
        {onManage && (
          <button type="button" onClick={onManage}
            className="flex h-9 items-center gap-1.5 rounded-xl px-3.5 text-[12px] font-bold text-white transition-all hover:opacity-90 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6366C8]"
            style={{ background: "linear-gradient(135deg,#6366C8 0%,#313491 100%)" }}>
            <Settings2 size={13} /> Puxar / gerenciar
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="py-3 text-center text-[12px]" style={{ color: "var(--dm-text-tertiary)" }}>
          {list.length === 0 ? "Nenhuma campanha configurada ainda." : "Nenhuma campanha encontrada."}
        </p>
      ) : (
        <div className="flex max-h-72 flex-col gap-1.5 overflow-y-auto pr-1">
          {filtered.map((c) => {
            const pct = (c.inv / maxInv) * 100;
            return (
              <div key={c.name} className="flex items-center gap-3 rounded-xl border px-3 py-2 transition-colors hover:border-[#6366C8]"
                style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-elevated)" }}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-semibold" style={{ color: "var(--dm-text-primary)" }}>{c.name}</p>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full" style={{ backgroundColor: "var(--dm-bg-surface)" }}>
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "linear-gradient(90deg,#6366C8,#6366C8aa)" }} />
                  </div>
                </div>
                <div className="flex-shrink-0 text-right">
                  <p className="text-[12px] font-bold tabular-nums" style={{ color: "var(--dm-text-primary)" }}>{formatBRL(c.inv)}</p>
                  <p className="text-[10px] tabular-nums" style={{ color: "var(--dm-text-tertiary)" }}>{formatInt(c.res)} result.</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Bento ────────────────────────────────────────────────────────────────────

export function OverviewBento({ totals, campaigns, conversions, onManage }: {
  totals: DashboardTotals;
  campaigns: CampaignData[];
  conversions: number;
  onManage?: () => void;
}) {
  const series = useMemo(() => {
    const byDate = new Map<string, { inv: number; rev: number; conv: number; clk: number }>();
    for (const c of campaigns) {
      const cur = byDate.get(c.date) ?? { inv: 0, rev: 0, conv: 0, clk: 0 };
      cur.inv += c.investment; cur.rev += c.revenue; cur.conv += c.conversions; cur.clk += c.clicks;
      byDate.set(c.date, cur);
    }
    const dates = [...byDate.keys()].sort();
    const g = (sel: (v: { inv: number; rev: number; conv: number; clk: number }) => number) => dates.map((d) => sel(byDate.get(d)!));
    return {
      investment: g((v) => v.inv),
      revenue: g((v) => v.rev),
      conversions: g((v) => v.conv),
      clicks: g((v) => v.clk),
    };
  }, [campaigns]);

  const cpa = conversions > 0 ? totals.totalInvestment / conversions : 0;
  const cpaSeries = series.investment.map((inv, i) => { const c = series.conversions[i]; return c > 0 ? inv / c : 0; });

  const stages = [
    { label: "Impressões", value: totals.totalImpressions, color: "#6366C8" },
    { label: "Cliques",    value: totals.totalClicks,      color: "#0ea5e9" },
    ...(totals.totalLeads > 0 ? [{ label: "Leads", value: totals.totalLeads, color: "#f59e0b" }] : []),
    { label: "Resultados", value: conversions,             color: "#05CD99" },
  ];

  return (
    <div className="flex flex-col gap-3 sm:gap-4">
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
      <div className="sm:col-span-2 lg:col-span-1 lg:row-span-2">
        <FunnelTile stages={stages} />
      </div>
      <MetricTile icon={Wallet} label="Investido" color="#6366C8" data={series.investment}
        value={formatBRL(totals.totalInvestment)} sub={`CTR ${formatPercent(totals.ctr)}`} invertDelta />
      <MetricTile icon={Target} label="Resultados" color="#05CD99" data={series.conversions}
        value={formatInt(conversions)} sub={totals.totalRevenue > 0 ? `Receita ${formatCompact(totals.totalRevenue)}` : undefined} />
      <MetricTile icon={Coins} label="Custo / Resultado" color="#f59e0b" data={cpaSeries}
        value={cpa > 0 ? formatBRL(cpa) : "—"} sub="CPA médio" invertDelta />
      <MetricTile icon={Gauge} label="ROAS" color="#e11d48" data={series.revenue}
        value={`${totals.roas.toFixed(2)}x`} sub={totals.totalRevenue > 0 ? `Receita ${formatBRL(totals.totalRevenue)}` : "sem receita"} />
    </div>
    <CampaignsTile campaigns={campaigns} onManage={onManage} />
    </div>
  );
}
