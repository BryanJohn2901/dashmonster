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
  // Fonte da verdade = a função is_super_admin() (migration 026), que lê
  // app_admins no servidor. NÃO inferir por "vejo empresa onde não sou membro":
  // um super admin com uma só empresa daria falso-negativo nessa heurística.
  let isSuperAdmin = false;
  if (isDevModeActive()) {
    const { data: isAdmin } = await supabaseClient.rpc("is_super_admin");
    isSuperAdmin = isAdmin === true;
    if (isSuperAdmin) {
      const { data: allCompanies, error: allErr } = await supabaseClient
        .from("companies")
        .select("id, name, slug, logo_url, settings")
        .order("name");
      if (!allErr && allCompanies) {
        const ownIds = new Set(memberships.map((m) => m.company.id));
        // empresas onde não sou membro entram com papel "owner" (acesso via policy)
        allCompanies
          .filter((c) => !ownIds.has(c.id))
          .forEach((c) => memberships.push({ role: "owner", company: rowToCompany(c) }));
      }
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

/**
 * Grava o token Meta de uma empresa específica (RLS: owner OU super admin).
 * String vazia limpa o token. Usado pelo painel de super admin para configurar
 * qualquer empresa sem trocar de contexto.
 */
export async function setCompanyToken(companyId: string, token: string): Promise<void> {
  if (!supabaseClient) throw new Error("Supabase não configurado.");
  const { error } = await supabaseClient
    .from("companies")
    .update({ meta_access_token: token.trim() || null })
    .eq("id", companyId);
  if (error) throw new Error(error.message);
}

export interface TrackingConfig {
  metaPixelId: string;
  metaCapiToken: string;
  dominioAutorizado: string;
  /** Código de "Eventos de teste" do Events Manager — opcional, só pra validar dedup Pixel+CAPI. Remover depois do teste. */
  metaTestEventCode: string;
}

/** Lê a config do tracking pixel (meta_pixel_id, meta_capi_token, dominio_autorizado, meta_test_event_code) de uma empresa. */
export async function fetchCompanyTracking(companyId: string): Promise<TrackingConfig> {
  const empty: TrackingConfig = { metaPixelId: "", metaCapiToken: "", dominioAutorizado: "", metaTestEventCode: "" };
  if (!supabaseClient) return empty;
  let { data, error } = await supabaseClient
    .from("companies")
    .select("meta_pixel_id, meta_capi_token, dominio_autorizado, meta_test_event_code")
    .eq("id", companyId)
    .maybeSingle();
  // meta_test_event_code (migration 036) pode ainda não existir no banco —
  // tenta sem ela em vez de devolver tudo vazio (perderia pixelId/token já salvos na tela).
  if (error?.message?.includes("meta_test_event_code")) {
    ({ data, error } = await supabaseClient
      .from("companies")
      .select("meta_pixel_id, meta_capi_token, dominio_autorizado")
      .eq("id", companyId)
      .maybeSingle());
  }
  if (error || !data) return empty;
  return {
    metaPixelId: (data.meta_pixel_id as string) ?? "",
    metaCapiToken: (data.meta_capi_token as string) ?? "",
    dominioAutorizado: (data.dominio_autorizado as string) ?? "",
    metaTestEventCode: ((data as { meta_test_event_code?: string }).meta_test_event_code) ?? "",
  };
}

/** Grava a config do tracking pixel de uma empresa (RLS: owner OU manager, migration 035 — trigger restringe manager só a essas 4 colunas). String vazia limpa o campo. */
export async function setCompanyTracking(companyId: string, config: TrackingConfig): Promise<void> {
  if (!supabaseClient) throw new Error("Supabase não configurado.");
  const { error } = await supabaseClient
    .from("companies")
    .update({
      meta_pixel_id: config.metaPixelId.trim() || null,
      meta_capi_token: config.metaCapiToken.trim() || null,
      dominio_autorizado: config.dominioAutorizado.trim() || null,
      meta_test_event_code: config.metaTestEventCode.trim() || null,
    })
    .eq("id", companyId);
  if (error?.message?.includes("meta_test_event_code")) {
    if (config.metaTestEventCode.trim()) {
      throw new Error("Código de teste ainda não disponível — rode a migration 036 no Supabase antes de usar esse campo.");
    }
    const retry = await supabaseClient
      .from("companies")
      .update({
        meta_pixel_id: config.metaPixelId.trim() || null,
        meta_capi_token: config.metaCapiToken.trim() || null,
        dominio_autorizado: config.dominioAutorizado.trim() || null,
      })
      .eq("id", companyId);
    if (retry.error) throw new Error(retry.error.message);
    return;
  }
  if (error) throw new Error(error.message);
}

// ─── Painel de super admin ────────────────────────────────────────────────────

export interface AdminCompany {
  company: Company;
  /** true se a empresa já tem token Meta configurado. */
  hasToken: boolean;
  /** quantos membros a empresa tem. */
  memberCount: number;
}

/**
 * Lista TODAS as empresas com status de token e nº de membros.
 * Só retorna tudo se o RLS de super admin (migration 026) permitir no servidor.
 */
export async function fetchAdminCompanies(): Promise<AdminCompany[]> {
  if (!supabaseClient) return [];
  const { data: comps, error } = await supabaseClient
    .from("companies")
    .select("id, name, slug, logo_url, settings, meta_access_token")
    .order("name");
  if (error) throw new Error(error.message);

  const { data: mem } = await supabaseClient
    .from("company_members")
    .select("company_id");
  const counts = new Map<string, number>();
  (mem ?? []).forEach((r) => {
    const cid = r.company_id as string;
    counts.set(cid, (counts.get(cid) ?? 0) + 1);
  });

  return (comps ?? []).map((c) => ({
    company: rowToCompany(c),
    hasToken: Boolean((c.meta_access_token as string | null)?.trim()),
    memberCount: counts.get(c.id as string) ?? 0,
  }));
}

// ─── Contas de anúncio por empresa (painel super admin) ────────────────────────

export interface AdAccountEntry {
  id: string;
  adAccountId: string;
  label: string;
  isEnabled: boolean;
}

/** Contas de anúncio (ad accounts) configuradas numa empresa. */
export async function fetchCompanyAdAccounts(companyId: string): Promise<AdAccountEntry[]> {
  if (!supabaseClient) return [];
  const { data, error } = await supabaseClient
    .from("user_account_entries")
    .select("id, ad_account_id, label, is_enabled")
    .eq("company_id", companyId)
    .order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id:          r.id as string,
    adAccountId: (r.ad_account_id as string) ?? "",
    label:       (r.label as string) ?? "",
    isEnabled:   (r.is_enabled as boolean) ?? true,
  }));
}

// ─── Registro de contas de anúncio sugeridas (sem categoria) ──────────────────
// Guardado em companies.settings. NÃO cria user_account_entry (que exigiria uma
// categoria e acoplaria tudo num filtro só). Só alimenta o autocomplete do
// "Adicionar conta" — o acoplamento a um filtro acontece quando o usuário de
// fato adiciona a conta, escolhendo o filtro ali.

export interface AdAccountSuggestion { id: string; label: string }
export const AD_ACCOUNT_SUGGESTIONS_KEY = "adAccountSuggestions";

/** Lê o registro de sugestões de uma empresa (a partir de company.settings). */
export function readAdAccountSuggestions(settings?: Record<string, unknown>): AdAccountSuggestion[] {
  const raw = settings?.[AD_ACCOUNT_SUGGESTIONS_KEY];
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s): s is AdAccountSuggestion => !!s && typeof (s as AdAccountSuggestion).id === "string")
    .map((s) => ({ id: String(s.id).replace(/^act_/, ""), label: String(s.label ?? "") }));
}

/** Persiste o registro de sugestões (RLS: owner OU super admin via policy 026). */
export async function saveAdAccountSuggestions(
  companyId: string,
  settings: Record<string, unknown> | undefined,
  suggestions: AdAccountSuggestion[],
): Promise<void> {
  await updateCompanySettings(companyId, { ...(settings ?? {}), [AD_ACCOUNT_SUGGESTIONS_KEY]: suggestions });
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
