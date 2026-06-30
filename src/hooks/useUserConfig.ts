"use client";

// ─── useUserConfig — store global de categorias/filtros + contas (entries) ──────
// Mesma ideia do useCampaignCenter: um único estado pro app inteiro. Qualquer
// mutação (em qualquer tela) e qualquer mudança no banco (deste ou de outro
// membro da empresa, via realtime do Supabase) atualiza TODOS os consumidores —
// sem fetch manual em cada componente. É isto que dá "tempo real" no sistema.

import { useCallback, useEffect, useReducer } from "react";
import { useCompany } from "@/hooks/useCompany";
import {
  fetchUserCategories,
  fetchUserAccountEntries,
  subscribeUserConfig,
} from "@/utils/supabaseCategories";
import type { UserCategory, UserAccountEntry } from "@/types/userConfig";

let cfgCategories: UserCategory[] = [];
let cfgEntries: UserAccountEntry[] = [];
let cfgHydrated = false;
let cfgRealtime = false;
const cfgListeners = new Set<() => void>();

function emit() { cfgListeners.forEach((l) => l()); }

async function refetchConfig(): Promise<void> {
  try {
    const [cats, entries] = await Promise.all([fetchUserCategories(), fetchUserAccountEntries()]);
    cfgCategories = cats;
    cfgEntries = entries;
    emit();
  } catch { /* mantém o cache atual */ }
}

function hydrateConfig() {
  if (cfgHydrated) return;
  cfgHydrated = true;
  void refetchConfig();
}

function startConfigRealtime() {
  if (cfgRealtime) return;
  cfgRealtime = true;
  // canal próprio: o page.tsx já usa "user-config-realtime" pro dashboard.
  subscribeUserConfig(() => { void refetchConfig(); }, "user-config-realtime-store");
}

export function useUserConfig() {
  const { company } = useCompany();
  const [, force] = useReducer((c: number) => c + 1, 0);

  useEffect(() => {
    cfgListeners.add(force);
    hydrateConfig();
    startConfigRealtime();
    return () => { cfgListeners.delete(force); };
  }, []);

  // Trocar de empresa busca os dados da nova — o store é módulo único e não
  // remonta sozinho na troca.
  useEffect(() => { void refetchConfig(); }, [company?.id]);

  const setCategories = useCallback((next: UserCategory[]) => { cfgCategories = next; emit(); }, []);
  const setAccountEntries = useCallback((next: UserAccountEntry[]) => { cfgEntries = next; emit(); }, []);
  const refetch = useCallback(() => refetchConfig(), []);

  return { categories: cfgCategories, accountEntries: cfgEntries, setCategories, setAccountEntries, refetch };
}
