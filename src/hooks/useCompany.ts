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

// ─── Empresa DEMO ───────────────────────────────────────────────────────────────
// Modo DEV sem Supabase (preview): injeta uma empresa fake só pra VER a UI
// populada e como o contexto propaga no dashboard. Não persiste nada.
const DEMO_COMPANIES: Company[] = [
  {
    id: "demo-1", name: "Personal Trainer Academy (Demo)", slug: "demo-pta", logoUrl: null,
    settings: {
      adAccountSuggestions: [
        { id: "1860195434590", label: "Conta Principal" },
        { id: "9087654321000", label: "Conta Secundária" },
      ],
      historyTabLabels: { lancamento: "Lançamentos", evento: "Eventos ao vivo" },
      customHistoryTabs: [{ id: "ct_demo", label: "Mentorias", emoji: "🎓" }],
    },
  },
  {
    id: "demo-2", name: "Loja Fitness Online (Demo)", slug: "demo-loja", logoUrl: null,
    settings: { adAccountSuggestions: [{ id: "5551234567890", label: "E-commerce" }] },
  },
  {
    id: "demo-3", name: "Clínica Estética (Demo)", slug: "demo-clinica", logoUrl: null,
    settings: {},
  },
];
function demoState(): CompanyState {
  const activeId = readActiveCompanyId();
  const active = DEMO_COMPANIES.find((c) => c.id === activeId) ?? DEMO_COMPANIES[0];
  return {
    company: active, role: "owner",
    memberships: DEMO_COMPANIES.map((c) => ({ role: "owner" as CompanyRole, company: c })),
    isSuperAdmin: true, loading: false, migrationMissing: false,
  };
}

async function fetchCompanyState(): Promise<CompanyState> {
  const base: CompanyState = {
    company: null, role: null, memberships: [], isSuperAdmin: false, loading: false, migrationMissing: false,
  };
  if (!supabaseClient) return isDevModeActive() ? demoState() : base;

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
  if (!supabaseClient) return isDevModeActive() ? [
    { id: "m1", userId: "u1", email: "dono@ptacademy.com",   role: "owner",   createdAt: new Date().toISOString() },
    { id: "m2", userId: "u2", email: "gestor@ptacademy.com", role: "manager", createdAt: new Date().toISOString() },
    { id: "m3", userId: "u3", email: "social@ptacademy.com", role: "viewer",  createdAt: new Date().toISOString() },
  ] : [];
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

/** Cria uma empresa nova e, opcionalmente, convida um e-mail como dono.
 *  RLS: passa pela policy `companies_superadmin_all` (super admin). */
export async function createCompany(name: string, ownerEmail?: string): Promise<Company> {
  if (!supabaseClient) throw new Error("Supabase não configurado.");
  const clean = name.trim();
  if (!clean) throw new Error("Informe o nome da empresa.");
  const slug =
    clean.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) +
    "-" + Math.random().toString(36).slice(2, 7);
  // blankTaxonomy: empresa nova nasce SEM os filtros padrão PTA (Biomecânica,
  // Mentoria…). O dono monta os próprios filtros na aba Filtros / no wizard.
  // Empresas antigas (sem a flag) seguem com a taxonomia PTA hardcoded.
  const { data, error } = await supabaseClient
    .from("companies")
    .insert({ name: clean, slug, settings: { blankTaxonomy: true } })
    .select("id, name, slug, logo_url, settings")
    .single();
  if (error) throw new Error(error.message);
  const company = rowToCompany(data);
  const email = ownerEmail?.trim().toLowerCase();
  if (email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    await inviteMemberByEmail(company.id, email, "owner");
  }
  await refreshCompany();
  return company;
}

/** Lê o token Meta salvo de uma empresa específica (para o painel DEV). */
export async function fetchCompanyToken(companyId: string): Promise<string> {
  if (!supabaseClient) return isDevModeActive() ? "EAADEMOdemoTOKENexample1234567890abcdef" : "";
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
  /** O token existe no banco, mas nunca volta para o browser. */
  hasMetaCapiToken: boolean;
  /** O webhook_secret existe no banco, mas nunca volta para o browser (exceto no momento da geração). */
  hasWebhookSecret: boolean;
  dominioAutorizado: string;
  /** Código de "Eventos de teste" do Events Manager — opcional, só pra validar dedup Pixel+CAPI. Remover depois do teste. */
  metaTestEventCode: string;
  isDefault: boolean;
}

const TRACKING_PIXELS_SELECT = "id, slug, name, meta_pixel_id, dominio_autorizado, meta_test_event_code, is_default";

function rowToTrackingPixel(row: Record<string, unknown>): TrackingPixel {
  return {
    id: row.id as string,
    slug: row.slug as string,
    name: row.name as string,
    metaPixelId: (row.meta_pixel_id as string) ?? "",
    hasMetaCapiToken: Boolean(row.hasMetaCapiToken),
    hasWebhookSecret: Boolean(row.hasWebhookSecret),
    dominioAutorizado: (row.dominio_autorizado as string) ?? "",
    metaTestEventCode: (row.meta_test_event_code as string) ?? "",
    isDefault: Boolean(row.is_default),
  };
}

export async function authHeaders(): Promise<HeadersInit> {
  if (!supabaseClient) throw new Error("Supabase nÃ£o configurado.");
  const { data } = await supabaseClient.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("SessÃ£o expirada. Entre novamente.");
  return { Authorization: `Bearer ${token}` };
}

async function trackingPixelsJson<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = {
    ...(await authHeaders()),
    ...(init?.body ? { "Content-Type": "application/json" } : {}),
    ...(init?.headers ?? {}),
  };
  const res = await fetch(url, { ...init, headers });
  const json = await res.json().catch(() => null) as T | { error?: string } | null;
  const errorMessage =
    json && typeof json === "object" && "error" in json && typeof json.error === "string"
      ? json.error
      : "Erro na API de tracking.";
  if (!res.ok) throw new Error(errorMessage);
  return json as T;
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
  try {
    const data = await trackingPixelsJson<{ pixels: TrackingPixel[] }>(`/api/tracking/pixels?companyId=${encodeURIComponent(companyId)}`);
    return data.pixels;
  } catch {
    return [];
  }
}

/** Cria um pixel novo (RLS: owner OU manager). Se for o 1º da empresa, já nasce padrão. */
export async function createTrackingPixel(
  companyId: string,
  input: { name: string; isFirst: boolean },
): Promise<TrackingPixel> {
  if (!supabaseClient) throw new Error("Supabase não configurado.");
  void input.isFirst;
  const data = await trackingPixelsJson<{ pixel: TrackingPixel }>("/api/tracking/pixels", {
    method: "POST",
    body: JSON.stringify({ companyId, name: input.name }),
  });
  return data.pixel;
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
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
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
  patch: { name: string; metaPixelId: string; metaCapiToken?: string | null; dominioAutorizado: string; metaTestEventCode: string },
): Promise<TrackingPixel> {
  const updated = await trackingPixelsJson<{ pixel: TrackingPixel }>("/api/tracking/pixels", {
    method: "PATCH",
    body: JSON.stringify({ action: "update", pixelId, ...patch }),
  });
  return updated.pixel;
}

/** Marca um pixel como padrão (snippet sem 2º argumento) e desmarca os outros da mesma empresa. */
export async function setDefaultTrackingPixel(companyId: string, pixelId: string): Promise<void> {
  void companyId;
  await trackingPixelsJson<{ pixel: TrackingPixel }>("/api/tracking/pixels", {
    method: "PATCH",
    body: JSON.stringify({ action: "set-default", pixelId }),
  });
}

/**
 * Gera (ou regenera) o webhook_secret de um pixel.
 * O secret é retornado UMA ÚNICA VEZ na resposta — mostre ao usuário imediatamente
 * e avise que não será exibido novamente.
 */
export async function generateWebhookSecret(
  pixelId: string,
): Promise<{ pixel: TrackingPixel; webhookSecret: string }> {
  const data = await trackingPixelsJson<{ pixel: TrackingPixel; webhookSecret: string }>("/api/tracking/pixels", {
    method: "PATCH",
    body: JSON.stringify({ action: "generate-webhook-secret", pixelId }),
  });
  return data;
}

/** Remove o webhook_secret de um pixel (desativa o endpoint de webhook). */
export async function clearWebhookSecret(pixelId: string): Promise<TrackingPixel> {
  const data = await trackingPixelsJson<{ pixel: TrackingPixel }>("/api/tracking/pixels", {
    method: "PATCH",
    body: JSON.stringify({ action: "clear-webhook-secret", pixelId }),
  });
  return data.pixel;
}

/** Remove um pixel (RLS: owner OU manager). Não deixa remover o único pixel restante da empresa. */
export async function deleteTrackingPixel(pixelId: string): Promise<void> {
  await trackingPixelsJson<{ ok: true }>(`/api/tracking/pixels?pixelId=${encodeURIComponent(pixelId)}`, { method: "DELETE" });
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

// ─── Funis de campanha (migration 067) ───────────────────────────────────────
// Agrupam eventos de tracking por "funil" (ex: "Perpetuo SM", "Lançamento Jul").
// Cada funil define matchers: product_names (events_log.product_name), utm_campaigns
// (events_log.utm_campaign) e url_patterns (events_log.event_url). Attribution:
// 1º product_name → 2º utm_campaign → 3º url_pattern. Primeiro match vence.

export interface TrackingFunnel {
  id: string;
  companyId: string;
  label: string;
  color: string;
  pixelId: string | null;
  productParentIds: string[];
  productNames: string[];
  utmCampaigns: string[];
  urlPatterns: string[];
  createdAt: string;
}

function rowToFunnel(row: Record<string, unknown>): TrackingFunnel {
  return {
    id: row.id as string,
    companyId: row.company_id as string,
    label: row.label as string,
    color: (row.color as string) || "#16A34A",
    pixelId: (row.pixel_id as string | null) ?? null,
    productParentIds: (row.product_parent_ids as string[]) || [],
    productNames: (row.product_names as string[]) || [],
    utmCampaigns: (row.utm_campaigns as string[]) || [],
    urlPatterns: (row.url_patterns as string[]) || [],
    createdAt: row.created_at as string,
  };
}

function cleanFunnelList(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = raw.trim().slice(0, 160);
    if (!value || seen.has(value.toLowerCase())) continue;
    seen.add(value.toLowerCase());
    out.push(value);
    if (out.length >= 50) break;
  }
  return out;
}

function cleanFunnelColor(value: string): string {
  return /^#[0-9A-Fa-f]{6}$/.test(value) ? value : "#16A34A";
}

export async function fetchTrackingFunnels(companyId: string): Promise<TrackingFunnel[]> {
  if (!supabaseClient) return [];
  const { data, error } = await supabaseClient
    .from("tracking_funnels")
    .select("id, company_id, label, color, pixel_id, product_parent_ids, product_names, utm_campaigns, url_patterns, created_at")
    .eq("company_id", companyId)
    .order("created_at", { ascending: true });
  if (error?.message?.includes("pixel_id") || error?.message?.includes("product_parent_ids")) {
    // Migration 068/070 ainda não rodou — busca sem as colunas novas.
    const retry = await supabaseClient
      .from("tracking_funnels")
      .select("id, company_id, label, color, product_names, utm_campaigns, url_patterns, created_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: true });
    if (retry.error) return [];
    return (retry.data ?? []).map(rowToFunnel);
  }
  if (error) return [];
  return (data ?? []).map(rowToFunnel);
}

export async function upsertTrackingFunnel(
  companyId: string,
  funnel: { id?: string; label: string; color: string; pixelId: string | null; productParentIds: string[]; productNames: string[]; utmCampaigns: string[]; urlPatterns: string[] },
): Promise<TrackingFunnel> {
  if (!supabaseClient) throw new Error("Supabase não configurado.");
  const productParentIds = cleanFunnelList(funnel.productParentIds);
  const productNames = cleanFunnelList(funnel.productNames);
  const utmCampaigns = cleanFunnelList(funnel.utmCampaigns);
  const urlPatterns = cleanFunnelList(funnel.urlPatterns);
  if (productParentIds.length === 0 && productNames.length === 0 && utmCampaigns.length === 0 && urlPatterns.length === 0) {
    throw new Error("Adicione pelo menos 1 matcher ao funil.");
  }
  const payload: Record<string, unknown> = {
    company_id: companyId,
    label: (funnel.label.trim() || "Funil sem nome").slice(0, 80),
    color: cleanFunnelColor(funnel.color),
    pixel_id: funnel.pixelId || null,
    product_parent_ids: productParentIds,
    product_names: productNames,
    utm_campaigns: utmCampaigns,
    url_patterns: urlPatterns,
  };
  const query = funnel.id
    ? supabaseClient.from("tracking_funnels").update(payload).eq("id", funnel.id).eq("company_id", companyId)
    : supabaseClient.from("tracking_funnels").insert(payload);
  const result = await query
    .select("id, company_id, label, color, pixel_id, product_parent_ids, product_names, utm_campaigns, url_patterns, created_at")
    .single();
  let data = result.data as Record<string, unknown> | null;
  let error = result.error;
  if (error?.message?.includes("pixel_id") || error?.message?.includes("product_parent_ids")) {
    delete payload.pixel_id;
    delete payload.product_parent_ids;
    const retryQuery = funnel.id
      ? supabaseClient.from("tracking_funnels").update(payload).eq("id", funnel.id).eq("company_id", companyId)
      : supabaseClient.from("tracking_funnels").insert(payload);
    const retry = await retryQuery
      .select("id, company_id, label, color, product_names, utm_campaigns, url_patterns, created_at")
      .single();
    data = retry.data as Record<string, unknown> | null;
    error = retry.error;
  }
  if (error || !data) throw new Error(error?.message ?? "Erro ao salvar funil.");
  return rowToFunnel(data as Record<string, unknown>);
}

export async function deleteTrackingFunnel(id: string): Promise<void> {
  if (!supabaseClient) throw new Error("Supabase não configurado.");
  const { error } = await supabaseClient.from("tracking_funnels").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/** Valores distintos de utm_campaign já capturados nos eventos desta empresa. */
export async function fetchDistinctUtmCampaigns(companyId: string): Promise<string[]> {
  if (!supabaseClient) return [];
  const { data } = await supabaseClient
    .from("events_log")
    .select("utm_campaign")
    .eq("company_id", companyId)
    .not("utm_campaign", "is", null)
    .limit(500);
  const seen = new Set<string>();
  for (const row of data ?? []) {
    const v = (row as { utm_campaign: string | null }).utm_campaign;
    if (v) seen.add(v);
  }
  return [...seen].sort();
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
