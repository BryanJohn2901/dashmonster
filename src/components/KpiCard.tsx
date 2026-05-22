import { LucideIcon, TrendingDown, TrendingUp } from "lucide-react";

/* ─── Tier types ─────────────────────────────────────────────────────────── */
export type KpiTier = 1 | 2 | 3;

/* ─── Accent colours ─────────────────────────────────────────────────────── */
type AccentKey = "red" | "green" | "primary" | "blue" | "emerald" | "violet" | "amber" | "rose";

interface AccentStyle {
  iconBg:   string;   // CSS value
  iconText: string;   // CSS value
  topBar:   string;   // hex — Tier 1 only
}

// Padrão: iconBg neutro translúcido, cor só em status semântico (success/danger)
// "Cor não é decoração; cor é informação" — guia visual §3
const NEUTRAL_ICON_BG   = "rgba(255,255,255,0.045)";
const NEUTRAL_ICON_TEXT = "var(--dm-icon-primary, #C8CCD8)";

const ACCENT: Record<AccentKey, AccentStyle> = {
  primary: { iconBg: NEUTRAL_ICON_BG, iconText: NEUTRAL_ICON_TEXT, topBar: "#313491" },
  blue:    { iconBg: NEUTRAL_ICON_BG, iconText: NEUTRAL_ICON_TEXT, topBar: "#313491" },
  violet:  { iconBg: NEUTRAL_ICON_BG, iconText: NEUTRAL_ICON_TEXT, topBar: "#8B5CF6" },
  amber:   { iconBg: NEUTRAL_ICON_BG, iconText: NEUTRAL_ICON_TEXT, topBar: "#F59E0B" },
  // Semânticos: texto colorido, fundo ainda neutro
  green:   { iconBg: NEUTRAL_ICON_BG, iconText: "var(--dm-chart-success, #22C55E)", topBar: "#10B981" },
  emerald: { iconBg: NEUTRAL_ICON_BG, iconText: "var(--dm-chart-success, #22C55E)", topBar: "#10B981" },
  red:     { iconBg: NEUTRAL_ICON_BG, iconText: "var(--dm-chart-danger,  #EF4444)", topBar: "#EF4444" },
  rose:    { iconBg: NEUTRAL_ICON_BG, iconText: "var(--dm-chart-danger,  #EF4444)", topBar: "#F43F5E" },
};

/* ─── Goal helpers ─────────────────────────────────────────────────────────── */
function goalColor(pct: number, invert: boolean) {
  const good = invert ? pct <= 100 : pct >= 100;
  const mid  = invert ? pct <= 130 : pct >= 70;
  if (good) return { bar: "var(--dm-success-base)", text: "var(--dm-success-text)",  bg: "var(--dm-success-bg)" };
  if (mid)  return { bar: "var(--dm-warning-base)", text: "var(--dm-warning-text)",  bg: "var(--dm-warning-bg)" };
  return      { bar: "var(--dm-error-base)",   text: "var(--dm-error-text)",    bg: "var(--dm-error-bg)"   };
}

/* ─── Props ────────────────────────────────────────────────────────────────── */
export interface KpiCardProps {
  title:        string;
  tooltip?:     string;
  value:        string;
  subtitle?:    string;
  icon:         LucideIcon;
  trend?:       number;
  trendLabel?:  string;
  accentColor?: AccentKey;
  invertTrend?: boolean;
  goalValue?:   number | null;
  goalLabel?:   string;
  goalPct?:     number | null;
  goalInvert?:  boolean;
  /** Visual tier: 1 = Financeiro (large), 2 = Eficiência (medium), 3 = Volume (compact) */
  tier?:        KpiTier;
}

/* ─────────────────────────────────────────────────────────────────────────── */

export function KpiCard({
  title, tooltip, value, subtitle, icon: Icon,
  trend, trendLabel = "vs período anterior",
  accentColor = "blue",
  invertTrend = false,
  goalValue, goalLabel, goalPct, goalInvert = false,
  tier = 1,
}: KpiCardProps) {
  const a = ACCENT[accentColor];

  const isPositiveTrend = trend !== undefined
    ? (invertTrend ? trend < 0 : trend > 0)
    : null;

  const hasGoal = goalValue != null && goalPct != null;
  const gc      = hasGoal ? goalColor(goalPct!, goalInvert) : null;
  const barWidth = hasGoal ? Math.min(goalPct!, 100) : 0;

  const deltaStyle = isPositiveTrend !== null ? {
    backgroundColor: isPositiveTrend ? "var(--dm-value-positive-bg)" : "var(--dm-value-negative-bg)",
    color:           isPositiveTrend ? "var(--dm-value-positive)"    : "var(--dm-value-negative)",
  } : undefined;

  /* ── Tier-driven sizing ────────────────────────────────────────────────── */
  const t1 = tier === 1;
  const t2 = tier === 2;
  // tier 3 = smallest

  const cardPadding    = t1 ? "p-5"        : t2 ? "px-4 py-3.5"  : "px-3 py-2.5";
  const iconSize       = t1 ? 34           : t2 ? 28              : 22;
  const iconRadius     = t1 ? "rounded-[10px]" : "rounded-lg";
  // MD3 type scale — font-size via CSS var (não Tailwind) para usar tokens semânticos
  const valueFontSize  = t1
    ? "var(--dm-type-title-lg)"   /* 22px */
    : t2
    ? "var(--dm-type-title-md)"   /* 18px */
    : "var(--dm-type-body-lg)";   /* 14px */
  const valueSize      = "";
  const valueWeight    = t1 ? "font-bold"       : t2 ? "font-bold"    : "font-semibold";
  const valueColor     = t1 || t2 ? "var(--dm-text-primary)" : "var(--dm-text-secondary)";
  const labelColor     = "var(--dm-text-tertiary)";
  const gap            = t1 ? "gap-3.5"    : t2 ? "gap-2.5"      : "gap-2";

  const shapeRadius = t1
    ? "var(--dm-shape-lg)"    /* 16px — MD3 large */
    : t2
    ? "var(--dm-shape-md)"   /* 12px — MD3 medium */
    : "var(--dm-shape-sm)";  /* 8px  — MD3 small  */

  return (
    <article
      className="dm-state-layer card-hover group relative overflow-hidden border shadow-horizon transition-all duration-300 hover:-translate-y-0.5"
      style={{
        background:   "var(--dm-bg-surface)",
        borderColor:  t1 ? "var(--dm-border-default)" : t2 ? "transparent" : "var(--dm-border-subtle)",
        borderRadius: shapeRadius,
      }}
    >
      {/* Tier 1 — top accent bar */}
      {t1 && (
        <div className="h-[3px] w-full" style={{ background: a.topBar }} />
      )}

      <div className={`flex items-center ${gap} ${cardPadding}`}>
        {/* Icon */}
        <span
          className={`flex flex-shrink-0 items-center justify-center ${iconRadius}`}
          style={{
            width:      iconSize,
            height:     iconSize,
            background: a.iconBg,
            color:      a.iconText,
          }}
        >
          <Icon size={t1 ? 18 : t2 ? 15 : 12} />
        </span>

        {/* Text */}
        <div className="min-w-0 flex-1">
          {/* Label — MD3 Label Small */}
          <p
            className="dm-metric-label mb-0.5"
            {...(tooltip ? { "data-dm-tip": tooltip } : {})}
            style={{ color: labelColor, fontSize: "var(--dm-type-label-sm)" }}
          >
            {title}
          </p>

          {/* Value — MD3 type scale via CSS var */}
          <p
            className={`${valueWeight} leading-tight tracking-tight font-[family-name:var(--font-poppins)]`}
            style={{ color: valueColor, fontSize: valueFontSize }}
          >
            {value}
          </p>

          {/* Trend + subtitle — Tier 1 and 2 only */}
          {tier < 3 && (trend !== undefined || subtitle) && (
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
          {tier < 3 && trend !== undefined && subtitle && (
            <p className="mt-0.5 text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>{subtitle}</p>
          )}

          {/* Tier 3 — compact subtitle inline */}
          {tier === 3 && subtitle && (
            <p className="mt-0.5 text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>{subtitle}</p>
          )}
        </div>
      </div>

      {/* Goal bar — Tier 1 only */}
      {tier === 1 && hasGoal && gc && (
        <div className="border-t px-5 pb-4 pt-3" style={{ borderColor: "var(--dm-border-subtle)" }}>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[10px] font-medium" style={{ color: "var(--dm-text-tertiary)" }}>
              Meta: <span style={{ color: "var(--dm-text-secondary)" }}>{goalLabel}</span>
            </span>
            <span
              className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold"
              style={{ background: gc.bg, color: gc.text }}
            >
              {goalInvert
                ? goalPct! <= 100 ? `✓ ${goalPct!.toFixed(0)}%` : `+${(goalPct! - 100).toFixed(0)}% acima`
                : goalPct! >= 100 ? `✓ ${goalPct!.toFixed(0)}%` : `${goalPct!.toFixed(0)}%`
              }
            </span>
          </div>
          <div className="h-1 w-full overflow-hidden rounded-full" style={{ background: "var(--dm-bg-elevated)" }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${barWidth}%`, background: gc.bar }}
            />
          </div>
        </div>
      )}
    </article>
  );
}
