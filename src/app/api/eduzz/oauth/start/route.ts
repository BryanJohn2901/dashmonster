import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { EDUZZ_AUTHORIZE_URL, eduzzRedirectUri, eduzzUserScopedClient } from "@/lib/eduzzOAuth";

export const runtime = "nodejs";

const STATE_COOKIE = "eduzz_oauth_state";

/**
 * POST /api/eduzz/oauth/start — body { company_id }, header Authorization: Bearer <token>.
 * Confere se o usuário logado pode escrever na empresa (owner/manager, mesma
 * regra de eduzz_webhook_configs), gera state CSRF prefixado pelo company_id
 * (lido de volta no callback, mesmo padrão do state simples do Instagram —
 * aqui precisa carregar o company_id porque o callback da Eduzz não devolve
 * nenhum outro jeito de saber qual empresa iniciou o fluxo) e devolve a URL
 * de autorização pro client navegar (`window.location.href`).
 *
 * É POST com token explícito, não GET com sessão via cookie: o login do app
 * usa `supabaseClient` puro (@supabase/supabase-js, sessão em localStorage),
 * nunca grava cookie de sessão — `cookies()`/`@/utils/supabase/server` aqui
 * sempre veria "sem usuário". Usa `eduzzUserScopedClient(token)` (não o
 * client cookie-based) porque o `sb.rpc("can_write_company", ...)` precisa
 * mandar o Authorization: Bearer no request pro PostgREST resolver
 * `auth.uid()` certo — `auth.getUser(token)` valida o token mas não
 * configura esse header pros outros chamados do client. O `state` ainda vai
 * num cookie httpOnly próprio (não é sessão Supabase, é CSRF nosso) porque
 * o `callback` da Eduzz é, esse sim, uma navegação de página inteira de
 * volta pro nosso domínio.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as { company_id?: string } | null;
  const companyId = body?.company_id;
  if (!companyId) {
    return NextResponse.json({ error: "company_id ausente." }, { status: 400 });
  }

  const clientId = process.env.EDUZZ_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: "EDUZZ_CLIENT_ID não configurado no servidor." }, { status: 500 });
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

  const res = NextResponse.json({ url: authUrl });
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600, // 10 min
  });
  return res;
}
