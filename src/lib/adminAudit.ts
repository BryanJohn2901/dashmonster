"use client";

// ─── Auditoria do Painel Admin: logins, usuários globais, último acesso ────────
// Leitura direta com RLS de super admin (migrations 026/074). Sem Supabase
// (preview/demo) devolve dados de exemplo pra tela ser demonstrável.

import { supabaseClient } from "@/lib/supabase";
import { isDevModeActive } from "@/hooks/useDevMode";
import { authedFetch } from "@/lib/authedFetch";

export interface LoginEvent {
  id: string;
  userId: string;
  email: string;
  ip: string | null;
  userAgent: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  timezone: string | null;
  createdAt: string;
}

export interface GlobalMember {
  userId: string;
  email: string;
  /** [{ companyName, role }] — um usuário pode estar em N empresas. */
  companies: { companyId: string; companyName: string; role: string }[];
  lastLogin: LoginEvent | null;
  memberSince: string;
}

/** Ativo = logou nos últimos 30 dias. */
export function isActiveMember(m: GlobalMember): boolean {
  if (!m.lastLogin) return false;
  return Date.now() - new Date(m.lastLogin.createdAt).getTime() < 30 * 24 * 60 * 60 * 1000;
}

/** "Chrome · Windows" a partir do user-agent — o suficiente pro painel. */
export function parseUserAgent(ua: string | null): string {
  if (!ua) return "—";
  const browser =
    /Edg\//.test(ua) ? "Edge" :
    /OPR\//.test(ua) ? "Opera" :
    /Chrome\//.test(ua) ? "Chrome" :
    /Firefox\//.test(ua) ? "Firefox" :
    /Safari\//.test(ua) ? "Safari" : "Navegador";
  const os =
    /Windows/.test(ua) ? "Windows" :
    /Android/.test(ua) ? "Android" :
    /iPhone|iPad|iOS/.test(ua) ? "iOS" :
    /Mac OS X|Macintosh/.test(ua) ? "macOS" :
    /Linux/.test(ua) ? "Linux" : "?";
  return `${browser} · ${os}`;
}

export function formatLocation(e: LoginEvent | null): string {
  if (!e) return "—";
  const parts = [e.city, e.region, e.country].filter(Boolean);
  if (parts.length > 0) return parts.join(", ");
  return e.timezone ?? "—";
}

// ─── Demo ───────────────────────────────────────────────────────────────────

const DEMO_UA = {
  win: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0",
  mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) Safari/605.1.15",
  android: "Mozilla/5.0 (Linux; Android 14) Chrome/126.0 Mobile",
};

function demoEvents(): LoginEvent[] {
  const h = (n: number) => new Date(Date.now() - n * 3600_000).toISOString();
  return [
    { id: "e1", userId: "u1", email: "dono@ptacademy.com",   ip: "187.55.10.2",  userAgent: DEMO_UA.win,     city: "São Paulo",      region: "SP", country: "BR", timezone: "America/Sao_Paulo", createdAt: h(2) },
    { id: "e2", userId: "u2", email: "gestor@ptacademy.com", ip: "191.33.200.8", userAgent: DEMO_UA.mac,     city: "Curitiba",       region: "PR", country: "BR", timezone: "America/Sao_Paulo", createdAt: h(28) },
    { id: "e3", userId: "u1", email: "dono@ptacademy.com",   ip: "187.55.10.2",  userAgent: DEMO_UA.android, city: "São Paulo",      region: "SP", country: "BR", timezone: "America/Sao_Paulo", createdAt: h(50) },
    { id: "e4", userId: "u3", email: "social@ptacademy.com", ip: "45.170.4.77",  userAgent: DEMO_UA.win,     city: "Belo Horizonte", region: "MG", country: "BR", timezone: "America/Sao_Paulo", createdAt: h(24 * 41) },
  ];
}

function demoMembers(): GlobalMember[] {
  const ev = demoEvents();
  const d = (n: number) => new Date(Date.now() - n * 24 * 3600_000).toISOString();
  return [
    { userId: "u1", email: "dono@ptacademy.com",   companies: [{ companyId: "demo-1", companyName: "Personal Trainer Academy (Demo)", role: "owner" }],   lastLogin: ev[0], memberSince: d(220) },
    { userId: "u2", email: "gestor@ptacademy.com", companies: [{ companyId: "demo-1", companyName: "Personal Trainer Academy (Demo)", role: "manager" }, { companyId: "demo-2", companyName: "Loja Fitness Online (Demo)", role: "manager" }], lastLogin: ev[1], memberSince: d(140) },
    { userId: "u3", email: "social@ptacademy.com", companies: [{ companyId: "demo-1", companyName: "Personal Trainer Academy (Demo)", role: "viewer" }],  lastLogin: ev[3], memberSince: d(90) },
    { userId: "u4", email: "novo@loja.com",        companies: [{ companyId: "demo-2", companyName: "Loja Fitness Online (Demo)", role: "viewer" }],       lastLogin: null,  memberSince: d(3) },
  ];
}

// ─── Gestão de usuários (rota /api/admin/users, service role) ────────────────

export interface AdminUserDetail {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  bannedUntil: string | null;
}

export type BanDuration = "24h" | "168h" | "876000h" | "none";

export async function fetchAdminUser(userId: string): Promise<AdminUserDetail> {
  const res = await authedFetch(`/api/admin/users?userId=${encodeURIComponent(userId)}`);
  const body = (await res.json()) as AdminUserDetail & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `Erro ${res.status}`);
  return body;
}

export async function updateAdminUser(input: {
  userId: string; name?: string; email?: string; avatarUrl?: string; ban?: BanDuration;
}): Promise<void> {
  const res = await authedFetch("/api/admin/users", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Erro ${res.status}`);
  }
}

/** Banido = banned_until no futuro. */
export function isBanned(bannedUntil: string | null): boolean {
  return !!bannedUntil && new Date(bannedUntil).getTime() > Date.now();
}

/** Vira super admin com a senha mestra (env SUPER_ADMIN_ACTIVATION_PASSWORD). */
export async function activateSuperAdmin(password: string): Promise<void> {
  const res = await authedFetch("/api/admin/activate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Erro ${res.status}`);
  }
}

// ─── Real ───────────────────────────────────────────────────────────────────

export async function fetchLoginEvents(limit = 100): Promise<LoginEvent[]> {
  if (!supabaseClient) return isDevModeActive() ? demoEvents() : [];
  const { data, error } = await supabaseClient
    .from("login_events")
    .select("id, user_id, email, ip, user_agent, city, region, country, timezone, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id, userId: r.user_id, email: r.email, ip: r.ip, userAgent: r.user_agent,
    city: r.city, region: r.region, country: r.country, timezone: r.timezone, createdAt: r.created_at,
  }));
}

export async function fetchGlobalMembers(): Promise<GlobalMember[]> {
  if (!supabaseClient) return isDevModeActive() ? demoMembers() : [];

  const [membersRes, companiesRes, events] = await Promise.all([
    supabaseClient.from("company_members").select("user_id, email, role, company_id, created_at"),
    supabaseClient.from("companies").select("id, name"),
    fetchLoginEvents(500).catch(() => [] as LoginEvent[]),
  ]);
  if (membersRes.error) throw new Error(membersRes.error.message);

  const companyName = new Map((companiesRes.data ?? []).map((c) => [c.id as string, c.name as string]));
  const lastByUser = new Map<string, LoginEvent>();
  for (const e of events) if (!lastByUser.has(e.userId)) lastByUser.set(e.userId, e); // já vem desc

  const byUser = new Map<string, GlobalMember>();
  for (const r of membersRes.data ?? []) {
    const uid = r.user_id as string;
    const existing = byUser.get(uid);
    const entry = {
      companyId: r.company_id as string,
      companyName: companyName.get(r.company_id as string) ?? "—",
      role: r.role as string,
    };
    if (existing) {
      existing.companies.push(entry);
      if ((r.created_at as string) < existing.memberSince) existing.memberSince = r.created_at as string;
    } else {
      byUser.set(uid, {
        userId: uid,
        email: (r.email as string) ?? "—",
        companies: [entry],
        lastLogin: lastByUser.get(uid) ?? null,
        memberSince: r.created_at as string,
      });
    }
  }
  return Array.from(byUser.values()).sort((a, b) =>
    (b.lastLogin?.createdAt ?? "").localeCompare(a.lastLogin?.createdAt ?? ""));
}
