"use client";
import { useState, useEffect, useCallback } from "react";

const STORE_KEY = "pta_manual_overrides_v1";

export interface ManualOverride {
  conversions?: number;
  leads?:       number;
  revenue?:     number;
  note?:        string;
  source:       "manual";
  updatedAt:    string;
}

export type ManualOverrideStore = Record<string, ManualOverride>;

export function useManualMetrics() {
  const [overrides, setOverrides] = useState<ManualOverrideStore>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) setOverrides(JSON.parse(raw) as ManualOverrideStore);
    } catch {}
  }, []);

  const persist = useCallback((next: ManualOverrideStore) => {
    setOverrides(next);
    try { localStorage.setItem(STORE_KEY, JSON.stringify(next)); } catch {}
  }, []);

  const setOverride = useCallback((campaignId: string, patch: Partial<ManualOverride>) => {
    setOverrides((prev) => {
      const next = {
        ...prev,
        [campaignId]: {
          ...(prev[campaignId] ?? { source: "manual" as const, updatedAt: "" }),
          ...patch,
          source: "manual" as const,
          updatedAt: new Date().toISOString(),
        },
      };
      try { localStorage.setItem(STORE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const removeOverride = useCallback((campaignId: string) => {
    setOverrides((prev) => {
      const next = { ...prev };
      delete next[campaignId];
      try { localStorage.setItem(STORE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  return { overrides, setOverride, removeOverride };
}
