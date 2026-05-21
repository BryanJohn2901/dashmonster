"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, SlidersHorizontal } from "lucide-react";
import { formatCurrency, formatNumber, formatPercent } from "@/utils/metrics";

interface FunnelCardProps {
  impressions: number;
  clicks: number;
  conversions: number;
  investment?: number;
  // Optional extended metrics (when available from Meta or manual entry)
  pageViews?: number;
  leads?: number;
  storageScope?: string;
}

type FunnelStepId = "impressions" | "clicks" | "pageViews" | "leads" | "conversions";

interface FunnelStep {
  id: FunnelStepId;
  label: string;
  value: number;
  rate?: number;          // conversion rate from previous step
  rateLabel?: string;     // label for the rate (e.g. "CTR")
  color: string;
  cost?: number;          // cost per unit (investment / value)
  costLabel?: string;
  widthPct: number;       // visual funnel width %
}

const DEFAULT_FUNNEL_STEPS: FunnelStepId[] = ["impressions", "clicks", "conversions"];
const ALL_FUNNEL_STEPS: Array<{
  id: FunnelStepId;
  label: string;
  color: string;
  rateLabel?: string;
  costLabel?: string;
}> = [
  { id: "impressions", label: "Impressões", color: "#3b82f6", costLabel: "CPM" },
  { id: "clicks", label: "Cliques", color: "#8b5cf6", rateLabel: "CTR", costLabel: "CPC" },
  { id: "pageViews", label: "Vis. Página", color: "#0891b2", rateLabel: "Connect Rate", costLabel: "CPV" },
  { id: "leads", label: "Leads", color: "#f59e0b", rateLabel: "Tx. Captura", costLabel: "CPL" },
  { id: "conversions", label: "Conversões", color: "#10b981", rateLabel: "Tx. Conv.", costLabel: "CPA" },
];

function loadFunnelStepPrefs(storageKey: string): FunnelStepId[] {
  if (typeof window === "undefined") return DEFAULT_FUNNEL_STEPS;
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return DEFAULT_FUNNEL_STEPS;
    const parsed = JSON.parse(raw) as string[];
    const valid = parsed.filter((id): id is FunnelStepId =>
      ALL_FUNNEL_STEPS.some((step) => step.id === id),
    );
    return valid.length > 0 ? valid : DEFAULT_FUNNEL_STEPS;
  } catch {
    return DEFAULT_FUNNEL_STEPS;
  }
}

export function FunnelCard({ impressions, clicks, conversions, investment, pageViews, leads, storageScope }: FunnelCardProps) {
  const storageKey = `pta_funnel_steps_v1:${storageScope || "default"}`;
  const [showPanel, setShowPanel] = useState(false);
  const [stepIds, setStepIds] = useState<FunnelStepId[]>(() => loadFunnelStepPrefs(storageKey));

  const persistStepIds = (next: FunnelStepId[]) => {
    const safe = next.length > 0 ? next : DEFAULT_FUNNEL_STEPS;
    setStepIds(safe);
    try { localStorage.setItem(storageKey, JSON.stringify(safe)); } catch {}
  };

  const toggleStep = (id: FunnelStepId) => {
    persistStepIds(
      stepIds.includes(id)
        ? stepIds.filter((item) => item !== id)
        : [...stepIds, id],
    );
  };

  const moveStep = (id: FunnelStepId, direction: -1 | 1) => {
    const index = stepIds.indexOf(id);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= stepIds.length) return;
    const next = [...stepIds];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    persistStepIds(next);
  };

  const stepValues = useMemo<Record<FunnelStepId, number>>(() => ({
    impressions,
    clicks,
    pageViews: pageViews ?? 0,
    leads: leads ?? 0,
    conversions,
  }), [clicks, conversions, impressions, leads, pageViews]);

  // Build steps dynamically based on available data
  const rawSteps = useMemo(
    () => stepIds
      .map((id) => {
        const def = ALL_FUNNEL_STEPS.find((step) => step.id === id);
        if (!def) return null;
        return { ...def, value: stepValues[id] };
      })
      .filter(Boolean) as Array<{ id: FunnelStepId; label: string; value: number; rateLabel?: string; color: string; costLabel?: string }>,
    [stepIds, stepValues],
  );

  const maxVal = Math.max(...rawSteps.map((s) => s.value), 1);

  // Funnel widths: 100% at top → narrowing down
  const steps: FunnelStep[] = rawSteps.map((s, i) => {
    const prev = i > 0 ? rawSteps[i - 1].value : null;
    const rate = prev && prev > 0 ? (s.value / prev) * 100 : undefined;
    const cost = investment && investment > 0 && s.value > 0 ? investment / s.value : undefined;
    const minWidth = 18;
    const widthPct = s.value > 0
      ? Math.max(minWidth, (s.value / maxVal) * 100)
      : minWidth;
    return { ...s, rate, cost, widthPct };
  });

  const getCostValue = (step: FunnelStep) => {
    if (!step.cost) return null;
    if (step.id === "impressions") return formatCurrency((step.cost ?? 0) * 1000); // CPM
    return formatCurrency(step.cost);
  };

  return (
    <article
      className="relative rounded-[20px] border p-5 shadow-horizon bg-white dark:bg-[#0F1020] transition-all duration-300 hover:-translate-y-1"
      style={{ borderColor: "var(--dm-border-default)" }}
    >
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-sm font-semibold" style={{ color: "var(--dm-text-primary)" }}>
          Funil de Conversão
        </h3>
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowPanel((v) => !v)}
            className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition hover:opacity-80"
            style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-elevated)", color: "var(--dm-text-secondary)" }}
          >
            <SlidersHorizontal size={11} aria-hidden />
            Personalizar funil
          </button>
          {showPanel && (
            <div
              className="absolute right-0 top-full z-30 mt-1 w-64 rounded-xl border p-3 shadow-lg"
              style={{ backgroundColor: "var(--dm-bg-surface)", borderColor: "var(--dm-border-default)" }}
            >
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--dm-text-tertiary)" }}>
                Etapas visíveis
              </p>
              <p className="mb-2 text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>
                Marque e reordene as etapas do funil.
              </p>
              <div className="space-y-1">
                {ALL_FUNNEL_STEPS.map((step) => {
                  const selected = stepIds.includes(step.id);
                  const index = stepIds.indexOf(step.id);
                  return (
                    <div key={step.id} className="flex items-center gap-2 rounded-md px-1 py-0.5 hover:bg-[var(--dm-bg-elevated)]">
                      <input
                        type="checkbox"
                        checked={selected}
                        disabled={selected && stepIds.length === 1}
                        onChange={() => toggleStep(step.id)}
                        className="h-3.5 w-3.5 accent-blue-500 disabled:opacity-40"
                      />
                      <span className="min-w-0 flex-1 truncate text-xs" style={{ color: "var(--dm-text-secondary)" }}>{step.label}</span>
                      <button
                        type="button"
                        onClick={() => moveStep(step.id, -1)}
                        disabled={!selected || index <= 0}
                        className="flex h-6 w-6 items-center justify-center rounded border disabled:opacity-30"
                        style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-tertiary)" }}
                        title="Mover para cima"
                      >
                        <ArrowUp size={11} />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveStep(step.id, 1)}
                        disabled={!selected || index < 0 || index >= stepIds.length - 1}
                        className="flex h-6 w-6 items-center justify-center rounded border disabled:opacity-30"
                        style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-tertiary)" }}
                        title="Mover para baixo"
                      >
                        <ArrowDown size={11} />
                      </button>
                    </div>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() => persistStepIds(DEFAULT_FUNNEL_STEPS)}
                className="mt-2 w-full rounded-md py-1 text-[10px] font-semibold text-blue-500 hover:underline"
              >
                Restaurar padrão
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col items-center gap-0">
        {steps.map((step, i) => (
          <div key={step.label} className="w-full">

            {/* Rate badge between steps */}
            {i > 0 && step.rateLabel && (
              <div className="flex items-center justify-center gap-2 py-2">
                <span className="h-px flex-1" style={{ backgroundColor: "var(--dm-border-subtle)" }} />
                <span
                  className="rounded-full px-3 py-1 text-[11px] font-semibold"
                  style={{ backgroundColor: "var(--dm-bg-elevated)", color: "var(--dm-text-secondary)", border: "1px solid var(--dm-border-subtle)" }}
                >
                  {step.rateLabel}: {step.rate !== undefined ? formatPercent(step.rate) : "—"}
                </span>
                <span className="h-px flex-1" style={{ backgroundColor: "var(--dm-border-subtle)" }} />
              </div>
            )}

            {/* Spacer between non-rate steps */}
            {i > 0 && !step.rateLabel && (
              <div className="py-1.5" />
            )}

            {/* Funnel bar row */}
            <div className="flex items-center gap-4">
              {/* Label + value (left) */}
              <div className="w-28 flex-shrink-0 text-right">
                <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>{step.label}</p>
                <p className="text-base font-bold font-[family-name:var(--font-poppins)]" style={{ color: "var(--dm-text-primary)" }}>{formatNumber(step.value)}</p>
              </div>

              {/* Funnel bar */}
              <div className="flex flex-1 justify-center">
                <div
                  className="flex h-10 items-center justify-center rounded-lg transition-all duration-700"
                  style={{
                    width: `${step.widthPct}%`,
                    backgroundColor: step.color,
                    opacity: step.value > 0 ? 1 : 0.18,
                    minWidth: 32,
                  }}
                >
                  {step.widthPct > 22 && step.value > 0 && (
                    <span className="text-[11px] font-bold text-white/90 px-2 truncate">
                      {formatNumber(step.value)}
                    </span>
                  )}
                </div>
              </div>

              {/* Cost (right) */}
              <div className="w-28 flex-shrink-0 text-left">
                {investment && step.costLabel && getCostValue(step) ? (
                  <>
                    <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>{step.costLabel}</p>
                    <p className="text-sm font-bold" style={{ color: "var(--dm-text-secondary)" }}>{getCostValue(step)}</p>
                  </>
                ) : null}
              </div>
            </div>

          </div>
        ))}
      </div>

      {/* Summary row */}
      {investment && investment > 0 && (
        <div
          className="mt-6 grid gap-px rounded-xl overflow-hidden border"
          style={{ borderColor: "var(--dm-border-subtle)", backgroundColor: "var(--dm-border-subtle)", gridTemplateColumns: `repeat(${2 + (clicks > 0 ? 1 : 0) + (conversions > 0 ? 2 : 0)}, 1fr)` }}
        >
          {/* Total Investido */}
          <div className="flex flex-col items-center justify-center px-3 py-3" style={{ backgroundColor: "var(--dm-bg-elevated)" }}>
            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>Investimento</p>
            <p className="mt-0.5 text-sm font-bold font-[family-name:var(--font-poppins)]" style={{ color: "var(--dm-text-primary)" }}>{formatCurrency(investment)}</p>
          </div>

          {/* CPM */}
          <div className="flex flex-col items-center justify-center px-3 py-3" style={{ backgroundColor: "var(--dm-bg-elevated)" }}>
            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>CPM</p>
            <p className="mt-0.5 text-sm font-bold font-[family-name:var(--font-poppins)]" style={{ color: "var(--dm-text-primary)" }}>{impressions > 0 ? formatCurrency((investment / impressions) * 1000) : "—"}</p>
          </div>

          {clicks > 0 && (
            <div className="flex flex-col items-center justify-center px-3 py-3" style={{ backgroundColor: "var(--dm-bg-elevated)" }}>
              <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>CTR</p>
              <p className="mt-0.5 text-sm font-bold font-[family-name:var(--font-poppins)]" style={{ color: "var(--dm-text-primary)" }}>{formatPercent(impressions > 0 ? (clicks / impressions) * 100 : 0)}</p>
            </div>
          )}

          {conversions > 0 && (
            <>
              <div className="flex flex-col items-center justify-center px-3 py-3" style={{ backgroundColor: "var(--dm-bg-elevated)" }}>
                <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>Tx. Conv.</p>
                <p className="mt-0.5 text-sm font-bold font-[family-name:var(--font-poppins)]" style={{ color: "var(--dm-text-primary)" }}>{formatPercent(clicks > 0 ? (conversions / clicks) * 100 : 0)}</p>
              </div>
              <div className="flex flex-col items-center justify-center px-3 py-3" style={{ backgroundColor: "var(--dm-bg-elevated)" }}>
                <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>CPA</p>
                <p className="mt-0.5 text-sm font-bold font-[family-name:var(--font-poppins)]" style={{ color: "var(--dm-text-primary)" }}>{formatCurrency(investment / conversions)}</p>
              </div>
            </>
          )}
        </div>
      )}
    </article>
  );
}
