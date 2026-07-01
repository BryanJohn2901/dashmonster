"use client";

import { supabaseClient } from "@/lib/supabase";

// ─── fetch autenticado para as rotas /api ──────────────────────────────────────
// Manda o access_token da sessão Supabase no header Authorization: Bearer — as
// rotas validam com requireAuth/requireCompanyAccess (src/lib/trackingAuth.ts).
// Assim as rotas deixam de ser proxies abertos.

export async function authedFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  try {
    const { data } = (await supabaseClient?.auth.getSession()) ?? { data: { session: null } };
    const token = data?.session?.access_token;
    if (token) headers.set("Authorization", `Bearer ${token}`);
  } catch { /* sem sessão → rota responde 401 */ }
  return fetch(input, { ...init, headers });
}

// Igual ao authedFetch, mas injeta o token Meta num HEADER (x-meta-token) em vez
// de query string — mantém o token fora de logs de servidor/CDN, histórico e referer.
export async function metaFetch(
  input: string,
  metaToken: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (metaToken) headers.set("x-meta-token", metaToken);
  return authedFetch(input, { ...init, headers });
}
