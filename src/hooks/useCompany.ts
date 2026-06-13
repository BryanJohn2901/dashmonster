"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseClient } from "@/lib/supabase";
import { useDevMode } from "@/hooks/useDevMode";

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

// Login/logout invalida o cache — sem isso, quem loga depois do primeiro
// fetch ficaria com company=null e gravaria sem company_id (RLS bloquearia).
let authListenerStarted = false;
function watchAuth(): void {
  if (authListenerStarted || !supabaseClient) return;
  authListenerStarted = true;
  supabaseClient.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "TOKEN_REFRESHED") {
      inflight = null;
      void loadOnce();
    }
  });
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
  watchAuth();
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

// ─── Membros (tela Empresa) ───────────────────────────────────────────────────

export interface CompanyMember {
  id: string;
  userId: string;
  email: string;
  role: CompanyRole;
  createdAt: string;
}

/** Lista os membros da empresa (RLS: qualquer membro enxerga). */
export async function fetchCompanyMembers(companyId: string): Promise<CompanyMember[]> {
  if (!supabaseClient) return [];
  const { data, error } = await supabaseClient
    .from("company_members")
    .select("id, user_id, email, role, created_at")
    .eq("company_id", companyId)
    .order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id:        r.id as string,
    userId:    r.user_id as string,
    email:     (r.email as string) ?? "",
    role:      r.role as CompanyRole,
    createdAt: r.created_at as string,
  }));
}

/** Troca o papel de um membro (RLS: só owner). */
export async function updateMemberRole(memberId: string, role: CompanyRole): Promise<void> {
  if (!supabaseClient) throw new Error("Supabase não configurado.");
  const { error } = await supabaseClient
    .from("company_members")
    .update({ role })
    .eq("id", memberId);
  if (error) throw new Error(error.message);
}

/** Remove um membro da empresa (RLS: só owner). */
export async function removeMember(memberId: string): Promise<void> {
  if (!supabaseClient) throw new Error("Supabase não configurado.");
  const { error } = await supabaseClient
    .from("company_members")
    .delete()
    .eq("id", memberId);
  if (error) throw new Error(error.message);
}

/** Renomeia a empresa (RLS: só owner). */
export async function renameCompany(companyId: string, name: string): Promise<void> {
  if (!supabaseClient) throw new Error("Supabase não configurado.");
  const { error } = await supabaseClient
    .from("companies")
    .update({ name })
    .eq("id", companyId);
  if (error) throw new Error(error.message);
  await refreshCompany();
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useCompany() {
  const [state, setState] = useState<CompanyState>(
    cached ?? { company: null, role: null, loading: true, migrationMissing: false },
  );
  const { active: devMode } = useDevMode();

  useEffect(() => {
    listeners.add(setState);
    watchAuth();
    if (!cached) void loadOnce();
    return () => {
      listeners.delete(setState);
    };
  }, []);

  const refresh = useCallback(() => refreshCompany(), []);

  const { company, role } = state;
  // Modo DEV destrava o gating de papel — usuário é tratado como dono em tudo.
  return {
    ...state,
    refresh,
    devMode,
    isOwner: devMode || role === "owner",
    /** owner ou manager — pode conectar tokens, configurar campanhas, editar filtros */
    canWrite: devMode || role === "owner" || role === "manager",
    companyId: company?.id ?? null,
  };
}
