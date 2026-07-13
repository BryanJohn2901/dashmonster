// ─── Conecta o canal Instagram DM do CRM ──────────────────────────────────────
// Reaproveita a conta Instagram Business já vinculada à empresa (onboarding em
// Perfil, lib/instagramDiscovery) — não inicia um OAuth novo. O token só tem
// permissão de mensagens se foi obtido depois que IG_OAUTH_SCOPES ganhou
// instagram_manage_messages (lib/meta.ts); token antigo pode falhar no envio,
// nesse caso a empresa precisa reconectar o Instagram em Perfil.

import { NextRequest, NextResponse } from "next/server";
import { requireCompanyAccess } from "@/lib/trackingAuth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let body: { companyId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }

  const auth = await requireCompanyAccess(request, { companyId: body.companyId, write: true });
  if (!auth.ok) return auth.response;

  const { data: igAccount, error: igError } = await auth.db
    .from("instagram_accounts")
    .select("instagram_business_account_id, username, name, profile_picture_url, access_token, connection_status")
    .eq("company_id", auth.companyId)
    .eq("connection_status", "active")
    .maybeSingle();

  if (igError) return NextResponse.json({ error: igError.message }, { status: 500 });
  if (!igAccount) {
    return NextResponse.json(
      { error: "Nenhuma conta Instagram vinculada a esta empresa. Conecte em Perfil primeiro." },
      { status: 422 },
    );
  }

  const { data: existing } = await auth.db
    .from("channel_connections")
    .select("id")
    .eq("company_id", auth.companyId)
    .eq("provider", "instagram")
    .maybeSingle();

  const row = {
    company_id: auth.companyId,
    provider: "instagram" as const,
    status: "connected" as const,
    account_handle: igAccount.username,
    account_name: igAccount.name,
    account_avatar: igAccount.profile_picture_url,
    access_token: igAccount.access_token, // já cifrado (encryptToken), copiado como está
    external_config: { instagramBusinessAccountId: igAccount.instagram_business_account_id },
    connected_by: auth.userId,
    error_message: null,
  };

  const { error: upsertError } = existing
    ? await auth.db.from("channel_connections").update(row).eq("id", existing.id)
    : await auth.db.from("channel_connections").insert(row);

  if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
