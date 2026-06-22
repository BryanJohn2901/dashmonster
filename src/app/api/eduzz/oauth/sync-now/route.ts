import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { eduzzUserScopedClient } from "@/lib/eduzzOAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { syncCompany } from "@/lib/eduzzSync";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/eduzz/oauth/sync-now
 * Body: { company_id }, header Authorization: Bearer <token> (não cookie —
 * mesmo motivo do oauth/start, login do app usa sessão em localStorage, não
 * em cookie). Usa `eduzzUserScopedClient(token)` pra checar permissão
 * (`can_write_company` via RPC precisa do Authorization header no request,
 * não só do token validado em `getUser`). Sincronização sob demanda (botão
 * "Sincronizar agora" no painel) — mesma checagem de permissão do
 * oauth/start, mas usa supabaseAdmin (service_role) pra rodar a sync, já
 * que syncCompany() grava em tabelas (events_log, eduzz_contracts) que o
 * usuário final não tem permissão de escrita direta.
 *
 * A sync roda em background (after(), mesmo motivo do oauth/callback): um
 * histórico grande passa fácil do maxDuration mesmo em 60s, e antes disso a
 * function morria com 504 antes do front receber qualquer resposta. Aqui a
 * rota marca status "syncing" e responde na hora — status final
 * ("connected"/"error") só aparece numa leitura posterior da conexão.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as { company_id?: string } | null;
  const companyId = body?.company_id;
  if (!companyId) {
    return NextResponse.json({ error: "company_id ausente." }, { status: 400 });
  }

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const sb = eduzzUserScopedClient(token);
  const { data: auth } = await sb.auth.getUser(token);
  if (!auth?.user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { data: canWrite, error: rpcError } = await sb.rpc("can_write_company", { cid: companyId });
  if (rpcError || !canWrite) {
    return NextResponse.json({ error: "Sem permissão para sincronizar essa empresa." }, { status: 403 });
  }

  const admin = supabaseAdmin();
  const { data: connection, error } = await admin
    .from("eduzz_oauth_connections")
    .select("company_id, access_token, last_synced_at")
    .eq("company_id", companyId)
    .single();

  if (error || !connection) {
    return NextResponse.json({ error: "Empresa sem conexão Eduzz." }, { status: 404 });
  }

  await admin
    .from("eduzz_oauth_connections")
    .update({ status: "syncing", last_sync_error: null, updated_at: new Date().toISOString() })
    .eq("company_id", companyId);

  after(async () => {
    await syncCompany(admin, connection as { company_id: string; access_token: string; last_synced_at: string | null });
  });

  const { data: updated } = await admin
    .from("eduzz_oauth_connections")
    .select("status, last_synced_at, last_sync_error")
    .eq("company_id", companyId)
    .single();

  return NextResponse.json({ ok: true, connection: updated });
}
