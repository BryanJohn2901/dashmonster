import { LucideIcon, TrendingDown, TrendingUp } from "lucide-react";

interface KpiCardProps {
  title: string;
  tooltip?: string;           // 4.4 — texto expandido para métricas abreviadas (CPM, ROAS, CTR…)
  value: string;
  subtitle?: string;
  icon: LucideIcon;
  trend?: number;
  trendLabel?: string;
  accentColor?: "blue" | "emerald" | "violet" | "amber" | "rose";
  invertTrend?: boolean;
  goalValue?: number | null;
  goalLabel?: string;
  goalPct?: number | null;
  goalInvert?: boolean;
}

const ACCENT = {
  blue:    { bg: "bg-blue-50",    icon: "text-blue-500",    bar: "bg-blue-500",    dark: "dark:bg-blue-900/20" },
  emerald: { bg: "bg-emerald-50", icon: "text-emerald-500", bar: "bg-emerald-500", dark: "dark:bg-emerald-900/20" },
  violet:  { bg: "bg-violet-50",  icon: "text-violet-500",  bar: "bg-violet-500",  dark: "dark:bg-violet-900/20" },
  amber:   { bg: "bg-amber-50",   icon: "text-amber-500",   bar: "bg-amber-500",   dark: "dark:bg-amber-900/20" },
  rose:    { bg: "bg-rose-50",    icon: "text-rose-500",    bar: "bg-rose-500",    dark: "dark:bg-rose-900/20" },
};

function goalColor(pct: number, invert: boolean): { bar: string; text: string; bg: string } {
  const good = invert ? pct <= 100 : pct >= 100;
  const mid  = invert ? pct <= 130 : pct >= 70;
  if (good) return { bar: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-900/20" };
  if (mid)  return { bar: "bg-amber-400",   text: "text-amber-600 dark:text-amber-400",     bg: "bg-amber-50 dark:bg-amber-900/20" };
  return      { bar: "bg-red-400",      text: "text-red-500 dark:text-red-400",         bg: "bg-red-50 dark:bg-red-900/20" };
}

export function KpiCard({
  title, tooltip, value, subtitle, icon: Icon,
  trend, trendLabel = "vs período anterior",
  accentColor = "blue",
  invertTrend = false,
  goalValue, goalLabel, goalPct, goalInvert = false,
}: KpiCardProps) {
  const a = ACCENT[accentColor];

  const isPositiveTrend = trend !== undefined
    ? (invertTrend ? trend < 0 : trend > 0)
    : null;

  const hasGoal = goalValue != null && goalPct != null;
  const gc = hasGoal ? goalColor(goalPct!, goalInvert) : null;
  const barWidth = hasGoal ? Math.min(goalPct!, 100) : 0;

  // 4.3 — cores semânticas para delta (positivo / negativo)
  const deltaStyle = isPositiveTrend !== null ? {
    backgroundColor: isPositiveTrend
      ? "var(--dm-value-positive-bg)"
      : "var(--dm-value-negative-bg)",
    color: isPositiveTrend
      ? "var(--dm-value-positive)"
      : "var(--dm-value-negative)",
  } : undefined;

  return (
    <article
      className="card-hover group relative overflow-hidden rounded-[20px] border bg-white dark:bg-[#0F1020] shadow-horizon transition-all duration-300 hover:-translate-y-0.5"
      style={{ borderColor: "var(--dm-border-default)" }}
    >
      <div className="flex items-center gap-4 p-5">
        {/* Icon — LEFT, circular, Horizon style */}
        <span
          className={`flex h-[46px] w-[46px] flex-shrink-0 items-center justify-center rounded-full ${a.bg} ${a.dark}`}
        >
          <Icon size={20} className={a.icon} />
        </span>

        {/* Text block */}
        <div className="min-w-0 flex-1">
          {/* Label */}
          <p
            className="dm-metric-label mb-1"
            {...(tooltip ? { "data-dm-tip": tooltip } : {})}
          >
            {title}
          </p>

          {/* Value */}
          <p
            className="text-xl font-bold leading-tight tracking-tight font-[family-name:var(--font-poppins)]"
            style={{ color: "var(--dm-text-primary)" }}
          >
            {value}
          </p>

          {/* Trend + subtitle */}
          {(trend !== undefined || subtitle) && (
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {trend !== undefined && (
                <span
                  className="inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold"
                  style={deltaStyle}
                >
                  {isPositiveTrend ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
                  {Math.abs(trend).toFixed(1)}%
                </span>
              )}
              {subtitle && (
                <p className="text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>
                  {trend !== undefined ? trendLabel : subtitle}
                </p>
              )}
            </div>
          )}
          {trend !== undefined && subtitle && (
            <p className="mt-0.5 text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>{subtitle}</p>
          )}
        </div>
      </div>

      {/* Goal section */}
      {hasGoal && gc && (
        <div className="border-t px-5 pb-4 pt-3" style={{ borderColor: "var(--dm-border-subtle)" }}>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[10px] font-medium" style={{ color: "var(--dm-text-tertiary)" }}>
              Meta: <span style={{ color: "var(--dm-text-secondary)" }}>{goalLabel}</span>
            </span>
            <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${gc.bg} ${gc.text}`}>
              {goalInvert
                ? goalPct! <= 100 ? `✓ ${goalPct!.toFixed(0)}%` : `+${(goalPct! - 100).toFixed(0)}% acima`
                : goalPct! >= 100 ? `✓ ${goalPct!.toFixed(0)}%` : `${goalPct!.toFixed(0)}%`
              }
            </span>
          </div>
          <div className="h-1 w-full overflow-hidden rounded-full bg-[var(--dm-bg-elevated)]">
            <div
              className={`h-full rounded-full transition-all duration-500 ${gc.bar}`}
              style={{ width: `${barWidth}%` }}
            />
          </div>
        </div>
      )}
    </article>
  );
}
