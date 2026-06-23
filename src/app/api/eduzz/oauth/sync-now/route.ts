import { NextRequest, NextResponse } from "next/server";
import { eduzzUserScopedClient } from "@/lib/eduzzOAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { syncCompany } from "@/lib/eduzzSync";

export const runtime = "nodejs";
export const maxDuration = 60;

// Orçamento de trabalho por request (< maxDuration de 60s com folga). A sync
// roda em janelas; quando estoura esse tempo, a rota responde done=false e o
// front chama de novo, continuando de onde parou (last_synced_at).
const REQUEST_BUDGET_MS = 40_000;

/**
 * POST /api/eduzz/oauth/sync-now
 * Body: { company_id }, header Authorization: Bearer <token> (não cookie —
 * login do app usa sessão em localStorage, ver CLAUDE.md da pasta). Usa
 * `eduzzUserScopedClient(token)` pra checar permissão (`can_write_company` via
 * RPC precisa do Authorization header no request, não só do token validado em
 * `getUser`); a sync em si usa supabaseAdmin (service_role) porque escreve em
 * events_log/eduzz_contracts.
 *
 * SÍNCRONO de propósito (NÃO usa after()): after() depende de o waitUntil da
 * Vercel rodar o callback depois da resposta — invisível, sem como ver o
 * resultado, e se não rodar a conexão fica presa em "syncing" pra sempre (bug
 * real). Aqui a rota faz o trabalho dentro do request (bounded por
 * REQUEST_BUDGET_MS, com timeout em cada fetch — ver eduzzFetch) e devolve o
 * resultado de verdade: done + connection com status final. Se done=false,
 * ainda falta período — o front (EduzzConfigPanel) chama de novo em loop até
 * done=true. syncCompany SEMPRE grava um status final, então nunca trava.
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

  const { done } = await syncCompany(
    admin,
    connection as { company_id: string; access_token: string; last_synced_at: string | null },
    REQUEST_BUDGET_MS,
  );

  const { data: updated } = await admin
    .from("eduzz_oauth_connections")
    .select("status, last_synced_at, last_sync_error")
    .eq("company_id", companyId)
    .single();

  return NextResponse.json({ ok: true, done, connection: updated });
}
