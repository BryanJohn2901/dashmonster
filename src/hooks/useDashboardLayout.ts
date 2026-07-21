"use client";
import { useState, useEffect, useCallback } from "react";
import type { MetricId } from "./useMetricVisibility";
import { ALL_METRIC_IDS, METRIC_LABELS } from "./useMetricVisibility";

const STORE_KEY = "gsah_layout_v1";

export interface DashboardLayout {
  order:       MetricId[];
  labels:      Partial<Record<MetricId, string>>;
  gridColumns: 2 | 3 | 4;
}

export const DEFAULT_LAYOUT: DashboardLayout = {
  order:       [...ALL_METRIC_IDS] as MetricId[],
  labels:      {},
  gridColumns: 4,
};

/** Returns the display label for a metric, respecting custom labels. */
export function getMetricLabel(metric: MetricId, labels: DashboardLayout["labels"]): string {
  return labels[metric] ?? METRIC_LABELS[metric] ?? metric;
}

export function useDashboardLayout() {
  const [layout, setLayout] = useState<DashboardLayout>(DEFAULT_LAYOUT);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) setLayout({ ...DEFAULT_LAYOUT, ...JSON.parse(raw) as DashboardLayout });
    } catch {}
  }, []);

  const persist = useCallback((next: DashboardLayout) => {
    setLayout(next);
    try { localStorage.setItem(STORE_KEY, JSON.stringify(next)); } catch {}
  }, []);

  const reorder = useCallback((from: number, to: number) => {
    setLayout((prev) => {
      const next = [...prev.order];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      const updated = { ...prev, order: next };
      try { localStorage.setItem(STORE_KEY, JSON.stringify(updated)); } catch {}
      return updated;
    });
  }, []);

  const setLabel = useCallback((metric: MetricId, label: string) => {
    setLayout((prev) => {
      const updated = { ...prev, labels: { ...prev.labels, [metric]: label || undefined } };
      try { localStorage.setItem(STORE_KEY, JSON.stringify(updated)); } catch {}
      return updated;
    });
  }, []);

  const setGridColumns = useCallback((n: 2 | 3 | 4) => {
    setLayout((prev) => {
      const updated = { ...prev, gridColumns: n };
      try { localStorage.setItem(STORE_KEY, JSON.stringify(updated)); } catch {}
      return updated;
    });
  }, []);

  const reset = useCallback(() => persist(DEFAULT_LAYOUT), [persist]);

  return { layout, reorder, setLabel, setGridColumns, reset };
}
