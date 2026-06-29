"use client";

import { useMemo, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { formatCurrency, formatNumber, formatPercent } from "@/utils/metrics";
import type { ReportFunnel } from "@/types/report";

interface FunnelCardProps {
  impressions:   number;
  clicks:        number;
  conversions:   number;
  investment?:   number;
  pageViews?:    number;
  leads?:        number;
  storageScope?: string;
}

type FunnelStepId = "impressions" | "clicks" | "pageViews" | "leads" | "conversions";

interface StepDef {
  id:          FunnelStepId;
  label:       string;
  rateLabel?:  string;
  costLabel?:  string;
}

const ALL_STEPS: StepDef[] = [
  { id: "impressions", label: "Impressões",       costLabel: "CPM" },
  { id: "clicks",      label: "Cliques",          rateLabel: "CTR",         costLabel: "CPC" },
  { id: "pageViews",   label: "Vis. de Página",   rateLabel: "Connect Rate", costLabel: "CPV" },
  { id: "leads",       label: "Leads",            rateLabel: "Tx. Captura", costLabel: "CPL" },
  { id: "conversions", label: "Conversões",       rateLabel: "Tx. Conv.",   costLabel: "CPA" },
];

const DEFAULT_STEPS: FunnelStepId[] = ["impressions", "clicks", "pageViews", "leads", "conversions"];

// Token-aligned colors (match globals.css --dm-primary / --dm-primary-vivid / --dm-success-base)
const STEP_COLORS: Record<FunnelStepId, string> = {
  impressions: "#16A34A",
  clicks:      "#4A4FCC",
  pageViews:   "#0891b2",
  leads:       "#F59E0B",
  conversions: "#10B981",
};

function load(key: string): FunnelStepId[] {
  if (typeof window === "undefined") return DEFAULT_STEPS;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return DEFAULT_STEPS;
    const parsed = JSON.parse(raw) as string[];
    const valid  = parsed.filter((id): id is FunnelStepId => ALL_STEPS.some(s => s.id === id));
    return valid.length >= 1 ? valid : DEFAULT_STEPS;
  } catch { return DEFAULT_STEPS; }
}

export function FunnelCard({
  impressions, clicks, conversions, investment,
  pageViews, leads, storageScope,
}: FunnelCardProps) {
  const storageKey = `pta_funnel_steps_v1:${storageScope ?? "default"}`;
  const [showPanel, setShowPanel] = useState(false);
  const [stepIds, setStepIds]     = useState<FunnelStepId[]>(() => load(storageKey));

  const save = (ids: FunnelStepId[]) => {
    const safe = ids.length >= 1 ? ids : DEFAULT_STEPS;
    setStepIds(safe);
    try { localStorage.setItem(storageKey, JSON.stringify(safe)); } catch {}
  };

  const toggle = (id: FunnelStepId) =>
    save(stepIds.includes(id) ? stepIds.filter(x => x !== id) : [...stepIds, id]);

  const values: Record<FunnelStepId, number> = useMemo(() => ({
    impressions,
    clicks,
    pageViews: pageViews ?? 0,
    leads:     leads ?? 0,
    conversions,
  }), [clicks, conversions, impressions, leads, pageViews]);

  const steps = useMemo(() => {
    // Renderiza sempre na ordem lógica de ALL_STEPS (impressões → cliques →
    // vis. de página → leads → conversões), independente da ordem em que o
    // usuário marcou as etapas — evita taxas invertidas (ex: Connect Rate 3000%).
    const raw = ALL_STEPS.filter(s => stepIds.includes(s.id));
    const max = Math.max(...raw.map(s => values[s.id]), 1);
    return raw.map((s, i) => {
      const prev = i > 0 ? values[raw[i - 1].id] : null;
      const rate = prev && prev > 0 ? (values[s.id] / prev) * 100 : undefined;
      const cost = investment && investment > 0 && values[s.id] > 0
        ? investment / values[s.id]
        : undefined;
      const widthPct = values[s.id] > 0
        ? Math.max(20, (values[s.id] / max) * 100)
        : 20;
      return { ...s, value: values[s.id], rate, cost, widthPct };
    });
  }, [stepIds, values, investment]);

  // Footer metrics
  const cpm = investment && impressions > 0 ? (investment / impressions) * 1000 : null;
  const cpc = investment && clicks > 0        ? investment / clicks              : null;
  const cpa = investment && conversions > 0   ? investment / conversions         : null;

  return (
    <article
      className="dm-state-layer relative border p-5 shadow-horizon transition-all duration-300 hover:-translate-y-0.5"
      style={{
        background:   "var(--dm-bg-surface)",
        borderColor:  "var(--dm-border-default)",
        borderRadius: "var(--dm-shape-xl)",  /* MD3 extra-large = 28px */
      }}
    >
      {/* ── Header ── */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-[13px] font-semibold" style={{ color: "var(--dm-text-primary)" }}>
            Funil de Conversão
          </h3>
          <p className="text-[10px] mt-0.5" style={{ color: "var(--dm-text-tertiary)" }}>
            {steps.length} etapas · {steps[0]?.label} → {steps[steps.length - 1]?.label}
          </p>
        </div>
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowPanel(v => !v)}
            className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition hover:opacity-80"
            style={{
              borderColor: "var(--dm-border-default)",
              background:  "var(--dm-bg-elevated)",
              color:       "var(--dm-text-secondary)",
            }}
          >
            <SlidersHorizontal size={11} />
            Personalizar
          </button>

          {/* Customization panel */}
          {showPanel && (
            <div
              className="absolute right-0 top-full z-30 mt-1 w-64 rounded-xl border p-3 shadow-lg"
              style={{ background: "var(--dm-bg-surface)", borderColor: "var(--dm-border-default)" }}
            >
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest"
                style={{ color: "var(--dm-text-tertiary)" }}>
                Etapas visíveis
              </p>
              <p className="mb-2 text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>
                Selecione as etapas que aparecem no funil.
              </p>
              <div className="space-y-1">
                {ALL_STEPS.map(step => {
                  const on = stepIds.includes(step.id);
                  return (
                    <label
                      key={step.id}
                      className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 transition"
                      style={{ background: on ? "var(--dm-nav-active-bg)" : "transparent" }}
                    >
                      {/* Toggle switch */}
                      <span
                        className="relative inline-flex h-5 w-9 flex-shrink-0 rounded-full transition-colors duration-200"
                        style={{ background: on ? "var(--dm-primary)" : "var(--dm-border-strong)" }}
                      >
                        <span
                          className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200"
                          style={{ transform: on ? "translateX(16px)" : "translateX(2px)" }}
                        />
                        <input
                          type="checkbox"
                          checked={on}
                          disabled={on && stepIds.length === 1}
                          onChange={() => toggle(step.id)}
                          className="sr-only"
                        />
                      </span>
                      <span className="text-[12px]" style={{ color: "var(--dm-text-secondary)" }}>
                        {step.label}
                      </span>
                      {step.costLabel && (
                        <span className="ml-auto text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>
                          {step.costLabel}
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() => save(DEFAULT_STEPS)}
                className="mt-2 w-full rounded-md py-1.5 text-[11px] font-semibold transition hover:opacity-80"
                style={{ background: "var(--dm-bg-elevated)", color: "var(--dm-text-secondary)" }}
              >
                Restaurar padrão
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Funnel bars + connectors ── */}
      <div className="flex flex-col items-center gap-0">
        {steps.map((step, i) => (
          <div key={step.id} className="w-full flex flex-col items-center">

            {/* Connector between bars */}
            {i > 0 && (
              <div className="flex flex-col items-center w-full py-1.5">
                <div className="h-2 w-px" style={{ background: "var(--dm-divider)" }} />
                {step.rateLabel ? (
                  <span
                    className="my-0.5 rounded-full px-3 py-0.5 text-[10px] font-semibold"
                    style={
                      step.rateLabel === "Tx. Conv." || step.rateLabel === "Tx. Captura"
                        ? { background: "var(--dm-success-bg)",   color: "var(--dm-success-base)" }
                        : { background: "var(--dm-primary-soft)", color: "var(--dm-nav-active-text)" }
                    }
                  >
                    {step.rateLabel}: {step.rate !== undefined ? formatPercent(step.rate) : "—"}
                  </span>
                ) : (
                  <div className="my-0.5 h-1" />
                )}
                <div className="h-2 w-px" style={{ background: "var(--dm-divider)" }} />
              </div>
            )}

            {/* Bar — centered, narrowing */}
            <div
              className="flex h-10 items-center justify-between rounded-lg px-4 transition-all duration-700"
              style={{
                width:      `${step.widthPct}%`,
                minWidth:   48,
                background: STEP_COLORS[step.id],
                opacity:    step.value > 0 ? 1 : 0.2,
              }}
            >
              <span className="text-[11px] font-bold text-white/90 truncate">
                {step.label}
              </span>
              {step.widthPct > 30 && step.value > 0 && (
                <span className="text-[11px] font-bold text-white/80 flex-shrink-0">
                  {formatNumber(step.value)}
                </span>
              )}
            </div>

          </div>
        ))}
      </div>

      {/* ── Footer metrics ── */}
      {investment && investment > 0 && (
        <>
          <div className="my-4 h-px" style={{ background: "var(--dm-divider)" }} />
          <div className="flex justify-between">
            {[
              { label: "Investimento", value: formatCurrency(investment) },
              { label: "CPM",          value: cpm  ? formatCurrency(cpm)  : "—" },
              { label: "CPC",          value: cpc  ? formatCurrency(cpc)  : "—" },
              { label: "CPA",          value: cpa  ? formatCurrency(cpa)  : "—" },
            ].map(({ label, value }) => (
              <div key={label} className="flex flex-col items-center gap-0.5">
                <p className="text-[9px] font-semibold uppercase tracking-wider"
                  style={{ color: "var(--dm-text-tertiary)" }}>
                  {label}
                </p>
                <p className="text-[11px] font-semibold"
                  style={{ color: "var(--dm-text-primary)" }}>
                  {value}
                </p>
              </div>
            ))}
          </div>
        </>
      )}
    </article>
  );
}

// ─── Builder do funil para o relatório (mesma lógica/ordem do card) ───────────
export function reportFunnelFromValues(opts: {
  impressions: number; clicks: number; conversions: number;
  leads?: number; pageViews?: number; investment?: number; storageScope?: string;
}): ReportFunnel {
  const values: Record<FunnelStepId, number> = {
    impressions: opts.impressions,
    clicks:      opts.clicks,
    pageViews:   opts.pageViews ?? 0,
    leads:       opts.leads ?? 0,
    conversions: opts.conversions,
  };
  const stepIds = load(`pta_funnel_steps_v1:${opts.storageScope ?? "default"}`);
  const raw = ALL_STEPS.filter((s) => stepIds.includes(s.id));
  const steps = raw.map((s, i) => {
    const prev = i > 0 ? values[raw[i - 1].id] : null;
    const rate = prev && prev > 0 ? (values[s.id] / prev) * 100 : undefined;
    return {
      id: s.id,
      label: s.label,
      value: formatNumber(values[s.id]),
      color: STEP_COLORS[s.id],
      rateLabel: i > 0 ? s.rateLabel : undefined,
      rateValue: rate != null ? formatPercent(rate) : undefined,
    };
  });
  const inv = opts.investment ?? 0;
  const footer = [
    { label: "Investimento", value: formatCurrency(inv) },
    { label: "CPM", value: inv && opts.impressions > 0 ? formatCurrency((inv / opts.impressions) * 1000) : "—" },
    { label: "CPC", value: inv && opts.clicks > 0 ? formatCurrency(inv / opts.clicks) : "—" },
    { label: "CPA", value: inv && opts.conversions > 0 ? formatCurrency(inv / opts.conversions) : "—" },
  ];
  return { steps, footer };
}
