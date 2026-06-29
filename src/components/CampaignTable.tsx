"use client";

import { useMemo, useState } from "react";
import { ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { CampaignData } from "@/types/campaign";
import {
  formatCurrency, formatDatePtBr, formatNumber, formatPercent,
} from "@/utils/metrics";
import {
  Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";
import { useTheme } from "next-themes";

interface CampaignTableProps {
  campaigns: CampaignData[];
  isMetricVisible?: (id: string) => boolean;
}

const ITEMS_PER_PAGE = 10;

// ─── Badge helpers ────────────────────────────────────────────────────────────

function RoasBadge({ value }: { value: number }) {
  const cls =
    value >= 3   ? "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400 ring-emerald-500/20"
    : value >= 1.5 ? "bg-slate-500/10 text-slate-600 dark:bg-slate-500/20 dark:text-slate-300 ring-slate-500/20"
    : value >= 1   ? "bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400 ring-amber-500/20"
    : "bg-red-500/10 text-red-600 dark:bg-red-500/20 dark:text-red-400 ring-red-500/20";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ${cls}`} style={{ fontFamily: "var(--font-display)" }}>
      {value.toFixed(2)}x
    </span>
  );
}

function CtrBadge({ value }: { value: number }) {
  const cls =
    value >= 3   ? "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400"
    : value >= 1.5 ? "bg-slate-500/10 text-slate-600 dark:bg-slate-500/20 dark:text-slate-300"
    : value >= 0.5 ? "bg-slate-500/10 text-slate-600 dark:bg-slate-500/20 dark:text-slate-400"
    : "bg-red-500/10 text-red-600 dark:bg-red-500/20 dark:text-red-400";
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-bold ${cls}`} style={{ fontFamily: "var(--font-display)" }}>
      {formatPercent(value)}
    </span>
  );
}

// ─── Short date helper ────────────────────────────────────────────────────────

function shortDate(v: string): string {
  // Datas "YYYY-MM-DD" devem ser lidas no fuso local. new Date("2026-06-03")
  // é meia-noite UTC → em UTC-3 cai no dia anterior. Ancorar ao meio-dia local.
  const s = String(v);
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + "T12:00:00") : new Date(s);
  if (isNaN(d.getTime())) return s;
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// ─── Single‑campaign daily view ───────────────────────────────────────────────

type DailySortBy = "date-asc" | "date-desc" | "invest-desc" | "invest-asc" | "roas-desc" | "ctr-desc" | "conversions-desc" | "clicks-desc";

const DAILY_SORT_LABELS: Record<DailySortBy, string> = {
  "date-asc":         "Data ↑",
  "date-desc":        "Data ↓",
  "invest-desc":      "Invest. ↓",
  "invest-asc":       "Invest. ↑",
  "roas-desc":        "ROAS ↓",
  "ctr-desc":         "CTR ↓",
  "conversions-desc": "Conversões ↓",
  "clicks-desc":      "Cliques ↓",
};

function applyDailySort(data: CampaignData[], sort: DailySortBy): CampaignData[] {
  return [...data].sort((a, b) => {
    switch (sort) {
      case "date-asc":         return a.date.localeCompare(b.date);
      case "date-desc":        return b.date.localeCompare(a.date);
      case "invest-desc":      return b.investment - a.investment;
      case "invest-asc":       return a.investment - b.investment;
      case "roas-desc":        return b.roas - a.roas;
      case "ctr-desc":         return b.ctr - a.ctr;
      case "conversions-desc": return b.conversions - a.conversions;
      case "clicks-desc":      return b.clicks - a.clicks;
    }
  });
}

function SingleCampaignView({ campaigns, isMetricVisible = () => true }: { campaigns: CampaignData[]; isMetricVisible?: (id: string) => boolean }) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<DailySortBy>("date-asc");

  const sorted = useMemo(
    () => applyDailySort(campaigns, sortBy),
    [campaigns, sortBy],
  );

  const totalPages = Math.max(1, Math.ceil(sorted.length / ITEMS_PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const visibleRows = sorted.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const campaignName = sorted[0]?.campaignName ?? "";
  const totalInvestment = sorted.reduce((s, r) => s + r.investment, 0);
  const totalClicks     = sorted.reduce((s, r) => s + r.clicks, 0);
  const totalConversions = sorted.reduce((s, r) => s + r.conversions, 0);
  const totalRevenue    = sorted.reduce((s, r) => s + r.revenue, 0);
  const avgRoas = totalInvestment > 0 ? totalRevenue / totalInvestment : 0;

  const tickFill = dark ? "#64748b" : "#94a3b8";
  const gridStroke = dark ? "#334155" : "#f1f5f9";
  const tooltipBg = dark ? "#1e293b" : "#ffffff";
  const tooltipBorder = dark ? "#334155" : "#e2e8f0";

  // Color each bar by relative spend: top 25% → green, bottom 25% → red, rest → neutro (Calmo: azul sai)
  const investments = sorted.map((r) => r.investment);
  const maxInv = Math.max(...investments, 1);
  const minInv = Math.min(...investments.filter(v => v > 0), maxInv);
  const range = maxInv - minInv || 1;
  const barColor = (v: number) => {
    const pct = (v - minInv) / range;
    if (pct >= 0.75) return "#059669";
    if (pct <= 0.25) return "#ef4444";
    return "#94a3b8";
  };

  return (
    <article className="glass-panel w-full min-w-0 overflow-hidden rounded-3xl shadow-lg">
      {/* Header */}
      <div className="border-b border-slate-200/50 px-6 py-5 dark:border-slate-700/50">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">Evolução Diária</p>
            <h3 className="mt-0.5 text-sm font-bold text-slate-900 dark:text-slate-100 truncate max-w-lg" title={campaignName}>
              {campaignName}
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <ArrowUpDown size={12} className="text-slate-400" />
            <select
              value={sortBy}
              onChange={(e) => { setSortBy(e.target.value as DailySortBy); setPage(1); }}
              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
            >
              {(Object.keys(DAILY_SORT_LABELS) as DailySortBy[]).map((k) => (
                <option key={k} value={k}>{DAILY_SORT_LABELS[k]}</option>
              ))}
            </select>
            <span className="text-[11px] text-slate-400 dark:text-slate-500">{sorted.length} dias</span>
          </div>
        </div>

        {/* Summary KPIs */}
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { label: "Total Investido", value: formatCurrency(totalInvestment), color: "text-slate-900 dark:text-slate-100" },
            { label: "Receita",         value: formatCurrency(totalRevenue),    color: "text-emerald-700 dark:text-emerald-400" },
            { label: "Cliques",         value: formatNumber(totalClicks),       color: "text-slate-700 dark:text-slate-300" },
            { label: "ROAS Médio",      value: `${avgRoas.toFixed(2)}x`,        color: avgRoas >= 1 ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400" },
          ].map((kpi) => (
            <div key={kpi.label} className="rounded-lg border border-slate-100 px-3 py-2 dark:border-slate-700">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">{kpi.label}</p>
              <p className={`mt-0.5 text-sm font-bold ${kpi.color}`}>{kpi.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Daily investment chart */}
      <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-700">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
          Gasto por dia
        </p>
        <div style={{ height: 120 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={sorted} barCategoryGap="15%" margin={{ top: 2, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: tickFill }}
                tickLine={false}
                axisLine={false}
                tickFormatter={shortDate}
                interval={Math.ceil(sorted.length / 7) - 1}
                height={20}
              />
              <YAxis
                tick={{ fontSize: 10, fill: tickFill }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `R$${(Number(v) / 1000).toFixed(0)}k`}
                width={48}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: 10, border: `1px solid ${tooltipBorder}`,
                  background: tooltipBg, fontSize: 11,
                }}
                labelFormatter={(v) => formatDatePtBr(String(v))}
                formatter={(v) => [formatCurrency(Number(v)), "Investimento"]}
                cursor={{ fill: dark ? "#334155" : "#f8fafc" }}
              />
              <Bar dataKey="investment" radius={[3, 3, 0, 0]}>
                {sorted.map((entry, i) => (
                  <Cell key={`cell-${i}`} fill={barColor(entry.investment)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        {/* Color legend */}
        <div className="mt-1 flex gap-4 text-[10px] text-slate-400 dark:text-slate-500">
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />Maior gasto</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-slate-400" />Médio</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-red-400" />Menor gasto</span>
        </div>
      </div>

      {/* Daily data table */}
      <div className="w-full overflow-x-auto">
        <table className="w-full min-w-[760px] table-fixed text-sm">
          <colgroup>
            <col className="w-[14%]" />
            {isMetricVisible("investment")  && <col className="w-[14%]" />}
            {isMetricVisible("revenue")     && <col className="w-[14%]" />}
            {isMetricVisible("clicks")      && <col className="w-[11%]" />}
            {isMetricVisible("conversions") && <col className="w-[13%]" />}
            {isMetricVisible("ctr")         && <col className="w-[11%]" />}
            {isMetricVisible("cpc")         && <col className="w-[11%]" />}
            {isMetricVisible("roas")        && <col className="w-[12%]" />}
          </colgroup>
          <thead>
            <tr className="bg-slate-100/50 text-left dark:bg-slate-800/50">
              <th className="border-b border-slate-200/50 px-3 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-700/50 dark:text-slate-400">Data</th>
              {isMetricVisible("investment")  && <th className="border-b border-slate-200/50 px-3 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-700/50 dark:text-slate-400 text-right">Investimento</th>}
              {isMetricVisible("revenue")     && <th className="border-b border-slate-200/50 px-3 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-700/50 dark:text-slate-400 text-right">Receita</th>}
              {isMetricVisible("clicks")      && <th className="border-b border-slate-200/50 px-3 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-700/50 dark:text-slate-400 text-right">Cliques</th>}
              {isMetricVisible("conversions") && <th className="border-b border-slate-200/50 px-3 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-700/50 dark:text-slate-400 text-right">Conversões</th>}
              {isMetricVisible("ctr")         && <th className="border-b border-slate-200/50 px-3 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-700/50 dark:text-slate-400 text-center">CTR</th>}
              {isMetricVisible("cpc")         && <th className="border-b border-slate-200/50 px-3 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-700/50 dark:text-slate-400 text-right">CPC</th>}
              {isMetricVisible("roas")        && <th className="border-b border-slate-200/50 px-3 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-700/50 dark:text-slate-400 text-center">ROAS</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100/50 dark:divide-slate-700/50">
            {visibleRows.map((row) => (
              <tr key={row.id} className="transition-all hover:bg-white/50 dark:hover:bg-slate-800/50">
                <td className="whitespace-nowrap px-3 py-3 text-[13px] font-semibold text-slate-700 dark:text-slate-300">
                  {formatDatePtBr(row.date)}
                </td>
                {isMetricVisible("investment")  && <td className="whitespace-nowrap px-3 py-3 text-right text-[13px] font-bold tabular-nums text-slate-800 dark:text-slate-200" style={{ fontFamily: "var(--font-display)" }}>{formatCurrency(row.investment)}</td>}
                {isMetricVisible("revenue")     && <td className="whitespace-nowrap px-3 py-3 text-right text-[13px] font-bold tabular-nums text-emerald-600 dark:text-emerald-400" style={{ fontFamily: "var(--font-display)" }}>{formatCurrency(row.revenue)}</td>}
                {isMetricVisible("clicks")      && <td className="whitespace-nowrap px-3 py-3 text-right text-[13px] tabular-nums text-slate-600 dark:text-slate-400" style={{ fontFamily: "var(--font-display)" }}>{formatNumber(row.clicks)}</td>}
                {isMetricVisible("conversions") && <td className="whitespace-nowrap px-3 py-3 text-right text-[13px] font-semibold tabular-nums text-slate-700 dark:text-slate-300" style={{ fontFamily: "var(--font-display)" }}>{formatNumber(row.conversions)}</td>}
                {isMetricVisible("ctr")         && <td className="whitespace-nowrap px-3 py-3 text-center"><CtrBadge value={row.ctr} /></td>}
                {isMetricVisible("cpc")         && <td className="whitespace-nowrap px-3 py-3 text-right text-[13px] tabular-nums text-slate-600 dark:text-slate-400" style={{ fontFamily: "var(--font-display)" }}>{formatCurrency(row.cpc)}</td>}
                {isMetricVisible("roas")        && <td className="whitespace-nowrap px-3 py-3 text-center"><RoasBadge value={row.roas} /></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="flex flex-col items-start justify-between gap-2 border-t border-slate-200/50 bg-slate-100/30 px-6 py-4 sm:flex-row sm:items-center dark:border-slate-700/50 dark:bg-slate-800/30">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
          Total — {sorted.length} dias
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-slate-400">Investimento</span>
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200">{formatCurrency(totalInvestment)}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-slate-400">Conversões</span>
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{formatNumber(totalConversions)}</span>
          </div>
          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center gap-1 ml-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1}
                className="flex h-6 w-6 items-center justify-center rounded border border-slate-200 text-slate-500 transition hover:bg-slate-50 disabled:opacity-30 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-700">
                <ChevronLeft size={12} />
              </button>
              <span className="text-[11px] font-semibold text-slate-500">{currentPage}/{totalPages}</span>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
                className="flex h-6 w-6 items-center justify-center rounded border border-slate-200 text-slate-500 transition hover:bg-slate-50 disabled:opacity-30 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-700">
                <ChevronRight size={12} />
              </button>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

// ─── Multi‑campaign aggregate view ───────────────────────────────────────────

function MultiCampaignView({ campaigns, isMetricVisible = () => true }: { campaigns: CampaignData[]; isMetricVisible?: (id: string) => boolean }) {
  const [page, setPage] = useState(1);
  const totalPages   = Math.max(1, Math.ceil(campaigns.length / ITEMS_PER_PAGE));
  const currentPage  = Math.min(page, totalPages);

  const visibleRows = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return campaigns.slice(start, start + ITEMS_PER_PAGE);
  }, [campaigns, currentPage]);

  const firstIdx = (currentPage - 1) * ITEMS_PER_PAGE + 1;
  const lastIdx  = Math.min(currentPage * ITEMS_PER_PAGE, campaigns.length);

  return (
    <article className="glass-panel w-full min-w-0 overflow-hidden rounded-3xl shadow-lg">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/50 px-5 py-4 sm:px-6 sm:py-5 dark:border-slate-700/50">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Performance por Campanha</h3>
          <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
            {firstIdx}–{lastIdx} de {campaigns.length} registros
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 disabled:opacity-30 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-700">
            <ChevronLeft size={14} />
          </button>
          <span className="min-w-[52px] text-center text-xs font-semibold text-slate-600 dark:text-slate-400">
            {currentPage} / {totalPages}
          </span>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 disabled:opacity-30 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-700">
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="w-full overflow-x-auto">
        <table className="w-full min-w-[900px] table-fixed text-sm">
          <thead>
            <tr className="bg-slate-100/50 text-left dark:bg-slate-800/50">
              <th className="border-b border-slate-200/50 px-5 py-3.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-700/50 dark:text-slate-400 w-24">Data</th>
              <th className="border-b border-slate-200/50 px-5 py-3.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-700/50 dark:text-slate-400 min-w-[180px]">Campanha</th>
              {isMetricVisible("investment")  && <th className="border-b border-slate-200/50 px-5 py-3.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-700/50 dark:text-slate-400 text-right">Investimento</th>}
              {isMetricVisible("revenue")     && <th className="border-b border-slate-200/50 px-5 py-3.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-700/50 dark:text-slate-400 text-right">Receita</th>}
              {isMetricVisible("clicks")      && <th className="border-b border-slate-200/50 px-5 py-3.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-700/50 dark:text-slate-400 text-right">Cliques</th>}
              {isMetricVisible("conversions") && <th className="border-b border-slate-200/50 px-5 py-3.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-700/50 dark:text-slate-400 text-right">Conversões</th>}
              {isMetricVisible("ctr")         && <th className="border-b border-slate-200/50 px-5 py-3.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-700/50 dark:text-slate-400 text-center">CTR</th>}
              {isMetricVisible("cpc")         && <th className="border-b border-slate-200/50 px-5 py-3.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-700/50 dark:text-slate-400 text-right">CPC</th>}
              {isMetricVisible("cpa")         && <th className="border-b border-slate-200/50 px-5 py-3.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-700/50 dark:text-slate-400 text-right">CPA</th>}
              {isMetricVisible("roas")        && <th className="border-b border-slate-200/50 px-5 py-3.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-700/50 dark:text-slate-400 text-center">ROAS</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100/50 dark:divide-slate-700/50">
            {visibleRows.map((row) => (
              <tr key={row.id} className="transition-all hover:bg-white/50 dark:hover:bg-slate-800/50">
                <td className="whitespace-nowrap px-5 py-3.5 text-[13px] text-slate-500 dark:text-slate-400">{formatDatePtBr(row.date)}</td>
                <td className="px-5 py-3.5">
                  <span className="block max-w-[200px] truncate text-[13px] font-semibold text-slate-800 dark:text-slate-200" title={row.campaignName}>
                    {row.campaignName}
                  </span>
                </td>
                {isMetricVisible("investment")  && <td className="whitespace-nowrap px-5 py-3.5 text-right text-[13px] font-bold text-slate-700 dark:text-slate-300" style={{ fontFamily: "var(--font-display)" }}>{formatCurrency(row.investment)}</td>}
                {isMetricVisible("revenue")     && <td className="whitespace-nowrap px-5 py-3.5 text-right text-[13px] font-bold text-emerald-600 dark:text-emerald-400" style={{ fontFamily: "var(--font-display)" }}>{formatCurrency(row.revenue)}</td>}
                {isMetricVisible("clicks")      && <td className="whitespace-nowrap px-5 py-3.5 text-right text-[13px] text-slate-600 dark:text-slate-400" style={{ fontFamily: "var(--font-display)" }}>{formatNumber(row.clicks)}</td>}
                {isMetricVisible("conversions") && <td className="whitespace-nowrap px-5 py-3.5 text-right text-[13px] font-semibold text-slate-700 dark:text-slate-300" style={{ fontFamily: "var(--font-display)" }}>{formatNumber(row.conversions)}</td>}
                {isMetricVisible("ctr")         && <td className="whitespace-nowrap px-5 py-3.5 text-center"><CtrBadge value={row.ctr} /></td>}
                {isMetricVisible("cpc")         && <td className="whitespace-nowrap px-5 py-3.5 text-right text-[13px] text-slate-600 dark:text-slate-400" style={{ fontFamily: "var(--font-display)" }}>{formatCurrency(row.cpc)}</td>}
                {isMetricVisible("cpa")         && <td className="whitespace-nowrap px-5 py-3.5 text-right text-[13px] text-slate-600 dark:text-slate-400" style={{ fontFamily: "var(--font-display)" }}>{formatCurrency(row.cpa)}</td>}
                {isMetricVisible("roas")        && <td className="whitespace-nowrap px-5 py-3.5 text-center"><RoasBadge value={row.roas} /></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer total row */}
      {campaigns.length > 0 && (
        <div className="flex flex-col items-start justify-between gap-2 border-t border-slate-200/50 bg-slate-100/30 px-5 py-4 sm:flex-row sm:items-center sm:px-6 dark:border-slate-700/50 dark:bg-slate-800/30">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Total período ({campaigns.length} registros)
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs sm:gap-6">
            <span className="text-slate-500 dark:text-slate-400">
              Invest.: <span className="font-bold text-slate-800 dark:text-slate-200">{formatCurrency(campaigns.reduce((s, r) => s + r.investment, 0))}</span>
            </span>
            <span className="text-slate-500 dark:text-slate-400">
              Receita: <span className="font-bold text-emerald-700 dark:text-emerald-400">{formatCurrency(campaigns.reduce((s, r) => s + r.revenue, 0))}</span>
            </span>
            <span className="text-slate-500 dark:text-slate-400">
              Conversões: <span className="font-bold text-slate-700 dark:text-slate-300">{formatNumber(campaigns.reduce((s, r) => s + r.conversions, 0))}</span>
            </span>
          </div>
        </div>
      )}
    </article>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function CampaignTable({ campaigns, isMetricVisible }: CampaignTableProps) {
  const uniqueNames = useMemo(
    () => new Set(campaigns.map((c) => c.campaignName)),
    [campaigns],
  );

  if (uniqueNames.size === 1) {
    return <SingleCampaignView campaigns={campaigns} isMetricVisible={isMetricVisible} />;
  }

  return <MultiCampaignView campaigns={campaigns} isMetricVisible={isMetricVisible} />;
}
