"use client";

import { useMemo } from "react";
import { TrendingUp, TrendingDown, Wallet, Target, Coins, Gauge, Filter } from "lucide-react";
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

// ─── Bento ────────────────────────────────────────────────────────────────────

export function OverviewBento({ totals, campaigns, conversions }: {
  totals: DashboardTotals;
  campaigns: CampaignData[];
  conversions: number;
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
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="lg:row-span-2">
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
  );
}
