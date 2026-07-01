import { supabaseClient } from "@/lib/supabase";
import { getCompanyContext } from "@/hooks/useCompany";
import { ProductData } from "@/types/product";

// ─── Products ─────────────────────────────────────────────────────────────────

export async function fetchProducts(): Promise<ProductData[]> {
  if (!supabaseClient) return [];
  // Isolamento: filtra pela empresa ativa (super admin vê todas via RLS).
  const { company } = await getCompanyContext();
  const base = supabaseClient.from("products").select("data").order("created_at", { ascending: false });
  const { data, error } = await (company ? base.eq("company_id", company.id) : base);
  if (error) throw error;
  return (data ?? []).map((row) => row.data as ProductData);
}

export async function upsertProduct(p: ProductData): Promise<void> {
  if (!supabaseClient) return;
  const userId = (await supabaseClient.auth.getUser()).data.user?.id;
  if (!userId) return;
  const { company } = await getCompanyContext();
  const { error } = await supabaseClient.from("products").upsert(
    {
      id: p.id, user_id: userId, type: p.type, data: p,
      updated_at: new Date().toISOString(),
      ...(company ? { company_id: company.id } : {}),
    },
    { onConflict: "id" },
  );
  if (error) throw error;
}

export async function deleteProductRemote(id: string): Promise<void> {
  if (!supabaseClient) return;
  const { error } = await supabaseClient.from("products").delete().eq("id", id);
  if (error) throw error;
}

// ─── Custom tags ──────────────────────────────────────────────────────────────

// Tipo canônico (inclui kinds custom por empresa). Tags existem para qualquer kind.
export type { HistoricalKind } from "@/types/historical";
import type { HistoricalKind } from "@/types/historical";

export async function fetchUserTags(): Promise<Record<HistoricalKind, string[]>> {
  const empty: Record<HistoricalKind, string[]> = {
    lancamento: [], evento: [], perpetuo: [], instagram: [],
  };
  if (!supabaseClient) return empty;
  const { company } = await getCompanyContext();
  const base = supabaseClient.from("user_tags").select("kind, name").order("created_at", { ascending: true });
  const { data, error } = await (company ? base.eq("company_id", company.id) : base);
  if (error) return empty;
  const result = { ...empty };
  for (const row of data ?? []) {
    const kind = row.kind as HistoricalKind;
    if (result[kind]) result[kind].push(row.name as string);
  }
  return result;
}

export async function addUserTag(kind: HistoricalKind, name: string): Promise<void> {
  if (!supabaseClient) return;
  const userId = (await supabaseClient.auth.getUser()).data.user?.id;
  if (!userId) return;
  const { company } = await getCompanyContext();
  const { error } = await supabaseClient
    .from("user_tags")
    .insert({ user_id: userId, kind, name, ...(company ? { company_id: company.id } : {}) });
  if (error) throw new Error(error.message);
}

export async function deleteUserTag(kind: HistoricalKind, name: string): Promise<void> {
  if (!supabaseClient) return;
  const userId = (await supabaseClient.auth.getUser()).data.user?.id;
  if (!userId) return;
  const { error } = await supabaseClient
    .from("user_tags")
    .delete()
    .eq("user_id", userId)
    .eq("kind", kind)
    .eq("name", name);
  if (error) throw new Error(error.message);
}
