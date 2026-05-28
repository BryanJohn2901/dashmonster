"use client";

import { useState } from "react";

export const ALL_METRIC_IDS = [
  "investment", "revenue", "roas", "roi",
  "conversions", "leads", "cpa", "cpl", "ctr", "cpc", "cpm",
  "clicks", "impressions",
  "sales_ingresso", "sales_pos", "sales_total",
] as const;

export type MetricId = typeof ALL_METRIC_IDS[number];

export const METRIC_LABELS: Record<MetricId, string> = {
  investment:     "Investimento",
  revenue:        "Receita",
  roas:           "ROAS",
  roi:            "ROI",
  conversions:    "Conversões",
  leads:          "Leads",
  cpa:            "CPA",
  cpl:            "CPL",
  ctr:            "CTR",
  cpc:            "CPC",
  cpm:            "CPM",
  clicks:         "Cliques",
  impressions:    "Impressões",
  sales_ingresso: "Vendas de Ingresso",
  sales_pos:      "Vendas de Pós",
  sales_total:    "Vendas Total",
};

const STORAGE_KEY = "pta_hidden_metrics_v1";
const LEGACY_KEY  = "pta_hidden_kpis_v1";

function loadHidden(): Set<MetricId> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as MetricId[]);
  } catch {
    return new Set();
  }
}

export function useMetricVisibility() {
  const [hidden, setHidden] = useState<Set<MetricId>>(loadHidden);

  const toggle = (id: MetricId) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...next])); } catch {}
      return next;
    });
  };

  const showAll = () => {
    setHidden(new Set());
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  };

  const hideAll = () => {
    const next = new Set<MetricId>(ALL_METRIC_IDS);
    setHidden(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...next])); } catch {}
  };

  const isVisible = (id: MetricId | string): boolean =>
    !hidden.has(id as MetricId);

  const allVisible = hidden.size === 0;

  return { hidden, toggle, showAll, hideAll, isVisible, allVisible };
}
