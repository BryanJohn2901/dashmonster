import { supabaseClient } from "@/lib/supabase";
import { getCompanyContext } from "@/hooks/useCompany";

export interface SupabaseCreative {
  campaign_name: string;
  ad_account_id: string;
  meta_url:      string;
  storage_url:   string;
  ad_link:       string;
  notes:         string;
  starred:       boolean;
  starred_at:    string | null;
  saved_at:      string;
}

export async function fetchSupabaseCreatives(): Promise<SupabaseCreative[]> {
  if (!supabaseClient) return [];
  // Isolamento: filtra pela empresa ativa (super admin vê todas via RLS).
  const { company } = await getCompanyContext();
  const base = supabaseClient
    .from("campaign_creatives")
    .select("campaign_name,ad_account_id,meta_url,storage_url,ad_link,notes,starred,starred_at,saved_at")
    .order("saved_at", { ascending: false });
  const { data, error } = await (company ? base.eq("company_id", company.id) : base);
  if (error) return [];
  return (data ?? []) as SupabaseCreative[];
}

export async function saveCreativeToSupabase(
  thumbnailUrl: string,
  campaignName: string,
  adAccountId: string,
  adLink: string,
): Promise<string> {
  const res = await fetch("/api/save-creative", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ thumbnailUrl, campaignName, adAccountId, adLink }),
  });
  const body = await res.json() as { storageUrl?: string; error?: string };
  if (!res.ok || !body.storageUrl) {
    throw new Error(body.error ?? `Erro ${res.status}`);
  }
  return body.storageUrl;
}

export async function updateCreativeMetaInDb(
  campaignName: string,
  fields: Partial<{ notes: string; starred: boolean; starred_at: string | null; ad_link: string }>,
): Promise<void> {
  if (!supabaseClient) return;
  await supabaseClient
    .from("campaign_creatives")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("campaign_name", campaignName);
}
