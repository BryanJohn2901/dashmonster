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
let cfgLoadedCid: string | null | undefined = undefined;
let cfgRealtime = false;
const cfgListeners = new Set<() => void>();

function emit() { cfgListeners.forEach((l) => l()); }

async function refetchConfig(): Promise<void> {
  // fetch* leem a empresa ativa (getCompanyContext) no momento da chamada.
  const cidAtStart = cfgLoadedCid;
  try {
    const [cats, entries] = await Promise.all([fetchUserCategories(), fetchUserAccountEntries()]);
    // descarta resultado se a empresa mudou durante o fetch (evita vazamento).
    if (cfgLoadedCid !== cidAtStart) return;
    cfgCategories = cats;
    cfgEntries = entries;
    emit();
  } catch { /* mantém o cache atual */ }
}

// Troca de empresa: ZERA na hora (nada da anterior fica na tela) e recarrega.
function loadConfigForCompany(companyId: string | null): void {
  if (cfgLoadedCid === companyId) return;
  cfgLoadedCid = companyId;
  cfgCategories = [];
  cfgEntries = [];
  emit();
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
    startConfigRealtime();
    return () => { cfgListeners.delete(force); };
  }, []);

  // Carrega (ou recarrega, na troca de empresa) os dados da empresa ativa.
  useEffect(() => { loadConfigForCompany(company?.id ?? null); }, [company?.id]);

  const setCategories = useCallback((next: UserCategory[]) => { cfgCategories = next; emit(); }, []);
  const setAccountEntries = useCallback((next: UserAccountEntry[]) => { cfgEntries = next; emit(); }, []);
  const refetch = useCallback(() => refetchConfig(), []);

  return { categories: cfgCategories, accountEntries: cfgEntries, setCategories, setAccountEntries, refetch };
}
