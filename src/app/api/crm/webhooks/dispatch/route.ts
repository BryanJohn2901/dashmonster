// ─── Disparo de webhook pedido pelo cliente após uma mutação (deal/lead) ──────
// Autenticado pela sessão Supabase do usuário (mesmo padrão de /api/meta).
// A entrega HTTP real acontece aqui (servidor) para evitar CORS/SSRF do browser
// e não expor o secret do webhook em rede pública desnecessariamente.

import { NextRequest, NextResponse } from "next/server";
import { requireCompanyAccess } from "@/lib/trackingAuth";
import { dispatchCrmWebhooks } from "@/lib/server/crmWebhookDispatch";
import { CRM_WEBHOOK_EVENTS } from "@/lib/crmSupabase";

export async function POST(request: NextRequest) {
  let body: { companyId?: string; event?: string; payload?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }

  if (!body.event || !(CRM_WEBHOOK_EVENTS as readonly string[]).includes(body.event)) {
    return NextResponse.json({ error: "Evento inválido." }, { status: 400 });
  }

  const auth = await requireCompanyAccess(request, { companyId: body.companyId });
  if (!auth.ok) return auth.response;

  await dispatchCrmWebhooks(auth.db, auth.companyId, body.event, body.payload ?? {});
  return NextResponse.json({ ok: true });
}
