"use client";

import { useMemo, useState } from "react";
import { useTheme } from "next-themes";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell,
  Line, LineChart, ComposedChart,
  Pie, PieChart, ResponsiveContainer, Tooltip,
  XAxis, YAxis,
} from "recharts";
import { Activity, PieChart as PieIcon, BarChart2, type LucideIcon } from "lucide-react";
import {
  BudgetDistributionPoint, CampaignComparisonPoint, DailyTrendPoint,
} from "@/types/campaign";
import { formatCurrency, formatDatePtBr, formatNumber } from "@/utils/metrics";

interface ChartsSectionProps {
  dailyTrend: DailyTrendPoint[];
  campaignComparison: CampaignComparisonPoint[];
  budgetDistribution: BudgetDistributionPoint[];
}

// ── Data viz palette — minimalista, poucas cores
// Regra: azul/roxo = dado principal; cinza = comparativo; verde/vermelho = semântico
const PIE_COLORS_LIGHT = [
  "#313491", "#4A4FCC", "#6E72FF", "#A5A8FF",
  "#1FA971", "#F4A93C", "#E14D4D", "#8A8FAD",
  "#D6D8FF", "#6F7482", "#0891b2", "#A0A5B3",
];
const PIE_COLORS_DARK = [
  "#6C70FF", "#8A8FCC", "#A5A8FF", "#C4C6FF",
  "#22C55E", "#EAB308", "#EF4444", "#8A8FAD",
  "#D6D8FF", "#6F7686", "#22D3EE", "#A0A5B3",
];
const MAX_PIE_ITEMS = 10;

// ─── Shared chart theme ────────────────────────────────────────────────────────

function useChartTheme() {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  return {
    dark,
    pieColors:   dark ? PIE_COLORS_DARK : PIE_COLORS_LIGHT,
    /* Primary series: nova paleta minimalista */
    c1: dark ? "#6C70FF" : "#313491",   /* chart-primary */
    c2: dark ? "#8A8FAD" : "#A0A5B3",   /* chart-secondary (cinza — dado comparativo) */
    c3: dark ? "#22C55E" : "#1FA971",   /* chart-success */
    c4: dark ? "#EAB308" : "#F4A93C",   /* warning/investment */
    gridStroke:  dark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.05)",
    tickFill:    dark ? "#6F7686" : "#9CA3AF",
    tooltipStyle: {
      contentStyle: {
        borderRadius: 14,
        border: `1px solid ${dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"}`,
        background: dark ? "rgba(13,16,26,0.92)" : "rgba(255,255,255,0.96)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        boxShadow: "0 4px 24px rgba(0,0,0,0.14)",
        fontSize: 12,
        padding: "8px 12px",
        color: dark ? "#F3F4F6" : "#151821",
      },
      cursor: { fill: dark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)" },
    },
  };
}

// Short "DD/MM" date label — no rotation needed
function shortDate(v: string): string {
  const d = new Date(String(v));
  if (isNaN(d.getTime())) return String(v);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Smart interval: target ≤ 8 visible ticks
function xInterval(length: number): number {
  if (length <= 8)  return 0;
  if (length <= 16) return 1;
  if (length <= 32) return Math.ceil(length / 7) - 1;
  if (length <= 90) return Math.ceil(length / 6) - 1;
  return Math.ceil(length / 5) - 1;
}

// "YYYY-MM" → "Mês/Ano" in pt-BR
function monthLabel(key: string): string {
  const [year, month] = key.split("-");
  const monthNames = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  const m = parseInt(month, 10) - 1;
  return `${monthNames[m] ?? month}/${(year ?? "").slice(2)}`;
}

// ─── Toggle group ─────────────────────────────────────────────────────────────

function ToggleGroup<T extends string>({
  options, value, onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div
      className="flex gap-0.5 p-0.5"
      style={{ borderRadius: "var(--dm-shape-md)", background: "var(--dm-bg-elevated)" }}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className="px-3 py-1 text-xs font-semibold transition"
          style={{
            borderRadius: "var(--dm-shape-sm)",
            background: value === o.value ? "var(--dm-bg-surface)" : "transparent",
            color:       value === o.value ? "var(--dm-primary)"   : "var(--dm-text-tertiary)",
            boxShadow:   value === o.value ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ─── Card wrapper ─────────────────────────────────────────────────────────────

function ChartCard({
  title, subtitle, children, action, icon: Icon, iconColor = "#6366C8",
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  icon?: LucideIcon;
  iconColor?: string;
}) {
  return (
    <article
      className="dm-chart-card flex flex-col p-4 sm:p-5 shadow-horizon"
      style={{ borderRadius: "var(--dm-shape-xl)" }}
    >
      <div className="mb-4 flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-start">
        <div className="flex items-center gap-2">
          {Icon && (
            <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: `${iconColor}1a` }}>
              <Icon size={14} style={{ color: iconColor }} />
            </span>
          )}
          <div>
            <h3 className="text-sm font-bold" style={{ color: "var(--dm-text-primary)" }}>{title}</h3>
            {subtitle && (
              <p className="mt-0.5 text-xs" style={{ color: "var(--dm-text-tertiary)" }}>{subtitle}</p>
            )}
          </div>
        </div>
        {action}
      </div>
      {children}
    </article>
  );
}

// ─── Custom dot‑legend ────────────────────────────────────────────────────────

function DotLegend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <div className="mt-4 flex flex-wrap gap-3 sm:gap-4">
      {items.map((i) => (
        <div key={i.label} className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: i.color }} />
          <span className="text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>{i.label}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ChartsSection({
  dailyTrend, campaignComparison, budgetDistribution,
}: ChartsSectionProps) {
  const [trendMode, setTrendMode]           = useState<"area" | "bar" | "invest">("area");
  const [comparisonMode, setComparisonMode] = useState<"grouped" | "horizontal">("grouped");
  const [budgetMode, setBudgetMode]         = useState<"donut" | "mensal" | "bar">("donut");
  const { dark, pieColors, c1, c2, c3, c4, gridStroke, tickFill, tooltipStyle } = useChartTheme();

  const GRID_PROPS = { strokeDasharray: "3 3", stroke: gridStroke, vertical: false as const };
  const AXIS_STYLE = { stroke: "none", tick: { fontSize: 11, fill: tickFill }, tickLine: false as const, axisLine: false as const };
  void dark; // used via pieColors/c1-c4

  // ── Pie / budget data ─────────────────────────────────────────────────────
  const pieData = useMemo(() => {
    if (budgetDistribution.length <= MAX_PIE_ITEMS) return budgetDistribution;
    const sorted   = [...budgetDistribution].sort((a, b) => b.investment - a.investment);
    const topItems = sorted.slice(0, MAX_PIE_ITEMS);
    const rest     = sorted.slice(MAX_PIE_ITEMS).reduce((s, i) => s + i.investment, 0);
    return [...topItems, { campaignName: "Outros", investment: rest }];
  }, [budgetDistribution]);

  // ── Monthly investment aggregated from dailyTrend ─────────────────────────
  const monthlyData = useMemo(() => {
    const map = new Map<string, number>();
    dailyTrend.forEach((d) => {
      const key = d.date.slice(0, 7); // "YYYY-MM"
      map.set(key, (map.get(key) ?? 0) + (d.investment ?? 0));
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, investment], i, arr) => {
        const prev = i > 0 ? arr[i - 1][1] : null;
        const delta = prev !== null && prev > 0 ? ((investment - prev) / prev) * 100 : null;
        return { key, label: monthLabel(key), investment, delta };
      });
  }, [dailyTrend]);

  const interval = xInterval(dailyTrend.length);

  // ── Trend chart ──────────────────────────────────────────────────────────────

  const trendChart = trendMode === "invest" ? (
    // Investment per day view
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={dailyTrend} margin={{ top: 4, right: 52, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="gradInvest" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={c4} stopOpacity={0.3} />
            <stop offset="100%" stopColor={c4} stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <CartesianGrid {...GRID_PROPS} />
        <XAxis dataKey="date" {...AXIS_STYLE} tickFormatter={shortDate} interval={interval} angle={0} textAnchor="middle" height={24} />
        <YAxis yAxisId="inv" {...AXIS_STYLE} tickFormatter={(v) => `R$${(Number(v) / 1000).toFixed(0)}k`} width={52} />
        <YAxis yAxisId="clicks" orientation="right" {...AXIS_STYLE} tickFormatter={(v) => formatNumber(Number(v))} width={44} />
        <Tooltip
          {...tooltipStyle}
          labelFormatter={(v) => formatDatePtBr(String(v))}
          formatter={(v, name) => name === "Investimento" ? [formatCurrency(Number(v)), name] : [formatNumber(Number(v)), name]}
        />
        <Area yAxisId="inv" type="monotone" dataKey="investment" name="Investimento" stroke={c4} strokeWidth={3} fill="url(#gradInvest)" />
        <Line yAxisId="clicks" type="monotone" dataKey="clicks" name="Cliques" stroke={c2} strokeWidth={2} dot={false} strokeDasharray="4 4" />
      </ComposedChart>
    </ResponsiveContainer>
  ) : trendMode === "area" ? (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={dailyTrend} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="gradClicks" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={c2} stopOpacity={0.3} />
            <stop offset="100%" stopColor={c2} stopOpacity={0.05} />
          </linearGradient>
          <linearGradient id="gradConv" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={c3} stopOpacity={0.3} />
            <stop offset="100%" stopColor={c3} stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <CartesianGrid {...GRID_PROPS} />
        <XAxis dataKey="date" {...AXIS_STYLE} tickFormatter={shortDate} interval={interval} angle={0} textAnchor="middle" height={24} />
        <YAxis {...AXIS_STYLE} tickFormatter={(v) => formatNumber(Number(v))} width={48} />
        <Tooltip {...tooltipStyle} labelFormatter={(v) => formatDatePtBr(String(v))} formatter={(v, name) => [formatNumber(Number(v)), name]} />
        <Area type="monotone" dataKey="clicks"      name="Cliques"    stroke={c2} strokeWidth={3} fill="url(#gradClicks)" />
        <Area type="monotone" dataKey="conversions" name="Conversões" stroke={c3} strokeWidth={3} fill="url(#gradConv)" />
      </AreaChart>
    </ResponsiveContainer>
  ) : (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={dailyTrend} barCategoryGap="20%" margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <CartesianGrid {...GRID_PROPS} />
        <XAxis dataKey="date" {...AXIS_STYLE} tickFormatter={shortDate} interval={interval} angle={0} textAnchor="middle" height={24} />
        <YAxis {...AXIS_STYLE} tickFormatter={(v) => formatNumber(Number(v))} width={48} />
        <Tooltip {...tooltipStyle} labelFormatter={(v) => formatDatePtBr(String(v))} formatter={(v, name) => [formatNumber(Number(v)), name]} />
        <Bar dataKey="clicks"      name="Cliques"    fill={c2} radius={[3, 3, 0, 0]} />
        <Bar dataKey="conversions" name="Conversões" fill={c3} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );

  // ── Budget chart ──────────────────────────────────────────────────────────────

  // Monthly view: bar chart with investment per month + delta indicator
  const monthlySummaryChart = (
    <div>
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={monthlyData} barCategoryGap="20%" margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid {...GRID_PROPS} />
            <XAxis
              dataKey="label"
              {...AXIS_STYLE}
              angle={0}
              textAnchor="middle"
              height={24}
            />
            <YAxis
              {...AXIS_STYLE}
              tickFormatter={(v) => `R$${(Number(v) / 1000).toFixed(0)}k`}
              width={52}
            />
            <Tooltip
              {...tooltipStyle}
              formatter={(v) => [formatCurrency(Number(v)), "Investimento"]}
            />
            <Bar dataKey="investment" name="Investimento" radius={[4, 4, 0, 0]}>
              {monthlyData.map((entry, i) => (
                <Cell
                  key={`cell-${i}`}
                  fill={pieColors[i % pieColors.length]}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {/* Month-by-month delta badges */}
      <div className="mt-3 flex flex-wrap gap-2">
        {monthlyData.map((m) => (
          <div key={m.key} className="flex flex-col items-center rounded-lg border px-3 py-1.5 text-center"
            style={{ borderColor: "var(--dm-border-subtle)", backgroundColor: "var(--dm-bg-elevated)" }}>
            <span className="text-[10px] font-semibold" style={{ color: "var(--dm-text-tertiary)" }}>{m.label}</span>
            <span className="text-xs font-bold" style={{ color: "var(--dm-text-primary)" }}>{formatCurrency(m.investment)}</span>
            {m.delta !== null && (
              <span className="text-[10px] font-bold" style={{ color: m.delta >= 0 ? "var(--dm-success-base)" : "var(--dm-error-base)" }}>
                {m.delta >= 0 ? "▲" : "▼"} {Math.abs(m.delta).toFixed(1)}%
              </span>
            )}
          </div>
        ))}
        {monthlyData.length === 0 && (
          <p className="text-xs" style={{ color: "var(--dm-text-tertiary)" }}>Sem dados no período.</p>
        )}
      </div>
    </div>
  );

  const budgetChart = budgetMode === "donut" ? (
    <div className="flex flex-col items-center">
      <div className="h-48 w-full sm:h-52">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={pieData}
              dataKey="investment"
              nameKey="campaignName"
              innerRadius="55%"
              outerRadius="80%"
              paddingAngle={2}
              startAngle={90}
              endAngle={-270}
            >
              {pieData.map((entry, i) => (
                <Cell key={`cell-${i}`} fill={pieColors[i % pieColors.length]} stroke="none" />
              ))}
            </Pie>
            <Tooltip
              {...tooltipStyle}
              formatter={(v) => [formatCurrency(Number(v)), "Investimento"]}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-1 max-h-[140px] w-full space-y-1.5 overflow-y-auto">
        {pieData.map((item, i) => (
          <div key={`leg-${i}`} className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: pieColors[i % pieColors.length] }} />
              <span className="truncate text-xs" style={{ color: "var(--dm-text-secondary)" }}>{item.campaignName}</span>
            </div>
            <span className="flex-shrink-0 text-xs font-semibold" style={{ color: "var(--dm-text-primary)" }}>{formatCurrency(item.investment)}</span>
          </div>
        ))}
      </div>
    </div>
  ) : budgetMode === "mensal" ? monthlySummaryChart : (
    // Horizontal bar chart with % of total
    <div className="h-56 sm:h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={pieData} layout="vertical" margin={{ left: 0, right: 56, top: 4, bottom: 0 }}>
          <CartesianGrid {...GRID_PROPS} horizontal={false} />
          <XAxis type="number" {...AXIS_STYLE} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
          <YAxis
            type="category"
            dataKey="campaignName"
            {...AXIS_STYLE}
            width={110}
            tick={{ fontSize: 10, fill: tickFill }}
            tickFormatter={(v: string) => v.length > 15 ? `${v.slice(0, 15)}…` : v}
          />
          <Tooltip {...tooltipStyle} formatter={(v) => [formatCurrency(Number(v)), "Investimento"]} />
          <Bar dataKey="investment" name="Investimento" radius={[0, 4, 4, 0]}>
            {pieData.map((_, i) => (
              <Cell key={`bar-${i}`} fill={pieColors[i % pieColors.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );

  // ── Comparison chart ─────────────────────────────────────────────────────────

  const comparisonDataWithRoas = useMemo(() =>
    campaignComparison.map((c) => ({
      ...c,
      roas: c.investment > 0 ? c.revenue / c.investment : 0,
    })),
  [campaignComparison]);

  const n = comparisonDataWithRoas.length;
  // For grouped: each campaign needs space. Few campaigns → wider bars.
  const groupedMinWidth = Math.max(n * 90, 500);
  const groupedBarSize  = n <= 2 ? 72 : n <= 4 ? 52 : n <= 8 ? 36 : 28;
  // For horizontal: 40px per row, min 200px
  const horizontalHeight = Math.max(n * 42 + 24, 200);
  const horizontalBarSize = n <= 4 ? 20 : n <= 8 ? 16 : 12;

  const comparisonTooltip = {
    ...tooltipStyle,
    formatter: (v: unknown, name: string) => [formatCurrency(Number(v)), name],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    content: (({ active, payload, label }: { active?: boolean; payload?: any[]; label?: string }) => {
      if (!active || !payload?.length) return null;
      const roas = comparisonDataWithRoas.find((c) => c.campaignName === label)?.roas ?? 0;
      return (
        <div style={{ ...tooltipStyle.contentStyle, padding: "10px 14px", minWidth: 190 }}>
          <p style={{ fontWeight: 700, marginBottom: 6, fontSize: 11, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</p>
          {payload.map((p: { name?: string; value?: number; fill?: string }) => (
            <div key={p.name} style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 2 }}>
              <span style={{ color: p.fill, fontWeight: 600, fontSize: 11 }}>{p.name}</span>
              <span style={{ fontWeight: 700, fontSize: 11 }}>{formatCurrency(p.value ?? 0)}</span>
            </div>
          ))}
          <div style={{ borderTop: "1px solid rgba(0,0,0,0.08)", marginTop: 6, paddingTop: 6, display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 11, opacity: 0.6 }}>ROAS</span>
            <span style={{ fontWeight: 700, fontSize: 11, color: roas >= 1 ? "#059669" : "#dc2626" }}>{roas.toFixed(2)}x</span>
          </div>
        </div>
      );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any,
  };

  const comparisonChart = comparisonMode === "grouped" ? (
    <div className="w-full overflow-x-auto">
      <div style={{ minWidth: groupedMinWidth, height: 300 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={comparisonDataWithRoas}
            barCategoryGap={n <= 3 ? "15%" : "25%"}
            margin={{ top: 4, right: 8, bottom: 8, left: 0 }}
          >
            <CartesianGrid {...GRID_PROPS} />
            <XAxis
              dataKey="campaignName"
              {...AXIS_STYLE}
              interval={0}
              angle={0}
              textAnchor="middle"
              height={36}
              tick={{ fontSize: 10, fill: tickFill }}
              tickFormatter={(v: string) => v.length > 20 ? `${v.slice(0, 20)}…` : v}
            />
            <YAxis {...AXIS_STYLE} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} width={52} />
            <Tooltip content={comparisonTooltip.content} cursor={tooltipStyle.cursor} />
            <Bar dataKey="investment" name="Investimento" fill={c1} radius={[4, 4, 0, 0]} maxBarSize={groupedBarSize} />
            <Bar dataKey="revenue"    name="Receita"      fill={c3} radius={[4, 4, 0, 0]} maxBarSize={groupedBarSize} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  ) : (
    <div style={{ height: horizontalHeight, overflowY: "auto" }}>
      <ResponsiveContainer width="100%" height={Math.max(horizontalHeight, 200)}>
        <BarChart data={comparisonDataWithRoas} layout="vertical" margin={{ left: 4, right: 60, top: 4, bottom: 0 }}>
          <CartesianGrid {...GRID_PROPS} horizontal={false} />
          <XAxis type="number" {...AXIS_STYLE} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
          <YAxis
            type="category"
            dataKey="campaignName"
            {...AXIS_STYLE}
            width={170}
            tick={{ fontSize: 10, fill: tickFill }}
            tickFormatter={(v: string) => v.length > 24 ? `${v.slice(0, 24)}…` : v}
          />
          <Tooltip content={comparisonTooltip.content} cursor={tooltipStyle.cursor} />
          <Bar dataKey="investment" name="Investimento" fill={c1} radius={[0, 4, 4, 0]} maxBarSize={horizontalBarSize} />
          <Bar dataKey="revenue"    name="Receita"      fill={c3} radius={[0, 4, 4, 0]} maxBarSize={horizontalBarSize} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );

  return (
    <section className="grid grid-cols-1 gap-5 xl:grid-cols-12">

      {/* ── Trend chart — full width ── */}
      <div className="xl:col-span-12">
        <ChartCard
          icon={Activity}
          title="Evolução Diária"
          subtitle="Cliques e conversões ao longo do tempo"
          action={
            <ToggleGroup
              options={[
                { value: "area",   label: "Área"        },
                { value: "bar",    label: "Barras"      },
                { value: "invest", label: "Investimento" },
              ]}
              value={trendMode}
              onChange={setTrendMode}
            />
          }
        >
          <div className="h-64 sm:h-72">{trendChart}</div>
          <DotLegend items={
            trendMode === "invest"
              ? [{ color: c4, label: "Investimento" }, { color: c2, label: "Cliques" }]
              : [{ color: c2, label: "Cliques" }, { color: c3, label: "Conversões" }]
          } />
        </ChartCard>
      </div>

      {/* ── Budget chart — 4/12 normal, 12/12 quando horizontal ── */}
      <div className={comparisonMode === "horizontal" ? "xl:col-span-12" : "xl:col-span-4"}>
        <ChartCard
          icon={PieIcon}
          iconColor="#8B5CF6"
          title="Distribuição de Orçamento"
          subtitle={budgetMode === "mensal" ? "Investimento mês a mês" : "Investimento por campanha"}
          action={
            <ToggleGroup
              options={[
                { value: "donut",  label: "Rosca"  },
                { value: "mensal", label: "Mensal"  },
                { value: "bar",    label: "Barras"  },
              ]}
              value={budgetMode}
              onChange={setBudgetMode}
            />
          }
        >
          {budgetChart}
        </ChartCard>
      </div>

      {/* ── Comparison chart — 8/12 normal, 12/12 quando horizontal ── */}
      <div className={comparisonMode === "horizontal" ? "xl:col-span-12" : "xl:col-span-8"}>
        <ChartCard
          icon={BarChart2}
          iconColor="#0ea5e9"
          title="Investimento vs Receita"
          subtitle="Comparativo por campanha no período"
          action={
            <ToggleGroup
              options={[{ value: "grouped", label: "Agrupado" }, { value: "horizontal", label: "Horizontal" }]}
              value={comparisonMode}
              onChange={setComparisonMode}
            />
          }
        >
          {comparisonChart}
          <DotLegend items={[
            { color: c1, label: "Investimento" },
            { color: c3, label: "Receita" },
          ]} />
        </ChartCard>
      </div>

    </section>
  );
}
