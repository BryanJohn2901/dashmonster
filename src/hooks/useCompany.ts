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

// ─── Tracking pixels (1 empresa pode ter N, ex.: 1 por landing page) ──────────
// Migration 037 — antes disso a empresa tinha só 1 config (4 colunas direto em
// `companies`, hoje deprecadas). `slug` é opaco e estável (entra no snippet,
// nunca muda com o rename do `name`); `isDefault` é o pixel que um snippet
// antigo (`Tracker.init(empresa)`, sem o 2º argumento) usa.
export interface TrackingPixel {
  id: string;
  slug: string;
  name: string;
  metaPixelId: string;
  metaCapiToken: string;
  dominioAutorizado: string;
  /** Código de "Eventos de teste" do Events Manager — opcional, só pra validar dedup Pixel+CAPI. Remover depois do teste. */
  metaTestEventCode: string;
  isDefault: boolean;
}

const TRACKING_PIXELS_SELECT = "id, slug, name, meta_pixel_id, meta_capi_token, dominio_autorizado, meta_test_event_code, is_default";

function rowToTrackingPixel(row: Record<string, unknown>): TrackingPixel {
  return {
    id: row.id as string,
    slug: row.slug as string,
    name: row.name as string,
    metaPixelId: (row.meta_pixel_id as string) ?? "",
    metaCapiToken: (row.meta_capi_token as string) ?? "",
    dominioAutorizado: (row.dominio_autorizado as string) ?? "",
    metaTestEventCode: (row.meta_test_event_code as string) ?? "",
    isDefault: Boolean(row.is_default),
  };
}

function randomSlug(): string {
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
}

/**
 * Reduz o que o usuário digitar no campo "Domínio autorizado" ao hostname puro
 * — track-event compara `new URL(origin).hostname` (sem protocolo/porta/path)
 * EXATAMENTE com esse valor. Footgun real: colar "https://meusite.com.br" ou
 * "meusite.com.br/" salvava a string crua e NUNCA casava com o hostname do
 * visitante → todo evento virava 403 silencioso ("Domínio não autorizado").
 * Não tira "www." de propósito: se o site usa www, o hostname do visitante
 * também vem com www e precisa bater. Vazio = sem restrição (continua válido).
 */
export function normalizeHostname(raw: string): string {
  let v = raw.trim().toLowerCase();
  if (!v) return "";
  v = v.replace(/^[a-z][a-z0-9+.-]*:\/\//, ""); // tira protocolo (http://, https://)
  v = v.split("/")[0].split("?")[0].split("#")[0].split(":")[0]; // tira path/query/fragment/porta
  return v;
}

/** Lista os pixels de tracking de uma empresa (mais antigo primeiro — o "Pixel principal" migrado vem primeiro). */
export async function fetchTrackingPixels(companyId: string): Promise<TrackingPixel[]> {
  if (!supabaseClient) return [];
  const { data, error } = await supabaseClient
    .from("tracking_pixels")
    .select(TRACKING_PIXELS_SELECT)
    .eq("company_id", companyId)
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return data.map(rowToTrackingPixel);
}

/** Cria um pixel novo (RLS: owner OU manager). Se for o 1º da empresa, já nasce padrão. */
export async function createTrackingPixel(
  companyId: string,
  input: { name: string; isFirst: boolean },
): Promise<TrackingPixel> {
  if (!supabaseClient) throw new Error("Supabase não configurado.");
  const { data, error } = await supabaseClient
    .from("tracking_pixels")
    .insert({ company_id: companyId, slug: randomSlug(), name: input.name.trim() || "Novo pixel", is_default: input.isFirst })
    .select(TRACKING_PIXELS_SELECT)
    .single();
  if (error || !data) throw new Error(error?.message ?? "Erro ao criar pixel.");
  return rowToTrackingPixel(data);
}

export type VerifyTokenStatus = "match" | "mismatch" | "invalid" | "unknown" | "skipped";
export interface VerifyTokenResult {
  status: VerifyTokenStatus;
  authorizedIds?: string[];
  reason?: string;
}

/**
 * Confere com a Meta (via debug_token, no servidor) se o token da Conversions
 * API realmente autoriza o Pixel ID — chamado antes de salvar pra avisar o
 * usuário quando o token é de outro pixel (problema silencioso: a Meta aceita
 * o evento e descarta). "skipped" = faltou pixel ou token (nada a validar);
 * "unknown" = não deu pra verificar (não bloqueia o save).
 */
export async function verifyMetaToken(pixelId: string, token: string): Promise<VerifyTokenResult> {
  try {
    const res = await fetch("/api/tracking/verify-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pixelId, token }),
    });
    return (await res.json()) as VerifyTokenResult;
  } catch {
    return { status: "unknown", reason: "falha de rede ao validar o token" };
  }
}

/** Atualiza nome/credenciais de um pixel (RLS: owner OU manager). String vazia limpa o campo. */
export async function updateTrackingPixel(
  pixelId: string,
  patch: { name: string; metaPixelId: string; metaCapiToken: string; dominioAutorizado: string; metaTestEventCode: string },
): Promise<void> {
  if (!supabaseClient) throw new Error("Supabase não configurado.");
  const { error } = await supabaseClient
    .from("tracking_pixels")
    .update({
      name: patch.name.trim() || "Pixel sem nome",
      meta_pixel_id: patch.metaPixelId.trim() || null,
      meta_capi_token: patch.metaCapiToken.trim() || null,
      // Normaliza pra hostname puro — senão URL completa colada vira 403 silencioso (ver normalizeHostname).
      dominio_autorizado: normalizeHostname(patch.dominioAutorizado) || null,
      meta_test_event_code: patch.metaTestEventCode.trim() || null,
    })
    .eq("id", pixelId);
  if (error) throw new Error(error.message);
}

/** Marca um pixel como padrão (snippet sem 2º argumento) e desmarca os outros da mesma empresa. */
export async function setDefaultTrackingPixel(companyId: string, pixelId: string): Promise<void> {
  if (!supabaseClient) throw new Error("Supabase não configurado.");
  const { error: clearError } = await supabaseClient.from("tracking_pixels").update({ is_default: false }).eq("company_id", companyId);
  if (clearError) throw new Error(clearError.message);
  const { error } = await supabaseClient.from("tracking_pixels").update({ is_default: true }).eq("id", pixelId);
  if (error) throw new Error(error.message);
}

/** Remove um pixel (RLS: owner OU manager). Não deixa remover o único pixel restante da empresa. */
export async function deleteTrackingPixel(pixelId: string): Promise<void> {
  if (!supabaseClient) throw new Error("Supabase não configurado.");
  const { error } = await supabaseClient.from("tracking_pixels").delete().eq("id", pixelId);
  if (error) throw new Error(error.message);
}

// ─── Catálogo Eduzz: produto → ofertas, pixel por produto (migration 050) ──
// Você cria 1 PRODUTO na Eduzz (curso) e dentro dele N OFERTAS (preço/
// parcelamento diferentes, cada uma com seu próprio productId) — parentId é
// estável entre todas as ofertas do mesmo produto (confirmado com dado real).
// O vínculo de pixel é só no PRODUTO — toda oferta dele herda automaticamente,
// sem configurar oferta por oferta. 100% opt-in e SEM fallback: uma venda só vai
// pra Meta se o produto dela tiver um pixel escolhido aqui. Produto sem pixel =
// venda fica só no dashboard/relatório, nunca é enviada (não cai mais pra visita
// correlacionada nem pro pixel padrão) — ver findProductPixelId() e a seção
// "Resolução do pixel — SEM fallback nenhum" em src/app/api/eduzz/CLAUDE.md.
export interface EduzzProductOffer {
  productId: string;
  label: string;
}

export interface EduzzProduct {
  parentId: string;
  name: string;
  pixelId: string | null;
  offers: EduzzProductOffer[];
}

/**
 * Catálogo completo da empresa: todo produto já visto em venda da Eduzz
 * (criado automaticamente pelo webhook na 1ª venda, nome provisório = título
 * da oferta) + suas ofertas conhecidas. 2 queries (produtos + ofertas),
 * combinadas no client — volume baixo (dezenas de produtos), não precisa de
 * JOIN no servidor.
 */
export async function fetchEduzzCatalog(companyId: string): Promise<EduzzProduct[]> {
  if (!supabaseClient) return [];
  const [productsRes, offersRes] = await Promise.all([
    supabaseClient.from("eduzz_products").select("parent_id, name, pixel_id").eq("company_id", companyId),
    supabaseClient.from("eduzz_product_offers").select("parent_id, product_id, name").eq("company_id", companyId),
  ]);
  if (productsRes.error || !productsRes.data) return [];
  const offersByParent = new Map<string, EduzzProductOffer[]>();
  for (const row of offersRes.data ?? []) {
    const parentId = row.parent_id as string;
    const list = offersByParent.get(parentId) ?? [];
    list.push({ productId: row.product_id as string, label: (row.name as string) || (row.product_id as string) });
    offersByParent.set(parentId, list);
  }
  return productsRes.data.map((row) => ({
    parentId: row.parent_id as string,
    name: row.name as string,
    pixelId: (row.pixel_id as string) || null,
    offers: offersByParent.get(row.parent_id as string) ?? [],
  }));
}

/** Cadastra um produto novo de antemão (antes de qualquer venda chegar) ou renomeia um já existente — upsert por (empresa, parentId). */
export async function upsertEduzzProduct(companyId: string, parentId: string, name: string): Promise<void> {
  if (!supabaseClient) throw new Error("Supabase não configurado.");
  const { error } = await supabaseClient
    .from("eduzz_products")
    .upsert({ company_id: companyId, parent_id: parentId, name }, { onConflict: "company_id,parent_id" });
  if (error) throw new Error(error.message);
}

/** Vincula (ou remove, com `pixelId: null`) o pixel de um produto — todas as ofertas dele herdam automaticamente. */
export async function setEduzzProductPixel(companyId: string, parentId: string, pixelId: string | null): Promise<void> {
  if (!supabaseClient) throw new Error("Supabase não configurado.");
  const { error } = await supabaseClient
    .from("eduzz_products")
    .update({ pixel_id: pixelId })
    .eq("company_id", companyId)
    .eq("parent_id", parentId);
  if (error) throw new Error(error.message);
}

// ─── Webhook de vendas Eduzz (migration 041) ──────────────────────────────────

// Antes disso o segredo vivia em companies.settings (JSONB), escrito via
// UPDATE direto em `companies` — só que o trigger da migration 035 só deixa
// MANAGER editar 3 colunas de pixel, `settings` é owner-only. Resultado: um
// gestor de tráfego clicava em salvar e a escrita era rejeitada pelo Postgres
// (silenciosamente, porque a UI não tratava o erro). Tabela própria com RLS
// owner+manager direta (igual tracking_pixels) resolve os 2 problemas: o
// gestor consegue salvar, e dá pra nomear cada config (várias contas/produtos
// Eduzz da mesma empresa). `secret` é único globalmente e imutável — pra
// trocar o segredo de uma config, crie uma nova e apague a antiga (mesma
// lógica do `slug` do pixel: o valor que entra na URL não pode mudar sozinho).
export interface EduzzWebhookConfig {
  id: string;
  name: string;
  secret: string;
  createdAt: string;
}

const EDUZZ_WEBHOOK_CONFIGS_SELECT = "id, name, secret, created_at";

function rowToEduzzWebhookConfig(row: Record<string, unknown>): EduzzWebhookConfig {
  return {
    id: row.id as string,
    name: row.name as string,
    secret: row.secret as string,
    createdAt: row.created_at as string,
  };
}

function randomSecret(): string {
  return (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)).replace(/-/g, "");
}

/** Lista as configs de webhook Eduzz de uma empresa (mais antiga primeiro). */
export async function fetchEduzzWebhookConfigs(companyId: string): Promise<EduzzWebhookConfig[]> {
  if (!supabaseClient) return [];
  const { data, error } = await supabaseClient
    .from("eduzz_webhook_configs")
    .select(EDUZZ_WEBHOOK_CONFIGS_SELECT)
    .eq("company_id", companyId)
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return data.map(rowToEduzzWebhookConfig);
}

/** Cria uma config nova com segredo aleatório (RLS: owner OU manager). */
export async function createEduzzWebhookConfig(companyId: string, name: string): Promise<EduzzWebhookConfig> {
  if (!supabaseClient) throw new Error("Supabase não configurado.");
  const { data, error } = await supabaseClient
    .from("eduzz_webhook_configs")
    .insert({ company_id: companyId, name: name.trim() || "Nova config", secret: randomSecret() })
    .select(EDUZZ_WEBHOOK_CONFIGS_SELECT)
    .single();
  if (error || !data) throw new Error(error?.message ?? "Erro ao criar config.");
  return rowToEduzzWebhookConfig(data);
}

/** Renomeia uma config (RLS: owner OU manager) — secret não muda, é o que está cadastrado na Eduzz. */
export async function renameEduzzWebhookConfig(configId: string, name: string): Promise<void> {
  if (!supabaseClient) throw new Error("Supabase não configurado.");
  const { error } = await supabaseClient
    .from("eduzz_webhook_configs")
    .update({ name: name.trim() || "Config sem nome" })
    .eq("id", configId);
  if (error) throw new Error(error.message);
}

/** Remove uma config (RLS: owner OU manager) — webhook cadastrado na Eduzz com esse segredo para de funcionar. */
export async function deleteEduzzWebhookConfig(configId: string): Promise<void> {
  if (!supabaseClient) throw new Error("Supabase não configurado.");
  const { error } = await supabaseClient.from("eduzz_webhook_configs").delete().eq("id", configId);
  if (error) throw new Error(error.message);
}

// ─── Conexão OAuth2 com a API da Eduzz (migration 058) ────────────────────────
// Complemento ao webhook — pull de dados pra cobrir lacunas estruturais (ver
// src/app/api/eduzz/CLAUDE.md). 1 conexão por empresa, fluxo iniciado por
// navegação de página inteira (/api/eduzz/oauth/start), não por fetch — por
// isso não tem "createEduzzOAuthConnection" aqui, só leitura/desconexão.
export interface EduzzOAuthConnection {
  companyId: string;
  eduzzUserEmail: string | null;
  eduzzUserName: string | null;
  status: "connected" | "error" | "syncing";
  lastSyncedAt: string | null;
  lastSyncError: string | null;
}

function rowToEduzzOAuthConnection(row: Record<string, unknown>): EduzzOAuthConnection {
  return {
    companyId: row.company_id as string,
    eduzzUserEmail: (row.eduzz_user_email as string | null) ?? null,
    eduzzUserName: (row.eduzz_user_name as string | null) ?? null,
    status: row.status as "connected" | "error" | "syncing",
    lastSyncedAt: (row.last_synced_at as string | null) ?? null,
    lastSyncError: (row.last_sync_error as string | null) ?? null,
  };
}

/** Lê a conexão OAuth Eduzz da empresa, se existir (RLS: membro da empresa). */
export async function fetchEduzzOAuthConnection(companyId: string): Promise<EduzzOAuthConnection | null> {
  if (!supabaseClient) return null;
  const { data, error } = await supabaseClient
    .from("eduzz_oauth_connections")
    .select("company_id, eduzz_user_email, eduzz_user_name, status, last_synced_at, last_sync_error")
    .eq("company_id", companyId)
    .maybeSingle();
  if (error || !data) return null;
  return rowToEduzzOAuthConnection(data);
}

/** Desconecta (apaga a conexão) — RLS: owner OU manager. Próxima sync do cron simplesmente ignora a empresa. */
export async function disconnectEduzzOAuth(companyId: string): Promise<void> {
  if (!supabaseClient) throw new Error("Supabase não configurado.");
  const { error } = await supabaseClient.from("eduzz_oauth_connections").delete().eq("company_id", companyId);
  if (error) throw new Error(error.message);
}

/**
 * Monta o header Authorization a partir da sessão local (o login do app usa
 * `supabaseClient` puro, sessão em localStorage, não em cookie — por isso as
 * rotas server-side de OAuth da Eduzz precisam do token explícito, não dá pra
 * checar sessão via cookie como em `@/utils/supabase/server`).
 */
async function authHeader(): Promise<Record<string, string>> {
  const token = (await supabaseClient?.auth.getSession())?.data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Inicia o fluxo OAuth (botão "Conectar conta Eduzz") e devolve a URL de autorização da Eduzz pra navegar. */
export async function startEduzzOAuth(companyId: string): Promise<string> {
  const res = await fetch("/api/eduzz/oauth/start", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeader()) },
    body: JSON.stringify({ company_id: companyId }),
  });
  const json = await res.json().catch(() => null) as { error?: string; url?: string } | null;
  if (!res.ok || !json?.url) throw new Error(json?.error ?? "Falha ao iniciar conexão com a Eduzz.");
  return json.url;
}

/**
 * Dispara UMA fatia da sincronização sob demanda. A rota é síncrona e roda em
 * janelas até estourar um orçamento de tempo (< maxDuration), devolvendo
 * `done`: true = período inteiro sincronizado (status "connected"); false =
 * ainda falta período, o chamador deve chamar de novo (continua de onde
 * parou). O painel (EduzzConfigPanel) chama isso em loop até `done`. Status
 * final ("connected"/"error") já vem na própria resposta — a rota sempre
 * grava um status, nunca deixa preso em "syncing".
 */
export async function syncEduzzOAuthNow(companyId: string): Promise<{ connection: EduzzOAuthConnection; done: boolean }> {
  const res = await fetch("/api/eduzz/oauth/sync-now", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeader()) },
    body: JSON.stringify({ company_id: companyId }),
  });
  const json = await res.json().catch(() => null) as { error?: string; done?: boolean; connection?: Record<string, unknown> } | null;
  if (!res.ok || !json?.connection) throw new Error(json?.error ?? "Falha ao sincronizar.");
  return {
    connection: rowToEduzzOAuthConnection({ company_id: companyId, ...json.connection }),
    done: json.done ?? true,
  };
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
