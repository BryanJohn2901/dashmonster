import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { createClient } from "@/utils/supabase/server";
import { EDUZZ_AUTHORIZE_URL, eduzzRedirectUri } from "@/lib/eduzzOAuth";

export const runtime = "nodejs";

const STATE_COOKIE = "eduzz_oauth_state";

/**
 * GET /api/eduzz/oauth/start?company_id=...
 * Confere se o usuário logado pode escrever na empresa (owner/manager, mesma
 * regra de eduzz_webhook_configs), gera state CSRF prefixado pelo company_id
 * (lido de volta no callback, mesmo padrão do state simples do Instagram —
 * aqui precisa carregar o company_id porque o callback da Eduzz não devolve
 * nenhum outro jeito de saber qual empresa iniciou o fluxo) e redireciona.
 */
export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get("company_id");
  if (!companyId) {
    return NextResponse.json({ error: "company_id ausente." }, { status: 400 });
  }

  const clientId = process.env.EDUZZ_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: "EDUZZ_CLIENT_ID não configurado no servidor." }, { status: 500 });
  }

  const sb = await createClient();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { data: canWrite, error: rpcError } = await sb.rpc("can_write_company", { cid: companyId });
  if (rpcError || !canWrite) {
    return NextResponse.json({ error: "Sem permissão para conectar essa empresa." }, { status: 403 });
  }

  const state = `${companyId}.${randomBytes(16).toString("hex")}`;

  // Escopos não vão na URL — já ficam fixados no cadastro do app no Developer
  // Hub (console.eduzz.com), diferente do fluxo da Meta. `state` segue o
  // padrão genérico OAuth2; a doc oficial não confirma o echo de volta, mas
  // o cookie httpOnly abaixo é a fonte de verdade no callback de qualquer
  // forma (extrai companyId dali, não do query param).
  const authUrl =
    `${EDUZZ_AUTHORIZE_URL}?` +
    new URLSearchParams({
      client_id: clientId,
      responseType: "code",
      redirectTo: eduzzRedirectUri(),
      state,
    });

  const res = NextResponse.redirect(authUrl);
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600, // 10 min
  });
  return res;
}
