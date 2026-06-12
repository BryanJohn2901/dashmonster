/**
 * supabaseProfiles.ts
 *
 * Funções de persistência para:
 *   • Perfis de anunciante  (tabela advertiser_profiles)
 *   • Token de acesso Meta  (tabela user_settings)
 *
 * Todas as operações são fire-and-forget do ponto de vista da UI —
 * localStorage continua sendo a fonte primária (rápida e offline-first),
 * o Supabase é o backup que restaura os dados em qualquer device.
 */

import { supabaseClient } from "@/lib/supabase";
import { getCompanyContext } from "@/hooks/useCompany";
import type { AdvertiserProfile } from "@/hooks/useAdvertiserStore";

// ─── Advertiser Profiles ──────────────────────────────────────────────────────

/**
 * Busca os perfis salvos no Supabase para o usuário autenticado.
 * Retorna [] se não houver dados ou se o usuário não estiver logado.
 */
export async function fetchProfilesFromDB(): Promise<AdvertiserProfile[]> {
  if (!supabaseClient) return [];
  // Filtra pelo user_id em nível de aplicação além do RLS — defesa em profundidade
  // para o caso em que a migration 016 ainda não foi aplicada ou o RLS está desabilitado.
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabaseClient
    .from("advertiser_profiles")
    .select("profiles")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error || !data) return [];
  return Array.isArray(data.profiles) ? (data.profiles as AdvertiserProfile[]) : [];
}

/**
 * Salva (upsert) todos os perfis do usuário no Supabase.
 * Fire-and-forget — não lança exceção para o chamador.
 */
export async function saveProfilesToDB(profiles: AdvertiserProfile[]): Promise<void> {
  if (!supabaseClient) return;
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) return;
  await supabaseClient
    .from("advertiser_profiles")
    .upsert(
      { user_id: user.id, profiles, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
}

// ─── Meta Access Token ────────────────────────────────────────────────────────
// Regra de ouro: o token é da EMPRESA. O dono configura uma vez e propaga
// para todos os membros — ninguém reconfigura ao acessar.
// Fallback user_settings cobre o período pré-migration 022.

/**
 * Busca o token Meta: primeiro o da empresa (compartilhado),
 * depois o legado por usuário. Retorna "" se não existir.
 */
export async function fetchMetaTokenFromDB(): Promise<string> {
  if (!supabaseClient) return "";

  const { company } = await getCompanyContext();
  if (company) {
    const { data, error } = await supabaseClient
      .from("companies")
      .select("meta_access_token")
      .eq("id", company.id)
      .maybeSingle();
    if (!error && data?.meta_access_token) return data.meta_access_token as string;
  }

  const { data, error } = await supabaseClient
    .from("user_settings")
    .select("meta_access_token")
    .maybeSingle();
  if (error || !data) return "";
  return (data.meta_access_token as string) ?? "";
}

/**
 * Salva o token Meta na empresa (RLS: só o owner consegue).
 * Se não houver empresa ou a escrita for bloqueada, cai no legado por usuário.
 * Fire-and-forget.
 */
export async function saveMetaTokenToDB(token: string): Promise<void> {
  if (!supabaseClient) return;
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) return;

  const { company } = await getCompanyContext();
  if (company) {
    const { error } = await supabaseClient
      .from("companies")
      .update({ meta_access_token: token })
      .eq("id", company.id);
    if (!error) return;
  }

  await supabaseClient
    .from("user_settings")
    .upsert(
      { user_id: user.id, meta_access_token: token, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
}
