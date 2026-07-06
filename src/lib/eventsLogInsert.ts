import type { SupabaseClient } from "@supabase/supabase-js";

// Colunas adicionadas em migrations recentes, agrupadas por migration —
// como o deploy do código (git push) é automático mas a migration é rodada
// manualmente no Supabase, sempre existe uma janela onde o código já espera
// uma coluna que o banco ainda não tem. Em vez de perder o evento, insertEventsLogRow
// detecta a coluna ausente pela mensagem de erro do Postgres e regrava sem o
// grupo inteiro daquela migration, tentando de novo.
// Compartilhado entre track-event/route.ts (pixel) e eduzz/webhook/route.ts
// (venda) — os dois inserem em events_log e têm a mesma janela de risco.
const OPTIONAL_COLUMN_GROUPS: string[][] = [
  ["page_title", "extra_fields"], // migration 033
  ["country", "country_region", "city"], // migration 034
  ["event_id"], // migration 036
  ["pixel_id"], // migration 037
  ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "utm_placement", "utm_campaign_id", "utm_adset_id", "utm_ad_id"], // migration 038
  ["lead_name", "postal_code", "latitude", "longitude", "device_type"], // migration 039
  ["value", "currency", "external_transaction_id", "source", "payment_method", "fbp", "fbc"], // migration 040
  ["recurrence_key"], // migration 042
  ["installments"], // migration 043
  ["product_name"], // migration 044
  ["is_order_bump", "main_sale_transaction_id"], // migration 046
  ["client_ip_address", "client_user_agent"], // migration 047
  ["product_parent_id"], // migration 048
  ["product_item_id"], // migration 049
  ["total_installments_raw", "contract_unlimited_installments"], // migration 051
  ["installment_number"], // migration 053
  ["installment_value"], // migration 054
  ["via"], // migration 057
  ["sale_confirmed"], // migration 064
  ["items"], // migration 073
];

export async function insertEventsLogRow(db: SupabaseClient, fullRow: Record<string, unknown>) {
  const candidate = { ...fullRow };
  let result = await db.from("events_log").insert(candidate).select("id").single();

  for (const group of OPTIONAL_COLUMN_GROUPS) {
    if (!result.error) break;
    const missing = group.some((col) => col in candidate && result.error?.message?.includes(col));
    if (!missing) continue;
    console.warn(`[tracking] colunas ${group.join("/")} ausentes (migration pendente), gravando sem elas`);
    for (const col of group) delete candidate[col];
    result = await db.from("events_log").insert(candidate).select("id").single();
  }

  return result;
}
