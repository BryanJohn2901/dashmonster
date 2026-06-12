"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseClient } from "@/lib/supabase";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type CompanyRole = "owner" | "manager" | "viewer";

export interface Company {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  /** Pré-configuração do owner (filtros padrão, colunas do histórico, etc.) */
  settings: Record<string, unknown>;
}

export interface CompanyState {
  company: Company | null;
  role: CompanyRole | null;
  loading: boolean;
  /** true quando a migration 021 ainda não foi aplicada no Supabase */
  migrationMissing: boolean;
}

// ─── Cache em módulo: 1 fetch por sessão, compartilhado entre hooks ──────────

let cached: CompanyState | null = null;
let inflight: Promise<CompanyState> | null = null;
const listeners = new Set<(s: CompanyState) => void>();

function notify(state: CompanyState) {
  cached = state;
  listeners.forEach((l) => l(state));
}

async function fetchCompanyState(): Promise<CompanyState> {
  const base: CompanyState = { company: null, role: null, loading: false, migrationMissing: false };
  if (!supabaseClient) return base;

  const { data: auth } = await supabaseClient.auth.getUser();
  if (!auth.user) return base;

  const { data, error } = await supabaseClient
    .from("company_members")
    .select("role, companies ( id, name, slug, logo_url, settings )")
    .eq("user_id", auth.user.id)
    .limit(1)
    .maybeSingle();

  if (error) {
    // 42P01 = tabela não existe → migration 021 não aplicada ainda
    const missing = error.code === "42P01" || /company_members/.test(error.message ?? "");
    return { ...base, migrationMissing: missing };
  }
  if (!data?.companies) return base;

  // companies vem como objeto (FK única), mas o typegen pode inferir array
  const raw = Array.isArray(data.companies) ? data.companies[0] : data.companies;
  if (!raw) return base;

  return {
    company: {
      id: raw.id,
      name: raw.name,
      slug: raw.slug,
      logoUrl: raw.logo_url ?? null,
      settings: (raw.settings as Record<string, unknown>) ?? {},
    },
    role: data.role as CompanyRole,
    loading: false,
    migrationMissing: false,
  };
}

function loadOnce(): Promise<CompanyState> {
  if (!inflight) {
    inflight = fetchCompanyState()
      .then((s) => {
        notify(s);
        return s;
      })
      .catch(() => {
        const fallback: CompanyState = { company: null, role: null, loading: false, migrationMissing: false };
        notify(fallback);
        return fallback;
      });
  }
  return inflight;
}

/** Para usar fora de React (utils Supabase): estado atual da empresa. */
export async function getCompanyContext(): Promise<CompanyState> {
  return cached ?? loadOnce();
}

/** Força re-fetch (ex.: após trocar role ou atualizar settings da empresa). */
export async function refreshCompany(): Promise<CompanyState> {
  inflight = null;
  return loadOnce();
}

/** Atualiza settings da empresa (só owner passa na RLS). */
export async function updateCompanySettings(
  companyId: string,
  settings: Record<string, unknown>,
): Promise<void> {
  if (!supabaseClient) throw new Error("Supabase não configurado.");
  const { error } = await supabaseClient
    .from("companies")
    .update({ settings })
    .eq("id", companyId);
  if (error) throw new Error(error.message);
  await refreshCompany();
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useCompany() {
  const [state, setState] = useState<CompanyState>(
    cached ?? { company: null, role: null, loading: true, migrationMissing: false },
  );

  useEffect(() => {
    listeners.add(setState);
    if (!cached) void loadOnce();
    return () => {
      listeners.delete(setState);
    };
  }, []);

  const refresh = useCallback(() => refreshCompany(), []);

  const { company, role } = state;
  return {
    ...state,
    refresh,
    isOwner: role === "owner",
    /** owner ou manager — pode conectar tokens, configurar campanhas, editar filtros */
    canWrite: role === "owner" || role === "manager",
    companyId: company?.id ?? null,
  };
}
