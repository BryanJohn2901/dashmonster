import { useMemo } from "react";
import { TrendingUp, TrendingDown } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { BreakdownChips, type TileBreakdown } from "@/components/ui/BreakdownChips";

// Card de métrica compacto — a linguagem do bento, reutilizável em todas as abas.
// chip de ícone + label + valor grande + (delta | sparkline | breakdown | sub).

// ─── Sparkline (SVG inline, sem libs) ─────────────────────────────────────────

export function Sparkline({ data, color }: { data: number[]; color: string }) {
  // id estável por instância — evita Math.random impuro durante render
  const gid = useMemo(() => `spark-${Math.round(data.reduce((a, b) => a + b, 0))}-${data.length}`, [data]);
  if (data.length < 2) return <div className="h-7" />;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const w = 100, h = 28;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`);
  const area = `0,${h} ${pts.join(" ")} ${w},${h}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-7 w-full" aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.10" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${gid})`} />
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function pctChange(data: number[]): number | null {
  const nonZero = data.filter((v) => v !== 0);
  if (nonZero.length < 2) return null;
  const first = nonZero[0];
  const last = nonZero[nonZero.length - 1];
  if (first === 0) return null;
  return ((last - first) / Math.abs(first)) * 100;
}

export function Delta({ value, invert }: { value: number | null; invert?: boolean }) {
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

export function StatCard({
  icon: Icon, label, value, sub, color, data, invertDelta, breakdown,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sub?: string;
  color: string;
  /** Série p/ sparkline + delta. Omitir = card sem gráfico. */
  data?: number[];
  invertDelta?: boolean;
  breakdown?: TileBreakdown[];
}) {
  return (
    <div className="flex flex-col justify-between gap-2.5 rounded-2xl border p-4"
      style={{ backgroundColor: "var(--dm-bg-surface)", borderColor: "var(--dm-border-subtle)" }}>
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>
          <span className="flex h-6 w-6 items-center justify-center rounded-lg" style={{ backgroundColor: "var(--dm-bg-elevated)" }}>
            <Icon size={13} style={{ color: "var(--dm-text-tertiary)" }} />
          </span>
          {label}
        </span>
        {data && <Delta value={pctChange(data)} invert={invertDelta} />}
      </div>
      <p className="text-[26px] font-bold leading-none tabular-nums" style={{ color: "var(--dm-text-primary)", fontFamily: "var(--font-poppins),Poppins,sans-serif" }}>
        {value}
      </p>
      {data && <Sparkline data={data} color={color} />}
      {breakdown && breakdown.length > 1
        ? <BreakdownChips items={breakdown} />
        : sub && <span className="text-[10px] font-medium" style={{ color: "var(--dm-text-tertiary)" }}>{sub}</span>}
    </div>
  );
}
