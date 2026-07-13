// ─── Disparo de webhooks de saída (deal.*/lead.*) ─────────────────────────────
// Server-only: assina HMAC-SHA256 com o secret whsec_... de cada assinatura e
// entrega + loga em webhook_delivery_logs. Chamado por /api/crm/webhooks/dispatch
// (disparado pelo cliente após uma mutação) e pelo webhook de entrada público.

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

async function hmacSha256Hex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function dispatchCrmWebhooks(
  db: SupabaseClient,
  companyId: string,
  event: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const { data: subs } = await db
    .from("webhook_subscriptions")
    .select("id, url, secret, events")
    .eq("company_id", companyId)
    .eq("is_active", true);

  const targets = (subs ?? []).filter((s) => (s.events as string[])?.includes(event));
  if (targets.length === 0) return;

  const body = JSON.stringify({ event, data: payload, sent_at: new Date().toISOString() });

  await Promise.all(
    targets.map(async (sub) => {
      const signature = await hmacSha256Hex(sub.secret as string, body);
      let status: number | null = null;
      let errorMessage: string | null = null;
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(sub.url as string, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-PipeFlow-Signature": `sha256=${signature}` },
          body,
          signal: controller.signal,
        }).finally(() => clearTimeout(timeout));
        status = res.status;
      } catch (e) {
        errorMessage = e instanceof Error ? e.message : "Falha na entrega";
      }

      await Promise.all([
        db.from("webhook_delivery_logs").insert({
          webhook_id: sub.id, event_type: event, payload, response_status: status, error_message: errorMessage,
        }),
        db.from("webhook_subscriptions").update({
          last_triggered_at: new Date().toISOString(), last_status_code: status,
        }).eq("id", sub.id as string),
      ]);
    }),
  );
}
