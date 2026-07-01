import { supabaseClient } from "@/lib/supabase";
import { getCompanyContext } from "@/hooks/useCompany";
import { authedFetch, metaFetch } from "@/lib/authedFetch";
import type { IGTrackedAccount, IGHistoryPoint } from "@/app/api/instagram/history/route";

export type { IGTrackedAccount, IGHistoryPoint };

function client() {
  if (!supabaseClient) throw new Error("Supabase não configurado.");
  return supabaseClient;
}

// ─── Account list ─────────────────────────────────────────────────────────────

export async function fetchTrackedAccounts(): Promise<IGTrackedAccount[]> {
  // Isolamento: filtra pela empresa ativa (super admin vê todas via RLS).
  const { company } = await getCompanyContext();
  const base = client()
    .from("instagram_accounts")
    .select("id, instagram_business_account_id, username, name, biography, profile_picture_url, followers_count, follows_count, media_count, is_verified, engagement_rate, is_favorite, group_id, updated_at")
    .order("followers_count", { ascending: false });
  const { data, error } = await (company ? base.eq("company_id", company.id) : base);

  if (error) throw new Error(`Erro ao buscar contas: ${error.message}`);

  return (data ?? []).map((raw: Record<string, unknown>) => ({
    id:                         raw.id as string,
    instagramBusinessAccountId: raw.instagram_business_account_id as string,
    username:                   raw.username as string,
    name:                       raw.name as string,
    biography:                  raw.biography as string,
    profilePictureUrl:          raw.profile_picture_url as string | null,
    followersCount:             Number(raw.followers_count),
    followsCount:               Number(raw.follows_count),
    mediaCount:                 Number(raw.media_count),
    isVerified:                 Boolean(raw.is_verified),
    engagementRate:             Number(raw.engagement_rate),
    isFavorite:                 Boolean(raw.is_favorite),
    groupId:                    raw.group_id as string | null,
    updatedAt:                  raw.updated_at as string,
  }));
}

export async function getAccountByIBAId(ibaId: string): Promise<IGTrackedAccount | null> {
  const { company } = await getCompanyContext();
  const base = client()
    .from("instagram_accounts")
    .select("id, instagram_business_account_id, username, name, biography, profile_picture_url, followers_count, follows_count, media_count, is_verified, engagement_rate, is_favorite, group_id, updated_at")
    .eq("instagram_business_account_id", ibaId);
  const { data, error } = await (company ? base.eq("company_id", company.id) : base).maybeSingle();

  if (error) throw new Error(`Erro ao buscar conta: ${error.message}`);
  if (!data) return null;

  const raw = data as Record<string, unknown>;
  return {
    id:                         raw.id as string,
    instagramBusinessAccountId: raw.instagram_business_account_id as string,
    username:                   raw.username as string,
    name:                       raw.name as string,
    biography:                  raw.biography as string,
    profilePictureUrl:          raw.profile_picture_url as string | null,
    followersCount:             Number(raw.followers_count),
    followsCount:               Number(raw.follows_count),
    mediaCount:                 Number(raw.media_count),
    isVerified:                 Boolean(raw.is_verified),
    engagementRate:             Number(raw.engagement_rate),
    isFavorite:                 Boolean(raw.is_favorite),
    groupId:                    raw.group_id as string | null,
    updatedAt:                  raw.updated_at as string,
  };
}

export async function deleteTrackedAccount(accountId: string): Promise<void> {
  const { error } = await client()
    .from("instagram_accounts")
    .delete()
    .eq("id", accountId);
  if (error) throw new Error(`Erro ao remover conta: ${error.message}`);
}

// ─── Account mutations ────────────────────────────────────────────────────────

export async function toggleFavorite(accountId: string, isFavorite: boolean): Promise<void> {
  const { error } = await client()
    .from("instagram_accounts")
    .update({ is_favorite: isFavorite })
    .eq("id", accountId);
  if (error) throw new Error(`Erro ao atualizar favorito: ${error.message}`);
}

export async function moveToGroup(accountId: string, groupId: string | null): Promise<void> {
  const { error } = await client()
    .from("instagram_accounts")
    .update({ group_id: groupId })
    .eq("id", accountId);
  if (error) throw new Error(`Erro ao mover para grupo: ${error.message}`);
}

// ─── History ──────────────────────────────────────────────────────────────────

export async function fetchAccountHistory(
  accountId: string,
  dateFrom?: string,
  dateTo?: string,
): Promise<IGHistoryPoint[]> {
  const today      = new Date().toISOString().split("T")[0]!;
  const defaultFrom = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0]!;

  const query = client()
    .from("instagram_account_history")
    .select("date, followers_count, following_count, media_count, daily_followers_gained, daily_unfollows, profile_views, reach, impressions, engagement_rate")
    .eq("account_id", accountId)
    .gte("date", dateFrom ?? defaultFrom)
    .lte("date", dateTo   ?? today)
    .order("date", { ascending: true });

  const { data, error } = await query;
  if (error) throw new Error(`Erro ao buscar histórico: ${error.message}`);

  return (data ?? []).map((r: Record<string, unknown>) => ({
    date:                 r.date as string,
    followersCount:       Number(r.followers_count),
    followingCount:       Number(r.following_count),
    mediaCount:           Number(r.media_count),
    dailyFollowersGained: Number(r.daily_followers_gained),
    dailyUnfollows:       Number(r.daily_unfollows),
    profileViews:         Number(r.profile_views),
    reach:                Number(r.reach),
    impressions:          Number(r.impressions),
    engagementRate:       Number(r.engagement_rate),
  }));
}

// ─── Groups ───────────────────────────────────────────────────────────────────

export interface IGGroup {
  id: string;
  name: string;
  description: string;
  createdAt: string;
}

export async function fetchGroups(): Promise<IGGroup[]> {
  const { company } = await getCompanyContext();
  const base = client()
    .from("instagram_groups")
    .select("id, name, description, created_at")
    .order("name", { ascending: true });
  const { data, error } = await (company ? base.eq("company_id", company.id) : base);

  if (error) throw new Error(`Erro ao buscar grupos: ${error.message}`);
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id:          r.id as string,
    name:        r.name as string,
    description: r.description as string,
    createdAt:   r.created_at as string,
  }));
}

export async function createGroup(name: string, description = ""): Promise<IGGroup> {
  const { company } = await getCompanyContext();
  const { data, error } = await client()
    .from("instagram_groups")
    .insert({ name, description, ...(company ? { company_id: company.id } : {}) })
    .select()
    .single();

  if (error) throw new Error(`Erro ao criar grupo: ${error.message}`);
  const r = data as Record<string, unknown>;
  return { id: r.id as string, name: r.name as string, description: r.description as string, createdAt: r.created_at as string };
}

export async function deleteGroup(groupId: string): Promise<void> {
  const { error } = await client()
    .from("instagram_groups")
    .delete()
    .eq("id", groupId);
  if (error) throw new Error(`Erro ao remover grupo: ${error.message}`);
}

// ─── API helpers (client → route calls) ──────────────────────────────────────

/** Registers an account for tracking + backfills 30 days of history */
export async function registerAccount(ibaId: string, accessToken: string) {
  const { company } = await getCompanyContext();
  const res = await authedFetch("/api/instagram/accounts/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ instagramBusinessAccountId: ibaId, accessToken, companyId: company?.id }),
  });
  if (!res.ok) {
    const err = await res.json() as { error?: string };
    throw new Error(err.error ?? "Erro ao registrar conta.");
  }
  return res.json() as Promise<{ account: { id: string; username: string }; daysBackfilled: number }>;
}

/** Forces immediate sync of a tracked account */
export async function refreshAccount(accountId: string) {
  const res = await authedFetch("/api/instagram/accounts/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accountId }),
  });
  if (!res.ok) {
    const err = await res.json() as { error?: string };
    throw new Error(err.error ?? "Erro ao sincronizar conta.");
  }
  return res.json() as Promise<{ date: string; followersCount: number; dailyGained: number }>;
}

/** Looks up Instagram Business Account ID by @username */
export async function lookupByUsername(username: string, accessToken: string) {
  const params = new URLSearchParams({ username });
  const res = await metaFetch(`/api/instagram/accounts/lookup?${params}`, accessToken);
  if (!res.ok) {
    const err = await res.json() as { error?: string };
    throw new Error(err.error ?? "Conta não encontrada.");
  }
  return res.json() as Promise<{
    id: string;
    username: string;
    name: string;
    followersCount: number;
    profilePictureUrl?: string;
    biography?: string;
  }>;
}
