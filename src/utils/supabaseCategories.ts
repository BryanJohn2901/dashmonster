import { supabaseClient } from "@/lib/supabase";
import { getCompanyContext } from "@/hooks/useCompany";
import type { UserCategory, UserAccountEntry } from "@/types/userConfig";

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getCurrentUserId(): Promise<string | null> {
  if (!supabaseClient) return null;
  const { data } = await supabaseClient.auth.getUser();
  return data.user?.id ?? null;
}

/** company_id do usuário logado — null antes da migration 021 (fallback user-scoped). */
async function getCompanyId(): Promise<string | null> {
  const { company } = await getCompanyContext();
  return company?.id ?? null;
}

/** Converts a Supabase PostgrestError (plain object) to a real JS Error. */
function pgErr(e: { message?: string; details?: string; hint?: string; code?: string }): Error {
  const parts = [e.message, e.details, e.hint].filter(Boolean);
  return new Error(parts.join(" — ") || JSON.stringify(e));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToCategory(row: any): UserCategory {
  return {
    id:        row.id,
    userId:    row.user_id,
    slug:      row.slug,
    name:      row.name,
    type:      row.type as "fixed" | "custom",
    emoji:     row.emoji ?? null,
    position:  row.position,
    isEnabled: row.is_enabled,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToEntry(row: any): UserAccountEntry {
  const rawCamps = row.campaigns ?? [];
  const campaigns = Array.isArray(rawCamps)
    ? rawCamps.map((c: { id?: unknown; name?: string; status?: string }) => ({
        id:     String(c?.id ?? ""),
        name:   String(c?.name ?? ""),
        status: String(c?.status ?? ""),
      }))
    : [];
  const rawSel = row.selected_campaign_ids ?? [];
  const selectedCampaignIds = Array.isArray(rawSel) ? rawSel.map(String) : [];
  return {
    id:                   row.id,
    userId:               row.user_id,
    categoryId:           row.category_id,
    label:                row.label,
    adAccountId:          row.ad_account_id,
    internalFilter:       row.internal_filter ?? null,
    campaigns,
    selectedCampaignIds,
    isEnabled:            row.is_enabled,
  };
}

// ─── Categories ───────────────────────────────────────────────────────────────

export async function fetchUserCategories(): Promise<UserCategory[]> {
  if (!supabaseClient) return [];
  // Isolamento: filtra pela empresa ativa (super admin vê todas via RLS).
  const companyId = await getCompanyId();
  const base = supabaseClient.from("user_categories").select("*").order("position");
  const { data, error } = await (companyId ? base.eq("company_id", companyId) : base);
  if (error) throw pgErr(error);
  return (data ?? []).map(rowToCategory);
}

export async function upsertUserCategory(cat: {
  id?: string;
  slug: string;
  name: string;
  type?: "fixed" | "custom";
  emoji?: string | null;
  position?: number;
  isEnabled?: boolean;
}): Promise<UserCategory> {
  if (!supabaseClient) throw new Error("Supabase não configurado.");
  const userId = await getCurrentUserId();
  if (!userId) throw new Error("Usuário não autenticado.");
  const companyId = await getCompanyId();

  const payload: Record<string, unknown> = {
    user_id:    userId,
    slug:       cat.slug,
    name:       cat.name,
    type:       cat.type ?? "fixed",
    emoji:      cat.emoji ?? null,
    position:   cat.position ?? 0,
    is_enabled: cat.isEnabled ?? true,
  };
  if (companyId) payload.company_id = companyId;
  if (cat.id) payload.id = cat.id;

  const { data, error } = await supabaseClient
    .from("user_categories")
    .upsert(payload, { onConflict: companyId ? "company_id,slug" : "user_id,slug" })
    .select()
    .single();
  if (error) throw pgErr(error);
  return rowToCategory(data);
}

export async function deleteUserCategory(id: string): Promise<void> {
  if (!supabaseClient) throw new Error("Supabase não configurado.");
  const { error } = await supabaseClient
    .from("user_categories")
    .delete()
    .eq("id", id);
  if (error) throw pgErr(error);
}

// ─── Account Entries ─────────────────────────────────────────────────────────

export async function fetchUserAccountEntries(): Promise<UserAccountEntry[]> {
  if (!supabaseClient) return [];
  // Isolamento: filtra pela empresa ativa (super admin vê todas via RLS).
  const companyId = await getCompanyId();
  const base = supabaseClient.from("user_account_entries").select("*").order("created_at");
  const { data, error } = await (companyId ? base.eq("company_id", companyId) : base);
  if (error) throw pgErr(error);
  return (data ?? []).map(rowToEntry);
}

export async function upsertUserAccountEntry(entry: {
  id?: string;
  categoryId: string;
  label: string;
  adAccountId: string;
  internalFilter?: string | null;
  campaigns?: Array<{ id: string; name: string; status: string }>;
  selectedCampaignIds?: string[];
  isEnabled?: boolean;
}): Promise<UserAccountEntry> {
  if (!supabaseClient) throw new Error("Supabase não configurado.");
  const userId = await getCurrentUserId();
  if (!userId) throw new Error("Usuário não autenticado.");
  const companyId = await getCompanyId();

  const payload: Record<string, unknown> = {
    user_id:               userId,
    ...(companyId ? { company_id: companyId } : {}),
    category_id:           entry.categoryId,
    label:                 entry.label,
    ad_account_id:         entry.adAccountId,
    internal_filter:       entry.internalFilter ?? null,
    campaigns:             entry.campaigns ?? [],
    selected_campaign_ids: entry.selectedCampaignIds ?? [],
    is_enabled:            entry.isEnabled ?? true,
  };
  if (entry.id) payload.id = entry.id;

  const { data, error } = await supabaseClient
    .from("user_account_entries")
    .upsert(payload)
    .select()
    .single();
  if (error) throw pgErr(error);
  return rowToEntry(data);
}

export async function deleteUserAccountEntry(id: string): Promise<void> {
  if (!supabaseClient) throw new Error("Supabase não configurado.");
  const { error } = await supabaseClient
    .from("user_account_entries")
    .delete()
    .eq("id", id);
  if (error) throw pgErr(error);
}

// ─── Realtime ─────────────────────────────────────────────────────────────────

/**
 * Assina mudanças em user_categories e user_account_entries.
 * Qualquer alteração (deste ou de outro usuário da empresa) dispara onChange —
 * o dashboard refaz o fetch e atualiza sem refresh manual.
 * Retorna função de unsubscribe.
 */
export function subscribeUserConfig(onChange: () => void, channelName = "user-config-realtime"): () => void {
  if (!supabaseClient) return () => {};
  const channel = supabaseClient
    .channel(channelName)
    .on("postgres_changes",
      { event: "*", schema: "public", table: "user_categories" }, onChange)
    .on("postgres_changes",
      { event: "*", schema: "public", table: "user_account_entries" }, onChange)
    .subscribe();
  return () => { void supabaseClient?.removeChannel(channel); };
}
