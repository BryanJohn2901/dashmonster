// ─── Disparo real da mensagem pelo provedor (WhatsApp Cloud / Instagram DM) ───
// sendMessage() em crmSupabase.ts já gravou a linha outbound no banco
// (otimista, pra UI atualizar na hora). Esta rota faz a chamada HTTP real na
// Graph API usando o token cifrado da conexão e atualiza status/erro.

import { NextRequest, NextResponse } from "next/server";
import { requireCompanyAccess } from "@/lib/trackingAuth";
import { decryptToken } from "@/lib/crypto";
import { GRAPH_BASE } from "@/lib/meta";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let body: { companyId?: string; messageId?: string; conversationId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }

  const auth = await requireCompanyAccess(request, { companyId: body.companyId, write: true });
  if (!auth.ok) return auth.response;
  if (!body.messageId || !body.conversationId) {
    return NextResponse.json({ error: "messageId e conversationId são obrigatórios." }, { status: 400 });
  }

  const { data: message } = await auth.db.from("messages").select("id, content")
    .eq("id", body.messageId).eq("company_id", auth.companyId).maybeSingle();
  const { data: conversation } = await auth.db.from("conversations")
    .select("id, channel_connection_id, contact_handle, provider_thread_id")
    .eq("id", body.conversationId).eq("company_id", auth.companyId).maybeSingle();
  if (!message || !conversation) return NextResponse.json({ error: "Mensagem ou conversa não encontrada." }, { status: 404 });

  const { data: channel } = await auth.db.from("channel_connections")
    .select("provider, access_token, external_config").eq("id", conversation.channel_connection_id).maybeSingle();
  if (!channel) return NextResponse.json({ error: "Canal desconectado." }, { status: 422 });

  const token = decryptToken(channel.access_token as string);
  const to = conversation.contact_handle ?? conversation.provider_thread_id;
  const config = (channel.external_config as Record<string, string>) ?? {};

  let sendUrl: string;
  let sendBody: Record<string, unknown>;
  if (channel.provider === "whatsapp_cloud") {
    sendUrl = `${GRAPH_BASE}/${config.phoneNumberId}/messages`;
    sendBody = { messaging_product: "whatsapp", to, type: "text", text: { body: message.content } };
  } else if (channel.provider === "instagram") {
    sendUrl = `${GRAPH_BASE}/${config.instagramBusinessAccountId}/messages`;
    sendBody = { recipient: { id: to }, message: { text: message.content } };
  } else {
    return NextResponse.json({ error: `Envio real não implementado para ${channel.provider}.` }, { status: 501 });
  }

  const res = await fetch(sendUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(sendBody),
  });
  const json = await res.json().catch(() => ({})) as {
    error?: { message?: string; code?: number }; messages?: Array<{ id: string }>; message_id?: string;
  };

  if (!res.ok || json.error) {
    await auth.db.from("messages").update({
      status: "failed",
      status_error_code: json.error?.code ? String(json.error.code) : null,
      status_error_message: json.error?.message ?? `HTTP ${res.status}`,
    }).eq("id", body.messageId);
    return NextResponse.json({ error: json.error?.message ?? "Falha ao enviar." }, { status: 502 });
  }

  const providerMessageId = json.messages?.[0]?.id ?? json.message_id ?? null;
  await auth.db.from("messages").update({ provider_message_id: providerMessageId }).eq("id", body.messageId);
  return NextResponse.json({ ok: true });
}
