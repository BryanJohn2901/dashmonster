import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// ─── Cliente Supabase server-side com service_role ────────────────────────────
// Usar APENAS em route handlers (servidor). Ignora RLS — necessário para
// gravar/ler instagram_accounts.access_token, que é negado ao role anon.
// NUNCA importar isto em código client-side.

let cached: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Supabase service_role não configurado (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).",
    );
  }

  cached = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
