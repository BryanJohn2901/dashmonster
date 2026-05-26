"use client";
import { useState, useEffect, useCallback } from "react";

const STORE_KEY = "pta_dashboard_layout_v1";

/** IDs canônicos dos cards de KPI — mesmos usados em isMetricVisible */
export const DEFAULT_KPI_ORDER = [
  "investment",
  "revenue",
  "roas",
  "roi",
  "conversions",
  "leads",
  "cpa",
  "cpl",
  "ctr",
  "cpc",
  "cpm",
  "impressions",
  "clicks",
  "conversionRate",
] as const;

export type KpiId = (typeof DEFAULT_KPI_ORDER)[number];

export interface DashboardLayout {
  kpiOrder: KpiId[];
}

const DEFAULT_LAYOUT: DashboardLayout = {
  kpiOrder: [...DEFAULT_KPI_ORDER],
};

function loadLayout(): DashboardLayout {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return DEFAULT_LAYOUT;
    const parsed = JSON.parse(raw) as Partial<DashboardLayout>;
    // Merge: keep stored order, append any new IDs not yet persisted
    const storedOrder = (parsed.kpiOrder ?? []).filter((id): id is KpiId =>
      (DEFAULT_KPI_ORDER as readonly string[]).includes(id),
    );
    const missing = DEFAULT_KPI_ORDER.filter((id) => !storedOrder.includes(id));
    return { kpiOrder: [...storedOrder, ...missing] };
  } catch {
    return DEFAULT_LAYOUT;
  }
}

/**
 * Persists the drag-and-drop order of KPI cards in the Dashboard.
 * Stored in localStorage under `pta_dashboard_layout_v1`.
 */
export function useDashboardLayout() {
  const [layout, setLayout] = useState<DashboardLayout>(DEFAULT_LAYOUT);
  const [editMode, setEditMode] = useState(false);

  // Hydrate on mount (client-only)
  useEffect(() => {
    setLayout(loadLayout());
  }, []);

  const reorder = useCallback((activeId: KpiId, overId: KpiId) => {
    setLayout((prev) => {
      const order = [...prev.kpiOrder];
      const from = order.indexOf(activeId);
      const to = order.indexOf(overId);
      if (from === -1 || to === -1 || from === to) return prev;
      order.splice(from, 1);
      order.splice(to, 0, activeId);
      const next: DashboardLayout = { ...prev, kpiOrder: order };
      try { localStorage.setItem(STORE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const resetLayout = useCallback(() => {
    setLayout(DEFAULT_LAYOUT);
    try { localStorage.removeItem(STORE_KEY); } catch {}
  }, []);

  return { layout, editMode, setEditMode, reorder, resetLayout };
}
