"use client";

import { useEffect, useRef, useState } from "react";
import { TrendingUp } from "lucide-react";
import { formatCurrency, formatNumber, formatPercent } from "@/utils/metrics";
import type { Goals } from "@/hooks/useGoalsStore";

export interface CategorySummary {
  groupId: string;
  label: string;
  emoji: string | null;
  accentColor: string;
  totalInvestment: number;
  totalConversions: number;
  totalLeads: number;
  totalRevenue: number;
  roas: number;
  goals: Goals;
}

interface IndividualGoalsProps {
  summaries: CategorySummary[];
}

// ── Mini donut ────────────────────────────────────────────────────────────────

const R = 20;
const CIRC = 2 * Math.PI * R;

function MiniDonut({ pct, color }: { pct: number; color: string }) {
  const clamp = Math.min(pct, 100);
  const offset = CIRC * (1 - clamp / 100);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setReady(true), 80);
    return () => clearTimeout(t);
  }, []);

  return (
    <svg width={52} height={52} viewBox="0 0 52 52" className="-rotate-90 flex-shrink-0" aria-hidden>
      <circle cx="26" cy="26" r={R} fill="none" strokeWidth="5" stroke="var(--dm-bg-elevated)" />
      <circle
        cx="26" cy="26" r={R}
        fill="none"
        strokeWidth="5"
        stroke={color}
        strokeLinecap="round"
        strokeDasharray={CIRC}
        strokeDashoffset={ready ? offset : CIRC}
        style={{ transition: "stroke-dashoffset 700ms cubic-bezier(0.4,0,0.2,1)" }}
      />
    </svg>
  );
}

// ── Goal row inside card ──────────────────────────────────────────────────────

function GoalRow({ label, current, goal, format, invert = false }: {
  label: string;
  current: number;
  goal: number;
  format: (v: number) => string;
  invert?: boolean;
}) {
  const pct = goal > 0 ? (current / goal) * 100 : 0;
  const clamp = Math.min(pct, 100);
  const achieved = invert ? pct <= 100 : pct >= 100;
  const barColor = achieved
    ? "#10b981"
    : pct >= 70
      ? "#f59e0b"
      : "#ef4444";

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[10px] font-medium" style={{ color: "var(--dm-text-tertiary)" }}>{label}</span>
        <span className="text-[10px] font-semibold" style={{ color: achieved ? "#10b981" : "var(--dm-text-secondary)" }}>
          {format(current)} / {format(goal)}
        </span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full" style={{ backgroundColor: "var(--dm-bg-elevated)" }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${clamp}%`, backgroundColor: barColor }}
        />
      </div>
    </div>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────

function CategoryCard({ summary }: { summary: CategorySummary }) {
  const { label, emoji, accentColor, totalInvestment, totalConversions, totalRevenue, roas, goals } = summary;

  const hasGoals = goals.investment != null || goals.conversions != null || goals.roas != null;

  // Primary metric for the donut: investment vs budget
  const donutPct = goals.investment != null && goals.investment > 0
    ? (totalInvestment / goals.investment) * 100
    : goals.roas != null && goals.roas > 0
      ? (roas / goals.roas) * 100
      : null;

  const donutLabel = goals.investment != null ? "Orçamento" : goals.roas != null ? "ROAS" : null;

  return (
    <article
      className="rounded-[18px] border bg-white dark:bg-[#111c44] p-4 shadow-horizon transition-all duration-300 hover:-translate-y-0.5"
      style={{ borderColor: "var(--dm-border-default)" }}
    >
      {/* Header */}
      <div className="mb-3 flex items-center gap-2.5">
        <span className="text-xl leading-none">{emoji ?? "📊"}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold" style={{ color: "var(--dm-text-primary)" }}>{label}</p>
          <p className="text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>
            {totalConversions > 0 ? `${formatNumber(totalConversions)} conversões` : "Sem dados"}
          </p>
        </div>
        {donutPct !== null && (
          <div className="relative flex-shrink-0">
            <MiniDonut pct={donutPct} color={accentColor} />
            <span
              className="absolute inset-0 flex items-center justify-center text-[10px] font-bold"
              style={{ color: "var(--dm-text-primary)" }}
            >
              {Math.min(Math.round(donutPct), 999)}%
            </span>
          </div>
        )}
      </div>

      {/* KPI row */}
      <div
        className="mb-3 grid grid-cols-3 gap-px rounded-xl overflow-hidden border"
        style={{ borderColor: "var(--dm-border-subtle)", backgroundColor: "var(--dm-border-subtle)" }}
      >
        {[
          { label: "Invest.",  value: formatCurrency(totalInvestment) },
          { label: "Receita",  value: formatCurrency(totalRevenue) },
          { label: "ROAS",     value: `${roas.toFixed(2)}x` },
        ].map(({ label: l, value }) => (
          <div key={l} className="flex flex-col items-center px-2 py-2" style={{ backgroundColor: "var(--dm-bg-elevated)" }}>
            <p className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>{l}</p>
            <p className="text-xs font-bold" style={{ color: "var(--dm-text-primary)" }}>{value}</p>
          </div>
        ))}
      </div>

      {/* Goal progress bars */}
      {hasGoals ? (
        <div className="space-y-2">
          {goals.investment != null && goals.investment > 0 && (
            <GoalRow
              label="Orçamento"
              current={totalInvestment}
              goal={goals.investment}
              format={formatCurrency}
              invert
            />
          )}
          {goals.conversions != null && goals.conversions > 0 && (
            <GoalRow
              label="Conversões"
              current={totalConversions}
              goal={goals.conversions}
              format={formatNumber}
            />
          )}
          {goals.roas != null && goals.roas > 0 && (
            <GoalRow
              label="ROAS"
              current={roas}
              goal={goals.roas}
              format={(v) => `${v.toFixed(2)}x`}
            />
          )}
          {goals.roi != null && goals.roi > 0 && (
            <GoalRow
              label="ROI"
              current={totalRevenue > 0 && totalInvestment > 0 ? ((totalRevenue - totalInvestment) / totalInvestment) * 100 : 0}
              goal={goals.roi}
              format={formatPercent}
            />
          )}
        </div>
      ) : (
        <p className="text-center text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>
          Configure metas para ver progresso
        </p>
      )}
    </article>
  );
}

// ── Section ───────────────────────────────────────────────────────────────────

export function IndividualGoals({ summaries }: IndividualGoalsProps) {
  const active = summaries.filter((s) => s.totalInvestment > 0 || s.totalConversions > 0);

  if (active.length === 0) return null;

  return (
    <section aria-labelledby="individual-goals-title">
      <div className="mb-3 flex items-center gap-2">
        <TrendingUp size={14} className="text-violet-500" />
        <h2 id="individual-goals-title" className="text-sm font-bold" style={{ color: "var(--dm-text-primary)" }}>
          Metas por Grupo
        </h2>
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
          style={{ backgroundColor: "var(--dm-bg-elevated)", color: "var(--dm-text-tertiary)" }}
        >
          {active.length} grupos
        </span>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {active.map((s) => (
          <CategoryCard key={s.groupId} summary={s} />
        ))}
      </div>
    </section>
  );
}
