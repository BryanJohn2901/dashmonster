"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabaseClient } from "@/lib/supabase";
import { useDevMode, isDevModeActive } from "@/hooks/useDevMode";

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

/** Uma empresa da qual o usuário é membro, com o papel dele nela. */
export interface CompanyMembership {
  company: Company;
  role: CompanyRole;
}

export interface CompanyState {
  company: Company | null;
  role: CompanyRole | null;
  /** Todas as empresas do usuário (para o seletor de empresa). */
  memberships: CompanyMembership[];
  /** true quando o usuário é super admin (vê todas as empresas no modo DEV). */
  isSuperAdmin: boolean;
  loading: boolean;
  /** true quando a migration 021 ainda não foi aplicada no Supabase */
  migrationMissing: boolean;
}

// ─── Cache em módulo: 1 fetch por sessão, compartilhado entre hooks ──────────

const ACTIVE_COMPANY_KEY = "dm_active_company_v1";

let cached: CompanyState | null = null;
let inflight: Promise<CompanyState> | null = null;
const listeners = new Set<(s: CompanyState) => void>();

function notify(state: CompanyState) {
  cached = state;
  listeners.forEach((l) => l(state));
}

function readActiveCompanyId(): string | null {
  try { return localStorage.getItem(ACTIVE_COMPANY_KEY); } catch { return null; }
}

function writeActiveCompanyId(id: string | null): void {
  try {
    if (id) localStorage.setItem(ACTIVE_COMPANY_KEY, id);
    else localStorage.removeItem(ACTIVE_COMPANY_KEY);
  } catch {}
}

function rowToCompany(raw: {
  id: string; name: string; slug: string; logo_url?: string | null; settings?: unknown;
}): Company {
  return {
    id: raw.id,
    name: raw.name,
    slug: raw.slug,
    logoUrl: raw.logo_url ?? null,
    settings: (raw.settings as Record<string, unknown>) ?? {},
  };
}

async function fetchCompanyState(): Promise<CompanyState> {
  const base: CompanyState = {
    company: null, role: null, memberships: [], isSuperAdmin: false, loading: false, migrationMissing: false,
  };
  if (!supabaseClient) return base;

  const { data: auth } = await supabaseClient.auth.getUser();
  if (!auth.user) return base;

  const { data, error } = await supabaseClient
    .from("company_members")
    .select("role, companies ( id, name, slug, logo_url, settings )")
    .eq("user_id", auth.user.id)
    .order("created_at");

  if (error) {
    // 42P01 = tabela não existe → migration 021 não aplicada ainda
    const missing = error.code === "42P01" || /company_members/.test(error.message ?? "");
    return { ...base, migrationMissing: missing };
  }

  const memberships: CompanyMembership[] = (data ?? [])
    .map((row) => {
      const raw = Array.isArray(row.companies) ? row.companies[0] : row.companies;
      if (!raw) return null;
      return { role: row.role as CompanyRole, company: rowToCompany(raw) };
    })
    .filter((m): m is CompanyMembership => m !== null);

  // ── Modo DEV: super admin enxerga TODAS as empresas ──────────────────────
  // O SELECT em companies retorna todas só se a policy de super admin (migration
  // 026) permitir no servidor — o RLS é a fonte da verdade, não a senha DEV.
  let isSuperAdmin = false;
  if (isDevModeActive()) {
    const { data: allCompanies, error: allErr } = await supabaseClient
      .from("companies")
      .select("id, name, slug, logo_url, settings")
      .order("name");
    if (!allErr && allCompanies) {
      const ownIds = new Set(memberships.map((m) => m.company.id));
      // se há empresas além das que sou membro, então sou super admin
      const extras = allCompanies.filter((c) => !ownIds.has(c.id));
      isSuperAdmin = extras.length > 0 || allCompanies.length > 0;
      // empresas extras entram com papel "owner" (acesso total via policy)
      extras.forEach((c) => memberships.push({ role: "owner", company: rowToCompany(c) }));
      // reconfirma super admin: só é "super" se enxerga empresa onde não é membro
      isSuperAdmin = extras.length > 0;
    }
  }

  if (memberships.length === 0) return { ...base, isSuperAdmin };

  // empresa ativa: a salva em localStorage, senão a primeira
  const savedId = readActiveCompanyId();
  const active = memberships.find((m) => m.company.id === savedId) ?? memberships[0];
  writeActiveCompanyId(active.company.id);

  return {
    company: active.company,
    role: active.role,
    memberships,
    isSuperAdmin,
    loading: false,
    migrationMissing: false,
  };
}

/** Troca a empresa ativa (entre as que o usuário participa). */
export function switchCompany(companyId: string): void {
  if (!cached) return;
  const target = cached.memberships.find((m) => m.company.id === companyId);
  if (!target) return;
  writeActiveCompanyId(companyId);
  notify({ ...cached, company: target.company, role: target.role });
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
        const fallback: CompanyState = {
          company: null, role: null, memberships: [], isSuperAdmin: false, loading: false, migrationMissing: false,
        };
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

/** Lê o token Meta salvo de uma empresa específica (para o painel DEV). */
export async function fetchCompanyToken(companyId: string): Promise<string> {
  if (!supabaseClient) return "";
  const { data, error } = await supabaseClient
    .from("companies")
    .select("meta_access_token")
    .eq("id", companyId)
    .maybeSingle();
  if (error || !data) return "";
  return (data.meta_access_token as string) ?? "";
}

export type InviteResult = "added" | "invited";

/**
 * Convida um membro por e-mail (RPC owner-only, migration 025).
 * Se a pessoa já tem conta → vira membro na hora ("added").
 * Se ainda não → fica como convite pendente e é vinculada ao criar a conta ("invited").
 */
export async function inviteMemberByEmail(
  companyId: string,
  email: string,
  role: CompanyRole,
): Promise<InviteResult> {
  if (!supabaseClient) throw new Error("Supabase não configurado.");
  const { data, error } = await supabaseClient.rpc("invite_company_member", {
    p_company_id: companyId,
    p_email: email.trim().toLowerCase(),
    p_role: role,
  });
  if (error) {
    if (error.code === "42883" || /invite_company_member/.test(error.message)) {
      throw new Error("Execute a migration 025 no Supabase SQL Editor para habilitar convites.");
    }
    throw new Error(error.message);
  }
  return (data as InviteResult) ?? "invited";
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useCompany() {
  const [state, setState] = useState<CompanyState>(
    cached ?? { company: null, role: null, memberships: [], isSuperAdmin: false, loading: true, migrationMissing: false },
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

  // Ligar/desligar o modo DEV re-busca: super admin passa a ver (ou parar de
  // ver) todas as empresas.
  const prevDevRef = useRef(devMode);
  useEffect(() => {
    if (prevDevRef.current !== devMode) {
      prevDevRef.current = devMode;
      void refreshCompany();
    }
  }, [devMode]);

  const refresh = useCallback(() => refreshCompany(), []);
  const switchTo = useCallback((id: string) => switchCompany(id), []);

  const { company, role } = state;
  // Modo DEV destrava o gating de papel — usuário é tratado como dono em tudo.
  return {
    ...state,
    refresh,
    switchCompany: switchTo,
    devMode,
    isOwner: devMode || role === "owner",
    /** owner ou manager — pode conectar tokens, configurar campanhas, editar filtros */
    canWrite: devMode || role === "owner" || role === "manager",
    companyId: company?.id ?? null,
  };
}
