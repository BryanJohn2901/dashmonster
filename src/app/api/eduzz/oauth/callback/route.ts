import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { encryptToken } from "@/lib/crypto";
import { exchangeCodeForToken, eduzzRedirectUri } from "@/lib/eduzzOAuth";

export const runtime = "nodejs";
export const maxDuration = 60;

const STATE_COOKIE = "eduzz_oauth_state";

/**
 * GET /api/eduzz/oauth/callback?code=...&state=...
 * Troca o code por um access_token (não expira, sem refresh — confirmado na
 * doc oficial), grava cifrado em eduzz_oauth_connections com status "syncing"
 * e redireciona de volta pro painel.
 *
 * NÃO roda a 1ª sincronização aqui (antes rodava, e dava timeout 504 antes do
 * redirect — 90 dias de histórico não cabem no maxDuration). Quem faz a 1ª
 * sync é o próprio painel: ao voltar e ver status "syncing", ele chama
 * /oauth/sync-now em loop até terminar (ver EduzzConfigPanel). Mantém o
 * callback rápido (só troca token + grava) e a sync observável/retomável.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const origin = request.nextUrl.origin;
  const backToApp = (status: string, extra: Record<string, string> = {}): NextResponse => {
    const url = new URL("/", origin);
    url.searchParams.set("eduzz_oauth", status);
    for (const [k, v] of Object.entries(extra)) url.searchParams.set(k, v);
    return NextResponse.redirect(url);
  };

  const code = searchParams.get("code");
  const queryState = searchParams.get("state");
  const errorParam = searchParams.get("error");

  if (errorParam) {
    return backToApp("error", { reason: searchParams.get("error_description") ?? errorParam });
  }
  if (!code) {
    return backToApp("error", { reason: "Código de autorização ausente." });
  }

  // companyId vem do cookie (fonte de verdade), não do query state — a doc
  // oficial da Eduzz não confirma se o `state` enviado em /authorize é
  // ecoado de volta aqui (ver comentário em oauth/start/route.ts).
  const cookieState = request.cookies.get(STATE_COOKIE)?.value;
  if (!cookieState) {
    return backToApp("error", { reason: "Sessão de autorização expirada ou ausente." });
  }
  if (queryState && queryState !== cookieState) {
    return backToApp("error", { reason: "Falha de validação (state)." });
  }
  const companyId = cookieState.split(".")[0];
  if (!companyId) {
    return backToApp("error", { reason: "Estado de autorização inválido." });
  }

  try {
    const token = await exchangeCodeForToken(code, eduzzRedirectUri());

    const sb = supabaseAdmin();
    const { error } = await sb
      .from("eduzz_oauth_connections")
      .upsert(
        {
          company_id: companyId,
          access_token: encryptToken(token.access_token),
          eduzz_user_id: token.user?.id ?? null,
          eduzz_user_email: token.user?.email ?? null,
          eduzz_user_name: token.user?.name ?? null,
          status: "syncing",
          last_sync_error: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "company_id" },
      );
    if (error) {
      return backToApp("error", { reason: error.message });
    }

    // Sem sync aqui — o painel, ao ver status "syncing", chama sync-now em
    // loop pra fazer a 1ª sincronização (ver doc no topo do arquivo).
    const res = backToApp("connected");
    res.cookies.delete(STATE_COOKIE);
    return res;
  } catch (e) {
    return backToApp("error", { reason: e instanceof Error ? e.message : String(e) });
  }
}
