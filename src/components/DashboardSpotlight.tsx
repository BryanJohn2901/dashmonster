"use client";

import { useMemo, useState } from "react";
import { TrendingUp, TrendingDown, Minus, ChevronDown } from "lucide-react";

export interface SpotlightMetric {
  id: string;
  label: string;
  /** Valor já formatado para exibição (ex.: "R$ 142.380"). */
  value: string;
  /** Série diária crua (na ordem do tempo) para a sparkline + tendência. */
  series: number[];
  tone?: "primary" | "green" | "amber" | "violet";
}

const TONES: Record<NonNullable<SpotlightMetric["tone"]>, string> = {
  primary: "#6366C8", green: "#05CD99", amber: "#F4A60D", violet: "#8b5cf6",
};

const STORAGE_KEY = "pta_spotlight_metric_v1";

/** Sparkline em SVG puro (sem dependência de chart lib) — leve e nítida. */
function Sparkline({ series, color }: { series: number[]; color: string }) {
  const W = 132, H = 38;
  const path = useMemo(() => {
    const pts = series.filter((n) => Number.isFinite(n));
    if (pts.length < 2) return null;
    const min = Math.min(...pts), max = Math.max(...pts);
    const span = max - min || 1;
    const stepX = W / (pts.length - 1);
    const coords = pts.map((v, i) => [i * stepX, H - ((v - min) / span) * (H - 6) - 3] as const);
    const line = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
    const area = `${line} L${W},${H} L0,${H} Z`;
    return { line, area };
  }, [series]);

  if (!path) return null;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="overflow-visible" aria-hidden>
      <defs>
        <linearGradient id={`spark-${color}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.22} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={path.area} fill={`url(#spark-${color})`} />
      <path d={path.line} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Tendência dentro do período: média do terço final vs terço inicial da série. */
function periodTrend(series: number[]): number | null {
  const pts = series.filter((n) => Number.isFinite(n));
  if (pts.length < 3) return null;
  const third = Math.max(1, Math.floor(pts.length / 3));
  const head = pts.slice(0, third);
  const tail = pts.slice(-third);
  const avg = (a: number[]) => a.reduce((s, n) => s + n, 0) / a.length;
  const h = avg(head), t = avg(tail);
  if (h === 0) return t > 0 ? 100 : null;
  return ((t - h) / Math.abs(h)) * 100;
}

/**
 * "Ideia nova" do dash: uma métrica em destaque (configurável) no topo da Visão
 * Geral — número grande, sparkline e tendência do período. A escolha persiste
 * em localStorage. Renderiza só quando há ≥1 métrica.
 */
export function DashboardSpotlight({ metrics }: { metrics: SpotlightMetric[] }) {
  const [selectedId, setSelectedId] = useState<string>(() => {
    try { return localStorage.getItem(STORAGE_KEY) ?? metrics[0]?.id ?? ""; } catch { return metrics[0]?.id ?? ""; }
  });
  const [open, setOpen] = useState(false);

  const active = metrics.find((m) => m.id === selectedId) ?? metrics[0];
  if (!active) return null;

  const color = TONES[active.tone ?? "primary"];
  const trend = periodTrend(active.series);
  const TrendIcon = trend == null ? Minus : trend > 0.5 ? TrendingUp : trend < -0.5 ? TrendingDown : Minus;
  const trendColor = trend == null || Math.abs(trend) <= 0.5 ? "var(--dm-text-tertiary)" : trend > 0 ? "#05CD99" : "#EE5D50";

  const pick = (id: string) => {
    setSelectedId(id);
    setOpen(false);
    try { localStorage.setItem(STORAGE_KEY, id); } catch {}
  };

  return (
    <section
      className="relative flex items-center justify-between gap-4 overflow-hidden rounded-2xl border px-5 py-4 sm:px-6 sm:py-5"
      style={{ borderColor: "var(--dm-border-default)", background: "var(--dm-bg-surface)" }}
      aria-label="Métrica em destaque"
    >
      {/* Glow sutil na cor da métrica */}
      <div className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full"
        style={{ background: `radial-gradient(circle, ${color}1f 0%, transparent 70%)` }} />

      <div className="min-w-0 flex-1">
        {/* Seletor de métrica */}
        <div className="relative inline-block">
          <button type="button" onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-widest transition hover:opacity-80"
            style={{ color: "var(--dm-text-tertiary)" }}>
            {active.label}
            <ChevronDown size={12} className={`transition ${open ? "rotate-180" : ""}`} />
          </button>
          {open && (
            <>
              <button type="button" className="fixed inset-0 z-30" aria-label="Fechar" onClick={() => setOpen(false)} />
              <div className="absolute left-0 top-full z-40 mt-1.5 w-52 rounded-xl border p-1 shadow-xl"
                style={{ background: "var(--dm-bg-surface)", borderColor: "var(--dm-border-default)" }}>
                {metrics.map((m) => (
                  <button key={m.id} type="button" onClick={() => pick(m.id)}
                    className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs font-medium transition hover:bg-[var(--dm-bg-elevated)]"
                    style={{ color: m.id === active.id ? "var(--dm-primary)" : "var(--dm-text-secondary)" }}>
                    {m.label}
                    <span className="tabular-nums text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>{m.value}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Valor grande + tendência */}
        <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-3xl font-bold leading-none tabular-nums sm:text-[34px]"
            style={{ color: "var(--dm-text-primary)", fontFamily: "var(--font-poppins),Poppins,sans-serif" }}>
            {active.value}
          </span>
          <span className="flex items-center gap-1 text-[12px] font-bold" style={{ color: trendColor }}>
            <TrendIcon size={14} />
            {trend == null ? "estável" : `${trend > 0 ? "+" : ""}${trend.toFixed(0)}% no período`}
          </span>
        </div>
      </div>

      {/* Sparkline */}
      <div className="hidden flex-shrink-0 sm:block">
        <Sparkline series={active.series} color={color} />
      </div>
    </section>
  );
}
