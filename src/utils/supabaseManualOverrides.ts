import { supabaseClient } from "@/lib/supabase";

// ─── Tipos ────────────────────────────────────────────────────────────────────
export interface ManualOverrideFields {
  salesTotal?:    number;
  salesIngresso?: number;
  salesPos?:      number;
  tickets?:       number;
  revenue?:       number;
  note?:          string;
}

/** Chave de contexto: `${groupId}::${campaignId}`. */
export function overrideKey(groupId: string, campaignId: string): string {
  return `${groupId}::${campaignId}`;
}

export function parseOverrideKey(key: string): { groupId: string; campaignId: string } {
  const idx = key.indexOf("::");
  if (idx === -1) return { groupId: "all", campaignId: key };
  return { groupId: key.slice(0, idx), campaignId: key.slice(idx + 2) };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
async function getCurrentUserId(): Promise<string | null> {
  if (!supabaseClient) return null;
  const { data } = await supabaseClient.auth.getUser();
  return data.user?.id ?? null;
}

function pgErr(e: { message?: string; details?: string; hint?: string; code?: string }): Error {
  const parts = [e.message, e.details, e.hint].filter(Boolean);
  return new Error(parts.join(" — ") || JSON.stringify(e));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToFields(row: any): ManualOverrideFields {
  return {
    salesTotal:    Number(row.sales_total)    || 0,
    salesIngresso: Number(row.sales_ingresso) || 0,
    salesPos:      Number(row.sales_pos)      || 0,
    tickets:       Number(row.tickets)        || 0,
    revenue:       Number(row.revenue)        || 0,
    note:          row.note ?? undefined,
  };
}

// ─── API ────────────────────────────────────────────────────────────────────

/** Carrega todos os overrides do usuário logado, indexados por chave de contexto. */
export async function fetchManualOverrides(): Promise<Record<string, ManualOverrideFields>> {
  if (!supabaseClient) return {};
  const { data, error } = await supabaseClient
    .from("user_manual_overrides")
    .select("*");
  if (error) throw pgErr(error);
  const out: Record<string, ManualOverrideFields> = {};
  for (const row of data ?? []) {
    out[overrideKey(row.group_id as string, row.campaign_id as string)] = rowToFields(row);
  }
  return out;
}

/** Upsert do override de um contexto (grupo+campanha). Mescla com o existente. */
export async function upsertManualOverride(
  groupId: string,
  campaignId: string,
  patch: ManualOverrideFields,
): Promise<void> {
  if (!supabaseClient) throw new Error("Supabase não configurado.");
  const userId = await getCurrentUserId();
  if (!userId) throw new Error("Usuário não autenticado.");

  const payload: Record<string, unknown> = {
    user_id:     userId,
    group_id:    groupId,
    campaign_id: campaignId,
    updated_at:  new Date().toISOString(),
  };
  if (patch.salesTotal    !== undefined) payload.sales_total    = patch.salesTotal;
  if (patch.salesIngresso !== undefined) payload.sales_ingresso = patch.salesIngresso;
  if (patch.salesPos      !== undefined) payload.sales_pos      = patch.salesPos;
  if (patch.tickets       !== undefined) payload.tickets        = patch.tickets;
  if (patch.revenue       !== undefined) payload.revenue        = patch.revenue;
  if (patch.note          !== undefined) payload.note           = patch.note;

  const { error } = await supabaseClient
    .from("user_manual_overrides")
    .upsert(payload, { onConflict: "user_id,group_id,campaign_id" });
  if (error) throw pgErr(error);
}

/** Remove o override de um contexto. */
export async function deleteManualOverride(groupId: string, campaignId: string): Promise<void> {
  if (!supabaseClient) throw new Error("Supabase não configurado.");
  const userId = await getCurrentUserId();
  if (!userId) return;
  const { error } = await supabaseClient
    .from("user_manual_overrides")
    .delete()
    .eq("user_id", userId)
    .eq("group_id", groupId)
    .eq("campaign_id", campaignId);
  if (error) throw pgErr(error);
}
