// ─── Webhook do WhatsApp Cloud API (Meta) — mensagens inbound do inbox CRM ────
// Configurar em Meta App → WhatsApp → Configuration → Webhook:
//   Callback URL : https://<seu-dominio>/api/crm/webhook/whatsapp-cloud
//   Verify Token : valor de WHATSAPP_CLOUD_WEBHOOK_VERIFY_TOKEN
//   Campo        : messages
// A Meta manda UM webhook por App (não por número) — o roteamento pra empresa
// certa é feito pelo metadata.phone_number_id de cada payload.

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const VERIFY_TOKEN = process.env.WHATSAPP_CLOUD_WEBHOOK_VERIFY_TOKEN ?? "dashmonster_whatsapp_webhook_v1";

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const mode = sp.get("hub.mode");
  const token = sp.get("hub.verify_token");
  const challenge = sp.get("hub.challenge");
  if (mode === "subscribe" && token === VERIFY_TOKEN && challenge) {
    return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return NextResponse.json({ error: "Token inválido ou parâmetros ausentes." }, { status: 403 });
}

interface WhatsAppMessage {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  text?: { body: string };
}

interface WhatsAppValue {
  metadata?: { phone_number_id?: string };
  contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>;
  messages?: WhatsAppMessage[];
}

export async function POST(request: NextRequest) {
  let payload: { entry?: Array<{ changes?: Array<{ value?: WhatsAppValue }> }> };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }

  const db = supabaseAdmin();

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      const phoneNumberId = value?.metadata?.phone_number_id;
      const messages = value?.messages ?? [];
      if (!phoneNumberId || messages.length === 0) continue;

      const { data: channel } = await db
        .from("channel_connections")
        .select("id, company_id")
        .eq("provider", "whatsapp_cloud")
        .contains("external_config", { phoneNumberId })
        .maybeSingle();
      if (!channel) continue;

      for (const msg of messages) {
        if (msg.type !== "text" || !msg.text) continue; // outros tipos: fase futura

        const contactName = value?.contacts?.find((c) => c.wa_id === msg.from)?.profile?.name ?? null;

        const { data: conversation } = await db
          .from("conversations")
          .upsert(
            {
              company_id: channel.company_id, channel_connection_id: channel.id, provider: "whatsapp_cloud",
              provider_thread_id: msg.from, contact_handle: msg.from, contact_name: contactName,
              last_message_at: new Date(Number(msg.timestamp) * 1000).toISOString(),
              last_message_preview: msg.text.body.slice(0, 120),
            },
            { onConflict: "channel_connection_id,provider_thread_id", ignoreDuplicates: false },
          )
          .select("id, unread_count")
          .single();
        if (!conversation) continue;

        await db.from("messages").insert({
          conversation_id: conversation.id, company_id: channel.company_id, direction: "inbound",
          sender_type: "contact", provider_message_id: msg.id, content: msg.text.body,
          provider_timestamp: new Date(Number(msg.timestamp) * 1000).toISOString(),
        });
        await db.from("conversations").update({
          unread_count: (conversation.unread_count ?? 0) + 1,
          last_message_at: new Date(Number(msg.timestamp) * 1000).toISOString(),
          last_message_preview: msg.text.body.slice(0, 120),
        }).eq("id", conversation.id);
      }
    }
  }

  return NextResponse.json({ received: true });
}
