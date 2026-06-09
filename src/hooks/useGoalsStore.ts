"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "pta_goals_v2"; // v2: per-group goals

export interface Goals {
  ctr: number | null;
  roas: number | null;
  cpa: number | null;
  roi: number | null;
  cpc: number | null;
  cpm: number | null;
  leads: number | null;
  conversions: number | null;
  investment: number | null;
  revenue: number | null;
  cpl: number | null;
  clicks: number | null;
  impressions: number | null;
  sales_total: number | null;
  sales_ingresso: number | null;
  sales_pos: number | null;
  cpa_venda: number | null;
  cpa_ingresso: number | null;
  cpa_pos: number | null;
}

export const DEFAULT_GOALS: Goals = {
  ctr: null, roas: null, cpa: null, roi: null,
  cpc: null, cpm: null, leads: null, conversions: null, investment: null,
  revenue: null, cpl: null, clicks: null, impressions: null,
  sales_total: null, sales_ingresso: null, sales_pos: null,
  cpa_venda: null, cpa_ingresso: null, cpa_pos: null,
};

interface GoalsState {
  byGroup: Record<string, Goals>;
}

const DEFAULT_STATE: GoalsState = { byGroup: {} };

function load(): GoalsState {
  if (typeof window === "undefined") return DEFAULT_STATE;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw);
    // v1 migration: if it looks like a flat Goals object, wrap it under "global"
    if ("byGroup" in parsed) return { ...DEFAULT_STATE, ...parsed };
    return { byGroup: { global: { ...DEFAULT_GOALS, ...parsed } } };
  } catch { return DEFAULT_STATE; }
}

function persist(s: GoalsState): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {}
}

export function useGoalsStore() {
  const [state, setState] = useState<GoalsState>(DEFAULT_STATE);

  useEffect(() => { setState(load()); }, []);

  const getGoals = useCallback((groupId: string): Goals => {
    return state.byGroup[groupId] ?? DEFAULT_GOALS;
  }, [state]);

  const setGoal = useCallback(<K extends keyof Goals>(groupId: string, key: K, value: Goals[K]) => {
    setState((prev) => {
      const current = prev.byGroup[groupId] ?? DEFAULT_GOALS;
      const next: GoalsState = {
        ...prev,
        byGroup: { ...prev.byGroup, [groupId]: { ...current, [key]: value } },
      };
      persist(next);
      return next;
    });
  }, []);

  const resetGoals = useCallback((groupId: string) => {
    setState((prev) => {
      const next: GoalsState = {
        ...prev,
        byGroup: { ...prev.byGroup, [groupId]: { ...DEFAULT_GOALS } },
      };
      persist(next);
      return next;
    });
  }, []);

  return { getGoals, setGoal, resetGoals, byGroup: state.byGroup };
}
