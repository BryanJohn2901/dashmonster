import type { SupabaseClient } from "@supabase/supabase-js";

// v23.0 — a Meta bloqueia versões abaixo de v22.0 desde set/2025 (cada versão
// tem ~2 anos de vida). Subir junto quando uma nova virar a estável recomendada.
const META_API_VERSION = "v23.0";

// POST genérico pra Meta Conversions API + atualização de capi_status/capi_error
// na linha de events_log correspondente — mecânica idêntica entre track-event
// (evento do pixel) e eduzz/webhook (Purchase de venda), só o conteúdo de
// `eventData` (user_data/custom_data/action_source) muda entre os dois.
// Nunca lança — falha de rede/Meta sempre vira capi_status="failed", nunca
// derruba quem chamou (pixel precisa de resposta rápida, webhook da Eduzz
// precisa responder 200 pra não entrar em retry-loop da Eduzz).
export async function sendMetaCapiEvent(
  db: SupabaseClient,
  args: {
    metaPixelId: string;
    metaCapiToken: string;
    testEventCode?: string | null;
    eventData: Record<string, unknown>;
    eventLogId: string;
  },
): Promise<void> {
  try {
    const capiPayload = {
      data: [args.eventData],
      // Só presente durante teste manual (Events Manager → Eventos de teste);
      // por design da própria Meta, deve ser removido depois de validar.
      ...(args.testEventCode ? { test_event_code: args.testEventCode } : {}),
    };

    const capiUrl = `https://graph.facebook.com/${META_API_VERSION}/${args.metaPixelId}/events?access_token=${args.metaCapiToken}`;
    const capiRes = await fetch(capiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(capiPayload),
    });
    const capiJson = (await capiRes.json()) as { error?: { message?: string } };

    await db
      .from("events_log")
      .update(
        capiRes.ok && !capiJson.error
          ? { capi_status: "sent" }
          : { capi_status: "failed", capi_error: capiJson.error?.message ?? `HTTP ${capiRes.status}` },
      )
      .eq("id", args.eventLogId);
  } catch (err) {
    await db
      .from("events_log")
      .update({
        capi_status: "failed",
        capi_error: err instanceof Error ? err.message : "Erro desconhecido",
      })
      .eq("id", args.eventLogId);
  }
}
