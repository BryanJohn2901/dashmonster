"use client";
import { useState, useEffect, useCallback } from "react";
import {
  fetchManualOverrides,
  upsertManualOverride,
  parseOverrideKey,
  type ManualOverrideFields,
} from "@/utils/supabaseManualOverrides";

const STORE_KEY = "gsah_manual_overrides_v1";

export interface ManualOverride {
  conversions?:   number;
  leads?:         number;
  revenue?:       number;   // Faturamento (manual)
  tickets?:       number;   // Ingressos vendidos (manual)
  salesIngresso?: number;   // Vendas de Ingresso (Eduzz)
  salesPos?:      number;   // Vendas de Pós-Graduação (Eduzz)
  salesTotal?:    number;   // Vendas Total (Eduzz)
  note?:          string;
  source:         "manual";
  updatedAt:      string;
}

export type ManualOverrideStore = Record<string, ManualOverride>;

function readLocal(): ManualOverrideStore {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw) as ManualOverrideStore;
  } catch {}
  return {};
}

function writeLocal(next: ManualOverrideStore) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(next)); } catch {}
}

/**
 * Overrides manuais por contexto (chave = `${groupId}::${campaignId}`).
 * Fonte: Supabase (conta do usuário). localStorage é só cache offline.
 */
export function useManualMetrics() {
  const [overrides, setOverrides] = useState<ManualOverrideStore>({});

  // Hidrata: cache local imediato + Supabase autoritativo.
  useEffect(() => {
    setOverrides(readLocal());
    let alive = true;
    void (async () => {
      try {
        const remote = await fetchManualOverrides();
        if (!alive) return;
        const merged: ManualOverrideStore = {};
        for (const [key, f] of Object.entries(remote)) {
          merged[key] = {
            ...f,
            source: "manual",
            updatedAt: new Date().toISOString(),
          };
        }
        setOverrides(merged);
        writeLocal(merged);
      } catch {
        // sem rede/login: segue com cache local
      }
    })();
    return () => { alive = false; };
  }, []);

  const setOverride = useCallback((key: string, patch: Partial<ManualOverride>) => {
    setOverrides((prev) => {
      const next = {
        ...prev,
        [key]: {
          ...(prev[key] ?? { source: "manual" as const, updatedAt: "" }),
          ...patch,
          source: "manual" as const,
          updatedAt: new Date().toISOString(),
        },
      };
      writeLocal(next);
      return next;
    });

    // Persiste no Supabase (best-effort)
    const { groupId, campaignId } = parseOverrideKey(key);
    const fields: ManualOverrideFields = {};
    if (patch.salesTotal    !== undefined) fields.salesTotal    = patch.salesTotal;
    if (patch.salesIngresso !== undefined) fields.salesIngresso = patch.salesIngresso;
    if (patch.salesPos      !== undefined) fields.salesPos      = patch.salesPos;
    if (patch.tickets       !== undefined) fields.tickets       = patch.tickets;
    if (patch.revenue       !== undefined) fields.revenue       = patch.revenue;
    if (patch.note          !== undefined) fields.note          = patch.note;
    if (Object.keys(fields).length > 0) {
      void upsertManualOverride(groupId, campaignId, fields).catch(() => {});
    }
  }, []);

  const removeOverride = useCallback((key: string) => {
    setOverrides((prev) => {
      const next = { ...prev };
      delete next[key];
      writeLocal(next);
      return next;
    });
    const { groupId, campaignId } = parseOverrideKey(key);
    void import("@/utils/supabaseManualOverrides")
      .then((m) => m.deleteManualOverride(groupId, campaignId))
      .catch(() => {});
  }, []);

  return { overrides, setOverride, removeOverride };
}
