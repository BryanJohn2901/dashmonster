// ─── Conecta o canal WhatsApp Cloud API do CRM (conexão manual) ───────────────
// Sem Embedded Signup (exige config_id do App Dashboard que não temos aqui) —
// a empresa cola Phone Number ID + token permanente (System User, Business
// Settings → System Users → Generate Token, permissões whatsapp_business_
// messaging + whatsapp_business_management). Validamos direto na Graph API
// antes de gravar, pra pegar o nome/número reais e falhar cedo se o token/ID
// estiver errado.

import { NextRequest, NextResponse } from "next/server";
import { requireCompanyAccess } from "@/lib/trackingAuth";
import { encryptToken } from "@/lib/crypto";
import { GRAPH_BASE } from "@/lib/meta";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let body: { companyId?: string; phoneNumberId?: string; wabaId?: string; accessToken?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }

  const auth = await requireCompanyAccess(request, { companyId: body.companyId, write: true });
  if (!auth.ok) return auth.response;

  const phoneNumberId = body.phoneNumberId?.trim();
  const wabaId = body.wabaId?.trim();
  const accessToken = body.accessToken?.trim();
  if (!phoneNumberId || !wabaId || !accessToken) {
    return NextResponse.json({ error: "phoneNumberId, wabaId e accessToken são obrigatórios." }, { status: 400 });
  }

  const verifyRes = await fetch(
    `${GRAPH_BASE}/${phoneNumberId}?` + new URLSearchParams({ fields: "display_phone_number,verified_name", access_token: accessToken }),
  );
  const verifyJson = await verifyRes.json() as {
    display_phone_number?: string; verified_name?: string; error?: { message?: string };
  };
  if (!verifyRes.ok || verifyJson.error) {
    return NextResponse.json({ error: verifyJson.error?.message ?? "Falha ao validar o número na Meta." }, { status: 502 });
  }

  const { data: existing } = await auth.db
    .from("channel_connections")
    .select("id")
    .eq("company_id", auth.companyId)
    .eq("provider", "whatsapp_cloud")
    .maybeSingle();

  const row = {
    company_id: auth.companyId,
    provider: "whatsapp_cloud" as const,
    status: "connected" as const,
    account_handle: verifyJson.display_phone_number ?? phoneNumberId,
    account_name: verifyJson.verified_name ?? null,
    account_avatar: null,
    access_token: encryptToken(accessToken),
    external_config: { phoneNumberId, wabaId },
    connected_by: auth.userId,
    error_message: null,
  };

  const { error: upsertError } = existing
    ? await auth.db.from("channel_connections").update(row).eq("id", existing.id)
    : await auth.db.from("channel_connections").insert(row);

  if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
